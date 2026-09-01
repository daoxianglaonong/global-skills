#!/usr/bin/env node
// 生成后 lint（规则表 G-LINT-01–G-LINT-09，分层唯一定义在 ch07 G-48 / G-52；本脚本只实现不发明）。
//
//   node lint-generated.mjs --asset page-theme/<style-set-id> --page out.html \
//        [--css a.css,b.css] [--trace generate-trace.holdout.json] \
//        [--section lint|lint-comparison] [--run <accept-run-id>] [--work .page-theme-work]
//
// 指标定义抄 Q-63 / Q-64 / Q-67 / Q-70 / Q-71 / Q-72：颜色与字体族 0 容忍 + 豁免清单（G-53），
// 尺寸类只记录不设红线，`cited` / `literalHitRate` 本身不设红线。
// 退出码：0 通过 / 1 阻断 / 2 仅报警（与 validate-asset.mjs 一致）。

import fs from 'node:fs';
import path from 'node:path';
import {
  readJsonOr,
  readTextOr,
  buildTokenIndex,
  lookupVar,
  normalizeColor,
  normalizeFontName,
  isColorProperty,
  extractDontSection,
  mergeReport,
  reportHead,
  utcRunId,
} from './accept/lib/asset-read.mjs';
// 双闸门判据的唯一来源（B-20）：`primitiveLeak.color` 与 `unresolvedVar` 都由本模块判。
// 本文件**不得**自己再写一份变量名派生或反解逻辑（D9）。
import { classifyCssVar, isColorPrimitiveLeak, isUnresolvedVar } from './schemas/css-var.mjs';

// G-53 豁免清单（抄〔014〕，不得增删）
const COLOR_EXEMPT = new Set(['inherit', 'unset', 'initial', 'currentcolor', 'transparent', 'none', '0']);
const FONT_EXEMPT = new Set(['inherit', 'unset', 'initial']);
// Q-63 属性闭集 T（`cited` 分母）
const T_EXACT = new Set([
  'color', 'background-color', 'outline-color',
  'font-family', 'font-size', 'font-weight', 'line-height', 'letter-spacing',
  'border-radius', 'box-shadow', 'gap',
  'transition-duration', 'transition-timing-function',
]);
const T_PREFIX = ['border-', 'padding-'];
const CONF_ORDER = { low: 0, medium: 1, high: 2 };

const argv = process.argv.slice(2);
const opt = (n, d = null) => {
  const i = argv.indexOf(`--${n}`);
  return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : d;
};
const die = (m) => {
  console.error(`lint-generated: ${m}`);
  process.exit(1);
};

const ASSET = opt('asset');
const PAGE = opt('page');
if (!ASSET || !PAGE) die('用法见文件头；--asset 与 --page 必填');
if (!fs.existsSync(ASSET)) die(`资产目录不存在: ${ASSET}`);
if (!fs.existsSync(PAGE)) die(`生成页不存在: ${PAGE}`);
const STYLE_SET_ID = path.basename(path.resolve(ASSET));
const RUN_DIR = path.join(opt('work', '.page-theme-work'), STYLE_SET_ID, opt('run', utcRunId()));

const tokens = readJsonOr(path.join(ASSET, 'tokens.json'));
if (!tokens) die('缺 tokens.json');
const index = buildTokenIndex(tokens);
const designMd = readTextOr(path.join(ASSET, 'DESIGN.md'));
const voiceMd = readTextOr(path.join(ASSET, 'voice.md'));
const trace = opt('trace') ? readJsonOr(opt('trace')) : null;

