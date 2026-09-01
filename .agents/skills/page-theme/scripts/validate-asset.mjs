#!/usr/bin/env node
// 资产目录 schema 校验器。零第三方依赖（含 YAML 解析）。
//
//   node validate-asset.mjs <资产目录> [--json] [--max-per-code=N]
//
// 退出码契约（跨件接口，`_build-stitch-log` 已冻）：
//   0 = 通过（无任何条目）
//   1 = 存在阻断类条目
//   2 = 仅有报警类条目
//
// 形状校验遍历 schemas/*.schema.mjs 的声明式描述；跨字段与跨文件的语义规则落本文件
// 的规则表，每条挂条款号。分层（阻断 / 报警）一律照抄 T-/P-/V- 各章已给出的分类，
// 本文件不新发明阈值（总纲 D2）。

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  ASSET_FILES, PATTERNS_ALLOWED,
  INDEX_SHAPE, PATTERN_SHAPE, CHROME_SHAPE,
  VOICE_FRONT_MATTER_SHAPE, LOCALE_PACK_SUBSECTIONS,
  VALUE_SHAPES, EXT_SHAPE, RESOLVER_SHAPE, REQUIRED_TOKEN_PATHS,
  ENUMS as E,
} from './schemas/index.mjs';
import { parseYaml } from './lib/yaml.mjs';

/* ================================================================== */
/* 0. 条目容器                                                         */
/* ================================================================== */

const BLOCK = 'block';
const WARN = 'warn';

function makeReport() {
  return { issues: [] };
}

function add(report, level, code, clause, file, at, message) {
  report.issues.push({ level, code, clause, file, at: at || '', message });
}

/* ================================================================== */
/* 1. YAML 解析：唯一实现在 scripts/lib/yaml.mjs〔B-21〕                 */
/*    本文件不得再写第二份解析逻辑（D9）。子集边界与「不支持即抛错」的     */
/*    底线见该模块文件头。`parseYamlLite` 保留为历史别名（S3 交付说明已    */
/*    把它列为可被 S4 import 的出口）。                                  */
/* ================================================================== */

export { parseYaml };
export const parseYamlLite = parseYaml;

/* ================================================================== */
/* 2. 声明式形状遍历器                                                  */
/* ================================================================== */

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

function checkShape(node, value, report, file, at, inherited = BLOCK) {
  if (!node) return;
  const level = node.level || inherited;
  const clause = node.clause || '';
  if (value === null || value === undefined) {
    if (node.nullable) return;
    add(report, level, 'null-value', clause, file, at,
      '值为 null；缺观测必须保留字段 + observed:false + confidence，不得填 null 或「未知」');
    return;
  }
  switch (node.kind) {
    case 'any':
      return;
    case 'scalar':
      return checkScalar(node, value, report, file, at, level, clause);
    case 'union': {
      for (const opt of node.options) {
        const probe = makeReport();
        checkShape(opt, value, probe, file, at, level);
        if (probe.issues.length === 0) return;
      }
      return add(report, level, 'union-mismatch', clause, file, at, '取值不符合本位允许的任一形状');
    }
    case 'array': {
      if (!Array.isArray(value)) return add(report, level, 'type-mismatch', clause, file, at, '必须是数组');
      if (node.min != null && value.length < node.min) {
        add(report, level, 'array-too-short', clause, file, at, `至少 ${node.min} 条，实得 ${value.length}`);
      }
      if (node.max != null && value.length > node.max) {
        add(report, level, 'array-too-long', clause, file, at, `至多 ${node.max} 条，实得 ${value.length}`);
      }
      value.forEach((v, i) => checkShape(node.item, v, report, file, `${at}[${i}]`, level));
      return;
    }
    case 'object': {
      if (!isObj(value)) return add(report, level, 'type-mismatch', clause, file, at, '必须是对象');
      for (const key of node.required || []) {
        if (!(key in value)) {
          add(report, level, 'missing-field', node.fields?.[key]?.clause || clause, file, at, `缺必填字段 \`${key}\``);
        }
      }
      for (const [key, v] of Object.entries(value)) {
        if (node.forbidden && key in node.forbidden) {
          const f = node.forbidden[key];
          add(report, BLOCK, 'forbidden-field', f.clause, file, at, f.message);
          continue;
        }
        if (node.fields && key in node.fields) {
          checkShape(node.fields[key], v, report, file, at ? `${at}.${key}` : key, level);
          continue;
        }
        const mode = node.unknown || 'forbid';
        if (mode === 'allow') continue;
        add(report, mode === 'warn' ? WARN : level, 'unknown-field', clause, file, at,
          `未知字段 \`${key}\`；结构化字段必须落闭集`);
      }
      return;
    }
    case 'map': {
      if (!isObj(value)) return add(report, level, 'type-mismatch', clause, file, at, '必须是映射');
      const keys = Object.keys(value);
      if (node.min != null && keys.length < node.min) {
        add(report, level, 'map-too-small', clause, file, at, `至少 ${node.min} 个键，实得 ${keys.length}`);
      }
      for (const k of keys) {
        if (node.keyEnum && !node.keyEnum.includes(k)) {
          add(report, level, 'key-not-in-enum', clause, file, at, `键 \`${k}\` 不在闭集内`);
          continue;
        }
        if (node.keyPattern && !node.keyPattern.test(k)) {
          add(report, level, 'key-pattern', clause, file, at, `键 \`${k}\` 不符合命名形态 ${node.keyPattern}`);
          continue;
        }
        checkShape(node.value, value[k], report, file, at ? `${at}.${k}` : k, level);
      }
      return;
    }
    default:
      return;
  }
}

function checkScalar(node, value, report, file, at, level, clause) {
  const t = node.type;
  const typeOk =
    t === 'string' ? typeof value === 'string'
      : t === 'int' ? Number.isInteger(value)
        : t === 'number' ? typeof value === 'number' && Number.isFinite(value)
          : t === 'boolean' ? typeof value === 'boolean'
            : true;
  if (!typeOk) {
    return add(report, level, 'type-mismatch', clause, file, at, `必须是 ${t}，实得 ${JSON.stringify(value)}`);
  }
  if (node.const !== undefined && value !== node.const) {
    return add(report, level, 'const-mismatch', clause, file, at, `必须恒为 ${JSON.stringify(node.const)}`);
  }
  if (node.enum && !node.enum.includes(value)) {
    return add(report, level, 'enum-violation', clause, file, at,
      `\`${value}\` 不在闭集 [${node.enum.join(' | ')}] 内`);
  }
  if (node.pattern && typeof value === 'string' && !node.pattern.test(value)) {
    return add(report, level, 'pattern-violation', clause, file, at, `\`${value}\` 不符合 ${node.pattern}`);
  }
  if (node.minLength != null && typeof value === 'string' && value.trim().length < node.minLength) {
    return add(report, level, 'too-short', clause, file, at, `字符串不得为空`);
  }
  if (typeof value === 'number') {
    if (node.min != null && value < node.min) add(report, level, 'range-violation', clause, file, at, `不得小于 ${node.min}`);
    if (node.max != null && value > node.max) add(report, level, 'range-violation', clause, file, at, `不得大于 ${node.max}`);
  }
}

/* ================================================================== */
/* 3. tokens.json 语义规则                                             */
/* ================================================================== */

const META = new Set(E.DTCG_META_KEYS);
const kidsOf = (o) => Object.keys(o).filter((k) => !META.has(k));
const isTokenNode = (v) => isObj(v) && '$value' in v;
const extOf = (n) => (isObj(n?.$extensions) ? n.$extensions[E.EXT_NAMESPACE] : undefined);
const isAlias = (v) => typeof v === 'string' && /^\{[^{}]+\}$/.test(v);
const aliasPath = (v) => v.slice(1, -1);

function collectNodes(root) {
  const list = [];
  const byPath = new Map();
  (function rec(node, segs) {
    if (!isObj(node)) return;
    const p = segs.join('.');
    const kids = kidsOf(node);
    if (segs.length) {
      const entry = { path: p, node, kids, isToken: isTokenNode(node), parent: segs.slice(0, -1).join('.') };
      list.push(entry);
      byPath.set(p, entry);
    }
    for (const k of kids) rec(node[k], [...segs, k]);
  })(root, []);
  return { list, byPath };
}

