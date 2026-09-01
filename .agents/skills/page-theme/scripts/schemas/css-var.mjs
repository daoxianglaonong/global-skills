// token 路径 ↔ CSS 自定义属性名的**确定性**双向映射，以及 `var(--x)` 的层判定。
//
// 存在理由（B-20 裁决）：生成页里写 `var(--x)` 时，lint 无从判断它指向 semantic 还是
// primitive，`primitiveLeak.color = 0` 这道阻断门因此失灵。裁决取「生成侧只准使用由
// token 路径确定性派生的变量名」，于是本模块的 `classifyCssVar()` 就是那道门的判据。
// 本模块**不新增任何 token 字段**，纯粹是既有键空间（T-19 / T-36 / T-46 / T-65）的投影。
//
// 消费方：S4 的 `lint-generated.mjs`（`import { classifyCssVar } from './schemas/css-var.mjs'`）。
// 一处定义、别处引用（D9）——不得在别的文件里再写一套派生规则。

import * as E from './enums.mjs';

/**
 * token 路径 → CSS 变量名。段名**原样保留**（含 camelCase 与内部连字符），
 * 尾部 `$root` 丢弃，段间用 `-` 连，前缀 `--`。
 *   color.surface.default.$root → --color-surface-default
 *   color.neutral.3             → --color-neutral-3
 *   dimension.font-size.1       → --dimension-font-size-1
 *   component.button-primary.backgroundColor → --component-button-primary-backgroundColor
 */
export function tokenPathToCssVar(tokenPath) {
  const segs = tokenPath.split('.').filter((s) => s !== '$root');
  return `--${segs.join('-')}`;
}

/** 语义角色的合法变量名集合（由 T-46 词表投影，不手写）。 */
const SEMANTIC_COLOR_VARS = new Set();
for (const [role, spec] of Object.entries(E.COLOR_ROLES)) {
  const base = `--color-${role.replace(/\./g, '-')}`;
  for (const key of Object.keys(spec.keys)) {
    SEMANTIC_COLOR_VARS.add(key === '$root' ? base : `${base}-${key}`);
  }
  if (spec.bareLeafAllowed) SEMANTIC_COLOR_VARS.add(base);
}

/** 非色域的 semantic 顶层组（T-19）。 */
const SEMANTIC_TOP = ['typography', 'motion', 'elevation', 'shape'];
/** primitive 顶层组（T-19）。 */
const PRIMITIVE_TOP = ['dimension', 'fontFamily', 'fontWeight', 'duration', 'cubicBezier', 'number', 'shadow'];

/**
 * 判定一个 CSS 变量名落在 token 三层的哪一层。
 * @returns {{ layer: 'primitive'|'semantic'|'component'|'unresolvable', type: 'color'|'other', reason: string }}
 *
 * `unresolvable` **不得**默认放行——反解不出来就说明它不是由 token 路径派生的，
 * 那正是这道门要拦的东西（B-20 裁决第 3 条）。
 */
export function classifyCssVar(name) {
  const raw = String(name).trim().replace(/^var\(\s*/, '').replace(/\s*\)$/, '');
  if (!raw.startsWith('--')) {
    return { layer: 'unresolvable', type: 'other', reason: '不是 CSS 自定义属性' };
  }
  const segs = raw.slice(2).split('-').filter(Boolean);
  if (segs.length < 2) {
    return { layer: 'unresolvable', type: 'other', reason: '段数不足，无法反解 token 路径' };
  }
  const [top, second] = segs;

  if (top === 'color') {
    if (E.COLOR_FAMILIES.includes(second)) {
      return { layer: 'primitive', type: 'color', reason: `color.${second}.* 是色相族刻度（T-36）` };
    }
    if (SEMANTIC_COLOR_VARS.has(raw)) {
      return { layer: 'semantic', type: 'color', reason: '落在 T-46 角色词表' };
    }
    return { layer: 'unresolvable', type: 'color', reason: '既不是色相族也不在角色词表内（T-36 / T-46）' };
  }
  if (top === 'component') {
    const isColorProp = E.COMPONENT_COLOR_PROPS.includes(segs[segs.length - 1]);
    return { layer: 'component', type: isColorProp ? 'color' : 'other', reason: 'component 层（T-65）' };
  }
  if (SEMANTIC_TOP.includes(top)) {
    return { layer: 'semantic', type: 'other', reason: `${top}.* 是 semantic 层（T-19）` };
  }
  if (PRIMITIVE_TOP.includes(top)) {
    return { layer: 'primitive', type: 'other', reason: `${top}.* 是 primitive 层（T-19）` };
  }
  return { layer: 'unresolvable', type: 'other', reason: `顶层组 \`${top}\` 不在 T-05 白名单内` };
}

/**
 * 颜色 primitive 泄漏判据（`Q-67` 的 `primitiveLeak.color`）：**可证**的颜色越层。
 * 命中两种：落在色相族闭集的 `--color-{family}-*`；以及顶层是 `color` 却既非色相族
 * 也不在角色词表内的（已作废键名如 `--color-brand`，属闭集违规，同样不得放行）。
 */
export function isColorPrimitiveLeak(name) {
  const c = classifyCssVar(name);
  return c.type === 'color' && (c.layer === 'primitive' || c.layer === 'unresolvable');
}

/**
 * 反解不出 token 路径的变量（如原站变量名 `--por-base-color-gray-90`）。
 *
 * **这道计数是防绕过的那一半**：只查 `primitiveLeak.color` 时，把变量随便改个名就能
 * 让「可证」判据失效，门形同虚设。故 `primitiveLeak.color === 0` **与**
 * `unresolvedVar === 0` 必须同时成立，闸门才真的关上。
 * 两者不合并成一个计数——`primitiveLeak.color` 是「确实引了 primitive」，
 * 本项是「无法证明引了什么」，归因不同，混在一起会让归因树读错。
 */
export function isUnresolvedVar(name) {
  return classifyCssVar(name).layer === 'unresolvable';
}
