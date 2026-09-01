#!/usr/bin/env node
// 像素级重建体检（第 08 章 Q-06–Q-21）。
//
//   node pixel-check.mjs --asset page-theme/<style-set-id> --viewport pc \
//        --baseline <url|png> --candidate <url|png> [--mode full|chrome] \
//        [--baseline-tree f.json] [--candidate-tree f.json] [--viewport-px N] \
//        [--masks f.json] [--raw-painted f.json] [--interaction-states f.json] \
//        [--run <accept-run-id>] [--work .page-theme-work] [--evidence]
//
// 两轨：轨 A 位图 mismatch/SSIM 只报警（Q-13 / Q-14），轨 B 色/字/间距/组件态/chrome
// 几何为主判（Q-11 / Q-12）。判不出的一律记 undecided 交人，不得替资产猜（总纲 D3）。
// 退出码：0 通过 / 1 阻断（轨 B 资产侧失败、前置缺失）/ 2 仅报警。

import fs from 'node:fs';
import path from 'node:path';
import {
  readJsonOr,
  readTextOr,
  readYamlOr,
  buildTokenIndex,
  normalizeColor,
  normalizeFontName,
  mergeReport,
  reportHead,
  utcRunId,
} from './accept/lib/asset-read.mjs';
import { EXTRACT_TREE_SRC, flatten, areaWeights, derivedGeometry } from './accept/lib/extract-tree.mjs';
import { loadRGBA, writePNG, pixelDiff, ssim, fillRect } from './accept/lib/imgdiff.mjs';

// 本项目自定报警线（Q-14）：8% 只是本仓 fidelity-* 默认，不是业界公约，且**不得**否决。
const WARN_MISMATCH_SELF_DEFINED = 0.08;

const argv = process.argv.slice(2);
const flag = (n) => argv.includes(`--${n}`);
const opt = (n, d = null) => {
  const i = argv.indexOf(`--${n}`);
  return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : d;
};
const die = (msg, code = 1) => {
  console.error(`pixel-check: ${msg}`);
  process.exit(code);
};

const ASSET = opt('asset');
if (!ASSET) die('缺 --asset <资产目录>');
if (!fs.existsSync(ASSET)) die(`资产目录不存在: ${ASSET}`);
const STYLE_SET_ID = path.basename(path.resolve(ASSET));
const VIEWPORT = opt('viewport', 'pc');
if (!['pc', 'tablet', 'mobile'].includes(VIEWPORT)) die('--viewport 只准 pc / tablet / mobile（字段位见 E-07，不得写死像素）');
const MODE = opt('mode', 'full');
const WORK = opt('work', '.page-theme-work');
const RUN_ID = opt('run', utcRunId());
const RUN_DIR = path.join(WORK, STYLE_SET_ID, RUN_ID);

// ---------- 断点口径：只准来自资产（E-08–E-13 聚类结果），找不到就停 ----------
function resolveViewportPx() {
  const cli = opt('viewport-px');
  if (cli) return { px: Number(cli), source: 'cli' };
  const idx = readJsonOr(path.join(ASSET, 'screenshots', 'index.json'));
  const hit = idx ? deepFindViewport(idx, VIEWPORT) : null;
  if (hit) return hit;
  const pat = safeYaml(path.join(ASSET, 'patterns', 'index.yaml'));
  const hit2 = pat ? deepFindViewport(pat, VIEWPORT) : null;
  if (hit2) return hit2;
  const design = readTextOr(path.join(ASSET, 'DESIGN.md'));
  if (design) {
    // G-65 的视口双轨表：| 对外 | 字段位 | 本站观测像素 | viewportSource |
    for (const line of design.split(/\r?\n/)) {
      const cells = line.split('|').map((c) => c.trim());
      if (cells.length < 5) continue;
      if (cells[2] !== VIEWPORT) continue;
      const px = parseInt(String(cells[3]).replace(/[^\d]/g, ''), 10);
      if (px) return { px, source: cells[4] || 'DESIGN.md' };
    }
  }
  return null;
}
function deepFindViewport(obj, name) {
  let found = null;
  (function walk(o) {
    if (found || !o || typeof o !== 'object') return;
    if (!Array.isArray(o)) {
      const px = o.viewport_px ?? o.viewportPx;
      const who = o.slot ?? o.viewport ?? o.breakpoint ?? o.field ?? o.name; // `slot` 是 screenshots/index.json 的档位键
      if (typeof px === 'number' && who === name) {
        found = { px, source: o.viewportSource ?? o.viewport_source ?? 'asset' };
        return;
      }
      const sub = o[name];
      if (sub && typeof sub === 'object') {
        const p2 = sub.viewport_px ?? sub.viewportPx;
        if (typeof p2 === 'number') {
          found = { px: p2, source: sub.viewportSource ?? sub.viewport_source ?? 'asset' };
          return;
        }
      }
    }
    for (const v of Array.isArray(o) ? o : Object.values(o)) walk(v);
  })(obj);
  return found;
}
function safeYaml(p) {
  try {
    return readYamlOr(p);
  } catch (e) {
    warnings.push({ code: 'yaml-unparseable', file: p, message: e.message });
    return null;
  }
}