/** 顺 alias 链取终点 token；返回 { entry, hops, error }。 */
function resolveAlias(byPath, startPath, seen = new Set()) {
  let cur = byPath.get(startPath);
  let hops = 0;
  while (cur && isAlias(cur.node.$value)) {
    if (seen.has(cur.path)) return { entry: null, hops, error: 'cycle' };
    seen.add(cur.path);
    const next = byPath.get(aliasPath(cur.node.$value));
    if (!next) return { entry: null, hops, error: 'missing' };
    cur = next;
    hops++;
  }
  return { entry: cur, hops, error: null };
}

function hexOf(byPath, tokenPath) {
  const r = resolveAlias(byPath, tokenPath);
  const v = r.entry?.node?.$value;
  return isObj(v) && typeof v.hex === 'string' ? v.hex.toUpperCase() : null;
}

/** 允许的 semantic 色路径集合（`color.` 之下）。T-46 / T-23 / T-37 */
const ALLOWED_COLOR_TOKENS = new Set();
const BARE_LEAF_ROLES = new Set();
for (const [role, spec] of Object.entries(E.COLOR_ROLES)) {
  for (const k of Object.keys(spec.keys)) ALLOWED_COLOR_TOKENS.add(`color.${role}.${k}`);
  if (spec.bareLeafAllowed) { ALLOWED_COLOR_TOKENS.add(`color.${role}`); BARE_LEAF_ROLES.add(role); }
}

function validateTokensFile(root, report, file, opts) {
  const { designText, isDark } = opts;
  const { list, byPath } = collectNodes(root);

  /* --- 文件头与顶层 group：T-04 / T-05 / T-124 --- */
  if (root.$schema !== E.SCHEMA_URL_FORMAT) {
    add(report, BLOCK, 'schema-url', 'T-04', file, '$schema', `必须恒为 ${E.SCHEMA_URL_FORMAT}`);
  }
  for (const k of Object.keys(root)) {
    if (META.has(k)) continue;
    if (E.TOKENS_TOP_FORBIDDEN.includes(k)) {
      add(report, BLOCK, 'top-group-forbidden', 'T-05', file, k, '不得建 `layout` 组；站级派生栅格只在 patterns/index.yaml（P-27）');
      continue;
    }
    if (!E.TOKENS_TOP_GROUPS.includes(k)) {
      add(report, BLOCK, 'top-group-unknown', 'T-05', file, k, `顶层 group \`${k}\` 不在 T-05 白名单内`);
      continue;
    }
    if (isObj(root[k]) && kidsOf(root[k]).length === 0) {
      add(report, BLOCK, 'top-group-empty', 'T-05', file, k, '未观测到的可选顶层 group 必须省略，不得写空对象凑结构');
    }
  }
  if (!isDark) {
    const scheme = extOf(root)?.defaultScheme;
    if (!E.DEFAULT_SCHEME.includes(scheme)) {
      add(report, BLOCK, 'default-scheme', 'T-124', file, '$extensions.page-theme.defaultScheme',
        '根级必须写 defaultScheme（light | dark），不得因缺测写死 light');
    }
  } else {
    for (const k of Object.keys(root)) {
      if (META.has(k) || k === 'color') continue;
      add(report, BLOCK, 'dark-extra-group', 'T-06', file, k,
        'tokens.dark.json 顶层只含被换值的 semantic 色路径，禁止 primitive 色阶 / dimension / typography / component');
    }
    for (const fam of E.COLOR_FAMILIES) {
      if (isObj(root.color) && fam in root.color) {
        add(report, BLOCK, 'dark-primitive', 'T-06', file, `color.${fam}`, '暗色 overlay 不得重写 primitive 色阶');
      }
    }
  }

  /* --- 逐节点规则 --- */
  for (const entry of list) {
    const { path: p, node, kids, isToken } = entry;
    const last = p.split('.').pop();

    // T-15 命名禁字符
    if (last !== '$root' && (last.startsWith('$') || /[{}.]/.test(last))) {
      add(report, BLOCK, 'token-name', 'T-15', file, p, 'token / group 名不得以 $ 开头（$root 除外），不得含 { } .');
    }

    // T-17 group 不得同时带 $value 与子 token
    if (isToken && kids.length) {
      add(report, BLOCK, 'group-value-mix', 'T-17', file, p,
        `同时含 $value 与子 token（${kids.join(' / ')}）；组的根值必须写成 ${last}.$root`);
    }

    if (!isToken) {
      validateGroupScale(entry, report, file);
      continue;
    }

    // T-16 / T-09 / T-11 类型
    const type = node.$type;
    if (typeof type !== 'string') {
      add(report, BLOCK, 'leaf-type-missing', 'T-16', file, p, '每个叶子必须自带 $type');
    } else if (E.FORBIDDEN_TOKEN_TYPES.includes(type)) {
      add(report, BLOCK, 'leaf-type-forbidden', 'T-11', file, p, `不得采用 $type: ${type}`);
    } else if (!E.TOKEN_TYPES.includes(type)) {
      add(report, BLOCK, 'leaf-type-unknown', 'T-09', file, p, `$type: ${type} 不在 8 原子类型 + typography / border 内`);
    }

    // T-12 / T-13 / T-14 / T-22 值与 alias
    const val = node.$value;
    if (isAlias(val)) {
      const target = byPath.get(aliasPath(val));
      if (!target) {
        add(report, BLOCK, 'alias-missing', 'T-14', file, p, `alias \`${val}\` 指向不存在的 token`);
      } else if (!target.isToken) {
        add(report, BLOCK, 'alias-group-target', 'T-17', file, p,
          `alias \`${val}\` 指向的是 group 不是 token；组根值必须写 {${aliasPath(val)}.$root}`);
      } else {
        const r = resolveAlias(byPath, p);
        if (r.error === 'cycle') add(report, BLOCK, 'alias-cycle', 'T-22', file, p, 'alias 成环');
        else if (r.hops > 3) add(report, BLOCK, 'alias-too-deep', 'T-22', file, p, `alias 跳数 ${r.hops} 超过三跳封顶`);
      }
    } else if (typeof val === 'string' && /[{}]/.test(val)) {
      add(report, BLOCK, 'alias-form', 'T-14', file, p, 'alias 必须写成完整花括号路径 `{a.b.c}`，不得挖内部字段');
    } else if (typeof type === 'string' && VALUE_SHAPES[type]) {
      if (type === 'color' && typeof val === 'string') {
        add(report, BLOCK, 'color-value-string', 'T-12', file, p, '禁止纯 hex 字符串当 $value；必须是 Color Module 对象');
      } else {
        checkShape(VALUE_SHAPES[type], val, report, file, `${p}.$value`);
      }
    }

    // T-19 primitive 只允许真值
    if (isPrimitivePath(p) && isAlias(val)) {
      add(report, BLOCK, 'primitive-alias', 'T-19', file, p, 'primitive 层只允许真值，禁止 alias');
    }

    validateLeafExtensions(entry, byPath, report, file, designText);
    validateColorPath(entry, report, file);
  }

  validateComponentLayer(list, byPath, report, file);
  validateSemanticRoles(byPath, report, file, isDark);
  if (!isDark) {
    for (const req of REQUIRED_TOKEN_PATHS) {
      const e = byPath.get(req);
      // `component.*` 与 `typography.*` 允许是 group（属性 / 层级各自成叶）；`.$root` 必须是 token
      if (!e || (req.endsWith('.$root') && !e.isToken)) {
        add(report, BLOCK, 'required-token-missing', 'T-46', file, req,
          '必产出 token 缺失；无观测走 T-85 保留字段 + observed:false + confidence，不是省略');
      }
    }
  }
}

