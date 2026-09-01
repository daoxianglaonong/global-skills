// 资产读取与索引。pixel-check / lint-generated / accept 三处共用。
// 落点说明：共享库放在 accept/lib/ 是文件归属所迫（scripts/lib/** 归 S2），非架构选择。
// 纪律：读不到的事实一律返回 null 并由调用方记 undecided，不得替资产猜值（总纲 D3）。

import fs from 'node:fs';
import path from 'node:path';
// YAML 解析的唯一实现在 scripts/lib/yaml.mjs（B-21：原 accept/lib/mini-yaml.mjs 已并入该模块）。
import { parseYaml } from '../../lib/yaml.mjs';
// 层判定与变量名派生的唯一权威在 S3 的 schemas/css-var.mjs（B-20 裁决）。本文件只 import，
// 不得再写一套派生或反解规则（D9）。
import { tokenPathToCssVar, classifyCssVar } from '../../schemas/css-var.mjs';

export const readTextOr = (p) => (fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : null);
export const readJsonOr = (p) => {
  const t = readTextOr(p);
  if (t === null) return null;
  try {
    return JSON.parse(t);
  } catch (e) {
    throw new Error(`${p} 不是合法 JSON: ${e.message}`);
  }
};
export const readYamlOr = (p) => {
  const t = readTextOr(p);
  return t === null ? null : parseYaml(t, p);
};

// ---------- 颜色归一 ----------
// 只做形式归一后精确相等比较。ΔE 硬线已删（Q-73 / T-90），本文件不得引入任何色距阈值。
const NAMED_TRANSPARENT = new Set(['transparent', 'rgba(0,0,0,0)']);

export function normalizeColor(raw) {
  if (raw == null) return null;
  const s = String(raw).trim().toLowerCase();
  if (s === '') return null;
  if (NAMED_TRANSPARENT.has(s.replace(/\s+/g, ''))) return 'transparent';
  let m = /^#([0-9a-f]{3,8})$/.exec(s);
  if (m) {
    let h = m[1];
    if (h.length === 3 || h.length === 4) h = [...h].map((c) => c + c).join('');
    if (h.length !== 6 && h.length !== 8) return s;
    const a = h.length === 8 ? Math.round((parseInt(h.slice(6, 8), 16) / 255) * 1000) / 1000 : 1;
    return `${parseInt(h.slice(0, 2), 16)},${parseInt(h.slice(2, 4), 16)},${parseInt(h.slice(4, 6), 16)},${a}`;
  }
  m = /^rgba?\(([^)]+)\)$/.exec(s);
  if (m) {
    const parts = m[1].split(/[\s,/]+/).filter(Boolean).map((x) => x.trim());
    if (parts.length < 3) return s;
    const num = (v) => (v.endsWith('%') ? Math.round((parseFloat(v) / 100) * 255) : Math.round(parseFloat(v)));
    const a = parts[3] === undefined ? 1 : parts[3].endsWith('%') ? parseFloat(parts[3]) / 100 : parseFloat(parts[3]);
    if (a === 0) return 'transparent';
    return `${num(parts[0])},${num(parts[1])},${num(parts[2])},${Math.round(a * 1000) / 1000}`;
  }
  // oklch / lab / color() 等现代语法：不自行换算色空间（会引入本项目自造的转换误差），原样归一
  return s.replace(/\s+/g, ' ');
}

export const isColorProperty = (prop) =>
  /^(color|background-color|border(-(top|right|bottom|left))?-color|outline-color|text-decoration-color|caret-color|column-rule-color|fill|stroke)$/.test(
    prop,
  );

// ---------- token 索引 ----------
const LAYERS = new Set(['primitive', 'semantic', 'component']);
const PT_EXT = 'page-theme';

const ptExt = (node) => (node && node.$extensions && node.$extensions[PT_EXT]) || {};

// DTCG 组根值走 `$root`（G-63 / T-17）：
// 1) 组节点同时挂 `$value` 与子键 → 组根记 `<path>.$root`；
// 2) 资产把根值写成显式 `$root` 子节点（shared-contract / 本站 tokens.json）→ childKeys
//    会滤掉 `$` 前缀，必须单补行走，否则 `--color-surface-default` 等组根全部悬挂，
//    lint 的 G-LINT-01「非资产路径」会误阻断合法 semantic 引用。
export function indexTokens(tokens) {
  const list = [];
  if (!tokens || typeof tokens !== 'object') return list;
  const walk = (node, segs) => {
    if (!node || typeof node !== 'object') return;
    const hasValue = Object.prototype.hasOwnProperty.call(node, '$value');
    const childKeys = Object.keys(node).filter((k) => !k.startsWith('$') && node[k] && typeof node[k] === 'object');
    if (hasValue) {
      const isGroupRoot = childKeys.length > 0;
      list.push(makeEntry(node, isGroupRoot ? [...segs, '$root'] : segs));
    }
    if (node.$root && typeof node.$root === 'object') walk(node.$root, [...segs, '$root']);
    for (const k of childKeys) walk(node[k], [...segs, k]);
  };
  for (const k of Object.keys(tokens)) {
    if (k.startsWith('$')) continue;
    walk(tokens[k], [k]);
  }
  return list;
}