const warnings = [];
const findings = []; // {check, verdict, ...} verdict ∈ asset-side | consumer-side | undecided | exempt | observation
const push = (f) => findings.push(f);
const chromeHeightObs = []; // 页壳高度：只记不判（B-19）

// ---------- 取图与取树 ----------
const isUrl = (s) => /^https?:\/\//i.test(s || '');

async function sideMaterial(which, ref, treeOpt, viewportPx) {
  const treeFile = opt(treeOpt);
  let tree = treeFile ? readJsonOr(treeFile) : null;
  let png = null;
  if (ref && !isUrl(ref)) {
    if (!fs.existsSync(ref)) die(`${which} 图不存在: ${ref}`);
    png = ref;
  }
  if (isUrl(ref) && (!tree || !png)) {
    const captured = await capture(ref, viewportPx, which);
    tree = tree || captured.tree;
    png = png || captured.png;
  }
  return { tree, png };
}

// Q-10.6 / Q-17 / Q-18 稳定门：load + fonts.ready + 双 rAF + layout-quiet，dpr=1，禁 networkidle。
async function capture(url, viewportPx, which) {
  let chromium;
  try {
    ({ chromium } = await import('playwright'));
  } catch {
    die('缺 playwright：给 URL 需要浏览器；或改传已截好的 PNG 与 --*-tree');
  }
  const browser = await chromium.launch();
  const ctx = await browser.newContext({
    viewport: { width: viewportPx, height: Math.round(viewportPx * 0.75) },
    deviceScaleFactor: 1, // E-17
  });
  const page = await ctx.newPage();
  await page.goto(url, { waitUntil: 'load' }); // E-19：禁 networkidle
  await page.evaluate(`(async () => {
    await document.fonts.ready;
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    let last = -1, stable = 0;
    while (stable < 3) {
      const h = document.documentElement.scrollHeight;
      if (h === last) stable++; else { stable = 0; last = h; }
      await new Promise((r) => setTimeout(r, 100));
    }
  })()`);
  const tree = await page.evaluate(`${EXTRACT_TREE_SRC};__ptExtractTree('body')`);
  const file = path.join(RUN_DIR, 'evidence', `${which}-${VIEWPORT}.png`);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  await page.screenshot({ path: file, fullPage: false }); // Q-23 同款：视口图，不用 fullPage
  await browser.close();
  return { tree, png: file };
}

// ---------- 轨 A：位图，只报警 ----------
async function trackA(basePng, candPng, masks) {
  if (!basePng || !candPng) return { skipped: '缺任一侧截图', mismatch: null };
  const a = await loadRGBA(basePng);
  const b = await loadRGBA(candPng);
  for (const m of masks) {
    fillRect(a, m, [255, 255, 255, 255]);
    fillRect(b, m, [255, 255, 255, 255]);
  }
  const d = await pixelDiff(a, b);
  const s = ssim(a, b);
  if (flag('evidence')) await writePNG(d.diff, path.join(RUN_DIR, 'evidence', `diff-${VIEWPORT}.png`));
  const out = {
    width: d.width,
    height: d.height,
    diffPixels: d.diffPixels,
    mismatch: Math.round(d.mismatch * 10000) / 10000,
    ssim: Math.round(s * 10000) / 10000,
    masksApplied: masks.length,
    warnLine: WARN_MISMATCH_SELF_DEFINED,
    warnLineNote: '本项目自定（Q-14）；跨源基线无人发表，**不得**据此否决（Q-13）',
    veto: false,
  };
  if (d.mismatch > WARN_MISMATCH_SELF_DEFINED) {
    warnings.push({ code: 'mismatch-over-self-defined-line', mismatch: out.mismatch, note: '只报警，不否决（Q-13）' });
  }
  return out;
}