function isPrimitivePath(p) {
  const s = p.split('.');
  if (s[0] === 'color') return E.COLOR_FAMILIES.includes(s[1]);
  return ['dimension', 'fontFamily', 'fontWeight', 'duration', 'cubicBezier', 'number', 'shadow'].includes(s[0]);
}

/** family / 维度 group 的 `scale`。T-29 / T-32 / T-79 / T-80 */
function validateGroupScale(entry, report, file) {
  const { path: p, node, kids } = entry;
  const segs = p.split('.');
  const isColorFamily = segs.length === 2 && segs[0] === 'color' && E.COLOR_FAMILIES.includes(segs[1]);
  const isDimensionFamily = segs.length === 2 && segs[0] === 'dimension';
  const ext = extOf(node) || {};
  if (ext.scale) checkShape(EXT_SHAPE.fields.scale, ext.scale, report, file, `${p}.$extensions.page-theme.scale`);
  if (!isColorFamily && !isDimensionFamily) return;

  const scale = ext.scale;
  if (!scale || typeof scale.mode !== 'string') {
    return add(report, BLOCK, 'scale-missing', 'T-79', file, p,
      'family / 维度 group 必须挂 $extensions["page-theme"].scale.mode（逐 family 记，T-29）');
  }
  if (scale.mode === 'declared' && !scale.declaredFrom) {
    add(report, BLOCK, 'scale-declared-from', 'T-79', file, p, 'mode=declared 时必须写 declaredFrom');
  }
  if (scale.mode === 'ordinal') {
    if (!E.SCALE_MEASURES.includes(scale.measure)) {
      add(report, BLOCK, 'scale-measure', 'T-79', file, p, 'mode=ordinal 时必须写 measure（oklch-l | px）');
    }
    const nums = kids.filter((k) => /^\d+$/.test(k)).map(Number).sort((a, b) => a - b);
    if (nums.length !== kids.length) {
      add(report, BLOCK, 'ordinal-key', 'T-32', file, p, `序数档键名必须是 1..N，实得 [${kids.join(', ')}]`);
    } else if (nums.length && (nums[0] !== 1 || nums[nums.length - 1] !== nums.length)) {
      add(report, BLOCK, 'ordinal-gap', 'T-32', file, p, `序数必须稠密 1..N，无跳号概念，实得 [${nums.join(', ')}]`);
    }
    const key = scale.measure === 'px' ? 'px' : 'oklchL';
    for (const k of kids) {
      const child = node[k];
      if (!isTokenNode(child)) continue;
      const m = extOf(child)?.measured;
      if (!isObj(m) || typeof m[key] !== 'number') {
        add(report, BLOCK, 'measured-missing', 'T-80', file, `${p}.${k}`, `序数档必须记 measured.${key}`);
      }
    }
  }
}

/** 叶子的 `$extensions["page-theme"]`。T-73–T-81 / T-101 / T-126 */
function validateLeafExtensions(entry, byPath, report, file, designText) {
  const { path: p, node } = entry;
  const ext = extOf(node);
  const isColor = node.$type === 'color';
  if (!ext) {
    add(report, BLOCK, 'ext-missing', 'T-73', file, p,
      '每个叶子必须有 $extensions["page-theme"]，至少含 observed 与 source');
    return;
  }
  checkShape(EXT_SHAPE, ext, report, file, `${p}.$extensions.page-theme`);
  if (isObj(node.$extensions)) {
    for (const ns of Object.keys(node.$extensions)) {
      if (ns !== E.EXT_NAMESPACE) {
        add(report, WARN, 'ext-foreign-ns', 'T-18', file, p, `$extensions 出现非 page-theme 命名空间 \`${ns}\`（保留但不被本 skill 消费）`);
      }
    }
  }

  if (typeof ext.observed !== 'boolean') {
    add(report, BLOCK, 'observed-missing', 'T-73', file, p, '必须写 observed（boolean）');
  }
  if (!E.SOURCE.includes(ext.source)) {
    add(report, BLOCK, 'source-missing', 'T-75', file, p, '必须写 source（measured | supplied | autodetected）');
  }
  if (ext.observed === false && !E.CONFIDENCE.includes(ext.confidence)) {
    add(report, BLOCK, 'confidence-missing', 'T-74', file, p, 'observed:false 必须带 confidence；缺 confidence 即资产不合格');
  }
  if (ext.observed === true && !E.CONFIDENCE.includes(ext.confidence)) {
    add(report, WARN, 'confidence-advisory', 'T-74', file, p, 'observed:true 应当带 confidence');
  }
  if (ext.observed === false && ext.source === 'measured') {
    add(report, BLOCK, 'source-observed-conflict', 'T-75', file, p, 'source: measured 表示从渲染结果读到，不得与 observed:false 并存');
  }
  if ('generated' in ext) {
    add(report, BLOCK, 'generated-neighbor', 'T-97', file, p,
      '`generated` 已整条退出规格：补空只许第一方真盘，不得出现算法生成的假盘邻居');
  }
  if (ext.paintedRatio === 0 && (ext.confidence === 'medium' || ext.confidence === 'high')) {
    add(report, BLOCK, 'paint-gate', 'T-101', file, p, 'paintedRatio = 0 且 confidence ≥ medium：脚本硬门报错（不是报警）');
  }
  if (ext.lossy === true && typeof ext.observedHex !== 'string') {
    add(report, BLOCK, 'lossy-no-hex', 'T-76', file, p, 'lossy:true 必须同时带 observedHex');
  }
  if (ext.merged === true && !isAlias(node.$value)) {
    add(report, BLOCK, 'merged-not-alias', 'T-77', file, p, 'merged:true 时 $value 必须是指向 {color.primary.$root} 的 alias');
  }
  if (ext.conflict === true && ext.suppliedValue === undefined) {
    add(report, BLOCK, 'conflict-no-supplied', 'T-81', file, p, 'conflict:true 时冲突值必须落 suppliedValue（$value 听实测，T-87）');
  }
  if (isColor && isObj(ext.wcag) && p.startsWith('color.border.')) {
    const failing = ext.wcag.aaUi === false || ext.wcag.aaText === false;
    if (failing && ext.wcag.alert !== true) {
      add(report, WARN, 'border-wcag-claim', 'T-119', file, p,
        'border 对比度只报警不判失败：必须写 wcag.alert = true，不得宣称原站 WCAG 失败');
    }
  }
  if (ext.observed === false && needsDontId(p)) {
    if (typeof ext.dontId !== 'string') {
      add(report, BLOCK, 'dont-id-missing', 'T-126', file, p, '未上屏项必须带 dontId，供 G-LINT-03 机检对上 DESIGN.md');
    } else if (designText !== null && !designText.includes(ext.dontId)) {
      add(report, BLOCK, 'dont-id-orphan', 'T-94', file, p, `dontId \`${ext.dontId}\` 在 DESIGN.md 中找不到对应条目`);
    }
  }
}

function needsDontId(p) {
  if (p.startsWith('component.')) return true;
  if (!p.startsWith('color.')) return false;
  return !isPrimitivePath(p); // primitive 整盘走 family 级 dontId（T-126）
}

/** `color.` 之下的路径闭集。T-36 / T-46 / T-23 */
function validateColorPath(entry, report, file) {
  const p = entry.path;
  if (!p.startsWith('color.')) return;
  const segs = p.split('.');
  if (E.COLOR_FAMILIES.includes(segs[1])) {
    if (segs.length !== 3) {
      add(report, BLOCK, 'family-depth', 'T-19', file, p, 'primitive 色路径必须是 color.{family}.{step} 两级');
    }
    return;
  }
  if (ALLOWED_COLOR_TOKENS.has(p)) return;
  const asRole = segs.slice(1).join('.');
  if (E.COLOR_ROLES[asRole] && !BARE_LEAF_ROLES.has(asRole)) {
    return add(report, BLOCK, 'role-missing-root', 'T-17', file, p,
      `semantic 角色的根值必须写成 ${p}.$root，{${p}} 只是 group 不能当 token alias`);
  }
  add(report, BLOCK, 'color-path-unknown', 'T-46', file, p,
    '不在色相族闭集（T-36）也不在 semantic 角色词表（T-46）内；角色不够用时降级写 DESIGN.md，不得扩词表');
}