function makeEntry(node, pathSegs) {
  const ext = ptExt(node);
  const tokenPath = pathSegs.join('.');
  const cssVar = tokenPathToCssVar(tokenPath); // 确定性派生，不读 $extensions（该字段不在 T-73–T-81 闭集内）
  const cls = classifyCssVar(cssVar);
  return {
    path: tokenPath,
    segs: pathSegs,
    cssVar,
    layer: LAYERS.has(cls.layer) ? cls.layer : null, // null = 反解不出，调用方记 undecided，不得替它猜
    layerReason: cls.reason,
    type: node.$type ?? null,
    value: node.$value,
    observed: typeof node.observed === 'boolean' ? node.observed : typeof ext.observed === 'boolean' ? ext.observed : null,
    confidence: node.confidence ?? ext.confidence ?? null,
    source: node.source ?? ext.source ?? null,
    paintedRatio: typeof ext.paintedRatio === 'number' ? ext.paintedRatio : null,
    dontId: ext.dontId ?? node.dontId ?? null,
    conflict: ext.conflict === true || node.conflict === true,
    node,
  };
}

// alias 解析：`{a.b.$root}` → 目标 entry。禁止把 `{color.primary}` 这类 group 路径当 alias（G-63）。
export function resolveAlias(entry, byPath, depth = 0) {
  if (depth > 16) return null;
  const v = entry && entry.value;
  if (typeof v !== 'string') return entry;
  const m = /^\{([^}]+)\}$/.exec(v.trim());
  if (!m) return entry;
  const target = byPath.get(m[1]);
  if (!target) return null;
  return resolveAlias(target, byPath, depth + 1);
}