const html = fs.readFileSync(PAGE, 'utf8');
const cssFiles = (opt('css') || '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

const violations = []; // {rule, level: block|warn, ...}
const add = (rule, level, info) => violations.push({ rule, level, ...info });

// ---------- CSS 声明扫描 ----------
// 无依赖实现（package.json 归 S2，依赖已锁死五个）。跳过 @font-face 与 @keyframes：
// 前者的 font-family 是字体描述符不是用色/用字，后者是动画关键帧位移（Q-63 排除项）。
function scanCss(text, file) {
  const out = [];
  const src = text.replace(/\/\*[\s\S]*?\*\//g, '');
  let i = 0;
  const readBlock = (selector, skip) => {
    let depth = 1;
    let buf = '';
    while (i < src.length && depth > 0) {
      const c = src[i++];
      if (c === '{') depth++;
      else if (c === '}') {
        depth--;
        if (!depth) break;
      }
      buf += c;
    }
    if (skip) return;
    if (/[{]/.test(buf)) {
      out.push(...scanCss(buf, file).map((d) => ({ ...d, selector: `${selector} ${d.selector}`.trim() })));
      return;
    }
    for (const raw of splitDecls(buf)) {
      const k = raw.indexOf(':');
      if (k < 0) continue;
      const prop = raw.slice(0, k).trim().toLowerCase();
      const value = raw.slice(k + 1).trim();
      if (!prop || !value) continue;
      out.push({ file, selector, prop, value });
    }
  };
  while (i < src.length) {
    const brace = src.indexOf('{', i);
    if (brace < 0) break;
    const selector = src.slice(i, brace).trim().replace(/\s+/g, ' ');
    i = brace + 1;
    const at = /^@([a-z-]+)/i.exec(selector);
    const skip = at && ['font-face', 'keyframes', '-webkit-keyframes', 'property'].includes(at[1].toLowerCase());
    readBlock(selector, skip);
  }
  return out;
}
function splitDecls(block) {
  const parts = [];
  let depth = 0;
  let quote = null;
  let cur = '';
  for (let i = 0; i < block.length; i++) {
    const c = block[i];
    if (quote) {
      cur += c;
      if (c === quote && block[i - 1] !== '\\') quote = null;
      continue;
    }
    if (c === '"' || c === "'") quote = c;
    else if (c === '(') depth++;
    else if (c === ')') depth--;
    if (c === ';' && depth === 0) {
      parts.push(cur);
      cur = '';
      continue;
    }
    cur += c;
  }
  if (cur.trim()) parts.push(cur);
  return parts.map((s) => s.trim()).filter(Boolean);
}

// ---------- HTML：内联样式 + 祖先链（G-54 只认得到标记才豁免）+ 可见文本 ----------
function scanHtml(text) {
  const decls = [];
  const textChunks = [];
  const stack = [];
  const re = /<(\/?)([a-zA-Z][\w-]*)([^>]*?)(\/?)>|([^<]+)/g;
  let m;
  while ((m = re.exec(text))) {
    if (m[5] !== undefined) {
      const chunk = m[5].replace(/\s+/g, ' ').trim();
      if (chunk && !stack.some((s) => s.tag === 'script' || s.tag === 'style')) textChunks.push(chunk);
      continue;
    }
    const closing = m[1] === '/';
    const tag = m[2].toLowerCase();
    const attrs = m[3] || '';
    const selfClose = m[4] === '/' || ['img', 'br', 'hr', 'input', 'meta', 'link', 'source'].includes(tag);
    if (closing) {
      for (let i = stack.length - 1; i >= 0; i--)
        if (stack[i].tag === tag) {
          stack.length = i;
          break;
        }
      continue;
    }
    const widget = /data-pt-widget\s*=\s*["']?third-party/i.test(attrs);
    const pattern = /data-pattern\s*=/.test(attrs);
    const frame = { tag, widget: widget || stack.some((s) => s.widget), pattern };
    const style = /style\s*=\s*"([^"]*)"|style\s*=\s*'([^']*)'/i.exec(attrs);
    if (style) {
      for (const raw of splitDecls(style[1] ?? style[2] ?? '')) {
        const k = raw.indexOf(':');
        if (k < 0) continue;
        decls.push({
          file: PAGE,
          selector: `<${tag} inline>`,
          prop: raw.slice(0, k).trim().toLowerCase(),
          value: raw.slice(k + 1).trim(),
          widget: frame.widget,
          floorContainer: pattern,
        });
      }
    }
    if (!selfClose) stack.push(frame);
  }
  return { decls, text: textChunks.join(' ') };
}

const htmlScan = scanHtml(html);
const declarations = [
  ...htmlScan.decls,
  ...cssFiles.flatMap((f) => {
    if (!fs.existsSync(f)) die(`CSS 不存在: ${f}`);
    return scanCss(fs.readFileSync(f, 'utf8'), f).map((d) => ({
      ...d,
      widget: /\[data-pt-widget/i.test(d.selector),
      floorContainer: /\[data-pattern/i.test(d.selector),
    }));
  }),
];

// ---------- 取值分析 ----------
const varRefs = (v) => [...String(v).matchAll(/var\(\s*(--[\w-]+)/g)].map((x) => x[1]);
const colorLiterals = (v) =>
  [...String(v).matchAll(/#[0-9a-fA-F]{3,8}\b|\brgba?\([^)]*\)|\bhsla?\([^)]*\)|\boklch\([^)]*\)|\blab\([^)]*\)/g)].map((x) => x[0]);
const inT = (prop, d) => {
  if (T_EXACT.has(prop)) return true;
  if (prop.startsWith('margin-')) return !!d.floorContainer; // Q-63：margin-* 仅楼层容器
  return T_PREFIX.some((p) => prop.startsWith(p));
};

let denominator = 0;
let citedNum = 0;
let literalHitNum = 0;
let suppliedOnlyRefs = 0;
let totalTokenRefs = 0;
// 双闸门的两个计数（B-20）：**不合并**。前者是「确实引了 primitive」，后者是「无法证明引了什么」，
// 归因不同；混成一个数会让 Q-82 的归因树读错分支。二者必须同时为 0，门才算关上。
const primitiveLeak = { color: 0, dimension: 0 };
let unresolvedVar = 0;
const unresolvedDetail = [];
const leakDetail = [];
const conflictRefs = [];
const danglingVars = new Set();
let widgetExemptRefs = 0;

for (const d of declarations) {
  const prop = d.prop;
  if (prop.startsWith('--')) continue; // 自定义属性声明本身不是用色点
  // Q-63 排除项：第三方 widget 根整枝不进分母，也不进任何闸门计数（G-54）
  const counted = inT(prop, d) && !d.widget;
  if (counted) denominator++;
  const refs = varRefs(d.value);
  const isColor = isColorProperty(prop) || /box-shadow|^background$|^border(-(top|right|bottom|left))?$|^outline$/.test(prop);

  for (const name of refs) {
    if (d.widget) {
      widgetExemptRefs++;
      continue;
    }
    totalTokenRefs++;
    const cls = classifyCssVar(name);
    const entry = lookupVar(name, index);

    // 闸门 A：无法证明引了什么（防绕过的那一半）
    if (isUnresolvedVar(name)) {
      unresolvedVar++;
      unresolvedDetail.push({ selector: d.selector, prop, var: name, type: cls.type, reason: cls.reason });
      add('G-LINT-01', 'block', {
        selector: d.selector,
        prop,
        var: name,
        varType: cls.type,
        reason: `变量名反解不出 token 路径（${cls.reason}）：生成侧只准用 token 路径确定性派生的变量名，`
          + `否则改个名就能绕过 primitiveLeak.color 这道门（B-20 · unresolvedVar 必须为 0）`,
      });
    }
    // 闸门 B：可证的颜色越层（含已作废键名等闭集违规）
    if (isColorPrimitiveLeak(name)) {
      primitiveLeak.color++;
      add('G-LINT-05', 'block', { selector: d.selector, prop, var: name, layer: cls.layer, reason: `颜色跳过 semantic（${cls.reason}）；Q-67 要求 primitiveLeak.color = 0` });
    } else if (cls.layer === 'primitive') {
      primitiveLeak.dimension++;
      leakDetail.push({ selector: d.selector, prop, var: name, reason: cls.reason });
    }

    if (cls.layer === 'semantic' || cls.layer === 'component') {
      if (counted) citedNum++;
      if (!entry) {
        // 名字合法但资产里没有这个键：悬挂引用。颜色侧即 G-LINT-01 的「非资产路径」，
        // 且 G-51 要求阻断类必须能从资产自身派生——查不到就派生不出。
        danglingVars.add(name);
        if (cls.type === 'color') {
          add('G-LINT-01', 'block', { selector: d.selector, prop, var: name, reason: '非资产路径：变量名合法但 tokens.json 里不存在该 token' });
        } else {
          add('G-LINT-09', 'warn', { selector: d.selector, prop, var: name, reason: '悬挂引用：变量名合法但 tokens.json 里不存在该 token（尺寸类只报警，Q-66）' });
        }
      }
    }
    if (entry) {
      if (entry.observed === false && ['supplied', 'autodetected'].includes(String(entry.source))) suppliedOnlyRefs++;
      if (entry.conflict) conflictRefs.push(entry.path);
    }
  }

  // G-LINT-01：颜色 0 容忍。纯色属性值不是 var() 且不在 G-53 豁免清单 → 字面量即违例。
  if (isColorProperty(prop)) {
    const v = d.value.trim().toLowerCase().replace(/\s*!important$/, '');
    if (!v.startsWith('var(') && !COLOR_EXEMPT.has(v)) {
      const n = normalizeColor(v);
      const hitPaths = n ? index.colorValues.get(n) : null;
      if (counted && hitPaths && hitPaths.length) literalHitNum++; // Q-64.2：只计 literalHitRate，不计 cited
      if (!d.widget) {
        add('G-LINT-01', 'block', {
          selector: d.selector,
          prop,
          value: d.value,
          matchedTokens: hitPaths || [],
          reason: '颜色字面量（Q-62 / Q-65：颜色 0 容忍；命中 token 值也不豁免，Q-64.5）',
        });
      }
    }
  } else if (isColor) {
    for (const lit of colorLiterals(d.value)) {
      if (COLOR_EXEMPT.has(lit.toLowerCase())) continue;
      if (!d.widget) add('G-LINT-01', 'block', { selector: d.selector, prop, value: lit, reason: '简写属性内的颜色字面量（含阴影色 / 边框色）' });
    }
  }

  // G-LINT-02：字体族必须在资产已声明字体栈
  if (prop === 'font-family') {
    const v = d.value.trim().toLowerCase().replace(/\s*!important$/, '');
    if (!v.startsWith('var(') && !FONT_EXEMPT.has(v)) {
      for (const fam of v.split(',')) {
        const f = normalizeFontName(fam);
        if (!f || FONT_EXEMPT.has(f)) continue;
        if (!index.fontStacks.has(f) && !d.widget) {
          add('G-LINT-02', 'block', { selector: d.selector, value: f, reason: '字体族不在 tokens.json 排印栈（Q-62 0 容忍）' });
        }
      }
    }
  }
}

// trace 里的 token_refs 也进 primitiveLeak / cited 统计口径（Q-80 主轴是 CSS/DOM，本项只作补充）
if (trace && Array.isArray(trace.floors)) {
  for (const fl of trace.floors) {
    for (const ref of fl.token_refs || []) {
      const m = /^\{(.+)\}$/.exec(String(ref).trim());
      if (!m) {
        add('G-LINT-09', 'warn', { source: 'trace', value: ref, reason: 'token_refs 不是 {path} 形状' });
        continue;
      }
      if (!m[1].endsWith('.$root') && !index.byPath.has(m[1])) {
        add('G-LINT-09', 'warn', { source: 'trace', value: ref, reason: '引用了 group 路径或不存在的键；组根必须写 .$root（G-63 / T-17）' });
      }
    }
  }
}

// ---------- G-LINT-03：Don't 条目缺失 ----------
const dontSection = extractDontSection(designMd);
const unobserved = index.entries.filter((e) => e.observed === false);
if (!designMd) {
  add('G-LINT-03', 'block', { reason: '缺 DESIGN.md，Don\'t 条目无从对账' });
} else if (!dontSection) {
  if (unobserved.length) add('G-LINT-03', 'block', { reason: 'DESIGN.md 无 §8 Don\'t 节，但资产存在未上屏项' });
} else {
  const rampUnobserved = unobserved.filter((e) => e.layer === 'primitive' && (e.type || '').toLowerCase() === 'color');
  const roleUnobserved = unobserved.filter((e) => e.layer === 'semantic' || e.layer === 'component');
  for (const e of roleUnobserved) {
    if (!e.dontId) {
      add('G-LINT-03', 'block', { tokenPath: e.path, reason: '未上屏的 semantic / component 项缺 dontId（T-126）' });
    } else if (!dontSection.includes(e.dontId)) {
      add('G-LINT-03', 'block', { tokenPath: e.path, dontId: e.dontId, reason: 'DESIGN.md §8 缺该 dontId 对应条目（Q-69.1 逐条）' });
    }
  }
  if (rampUnobserved.length) {
    const merged = rampUnobserved.map((e) => e.dontId).filter(Boolean).find((id) => dontSection.includes(id));
    if (!merged) add('G-LINT-03', 'block', { count: rampUnobserved.length, reason: '整盘未上屏色阶缺唯一一条合并 Don\'t（Q-69.1）' });
  }
}

// ---------- G-LINT-04 / G-LINT-06 / Q-72 ----------
for (const e of index.entries) {
  if (e.observed === false && (e.confidence === null || e.confidence === undefined || e.confidence === '')) {
    add('G-LINT-06', 'block', { tokenPath: e.path, reason: 'observed:false 缺 confidence，资产不合格（D3 / G-34）' });
  }
  if (e.paintedRatio === 0) {
    const rank = CONF_ORDER[String(e.confidence).toLowerCase()];
    if (rank === undefined) {
      add('G-LINT-04', 'warn', { tokenPath: e.path, confidence: e.confidence, reason: 'paintedRatio=0 但 confidence 不在闭集，档次判不出（不替它猜档）' });
    } else if (rank >= CONF_ORDER.medium) {
      add('G-LINT-04', 'block', { tokenPath: e.path, confidence: e.confidence, reason: 'paintedRatio=0 且 confidence≥medium（Q-72，本项目自定硬门）' });
    }
  }
}

// ---------- G-LINT-07：voice.md 禁词（字段存在才查） ----------
let voiceChecked = false;
if (voiceMd) {
  const lines = voiceMd.split(/\r?\n/);
  let inSection = false;
  let level = 0;
  const words = [];
  for (const line of lines) {
    const h = /^(#{1,6})\s+(.*)$/.exec(line);
    if (h) {
      if (inSection && h[1].length <= level) inSection = false;
      if (!inSection && /禁词|禁用词|forbidden|banned/i.test(h[2])) {
        inSection = true;
        level = h[1].length;
      }
      continue;
    }
    if (!inSection) continue;
    const li = /^\s*[-*+]\s+(.+)$/.exec(line);
    if (li) words.push(li[1].replace(/[`*]/g, '').split(/[（(—:：]/)[0].trim());
  }
  if (words.length) {
    voiceChecked = true;
    for (const w of words) {
      if (w && htmlScan.text.includes(w)) add('G-LINT-07', 'block', { word: w, reason: '生成文案命中 voice.md 禁词' });
    }
  }
}

// ---------- 报警类指标（G-LINT-08 / G-LINT-09；一律不设红线） ----------
const rate = (num, den) => (den ? Math.round((num / den) * 10000) / 10000 : null);
const metrics = {
  denominator,
  cited: rate(citedNum, denominator),
  literalHitRate: rate(literalHitNum, denominator),
  primitiveLeak, // Q-67：按属性拆，禁止无修饰的 primitiveLeak=0
  primitiveLeakDimensionDetail: leakDetail,
  unresolvedVar,
  unresolvedVarDetail: unresolvedDetail,
  danglingVars: [...danglingVars],
  widgetExemptRefs,
  suppliedOnlyRate: rate(suppliedOnlyRefs, totalTokenRefs),
  conflictRate: rate(conflictRefs.length, totalTokenRefs),
  conflictPaths: [...new Set(conflictRefs)],
  note: 'cited / literalHitRate 本身不设红线（Q-64 / Q-66）；已删的 0.70 / 0.60 不得复活（G-57）',
};
// B-20 的双闸门：两项**同时**为 0 才算关上；两项分列，不合并计数
const gate = {
  clause: 'Q-67 · G-LINT-05 · B-20',
  primitiveLeakColor: primitiveLeak.color,
  unresolvedVar,
  closed: primitiveLeak.color === 0 && unresolvedVar === 0,
  note: '`primitiveLeak.color` = 确实引了 primitive；`unresolvedVar` = 无法证明引了什么。'
    + '归因不同故分列；只查前者时改个变量名即可绕过整道门，故必须同时为 0。'
    + '两者在「顶层是 color 却既非色相族也不在角色词表内」这一类上有意重叠。',
};
if (metrics.suppliedOnlyRate) add('G-LINT-08', 'warn', { suppliedOnlyRate: metrics.suppliedOnlyRate, reason: '引用了未上屏的供给 / 第一方声明值（不硬禁，Q-70）' });
if (primitiveLeak.dimension) add('G-LINT-09', 'warn', { primitiveLeakDimension: primitiveLeak.dimension, reason: '本可用 semantic 却用了 primitive（尺寸类允许，只报警，Q-67）' });
if (metrics.conflictPaths.length) add('G-LINT-09', 'warn', { conflictPaths: metrics.conflictPaths, reason: 'token 取值冲突清单（描述性，禁止按比例自动定性版本不符，Q-71）' });
if (!voiceChecked) metrics.voiceNote = 'voice.md 无禁词节或不存在 → G-LINT-07 不触发（Q-69.2）';

const blocks = violations.filter((v) => v.level === 'block');
const warns = violations.filter((v) => v.level === 'warn');
const blocked = blocks.length > 0 || !gate.closed;
const payload = {
  clause: 'G-48 / G-52（分层）· Q-62–Q-75（指标）· B-20（双闸门）',
  head: reportHead(ASSET),
  page: PAGE,
  css: cssFiles,
  gate,
  metrics,
  blocking: blocks,
  warning: warns,
  verdict: blocked ? 'blocked' : warns.length ? 'pass-with-warnings' : 'pass',
  verdictNote: 'checklist 只辅助归因与回归，不得替代 Q-40（Q-59）；不得按 coverage 分档（Q-60）',
};
fs.mkdirSync(RUN_DIR, { recursive: true });
const file = mergeReport(RUN_DIR, opt('section', 'lint'), payload);

console.log(
  JSON.stringify(
    {
      verdict: payload.verdict,
      gate: { primitiveLeakColor: gate.primitiveLeakColor, unresolvedVar: gate.unresolvedVar, closed: gate.closed },
      blocking: blocks.length,
      warning: warns.length,
      cited: metrics.cited,
      primitiveLeakDimension: primitiveLeak.dimension,
      report: file,
    },
    null,
    2,
  ),
);
process.exit(blocked ? 1 : warns.length ? 2 : 0);