/** semantic 角色的条件产出与合并规则。T-47 / T-52 / T-53 / T-54 / T-56 / T-57 / T-123 */
function validateSemanticRoles(byPath, report, file, isDark) {
  const primaryHex = hexOf(byPath, 'color.primary.$root');
  const identity = byPath.get('color.identity.$root');
  if (identity?.isToken) {
    const idHex = hexOf(byPath, 'color.identity.$root');
    const same = primaryHex && idHex && primaryHex === idHex;
    const aliasToPrimary = identity.node.$value === '{color.primary.$root}';
    if (same && !aliasToPrimary) {
      add(report, BLOCK, 'identity-not-alias', 'T-47', file, 'color.identity.$root',
        'identity 与 primary 同色时必须 alias 到 {color.primary.$root} 并标 merged:true，禁止写两份重复实值');
    }
    if (aliasToPrimary && extOf(identity.node)?.merged !== true) {
      add(report, BLOCK, 'identity-merged-flag', 'T-77', file, 'color.identity.$root', 'alias 到 primary 时必须标 merged:true');
    }
  }
  const accent = byPath.get('color.accent.$root');
  if (accent?.isToken) {
    const accHex = hexOf(byPath, 'color.accent.$root');
    if (accent.node.$value === '{color.primary.$root}' || (primaryHex && accHex && primaryHex === accHex)) {
      add(report, BLOCK, 'accent-equals-primary', 'T-52', file, 'color.accent.$root',
        'accent 是选产出，禁止为凑必产出而 alias 到 primary 或与 primary 同色');
    }
  }
  if (isDark) return;
  for (const role of E.COND_ROLES_MUST_OMIT) {
    const e = byPath.get(`color.${role}.$root`) || byPath.get(`color.${role}`);
    if (e?.isToken && extOf(e.node)?.observed === false) {
      add(report, BLOCK, 'cond-role-fabricated', 'T-53', file, `color.${role}`,
        '条件必产出角色无观测时必须 omit 并写 DESIGN.md，不得保留占位实值（focus / hover / 状态色 / surface.* 同口径）');
    }
  }
}

/** component 层命名与属性。T-20 / T-65 / T-66 / T-67 */
function validateComponentLayer(list, byPath, report, file) {
  const root = list.find((e) => e.path === 'component');
  if (!root) return;
  for (const key of root.kids) {
    const at = `component.${key}`;
    const parsed = parseComponentKey(key);
    if (!parsed) {
      add(report, BLOCK, 'component-key', 'T-65', file, at,
        '必须是并列 kebab `{element}-{variant}[-{state}]`，三段各自落 T-65 闭集');
    }
    const entry = byPath.get(at);
    if (!entry || entry.isToken) continue;
    // 带 state 段的变体只写「相对 rest 态变了的属性」，故不套 rest 态的三条必填（T-65 / T-67）
    if (parsed?.state) {
      if (entry.kids.length === 0) {
        add(report, BLOCK, 'component-state-empty', 'T-67', file, at, 'state 变体至少要写一条相对 rest 态变化的属性');
      }
    } else {
      for (const req of E.COMPONENT_PROPS_REQUIRED) {
        if (!entry.kids.includes(req)) {
          add(report, BLOCK, 'component-prop-missing', 'T-66', file, at, `缺必填属性 \`${req}\``);
        }
      }
    }
    for (const prop of entry.kids) {
      if (!E.COMPONENT_PROPS.includes(prop)) {
        add(report, BLOCK, 'component-prop-unknown', 'T-66', file, `${at}.${prop}`,
          '属性名必须 camelCase 且落 T-66 闭集，禁止 bg / fg / radius 别名');
        continue;
      }
      if (!E.COMPONENT_COLOR_PROPS.includes(prop)) continue;
      const leaf = byPath.get(`${at}.${prop}`);
      const v = leaf?.node?.$value;
      if (!isAlias(v)) {
        add(report, BLOCK, 'component-color-literal', 'T-20', file, `${at}.${prop}`, '颜色必须 alias 到 semantic 角色，不得写实值');
        continue;
      }
      const target = aliasPath(v);
      if (isPrimitivePath(target)) {
        add(report, BLOCK, 'component-skips-semantic', 'T-20', file, `${at}.${prop}`,
          `颜色禁止跳过 semantic 直引 primitive（\`${target}\`）`);
      }
    }
  }
  for (const floor of E.COMPONENT_MIN_FLOOR) {
    if (!root.kids.includes(floor)) {
      add(report, BLOCK, 'component-floor', 'T-67', file, `component.${floor}`, '规格最小下限缺失');
    }
  }
}

/** 拆 `{element}-{variant}[-{state}]`；element 与 variant 均可能含连字符，逐段试。T-65 */
function parseComponentKey(key) {
  const segs = key.split('-');
  for (let i = 1; i <= segs.length - 1; i++) {
    const element = segs.slice(0, i).join('-');
    if (!E.COMPONENT_ELEMENTS.includes(element)) continue;
    const rest = segs.slice(i);
    for (let j = 1; j <= rest.length; j++) {
      const variant = rest.slice(0, j).join('-');
      if (!E.COMPONENT_VARIANTS.includes(variant)) continue;
      const tail = rest.slice(j);
      if (tail.length === 0) return { element, variant, state: null };
      if (tail.length === 1 && E.COMPONENT_STATES.includes(tail[0])) return { element, variant, state: tail[0] };
    }
  }
  return null;
}

/** resolver.json 与暗色 overlay 的配对。T-02 / T-03 / T-07 */
function validateResolver(resolver, tokensRoot, report, file, hasDark) {
  checkShape(RESOLVER_SHAPE, resolver, report, file, '');
  const scheme = extOf(tokensRoot)?.defaultScheme;
  const theme = resolver?.modifiers?.theme;
  if (!isObj(theme)) return;
  if (scheme && theme.default !== scheme) {
    add(report, BLOCK, 'resolver-default', 'T-07', file, 'modifiers.theme.default',
      `必须等于 tokens.json 的 defaultScheme（${scheme}），不得写死 "light"`);
  }
  const ctxs = theme.contexts;
  if (isObj(ctxs) && typeof theme.default === 'string') {
    const base = ctxs[theme.default];
    if (!Array.isArray(base) || base.length !== 0) {
      add(report, BLOCK, 'resolver-base-context', 'T-07', file, `modifiers.theme.contexts.${theme.default}`,
        '与 defaultScheme 同名的 context 必须为空数组（base 即 tokens.json）');
    }
    const other = Object.keys(ctxs).find((k) => k !== theme.default);
    if (other) {
      const refs = JSON.stringify(ctxs[other] ?? null);
      if (!refs.includes('./tokens.dark.json')) {
        add(report, BLOCK, 'resolver-overlay-ref', 'T-07', file, `modifiers.theme.contexts.${other}`, '另一 context 必须引用 ./tokens.dark.json');
      }
    }
  }
  if (!hasDark) {
    add(report, BLOCK, 'resolver-without-dark', 'T-03', file, '', '有 resolver.json 就必须有 tokens.dark.json（同条件交件）');
  }
}

/* ================================================================== */
/* 4. patterns/ 语义规则                                               */
/* ================================================================== */

function enabledTaxonomies(layers) {
  const map = { ...E.TAXONOMY_L1 };
  if (layers.includes('L2')) Object.assign(map, E.TAXONOMY_L2);
  if (layers.includes('L3')) Object.assign(map, E.TAXONOMY_L3);
  return map;
}