export function buildTokenIndex(tokens) {
  const entries = indexTokens(tokens);
  const byPath = new Map(entries.map((e) => [e.path, e]));
  const byVar = new Map(entries.map((e) => [e.cssVar, e]));
  const colorValues = new Map(); // 归一色值 -> [path]
  const fontStacks = new Map(); // 归一字体族 -> path
  for (const e of entries) {
    const resolved = resolveAlias(e, byPath) || e;
    const t = (e.type || resolved.type || '').toLowerCase();
    if (t === 'color' || (typeof resolved.value === 'string' && /^#|^rgba?\(|^hsla?\(|^oklch\(/i.test(resolved.value))) {
      const n = normalizeColor(typeof resolved.value === 'string' ? resolved.value : null);
      if (n) {
        if (!colorValues.has(n)) colorValues.set(n, []);
        colorValues.get(n).push(e.path);
      }
    }
    if (t === 'fontfamily' || t === 'font-family') {
      const fams = Array.isArray(resolved.value) ? resolved.value : String(resolved.value ?? '').split(',');
      for (const f of fams) {
        const k = normalizeFontName(f);
        if (k) fontStacks.set(k, e.path);
      }
    }
  }
  return { entries, byPath, byVar, colorValues, fontStacks };
}

export const normalizeFontName = (f) =>
  String(f ?? '')
    .trim()
    .replace(/^["']|["']$/g, '')
    .toLowerCase();

// `map(name)`（Q-63）：CSS 自定义属性名 → token。变量名由 token 路径确定性派生（B-20），
// 故这里只能是精确反查；查不到就是「资产内不存在该 token」，不得模糊匹配兜底。
export function lookupVar(varName, index) {
  const name = String(varName).trim();
  return index.byVar.get(name.startsWith('--') ? name : `--${name}`) || null;
}

// ---------- coverage：资产 README.md 的「覆盖度」节 ----------
// `G-05a` 明文：`coverage` 内嵌 README.md 的覆盖度节，根键为 `coverage`、形状等于 `M-37`，
// 且**禁止新增 `coverage.json`**。历史快照另在 `run-meta.json`（`M-44`），与当前值有意分家，
// 故本函数**不读**快照——把快照当当前值会让 Q-61 的头部显示过期覆盖度。〔B-18〕
export function findCoverage(assetDir) {
  const readme = readTextOr(path.join(assetDir, 'README.md'));
  const notes = [];
  if (fs.existsSync(path.join(assetDir, 'coverage.json'))) {
    notes.push('资产里存在 coverage.json：G-05a 禁止新增该文件，本工具不读它');
  }
  if (!readme) return { coverage: null, from: null, notes: [...notes, '资产缺 README.md（G-05a 的 coverage 载体）'] };
  const block = extractSectionCodeBlock(readme, /覆盖度/);
  if (!block) {
    return {
      coverage: null,
      from: 'README.md',
      notes: [...notes, 'README.md 无「覆盖度」节或该节无代码块；历史快照可在 run-meta.json 查（M-44），但那不是当前值'],
    };
  }
  let parsed = null;
  try {
    parsed = parseYaml(block, `${assetDir}/README.md#覆盖度`);
  } catch (e) {
    return { coverage: null, from: 'README.md#覆盖度', notes: [...notes, `覆盖度节 YAML 解析失败：${e.message}`] };
  }
  const cov = parsed && typeof parsed === 'object' ? parsed.coverage : null;
  if (!cov || typeof cov !== 'object') {
    return { coverage: null, from: 'README.md#覆盖度', notes: [...notes, '覆盖度节的根键不是 `coverage`（G-05a）'] };
  }
  return { coverage: cov, from: 'README.md#覆盖度', notes };
}

// 取某节标题之后的第一个围栏代码块内容
function extractSectionCodeBlock(md, titleRe) {
  const lines = md.split(/\r?\n/);
  let i = 0;
  let level = 0;
  for (; i < lines.length; i++) {
    const m = /^(#{1,6})\s+(.*)$/.exec(lines[i]);
    if (m && titleRe.test(m[2])) {
      level = m[1].length;
      i++;
      break;
    }
  }
  if (!level) return null;
  const buf = [];
  let inFence = false;
  for (; i < lines.length; i++) {
    const h = /^(#{1,6})\s+/.exec(lines[i]);
    if (!inFence && h && h[1].length <= level) break;
    if (/^\s*```/.test(lines[i])) {
      if (inFence) return buf.join('\n');
      inFence = true;
      continue;
    }
    if (inFence) buf.push(lines[i]);
  }
  return inFence && buf.length ? buf.join('\n') : null;
}

// ---------- DESIGN.md §8 Don't 节 ----------
export function extractDontSection(designMd) {
  if (!designMd) return null;
  const lines = designMd.split(/\r?\n/);
  let start = -1;
  let level = 0;
  for (let i = 0; i < lines.length; i++) {
    const m = /^(#{1,6})\s+(.*)$/.exec(lines[i]);
    if (!m) continue;
    const title = m[2];
    if (start < 0 && (/^8[.、\s]/.test(title) || /don'?t/i.test(title))) {
      start = i;
      level = m[1].length;
    } else if (start >= 0 && m[1].length <= level) {
      return lines.slice(start, i).join('\n');
    }
  }
  return start >= 0 ? lines.slice(start).join('\n') : null;
}

// ---------- 工作区 ----------
export function ensureRunDir(workRoot, styleSetId, accKey) {
  const dir = path.join(workRoot, styleSetId, accKey);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

export const utcRunId = (d = new Date()) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');

// accept-report.json 由像素轨 / lint / 归属实验三方分节写入，合并落盘（Q-05 只准这一份报告文件）
export function mergeReport(runDir, section, payload) {
  const file = path.join(runDir, 'accept-report.json');
  const prev = readJsonOr(file) || { schema_version: 1, sections: {} };
  prev.sections = prev.sections || {};
  prev.sections[section] = payload;
  prev.updatedAt = new Date().toISOString();
  fs.writeFileSync(file, JSON.stringify(prev, null, 2) + '\n');
  return file;
}

// Q-61 / Q-61a / Q-61b：报告头部强制项。缺任一必读字段一律显式记 missing，不得省略。
export function reportHead(assetDir) {
  const found = findCoverage(assetDir);
  const cov = found.coverage;
  const holdoutDeclared = cov && typeof cov.holdoutDeclared === 'boolean' ? cov.holdoutDeclared : null;
  const cohesion = cov && cov.cohesion ? cov.cohesion.verdict ?? null : null;
  return {
    coverageFrom: found.from,
    coverageNotes: found.notes.length ? found.notes : null,
    coverageMissing: !cov,
    status: cov ? (cov.status ?? null) : null,
    statusCaveat: cov ? 'status 必须连同 M-38a 限定语一起读，不得只看 full' : null,
    pagesLength: cov && Array.isArray(cov.pages) ? cov.pages.length : null,
    blockers: cov && Array.isArray(cov.blockers) ? cov.blockers : null,
    holdoutDeclared,
    cohesionVerdict: cohesion,
    // Q-61a：未预声明 holdout 时报告必须显式写此句，且全文不得出现「风格级验收通过」
    independentValidationNotice:
      holdoutDeclared === true ? null : '本次未完成独立风格验证（Q-61a）；Q-33 第 1 槽空缺（Q-56）',
    // Q-61b：疑似多套设计语言时品牌归属实验不适用
    attributionApplicable: cohesion === 'mixed-suspected' ? false : cohesion == null ? null : true,
  };
}