// ---------- 轨 B ----------
function judge(hasRawScale, share, minAdmitted, evidence) {
  // Q-84：不在 tokens 但 ∈ painted-area 高频 → a；面积低 → 豁免。
  // 「高频」的界不得由本脚本发明：以资产自己已收录的最小 paintedRatio 为界。
  // 无同尺度 painted-area 数据时一律 undecided，绝不猜。
  if (!hasRawScale || minAdmitted == null || share == null) {
    return { verdict: 'undecided', reason: '缺同尺度 painted-area（raw）；「高频/低面积」的界只能来自资产自身', ...evidence };
  }
  return share >= minAdmitted
    ? { verdict: 'asset-side', branch: 'a', reason: `面积占比 ${share} ≥ 资产已收录最小 paintedRatio ${minAdmitted}`, ...evidence }
    : { verdict: 'exempt', reason: `面积占比 ${share} < 资产已收录最小 paintedRatio ${minAdmitted}（Q-84 低面积不升格）`, ...evidence };
}

function trackB({ baseTree, candTree, index, rawPainted, chromeYaml, states }) {
  if (!baseTree || !candTree) {
    push({ check: 'trackB', verdict: 'undecided', reason: '缺任一侧 computedStyle 树，轨 B 无法对账（Q-11）' });
    return;
  }
  const baseNodes = flatten(baseTree);
  const candNodes = flatten(candTree);
  const baseArea = areaWeights(baseNodes);
  const candArea = areaWeights(candNodes);

  const colorTokens = index.entries.filter((e) => (e.type || '').toLowerCase() === 'color');
  const admitted = colorTokens.map((e) => e.paintedRatio).filter((x) => typeof x === 'number' && x > 0);
  const minAdmitted = admitted.length ? Math.min(...admitted) : null;
  const hasRawScale = !!rawPainted;
  const rawShare = (c) => {
    if (!rawPainted) return null;
    const n = normalizeColor(c);
    for (const [k, v] of Object.entries(rawPainted)) if (normalizeColor(k) === n) return v;
    return 0;
  };

  // 1. 语义色（Q-12 行 1）
  for (const [raw, share] of [...baseArea.byColor.entries()].sort((a, b) => b[1] - a[1])) {
    const n = normalizeColor(raw);
    if (!n || n === 'transparent') continue;
    const paths = index.colorValues.get(n) || [];
    const semantic = paths.some((p) => index.byPath.get(p)?.layer === 'semantic');
    if (semantic) continue;
    const ev = { check: 'semantic-color', value: n, areaShare: Math.round(share * 10000) / 10000, tokenPaths: paths };
    if (paths.length) {
      push({ ...ev, verdict: 'undecided', reason: `色在 tokens 里但不在 semantic 层（现层 ${paths.map((p) => index.byPath.get(p)?.layer).join('/')}）；是否升格归第 02 章` });
    } else {
      push(judge(hasRawScale, rawShare(raw), minAdmitted, ev));
    }
  }
  // 重建页侧：用到的色必须能回查资产（落 Q-82 分支 b）
  for (const [raw, share] of candArea.byColor.entries()) {
    const n = normalizeColor(raw);
    if (!n || n === 'transparent') continue;
    if (index.colorValues.has(n)) continue;
    push({
      check: 'semantic-color',
      verdict: 'consumer-side',
      branch: 'b',
      value: n,
      areaShare: Math.round(share * 10000) / 10000,
      reason: '重建页用了资产里没有的色值；打回重建侧，不改资产（Q-82b）',
    });
  }

  // 2. 排印（Q-12 行 2）
  for (const [fam, share] of [...baseArea.byFont.entries()].sort((a, b) => b[1] - a[1])) {
    const first = normalizeFontName(String(fam).split(',')[0]);
    if (!first || index.fontStacks.has(first)) continue;
    push(judge(hasRawScale, null, minAdmitted, { check: 'typography-family', value: first, areaShare: Math.round(share * 10000) / 10000 }));
  }
  const typoValues = new Set();
  for (const e of index.entries) {
    const t = (e.type || '').toLowerCase();
    if (['dimension', 'fontweight', 'number', 'duration'].includes(t) || /typography|font|line/i.test(e.path)) {
      typoValues.add(String(typeof e.value === 'object' ? JSON.stringify(e.value) : e.value).trim());
    }
  }
  const textNodes = (nodes) => nodes.filter((n) => n.text);
  const typoMissing = new Map();
  for (const n of textNodes(baseNodes)) {
    for (const k of ['fontSize', 'fontWeight', 'lineHeight']) {
      const v = String(n.styles[k] ?? '').trim();
      if (!v || v === 'normal') continue;
      if (typoValues.has(v) || typoValues.has(v.replace(/px$/, ''))) continue;
      const key = `${k}:${v}`;
      typoMissing.set(key, (typoMissing.get(key) || 0) + 1);
    }
  }
  for (const [key, count] of typoMissing) {
    push({
      check: 'typography-scale',
      verdict: 'undecided',
      value: key,
      nodeCount: count,
      reason: '原站该排印值未在 typography token 中找到；升格与否需人对照 Q-84（本脚本不设面积/条数界）',
    });
  }

  // 3. 派生间距（Q-12 行 3）：只出证据，不自动定性——rect 减法量与 token 的等值判据无规格出处
  const pairFloors = (nodes) => {
    const root = nodes[0];
    const main = nodes.find((n) => n.src.landmark === 'main') || root;
    return main.children.filter((c) => c.abs.h > 0);
  };
  const bf = pairFloors(baseNodes);
  const cf = pairFloors(candNodes);
  const spacing = [];
  for (let i = 0; i < Math.min(bf.length, cf.length); i++) {
    const g1 = derivedGeometry(bf[i]);
    const g2 = derivedGeometry(cf[i]);
    if (!g1 || !g2) continue;
    const deltas = {};
    for (const side of ['top', 'left', 'right', 'bottom']) deltas[`inset-${side}`] = Math.round(g2.inset[side] - g1.inset[side]);
    const rg = Math.min(g1.rowGaps.length, g2.rowGaps.length);
    for (let r = 0; r < rg; r++) deltas[`rowGap-${r}`] = Math.round(g2.rowGaps[r] - g1.rowGaps[r]);
    const nonZero = Object.entries(deltas).filter(([, v]) => v !== 0);
    if (nonZero.length) spacing.push({ floorIndex: i, pattern: cf[i].src.pattern ?? null, deltas: Object.fromEntries(nonZero) });
  }
  if (spacing.length) {
    push({
      check: 'derived-spacing',
      verdict: 'undecided',
      floors: spacing,
      reason: 'inset / 行距两侧不等；落 a 还是 b 需按 Q-84 对照 dimension token 与 pattern rhythm 后人判',
    });
  }
  if (bf.length !== cf.length) {
    push({ check: 'floor-count', verdict: 'consumer-side', branch: 'b', baseline: bf.length, candidate: cf.length, reason: '楼层数不等，先按 sequence 复核重建页（Q-10.2）' });
  }

  // 4. 组件态（Q-12 行 4）：采集归第 05 章，本脚本不自行 hover
  if (!states) {
    push({ check: 'component-state', verdict: 'undecided', reason: '未提供 --interaction-states（raw，第 05 章采集）；主 CTA 的 hover / focus-visible 未对账' });
  } else {
    const componentPaths = new Set(index.entries.filter((e) => e.layer === 'component').map((e) => e.path));
    for (const [sel, st] of Object.entries(states)) {
      for (const [stateName, decls] of Object.entries(st || {})) {
        for (const [prop, val] of Object.entries(decls || {})) {
          const n = normalizeColor(val);
          const hit = n ? index.colorValues.get(n) : null;
          const inComponent = hit && hit.some((p) => componentPaths.has(p));
          if (!inComponent) {
            push({ check: 'component-state', verdict: 'asset-side', branch: 'a', selector: sel, state: stateName, prop, value: val, reason: '交互态取值无对应 component token（Q-12 行 4）' });
          }
        }
      }
    }
  }

  // 5. chrome 对账（Q-12 行 5 / Q-16 / P-60）
  chromeSpotCheck(baseNodes, candNodes, chromeYaml, patternsIndex);
}