function checkTaxonomy(value, layers, report, file, at, clause = 'P-05') {
  if (typeof value !== 'string') return;
  if (E.FORBIDDEN_KEY_PREFIX.test(value)) {
    return add(report, BLOCK, 'taxonomy-invented', 'P-10', file, at, `禁止自造前缀：\`${value}\``);
  }
  const enabled = enabledTaxonomies(layers);
  if (value in enabled) return;
  if (value in E.TAXONOMY_L2) {
    return add(report, BLOCK, 'taxonomy-layer-off', 'P-07', file, at,
      `\`${value}\` 属 L2，但 taxonomy_layers 未启用 L2`);
  }
  if (value in E.TAXONOMY_L3) {
    return add(report, BLOCK, 'taxonomy-layer-off', 'P-01', file, at, `\`${value}\` 属附录 A（L3），未显式启用不得使用`);
  }
  add(report, BLOCK, 'taxonomy-unknown', clause, file, at,
    `\`${value}\` 不在已启用词表内；落不下必须记 taxonomy: content + unmapped_reason（P-09）`);
}

function validatePatternBody(obj, report, file, opts) {
  const { layers, at = '', pagesKeys } = opts;
  checkShape(PATTERN_SHAPE, obj, report, file, at);
  if (!isObj(obj)) return;
  const A = (k) => (at ? `${at}.${k}` : k);

  checkTaxonomy(obj.taxonomy, layers, report, file, A('taxonomy'));

  // P-29 role 必须与词条默认角色相符
  const enabled = enabledTaxonomies(layers);
  const allowedRoles = enabled[obj.taxonomy];
  if (allowedRoles && typeof obj.role === 'string' && !allowedRoles.includes(obj.role)) {
    add(report, BLOCK, 'role-mismatch', 'P-29', file, A('role'),
      `\`${obj.taxonomy}\` 的角色必须是 ${allowedRoles.join(' | ')}，实得 ${obj.role}`);
  }

  // P-09 兜底原因
  if (obj.unmapped_reason != null && obj.taxonomy !== E.TAXONOMY_FALLBACK) {
    add(report, BLOCK, 'unmapped-reason-misplaced', 'P-09', file, A('unmapped_reason'),
      'unmapped_reason 只在 taxonomy 为兜底 content 时写');
  }

  // P-30 变体约束
  const v = obj.variant;
  if (isObj(v)) {
    const fixed = E.VARIANT_COLUMNS_FIXED[v.layout];
    if (fixed != null && v.columns !== fixed) {
      add(report, BLOCK, 'variant-columns-fixed', 'P-30', file, A('variant.columns'), `layout=${v.layout} 时必须为 ${fixed}`);
    }
    if (v.layout === 'bento' && !Array.isArray(v.bento_map)) {
      add(report, BLOCK, 'bento-map-missing', 'P-30', file, A('variant.bento_map'), 'layout=bento 时必填 bento_map');
    }
    if (v.overlay === true && isObj(obj.responsive?.mobile) && !obj.responsive.mobile.overlay_strategy) {
      add(report, BLOCK, 'overlay-strategy-missing', 'P-30', file, A('responsive.mobile.overlay_strategy'),
        'variant.overlay=true 时必填 responsive.mobile.overlay_strategy');
    }
  }

  // P-31 槽位闭集
  if (Array.isArray(obj.slots)) {
    const slots = layers.includes('L3') ? [...E.SLOTS, ...E.SLOTS_L3] : E.SLOTS;
    obj.slots.forEach((s, i) => {
      if (!isObj(s) || typeof s.name !== 'string') return;
      if (E.FORBIDDEN_KEY_PREFIX.test(s.name)) {
        add(report, BLOCK, 'slot-invented', 'P-10', file, `${A('slots')}[${i}].name`, `禁止自造槽名：\`${s.name}\``);
      } else if (!slots.includes(s.name)) {
        add(report, BLOCK, 'slot-not-in-enum', 'P-31', file, `${A('slots')}[${i}].name`,
          `\`${s.name}\` 不在槽位闭集（36 条 + L3 三条）内；需要新槽必须开票`);
      }
    });
  }

  // P-34 内容计数
  const cc = obj.content_count;
  if (isObj(cc)) {
    const units = layers.includes('L3') ? [...E.CONTENT_COUNT_UNITS, ...E.CONTENT_COUNT_UNITS_L3] : E.CONTENT_COUNT_UNITS;
    if (typeof cc.unit === 'string' && !units.includes(cc.unit)) {
      add(report, BLOCK, 'content-unit', 'P-34', file, A('content_count.unit'), `\`${cc.unit}\` 不在计数单位闭集内`);
    }
    if (Number.isInteger(cc.min) && Number.isInteger(cc.max) && cc.max < cc.min) {
      add(report, BLOCK, 'content-count-range', 'P-34', file, A('content_count'), 'max 必须 ≥ min');
    }
    if (Number.isInteger(cc.typical) && Number.isInteger(cc.min) && Number.isInteger(cc.max)
      && (cc.typical < cc.min || cc.typical > cc.max)) {
      add(report, BLOCK, 'content-count-typical', 'P-34', file, A('content_count.typical'), 'typical 必须落在 [min, max]');
    }
  }

  // P-40 断点栅格
  if (isObj(obj.responsive)) {
    for (const bp of E.BREAKPOINTS) {
      const b = obj.responsive[bp];
      if (!isObj(b) || !isObj(b.grid)) continue;
      if (Number.isInteger(b.columns) && Number.isInteger(b.grid.columns) && b.columns !== b.grid.columns) {
        add(report, BLOCK, 'grid-columns-mismatch', 'P-40', file, A(`responsive.${bp}.grid.columns`),
          `必须与 responsive.${bp}.columns 相等`);
      }
      if (Number.isInteger(b.grid.columns) && b.grid.columns > 1) {
        if (b.grid.gutter_px == null) {
          add(report, BLOCK, 'gutter-missing', 'P-40', file, A(`responsive.${bp}.grid.gutter_px`), 'columns > 1 时必须实测 gutter_px');
        }
        if (!Array.isArray(b.grid.item_widths_px)) {
          add(report, BLOCK, 'item-widths-missing', 'P-40', file, A(`responsive.${bp}.grid.item_widths_px`),
            'columns > 1 时必须实测 item_widths_px');
        }
      }
    }
  }

  // P-54 容器
  if (isObj(obj.container) && obj.container.mode === 'full-bleed' && obj.container.max_width_px != null) {
    add(report, BLOCK, 'container-full-bleed', 'P-54', file, A('container.max_width_px'), 'mode: full-bleed 时必须 omit');
  }

  // P-35 语义类不得标 high
  if (obj.confidence === 'high') {
    add(report, WARN, 'pattern-confidence-high', 'P-35', file, A('confidence'),
      'taxonomy / variant / sequence 不得标 high；几何类标 high 必须两测法一致');
  }

  // P-36a 逐页观测分布
  if (Array.isArray(obj.observations)) {
    const selected = new Map();
    obj.observations.forEach((o, i) => {
      if (!isObj(o) || typeof o.path !== 'string') return;
      if (o.selected !== true) return;
      if (selected.has(o.path)) {
        add(report, BLOCK, 'observations-multi-selected', 'P-36a', file, `${A('observations')}[${i}]`,
          `同一 path \`${o.path}\` 下至多一条 selected: true`);
      }
      selected.set(o.path, o);
      const cur = getByPath(obj, o.path);
      if (cur === undefined) {
        add(report, BLOCK, 'observations-path', 'P-36a', file, `${A('observations')}[${i}].path`, `本文件内不存在字段路径 \`${o.path}\``);
      } else if (JSON.stringify(cur) !== JSON.stringify(o.value)) {
        add(report, BLOCK, 'observations-selected-mismatch', 'P-36a', file, `${A('observations')}[${i}].value`,
          `selected: true 的 value 必须等于 \`${o.path}\` 的现值（现值 ${JSON.stringify(cur)}）`);
      }
    });
  }

  if (Array.isArray(obj.observed_on) && pagesKeys) {
    for (const pid of obj.observed_on) {
      if (!pagesKeys.includes(pid)) {
        add(report, BLOCK, 'observed-on-unknown', 'P-35', file, A('observed_on'), `\`${pid}\` 不是 index.yaml 的页面 id`);
      }
    }
  }
}

function getByPath(obj, p) {
  return p.split('.').reduce((acc, k) => (acc == null ? undefined : acc[k]), obj);
}

function validateIndexYaml(index, report, file, opts) {
  const { dirName, chromeIds, sectionFiles } = opts;
  checkShape(INDEX_SHAPE, index, report, file, '');
  if (!isObj(index)) return [];
  const layers = Array.isArray(index.taxonomy_layers) ? index.taxonomy_layers : [];
  if (!layers.includes('L1')) {
    add(report, BLOCK, 'layer-l1', 'P-20', file, 'taxonomy_layers', 'L1 必须在列');
  }
  if (index.style_set_id !== dirName) {
    add(report, BLOCK, 'style-set-id', 'P-20', file, 'style_set_id',
      `必须与资产目录名一致（目录名 ${dirName}，实得 ${index.style_set_id}）`);
  }

  // P-15 catalog.sections ↔ 文件
  const sections = Array.isArray(index.catalog?.sections) ? index.catalog.sections : [];
  for (const id of sections) {
    if (chromeIds.includes(id)) {
      add(report, BLOCK, 'catalog-chrome-leak', 'P-17', file, 'catalog.sections', `页壳 id \`${id}\` 不得列入 catalog.sections`);
    } else if (!sectionFiles.includes(id)) {
      add(report, BLOCK, 'pattern-file-missing', 'P-15', file, 'catalog.sections', `缺 patterns/${id}.yaml（一层一文件）`);
    }
  }

  // P-47 涂色跳过
  const rhythm = index.rhythm;
  if (isObj(rhythm)) {
    const skipRoles = Array.isArray(rhythm.skip_roles) ? rhythm.skip_roles : [];
    for (const r of E.RHYTHM_SKIP_ROLES_MIN) {
      if (!skipRoles.includes(r)) {
        add(report, BLOCK, 'skip-roles-min', 'P-47', file, 'rhythm.skip_roles', `必须至少包含 \`${r}\``);
      }
    }
    const skipTax = Array.isArray(rhythm.skip_taxonomies) ? rhythm.skip_taxonomies : [];
    for (const t of ['hero', 'footer']) {
      if (!skipTax.includes(t)) {
        add(report, WARN, 'skip-taxonomies-advisory', 'P-47', file, 'rhythm.skip_taxonomies', `应当默认包含 \`${t}\``);
      }
    }
    for (const s of (Array.isArray(rhythm.surfaces) ? rhythm.surfaces : [])) {
      if (E.RHYTHM_SURFACES_SKIPPED.includes(s)) {
        add(report, BLOCK, 'surfaces-pool', 'P-47', file, 'rhythm.surfaces', `\`${s}\` 是硬跳过项，不得进入交替池`);
      }
    }
  }

  // P-25 挂载位
  if (isObj(index.chrome)) {
    for (const [k, val] of Object.entries(index.chrome)) {
      const ids = typeof val === 'string' ? [val] : isObj(val)
        ? [val.default, ...(Array.isArray(val.variants) ? val.variants.map((x) => x?.pattern) : [])]
        : [];
      for (const id of ids.filter(Boolean)) {
        if (!chromeIds.includes(id)) {
          add(report, BLOCK, 'chrome-mount-missing', 'P-25', file, `chrome.${k}`, `\`${id}\` 在 chrome.yaml 中不存在`);
        }
      }
      if (k === 'legal_bar' && val != null && !layers.includes('L2')) {
        add(report, BLOCK, 'legal-bar-l2', 'P-25', file, 'chrome.legal_bar', '未启用 L2 时必须为 null 或省略');
      }
    }
  }

  // P-27a 骨架序列型库
  const pagesKeys = isObj(index.pages) ? Object.keys(index.pages) : [];
  if (Array.isArray(index.page_skeletons)) {
    index.page_skeletons.forEach((sk, i) => {
      if (!isObj(sk)) return;
      const at = `page_skeletons[${i}]`;
      if (sk.confidence === 'high') {
        add(report, BLOCK, 'skeleton-confidence', 'P-27a', file, `${at}.confidence`, '骨架 confidence 不得为最高档');
      }
      for (const pid of (Array.isArray(sk.observed_on) ? sk.observed_on : [])) {
        if (!pagesKeys.includes(pid)) {
          add(report, BLOCK, 'skeleton-page', 'P-27a', file, `${at}.observed_on`, `\`${pid}\` 不是 pages 的页面 id`);
        }
      }
      (Array.isArray(sk.steps) ? sk.steps : []).forEach((st, j) => {
        if (!isObj(st)) return;
        const sat = `${at}.steps[${j}]`;
        checkTaxonomy(st.taxonomy, layers, report, file, `${sat}.taxonomy`, 'P-27a');
        const roles = enabledTaxonomies(layers)[st.taxonomy];
        if (roles && !roles.includes('section')) {
          add(report, BLOCK, 'skeleton-chrome-step', 'P-27a', file, `${sat}.taxonomy`, 'steps 只列内容楼层，chrome / overlay 不进');
        }
        if (isObj(st.repeat) && Number.isInteger(st.repeat.min) && Number.isInteger(st.repeat.max) && st.repeat.max < st.repeat.min) {
          add(report, BLOCK, 'skeleton-repeat', 'P-27a', file, `${sat}.repeat`, 'max 必须 ≥ min');
        }
      });
    });
  }

  // P-22 / P-23 / P-46 sequence
  const scheme = rhythm?.scheme;
  for (const [pid, page] of Object.entries(isObj(index.pages) ? index.pages : {})) {
    const seq = Array.isArray(page?.sequence) ? page.sequence : [];
    const seen = new Set();
    seq.forEach((step, i) => {
      if (!isObj(step)) return;
      const at = `pages.${pid}.sequence[${i}]`;
      if (typeof step.id === 'string') {
        if (seen.has(step.id)) add(report, BLOCK, 'sequence-id-dup', 'P-22', file, at, `页内锚点 id \`${step.id}\` 重复`);
        seen.add(step.id);
      }
      const known = sections.includes(step.pattern) || chromeIds.includes(step.pattern);
      if (typeof step.pattern === 'string' && !known) {
        add(report, BLOCK, 'sequence-pattern-unknown', 'P-22', file, `${at}.pattern`,
          '必须引用 catalog.sections 某 id 或 chrome.yaml 内某 id');
      }
      if (step.taxonomy != null) checkTaxonomy(step.taxonomy, layers, report, file, `${at}.taxonomy`);
      if (step.unmapped_reason != null && step.taxonomy !== E.TAXONOMY_FALLBACK) {
        add(report, BLOCK, 'unmapped-reason-misplaced', 'P-09', file, `${at}.unmapped_reason`,
          'unmapped_reason 只在 taxonomy 为兜底 content 时写');
      }
      if (scheme === 'custom' && step.surface == null && !chromeIds.includes(step.pattern)) {
        add(report, BLOCK, 'custom-surface-missing', 'P-46', file, `${at}.surface`,
          'scheme: custom 时每条参与计数的 sequence 必须手写 surface');
      }
    });
  }
  return layers;
}

/* ================================================================== */
/* 5. voice.md 语义规则                                                */
/* ================================================================== */

function splitFrontMatter(text) {
  const m = text.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!m) return null;
  return { front: m[1], body: m[2] };
}