// 页壳**高度不入 schema**（B-19：竖向尺度已由 density 的 E-98 承载；吸顶/收缩站的高度本来是
// 两个值，单值字段装不下）。故 Q-16 抽检改对四项已冻结字段：
//   1 `variant` 逐字段全等 · 2 `slots[].name` 集合与各自 `required`
//   3 `responsive.{slot}.columns` 与 `grid.content_width_px` · 4 `density` 与 `container.mode`
// 高度只作观测记录，**不是对账项**；若四项全等而只有高度不同，按 P-11 记第一条证据、等第二站，
// 不得因此自行加字段。
const MOUNT_LANDMARK = { navbar: 'header', footer: 'footer', announcement: null, 'legal_bar': null, float_widget: null };
const CHROME_NOT_CHECKABLE = [
  { field: 'variant.layout / media_position / align / card / off_grid / bento_map', reason: '构图语义非几何，机器不可测（P-30）' },
  { field: 'density', reason: '按 E-98 由采集侧判定，验收侧不重算（否则同一事实两处判据）' },
  { field: '页壳高度', reason: 'B-19 已定不入 schema，故不是对账项；只作 P-11 证据记录' },
];

function hostMatches(host, decl) {
  const h = String(host || '').toLowerCase();
  const d = String(decl || '').toLowerCase().replace(/^\./, '');
  return !!h && !!d && (h === d || h.endsWith(`.${d}`));
}

function measureChrome(nodes, patternId, mount) {
  const node =
    nodes.find((x) => x.src.pattern && String(x.src.pattern) === patternId) ||
    nodes.find((x) => MOUNT_LANDMARK[mount] && x.src.landmark === MOUNT_LANDMARK[mount]);
  if (!node) return null;
  const g = derivedGeometry(node);
  const width = Math.round(node.abs.w);
  const contentWidth = g ? Math.round(g.contentWidth) : null;
  // 跟在页壳之后的顶层节点若压进页壳矩形 → overlay（P-30 的「透明压 hero」）
  const siblings = node.parent ? node.parent.children : [];
  const idx = siblings.indexOf(node);
  const next = idx >= 0 ? siblings[idx + 1] : null;
  return {
    height: Math.round(node.abs.h), // 观测项，不参与对账（B-19）
    sticky: node.src.sticky ?? null,
    contentWidth,
    containerMode: contentWidth == null ? null : contentWidth > width ? 'breakout' : contentWidth === width ? 'full-bleed' : 'contained',
    columns: g && g.rowSizes.length ? Math.max(...g.rowSizes) : null,
    overlay: next ? next.abs.y < node.abs.y + node.abs.h : false,
    slots: [...new Set(descendantSlots(node))],
  };
}
function descendantSlots(node) {
  const out = [];
  (function walk(n) {
    if (n.src.slot) out.push(String(n.src.slot));
    for (const c of n.children) walk(c);
  })(node);
  return out;
}