function validateVoice(text, report, file) {
  const parts = splitFrontMatter(text);
  if (!parts) {
    return add(report, BLOCK, 'front-matter-missing', 'V-08', file, '', 'voice.md 必须以 YAML front matter 开头');
  }
  let fm;
  try {
    fm = parseYaml(parts.front, `${file}#front-matter`);
  } catch (err) {
    return add(report, BLOCK, 'yaml-parse', 'V-08', file, 'front matter', String(err.message));
  }
  checkShape(VOICE_FRONT_MATTER_SHAPE, fm, report, file, '');
  if (!isObj(fm)) return;

  const isZh = typeof fm.locale === 'string' && /^zh(-|$)/i.test(fm.locale);

  // V-02 / V-03 条件专章
  const wantPack = isZh ? 'zh-CN' : null;
  if ((fm.locale_pack ?? null) !== wantPack) {
    add(report, BLOCK, 'locale-pack', 'V-03', file, 'locale_pack',
      isZh ? 'zh* 站必须写 zh-CN' : '非中文站必须写 null（整节物理删除，禁留骨架）');
  }

  // V-32 槽位长度
  if (isObj(fm.slot_caps)) {
    for (const [slot, cap] of Object.entries(fm.slot_caps)) {
      if (!isObj(cap)) continue;
      const at = `slot_caps.${slot}`;
      if (Number.isInteger(cap.min) && Number.isInteger(cap.max) && cap.max < cap.min) {
        add(report, BLOCK, 'slot-cap-range', 'V-32', file, at, 'max 必须 ≥ min');
      }
      if (Number.isInteger(cap.typical) && Number.isInteger(cap.min) && Number.isInteger(cap.max)
        && (cap.typical < cap.min || cap.typical > cap.max)) {
        add(report, BLOCK, 'slot-cap-typical', 'V-32', file, at, 'typical 必须落在 [min, max]');
      }
      if (cap.observed === false && !E.CONFIDENCE.includes(cap.confidence)) {
        add(report, BLOCK, 'slot-cap-confidence', 'V-32', file, at, 'observed:false 必须带 confidence，禁止编造 typical');
      }
    }
  }

  // V-15 / V-22 slotHint 必须 ⊂ P-31
  for (const [i, up] of (Array.isArray(fm.chrome_upgrades) ? fm.chrome_upgrades : []).entries()) {
    if (!isObj(up) || typeof up.slotHint !== 'string') continue;
    if (!E.SLOTS.includes(up.slotHint)) {
      add(report, BLOCK, 'slot-hint-not-in-enum', 'V-15', file, `chrome_upgrades[${i}].slotHint`,
        `\`${up.slotHint}\` 不在 P-31 槽位闭集内；拿不准必须 omit，不得用闭集外占位`);
    }
  }

  // V-42 型数
  if (Array.isArray(fm.headline_structures)) {
    const n = fm.headline_structures.length;
    if (n < 3 || n > 7) {
      add(report, WARN, 'headline-count', 'V-42', file, 'headline_structures', `应当归纳 3–7 个句法型，实得 ${n}`);
    }
  }

  // V-09 / V-03 正文节
  const body = parts.body;
  const present = new Set();
  for (const m of body.matchAll(/^#{1,6}\s*(§V\d)/gm)) present.add(m[1]);
  for (const s of E.VOICE_SECTIONS) {
    if (!present.has(s)) {
      add(report, BLOCK, 'voice-section-missing', 'V-09', file, s, '正文固定 8 节，缺任一应出节标题 = 资产不完备');
    }
  }
  if (isZh && !present.has(E.VOICE_SECTION_ZH)) {
    add(report, BLOCK, 'voice-section-missing', 'V-09', file, E.VOICE_SECTION_ZH, '中文站必须 8 节标题俱全');
  }
  if (!isZh && present.has(E.VOICE_SECTION_ZH)) {
    add(report, BLOCK, 'locale-skeleton', 'V-03', file, E.VOICE_SECTION_ZH, '非中文站必须整节物理删除，不得留标题或 omitted 骨架');
  }
  if (isZh) {
    const zh = sectionText(body, E.VOICE_SECTION_ZH);
    for (const sub of LOCALE_PACK_SUBSECTIONS) {
      if (zh !== null && !zh.includes(sub)) {
        add(report, BLOCK, 'locale-pack-subsection', 'V-20', file, `${E.VOICE_SECTION_ZH}.${sub}`, '中文专章必须含本子节');
      }
    }
  }

  // V-77 金句上限与来源 URL。V-48 占位模式查的是**生成页**，不查资产自身（§V4 会正当写出被禁词）
  const few = sectionText(body, '§V5');
  if (few !== null) {
    const quotes = groupBlockquotes(few);
    for (const q of quotes) {
      const quoted = q[0] || '';
      if ([...quoted].length > E.FEW_SHOT_MAX_CODEPOINTS) {
        add(report, BLOCK, 'few-shot-too-long', 'V-77', file, '§V5',
          `单条原文 ${[...quoted].length} 码点，超过 ${E.FEW_SHOT_MAX_CODEPOINTS}`);
      }
      if (!q.some((l) => /https?:\/\//.test(l))) {
        add(report, BLOCK, 'few-shot-no-url', 'V-77', file, '§V5', `金句缺来源 URL：${quoted.slice(0, 20)}…`);
      }
    }
    if (Number.isInteger(fm.few_shot_count) && quotes.length !== fm.few_shot_count) {
      add(report, WARN, 'few-shot-count', 'V-08', file, 'few_shot_count',
        `声明 ${fm.few_shot_count} 条，§V5 实得 ${quotes.length} 段引用`);
    }
  }
}

/** 把 §V5 里连续的 `>` 行合成一段引用（原文行 + 出处行）。 */
function groupBlockquotes(text) {
  const groups = [];
  let cur = null;
  for (const raw of text.split('\n')) {
    const line = raw.trim();
    if (line.startsWith('>')) {
      const content = line.replace(/^>\s?/, '');
      if (!cur) { cur = []; groups.push(cur); }
      if (content !== '') cur.push(content);
    } else if (line === '' || !line.startsWith('>')) {
      cur = null;
    }
  }
  return groups.filter((g) => g.length);
}

function sectionText(body, tag) {
  const re = new RegExp(`^#{1,6}\\s*${tag}\\b([\\s\\S]*?)(?=^#{1,6}\\s*§V|\\Z)`, 'm');
  const m = body.match(re);
  return m ? m[1] : null;
}

/* ================================================================== */
/* 6. 主流程                                                           */
/* ================================================================== */

function readJson(file, report, label) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (err) {
    add(report, BLOCK, 'json-parse', '总纲 §4', label, '', String(err.message));
    return null;
  }
}

function readYaml(file, report, label, preParsed) {
  if (preParsed !== undefined) return preParsed;
  try {
    return parseYaml(fs.readFileSync(file, 'utf8'), label);
  } catch (err) {
    add(report, BLOCK, 'yaml-parse', '总纲 §4', label, '', String(err.message));
    return null;
  }
}

/**
 * @param {string} dir 资产目录
 * @param {{ parsedYaml?: Record<string, unknown> }} [options]
 *        `parsedYaml` 允许调用方传入已解析对象（键为相对路径），绕开内置子集解析器。
 */
export function validateAsset(dir, options = {}) {
  const report = makeReport();
  const pre = options.parsedYaml || {};
  const abs = path.resolve(dir);
  const dirName = path.basename(abs);
  const has = (rel) => fs.existsSync(path.join(abs, rel));

  if (!fs.existsSync(abs) || !fs.statSync(abs).isDirectory()) {
    add(report, BLOCK, 'asset-dir-missing', '总纲 §4', dirName, '', `资产目录不存在：${abs}`);
    return report;
  }

  /* 6.1 文件清单（总纲 §4） */
  const hasDark = has('tokens.dark.json');
  const hasResolver = has('resolver.json');
  for (const f of ASSET_FILES) {
    if (has(f.path)) continue;
    if (f.presence === 'required') {
      add(report, BLOCK, 'asset-file-missing', f.clause, f.path, '', `总纲 §4 无条件必交文件缺失（定义章 ${f.owner}）`);
    } else if (f.presence === 'advisory') {
      add(report, WARN, 'asset-file-missing', f.clause, f.path, '', `总纲 §4 列出的文件缺失（定义章 ${f.owner}，本校验器不校其内容）`);
    }
  }
  if (hasDark !== hasResolver) {
    add(report, BLOCK, 'dark-resolver-pair', 'T-03', hasDark ? 'resolver.json' : 'tokens.dark.json', '',
      'tokens.dark.json 与 resolver.json 交件条件相同（darkMode = supported），必须同进同出');
  }

  const designText = has('DESIGN.md') ? fs.readFileSync(path.join(abs, 'DESIGN.md'), 'utf8') : null;

  /* 6.2 tokens 三件 */
  let tokensRoot = null;
  if (has('tokens.json')) {
    tokensRoot = readJson(path.join(abs, 'tokens.json'), report, 'tokens.json');
    if (isObj(tokensRoot)) validateTokensFile(tokensRoot, report, 'tokens.json', { designText, isDark: false });
  }
  if (hasDark) {
    const dark = readJson(path.join(abs, 'tokens.dark.json'), report, 'tokens.dark.json');
    if (isObj(dark)) validateTokensFile(dark, report, 'tokens.dark.json', { designText, isDark: true });
  }
  if (hasResolver) {
    const resolver = readJson(path.join(abs, 'resolver.json'), report, 'resolver.json');
    if (isObj(resolver)) validateResolver(resolver, tokensRoot || {}, report, 'resolver.json', hasDark);
  }

  /* 6.3 patterns/ */
  const pdir = path.join(abs, 'patterns');
  if (fs.existsSync(pdir)) {
    const entries = fs.readdirSync(pdir);
    for (const name of entries) {
      if (!PATTERNS_ALLOWED.some((a) => a.re.test(name))) {
        add(report, BLOCK, 'patterns-extra-file', 'P-14', `patterns/${name}`, '', 'patterns/ 下不得出现第五种文件');
      }
    }
    const chromeRaw = has('patterns/chrome.yaml')
      ? readYaml(path.join(pdir, 'chrome.yaml'), report, 'patterns/chrome.yaml', pre['patterns/chrome.yaml'])
      : null;
    const chromeIds = isObj(chromeRaw) ? Object.keys(chromeRaw) : [];

    const sectionFiles = entries
      .filter((n) => n.endsWith('.yaml') && n !== 'index.yaml' && n !== 'chrome.yaml')
      .map((n) => n.slice(0, -5));

    let layers = ['L1'];
    let pagesKeys = null;
    let index = null;
    if (has('patterns/index.yaml')) {
      const parsed = readYaml(path.join(pdir, 'index.yaml'), report, 'patterns/index.yaml', pre['patterns/index.yaml']);
      if (isObj(parsed)) {
        index = parsed;
        layers = validateIndexYaml(index, report, 'patterns/index.yaml', { dirName, chromeIds, sectionFiles }) || ['L1'];
        pagesKeys = isObj(index.pages) ? Object.keys(index.pages) : null;
      }
    }

    if (isObj(chromeRaw)) {
      checkShape(CHROME_SHAPE, chromeRaw, report, 'patterns/chrome.yaml', '');
      for (const [key, body] of Object.entries(chromeRaw)) {
        if (!isObj(body)) continue;
        validatePatternBody(body, report, 'patterns/chrome.yaml', { layers, at: key, pagesKeys });
        if (body.id !== key) {
          add(report, BLOCK, 'chrome-key-id', 'P-60', 'patterns/chrome.yaml', key, `键名必须等于条目的 id（实得 ${body.id}）`);
        }
        const okHere = body.role === 'chrome' || body.role === 'overlay' || body.taxonomy === 'footer';
        if (!okHere) {
          add(report, BLOCK, 'chrome-entry-role', 'P-16', 'patterns/chrome.yaml', key,
            'chrome.yaml 只装 role: chrome、站点级 overlay 与 taxonomy: footer');
        }
      }
    }

    for (const name of entries) {
      if (!name.endsWith('.yaml') || name === 'index.yaml' || name === 'chrome.yaml') continue;
      const label = `patterns/${name}`;
      const body = readYaml(path.join(pdir, name), report, label, pre[label]);
      if (!isObj(body)) continue;
      validatePatternBody(body, report, label, { layers, at: '', pagesKeys });
      const id = name.slice(0, -5);
      if (body.id !== id) {
        add(report, BLOCK, 'pattern-id-filename', 'P-29', label, 'id', `必须与文件名一致（文件名 ${id}，实得 ${body.id}）`);
      }
      if (body.role === 'chrome' || (body.role === 'overlay' && body.taxonomy === 'cookie-consent') || body.taxonomy === 'footer') {
        add(report, BLOCK, 'chrome-not-merged', 'P-16', label, 'role',
          '全部 role: chrome、站点级 overlay 与 footer 必须写进 chrome.yaml，不得另立文件');
      }
    }

    // P-22 sequence.taxonomy 必须与被引 pattern 一致
    if (isObj(index)) {
      const taxById = new Map();
      if (isObj(chromeRaw)) for (const [k, b] of Object.entries(chromeRaw)) if (isObj(b)) taxById.set(k, b.taxonomy);
      for (const name of entries) {
        if (!name.endsWith('.yaml') || name === 'index.yaml' || name === 'chrome.yaml') continue;
        const b = readYaml(path.join(pdir, name), makeReport(), name, pre[`patterns/${name}`]);
        if (isObj(b)) taxById.set(name.slice(0, -5), b.taxonomy);
      }
      for (const [pid, page] of Object.entries(isObj(index.pages) ? index.pages : {})) {
        (Array.isArray(page?.sequence) ? page.sequence : []).forEach((step, i) => {
          if (!isObj(step) || step.taxonomy == null) return;
          const t = taxById.get(step.pattern);
          if (t != null && t !== step.taxonomy) {
            add(report, BLOCK, 'sequence-taxonomy-mismatch', 'P-22', 'patterns/index.yaml',
              `pages.${pid}.sequence[${i}].taxonomy`, `与被引 pattern \`${step.pattern}\` 的 taxonomy（${t}）不一致`);
          }
        });
      }
    }
  }

  /* 6.4 voice.md */
  if (has('voice.md')) {
    validateVoice(fs.readFileSync(path.join(abs, 'voice.md'), 'utf8'), report, 'voice.md');
  }

  return report;
}

/* ================================================================== */
/* 7. CLI                                                             */
/* ================================================================== */

export function summarize(report) {
  const blocks = report.issues.filter((i) => i.level === BLOCK);
  const warns = report.issues.filter((i) => i.level === WARN);
  return { blocks: blocks.length, warns: warns.length, exitCode: blocks.length ? 1 : (warns.length ? 2 : 0) };
}

function render(report, maxPerCode) {
  const order = { block: 0, warn: 1 };
  const sorted = [...report.issues].sort((a, b) =>
    order[a.level] - order[b.level] || a.file.localeCompare(b.file) || a.code.localeCompare(b.code));
  const shown = new Map();
  const lines = [];
  for (const i of sorted) {
    const k = `${i.level}|${i.code}`;
    const n = (shown.get(k) || 0) + 1;
    shown.set(k, n);
    if (n > maxPerCode) continue;
    const tag = i.level === BLOCK ? '阻断' : '报警';
    lines.push(`${tag}  ${(i.clause || '-').padEnd(7)} ${i.file}${i.at ? `  ${i.at}` : ''}  [${i.code}]  ${i.message}`);
  }
  for (const [k, n] of shown) {
    if (n > maxPerCode) {
      const [level, code] = k.split('|');
      lines.push(`${level === BLOCK ? '阻断' : '报警'}  …       [${code}] 同类另有 ${n - maxPerCode} 条已折叠（--max-per-code=0 全展开）`);
    }
  }
  const s = summarize(report);
  const codes = new Map();
  for (const i of report.issues) codes.set(i.code, (codes.get(i.code) || 0) + 1);
  lines.push('');
  lines.push(`合计：阻断 ${s.blocks} 条 / 报警 ${s.warns} 条，涉及 ${codes.size} 类。退出码 ${s.exitCode}。`);
  return lines.join('\n');
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const args = process.argv.slice(2);
  const dir = args.find((a) => !a.startsWith('--'));
  const asJson = args.includes('--json');
  const mpc = Number((args.find((a) => a.startsWith('--max-per-code=')) || '=8').split('=')[1]);
  if (!dir) {
    console.error('用法：node validate-asset.mjs <资产目录> [--json] [--max-per-code=N]');
    process.exit(1);
  }
  const report = validateAsset(dir);
  const s = summarize(report);
  if (asJson) {
    console.log(JSON.stringify({ ...s, issues: report.issues }, null, 2));
  } else {
    console.log(render(report, mpc > 0 ? mpc : Infinity));
  }
  process.exit(s.exitCode);
}