function chromeSpotCheck(baseNodes, candNodes, chromeYaml, patternsIndex) {
  if (!chromeYaml) {
    push({ check: 'chrome', verdict: 'undecided', reason: '读不到 patterns/chrome.yaml' });
    return;
  }
  const mounts = (patternsIndex && patternsIndex.chrome) || {};
  const host = opt('host');
  const entries = Object.entries(mounts).filter(([, v]) => v);
  if (!entries.length) {
    push({ check: 'chrome', verdict: 'undecided', reason: 'patterns/index.yaml 无 chrome 挂载位（P-25），无从确定该页用哪条页壳' });
    return;
  }
  for (const [mount, val] of entries) {
    const defaultId = typeof val === 'string' ? val : val.default;
    let variantId = null;
    if (typeof val === 'object' && Array.isArray(val.variants) && host) {
      const v = val.variants.find((x) => (x.hosts || []).some((h) => hostMatches(host, h)));
      variantId = v ? v.pattern : null;
    }
    const appliedId = variantId || defaultId;
    const declared = appliedId ? chromeYaml[appliedId] : null;
    if (!declared) {
      push({ check: 'chrome', mount, verdict: 'undecided', patternId: appliedId ?? null, reason: 'chrome.yaml 里没有该挂载位对应的条目' });
      continue;
    }
    // 声明间对账：跨子域用了变体时，逐字段列出与主域条目的差异——这是 P-18 单文件赌注的直接证据
    if (variantId && variantId !== defaultId && chromeYaml[defaultId]) {
      const diffs = fourItemDiff(chromeYaml[defaultId], declared);
      push({
        check: 'chrome-variant-vs-default',
        mount,
        verdict: 'observation',
        host: host ?? null,
        defaultPattern: defaultId,
        variantPattern: variantId,
        diffs,
        reason: diffs.length
          ? '跨子域页壳与主域在四项冻结字段上不全等：变体是已声明事实（Q-15.1 触发器），本条只作赌注证据'
          : '四项冻结字段全等：P-18 单文件赌注在本站得到一条正面证据',
      });
    }
    for (const [sideName, nodes, verdict, branch, why] of [
      ['baseline', baseNodes, 'asset-side', 'a', '原站实测与 chrome.yaml 声明不符（Q-17：P-18 单文件赌注未验证通过）'],
      ['candidate', candNodes, 'consumer-side', 'b', '重建页未按 chrome.yaml 落页壳（Q-82b）'],
    ]) {
      const m = measureChrome(nodes, appliedId, mount);
      if (!m) {
        push({ check: 'chrome', mount, side: sideName, verdict: 'undecided', reason: `${sideName} 树里找不到该页壳（无 data-pattern 标记且无对应 landmark）` });
        continue;
      }
      const bp = declared.responsive ? declared.responsive[VIEWPORT] : null;
      const cmp = [
        ['variant.overlay', declared.variant ? declared.variant.overlay : undefined, m.overlay],
        ['variant.columns', declared.variant ? declared.variant.columns : undefined, m.columns],
        [`responsive.${VIEWPORT}.columns`, bp ? bp.columns : undefined, m.columns],
        [`responsive.${VIEWPORT}.grid.content_width_px`, bp && bp.grid ? bp.grid.content_width_px : undefined, m.contentWidth],
        ['container.mode', declared.container ? declared.container.mode : undefined, m.containerMode],
      ];
      for (const [field, decl, meas] of cmp) {
        if (decl === undefined || decl === null) continue; // 未声明就没有对账对象，不算失败
        if (meas === null) {
          push({ check: 'chrome', mount, side: sideName, field, verdict: 'undecided', declared: decl, reason: '该项在本侧测不出（页壳无子节点或无行）' });
          continue;
        }
        const eq = typeof decl === 'number' ? Math.round(decl) === Math.round(meas) : decl === meas;
        if (!eq) push({ check: 'chrome', mount, side: sideName, field, verdict, branch, declared: decl, measured: meas, reason: why });
      }
      // slots：名集合 + 各自 required（P-32）。无槽标记则测不出，如实记 undecided
      const declSlots = Array.isArray(declared.slots) ? declared.slots : [];
      if (declSlots.length) {
        if (!m.slots.length) {
          push({ check: 'chrome', mount, side: sideName, field: 'slots[].name', verdict: 'undecided', reason: '本侧无 data-pt-tgt / data-slot 槽标记，槽集合测不出' });
        } else {
          const missingRequired = declSlots.filter((s) => s.required === true && !m.slots.includes(s.name)).map((s) => s.name);
          const extra = m.slots.filter((n) => !declSlots.some((s) => s.name === n));
          if (missingRequired.length) push({ check: 'chrome', mount, side: sideName, field: 'slots[].required', verdict, branch, missingRequired, reason: why });
          if (extra.length) push({ check: 'chrome', mount, side: sideName, field: 'slots[].name', verdict, branch, undeclaredSlots: extra, reason: why });
        }
      }
      chromeHeightObs.push({ mount, side: sideName, patternId: appliedId, height: m.height, sticky: m.sticky });
    }
  }
}

// 四项冻结字段的声明间差异（P-60 条目字段同 {id}.yaml）
function fourItemDiff(a, b) {
  const out = [];
  const eq = (x, y) => JSON.stringify(x ?? null) === JSON.stringify(y ?? null);
  for (const k of new Set([...Object.keys(a.variant || {}), ...Object.keys(b.variant || {})])) {
    if (!eq((a.variant || {})[k], (b.variant || {})[k])) out.push({ field: `variant.${k}`, default: (a.variant || {})[k] ?? null, variant: (b.variant || {})[k] ?? null });
  }
  const slotKey = (s) => `${s.name}:${s.required === true}`;
  const sa = (a.slots || []).map(slotKey).sort();
  const sb = (b.slots || []).map(slotKey).sort();
  if (!eq(sa, sb)) out.push({ field: 'slots[].name+required', default: sa, variant: sb });
  for (const slot of ['pc', 'tablet', 'mobile']) {
    const ra = (a.responsive || {})[slot] || {};
    const rb = (b.responsive || {})[slot] || {};
    if (!eq(ra.columns, rb.columns)) out.push({ field: `responsive.${slot}.columns`, default: ra.columns ?? null, variant: rb.columns ?? null });
    const ga = ra.grid || {};
    const gb = rb.grid || {};
    if (!eq(ga.content_width_px, gb.content_width_px)) {
      out.push({ field: `responsive.${slot}.grid.content_width_px`, default: ga.content_width_px ?? null, variant: gb.content_width_px ?? null });
    }
  }
  if (!eq(a.density, b.density)) out.push({ field: 'density', default: a.density ?? null, variant: b.density ?? null });
  if (!eq((a.container || {}).mode, (b.container || {}).mode)) {
    out.push({ field: 'container.mode', default: (a.container || {}).mode ?? null, variant: (b.container || {}).mode ?? null });
  }
  return out;
}

// ---------- Q-15 加页触发器 ----------
function chromeTriggers(patternsIndex) {
  const hit = [];
  // 变体挂在 index.yaml 的 chrome 挂载位上（P-25），不在 chrome.yaml 里
  const mounts = (patternsIndex && patternsIndex.chrome) || {};
  const variantMounts = Object.entries(mounts)
    .filter(([, v]) => v && typeof v === 'object' && Array.isArray(v.variants) && v.variants.length)
    .map(([k]) => k);
  if (variantMounts.length) hit.push(`Q-15.1 存在 chrome 变体（挂载位 ${variantMounts.join(' / ')}）`);
  const text = JSON.stringify(patternsIndex ?? {});
  if (/page-header/.test(text)) hit.push('Q-15.2 存在 page-header 楼层');
  const taxonomies = new Set();
  (function walk(o) {
    if (!o || typeof o !== 'object') return;
    if (!Array.isArray(o) && typeof o.taxonomy === 'string') taxonomies.add(o.taxonomy);
    for (const v of Array.isArray(o) ? o : Object.values(o)) walk(v);
  })(patternsIndex);
  if (taxonomies.size && taxonomies.size < 4) hit.push(`Q-15.3 首页 L1 楼层类型数 ${taxonomies.size} < 4`);
  return hit;
}

// ---------- main ----------
const vp = resolveViewportPx();
if (!vp) {
  die(
    `资产里读不到 ${VIEWPORT} 档的 viewport_px（E-08–E-13 聚类结果）。` +
      '禁止写死像素（Q-09）：请补 screenshots/index.json / patterns/index.yaml / DESIGN.md §10，或显式传 --viewport-px。',
  );
}
fs.mkdirSync(RUN_DIR, { recursive: true });

const tokens = readJsonOr(path.join(ASSET, 'tokens.json'));
if (!tokens) die('缺 tokens.json，轨 B 无从对账');
const index = buildTokenIndex(tokens);
const chromeYaml = safeYaml(path.join(ASSET, 'patterns', 'chrome.yaml'));
const patternsIndex = safeYaml(path.join(ASSET, 'patterns', 'index.yaml'));
// painted-area 输入：直接吃 raw/{pageId}/painted-area.json 的原形（slots.<档>.colors[]），
// 也接受扁平 { 色值: 占比 } 映射。归一成后者。
function normalizePainted(j) {
  if (!j || typeof j !== 'object') return null;
  const slot = j.slots && (j.slots[VIEWPORT] || Object.values(j.slots)[0]);
  const colors = slot && Array.isArray(slot.colors) ? slot.colors : Array.isArray(j.colors) ? j.colors : null;
  if (!colors) return j;
  const out = {};
  for (const c of colors) {
    const k = c.hex ?? c.value ?? c.color;
    if (!k || typeof c.paintedRatio !== 'number') continue;
    out[k] = Math.max(out[k] ?? 0, c.paintedRatio);
  }
  return out;
}
const rawPainted = opt('raw-painted') ? normalizePainted(readJsonOr(opt('raw-painted'))) : null;
const states = opt('interaction-states') ? readJsonOr(opt('interaction-states')) : null;

// Q-18：mask 名单读 screenshots/index.json 的 mask 字段；显式 --masks 覆盖
let masks = [];
const masksFile = opt('masks');
if (masksFile) masks = readJsonOr(masksFile) || [];
else {
  const idx = readJsonOr(path.join(ASSET, 'screenshots', 'index.json'));
  const collected = [];
  (function walk(o) {
    if (!o || typeof o !== 'object') return;
    if (!Array.isArray(o) && Array.isArray(o.mask)) collected.push(...o.mask);
    for (const v of Array.isArray(o) ? o : Object.values(o)) walk(v);
  })(idx);
  masks = collected;
}
// index.json 的 mask 可能是符号名（如 `sticky`）而非矩形：本脚本无从换算，必须显式报出去，
// 不得静默丢掉当作「已遮」（Q-18 要求 mask 名单来自该字段）。
const maskHints = masks.filter((m) => typeof m === 'string');
masks = masks.filter((m) => m && typeof m.x === 'number' && typeof m.w === 'number');
if (maskHints.length) warnings.push({ code: 'mask-hint-not-rect', hints: [...new Set(maskHints)], note: '符号型 mask 未应用；需显式 --masks 给矩形' });

const base = await sideMaterial('baseline', opt('baseline'), 'baseline-tree', vp.px);
const cand = await sideMaterial('candidate', opt('candidate'), 'candidate-tree', vp.px);

const a = await trackA(base.png, cand.png, masks);
trackB({ baseTree: base.tree, candTree: cand.tree, index, rawPainted, chromeYaml, states });

// Q-20.4 / Q-76：无 rebuild-trace.json 不得判通过（消费侧流程失败，不是资产缺维度）
const tracePath = path.join(RUN_DIR, 'rebuild-trace.json');
const trace = readJsonOr(tracePath);
const traceIssues = [];
if (!trace) traceIssues.push('rebuild-trace.json 未按 Q-05 落盘 → 打回重建侧补作业（Q-78）');
else {
  if (trace.copy) traceIssues.push('重建页 trace 禁止写 copy[]（Q-77 / G-66）');
  if (trace.skeleton) traceIssues.push('重建页 trace 禁止写 skeleton（Q-77a）');
}

const triggers = chromeTriggers(patternsIndex);
const prevReport = readJsonOr(path.join(RUN_DIR, 'accept-report.json'));
const chromeDone = MODE === 'chrome' || prevReport?.sections?.pixel?.chromeSpotCheckDone === true;

const assetSide = findings.filter((f) => f.verdict === 'asset-side');
const consumerSide = findings.filter((f) => f.verdict === 'consumer-side');
const undecided = findings.filter((f) => f.verdict === 'undecided');
const chromeGateUnmet = triggers.length > 0 && !chromeDone;

// Q-20：轨 B 无未关资产侧失败 + chrome 抽检已做 + 轨 A 只记录 + trace 已落盘
const pass = assetSide.length === 0 && !chromeGateUnmet && traceIssues.length === 0;

const payload = {
  clause: 'Q-06–Q-21',
  head: reportHead(ASSET),
  runId: RUN_ID,
  viewport: { field: VIEWPORT, px: vp.px, viewportSource: vp.source, note: '像素来自资产聚类结果（E-08–E-13），未写死（Q-09）' },
  mode: MODE,
  chromeSpotCheckDone: MODE === 'chrome' ? true : chromeDone,
  chromeTriggers: triggers,
  chromeHost: opt('host'),
  chromeCheckedFields: [
    'variant 逐字段全等（可测项：overlay / columns）',
    'slots[].name 集合与各自 required',
    `responsive.${VIEWPORT}.columns 与 grid.content_width_px`,
    'container.mode',
  ],
  chromeNotCheckable: CHROME_NOT_CHECKABLE,
  chromeHeightObservations: chromeHeightObs,
  chromeHeightNote:
    '高度不入 schema（B-19）故不是对账项。若四项冻结字段全等而只有高度不同，按 P-11 记为第一条证据、等第二站，不得自行加字段。',
  trackA: a,
  trackB: { findings, assetSide: assetSide.length, consumerSide: consumerSide.length, undecided: undecided.length },
  traceIssues,
  warnings,
  verdict: pass ? (undecided.length || warnings.length || consumerSide.length ? 'pass-with-warnings' : 'pass') : 'fail',
  verdictNote: '像素级只回答「资产有没有漏必须档维度」，不是最终目标（Q-02）；不得回推风格级结论（Q-01）',
  tabletNote: VIEWPORT === 'tablet' ? 'tablet 档只抽查，不得单独否决资产（Q-21）' : null,
};
const file = mergeReport(RUN_DIR, 'pixel', payload);

console.log(
  JSON.stringify(
    {
      verdict: payload.verdict,
      viewport: `${VIEWPORT}=${vp.px}px(${vp.source})`,
      mismatch: a.mismatch,
      ssim: a.ssim,
      assetSide: assetSide.length,
      consumerSide: consumerSide.length,
      undecided: undecided.length,
      chromeGateUnmet,
      traceIssues: traceIssues.length,
      report: file,
    },
    null,
    2,
  ),
);
if (VIEWPORT === 'tablet' && !pass && assetSide.length) process.exit(2); // Q-21：tablet 不单独否决
process.exit(pass ? (undecided.length || warnings.length || consumerSide.length ? 2 : 0) : 1);
