// VENDORED-FROM: page-theme-core/src/paint.mjs
// VENDORED-BY: node .agents/skills/page-theme-core/sync-vendor.mjs
// DO-NOT-EDIT: 手改副本会被 --check 拦下；改判据请改 core 源再重放

// 楼层涂色（P-47）的**唯一**可执行体。
//
// 在此之前这条算法只以伪代码存在于规格、以一行祈使句存在于资产契约，全库没有任何执行体：
// 生成侧照着散文手算，验证侧照着同一段散文另算一遍，分歧无人可证。本模块把它变成函数。
//
// ## 为什么「应涂色」不能预存在楼层上
//
// 末行是 `surfaces[n % len(surfaces)]`，而 `n` 数的是**已参与交替的楼层个数**——
// 被跳过的楼层不占计数，所以 `n` 既不是数组下标，也不是楼层的属性：
// 同一个楼层排在不同序列里、或前面多跳过一层，算出来就是不同的底色。
// 「应涂色」因此是整条序列的函数，逐楼层预存一个值在数学上没有定义。
//
// 分工据此切开：`classifyPaintStep()` 只吃楼层与站级 rhythm，不吃序列位置，
// 结论可以安全地冻进楼层选型索引；`paintSequence()` 吃整条序列，只在序列定下来之后跑。

import * as E from './enums.mjs';

/** 结构性不合格：算法跑不下去，不是「这层该涂什么」的问题。 */
export class PaintError extends Error {
  constructor(code, message, at = null) {
    super(message);
    this.name = 'PaintError';
    this.code = code;
    this.at = at;
  }
}

/**
 * 把 `patterns/index.yaml` 的 `rhythm`（snake_case）归一成算法入参。
 * 两侧都必须过这道口子：各自转换等于把同一份配置读成两种形状，
 * 而「少读了 skip_taxonomies」这类分歧会安静地改掉整条序列的底色。
 */
export function normalizeRhythm(raw) {
  const r = raw && typeof raw === 'object' ? raw : {};
  const arr = (v) => (Array.isArray(v) ? v.slice() : []);
  return {
    scheme: typeof r.scheme === 'string' ? r.scheme : null,
    surfaces: arr(r.surfaces),
    skipRoles: arr(r.skip_roles),
    // 省略即取默认；写了空数组是「明确不跳过任何 taxonomy」，不得被默认值悄悄补回
    skipTaxonomies: r.skip_taxonomies === undefined
      ? E.RHYTHM_SKIP_TAXONOMIES_DEFAULT.slice()
      : arr(r.skip_taxonomies),
  };
}

/**
 * P-47 前三道 `continue` 的裁定 —— 与序列位置无关的那一半。
 *
 * @param {{ role?: string, taxonomy?: string, surface?: string }} step
 *        `surface` 是 resolve 之后的值：序列条目上手写了就用手写的，否则用楼层自带的
 *        `rhythm.surface`。硬跳过判的是这个 resolve 结果，不是楼层自带值本身。
 * @param {{ skipRoles: string[], skipTaxonomies: string[] }} rhythm
 */
export function classifyPaintStep(step, rhythm) {
  const s = step && typeof step === 'object' ? step : {};
  const skipRoles = Array.isArray(rhythm?.skipRoles) ? rhythm.skipRoles : [];
  const skipTaxonomies = Array.isArray(rhythm?.skipTaxonomies) ? rhythm.skipTaxonomies : [];

  const skippedByRole = skipRoles.includes(s.role);
  const skippedByTaxonomy = !skippedByRole && skipTaxonomies.includes(s.taxonomy);
  const surfaceIsHardSkip = !skippedByRole && !skippedByTaxonomy
    && E.RHYTHM_SURFACES_SKIPPED.includes(s.surface);

  const hitsSkip = skippedByRole || skippedByTaxonomy || surfaceIsHardSkip;
  return {
    skippedByRole,
    skippedByTaxonomy,
    surfaceIsHardSkip,
    hitsSkip,
    participatesInCount: !hitsSkip,
  };
}

/**
 * P-47 整条序列涂色。纯函数：同一输入必有同一输出，不读时钟、不读磁盘、不改入参。
 *
 * @param {Array<{ id?: string, pattern?: string, role?: string, taxonomy?: string,
 *                 ownSurface?: string, surface?: string }>} steps
 *        `ownSurface` = 楼层自带的 `rhythm.surface`（观测记录）；
 *        `surface` = 序列条目上**已手写**的值，缺席表示没手写。两者不得混为一谈：
 *        「已手写不得改」保护的是后者，前者只是 resolve 的缺省来源。
 * @param {{ scheme: string, surfaces: string[], skipRoles: string[], skipTaxonomies: string[] }} rhythm
 * @returns {Array<{ index: number, id: string|null, surface: string|null,
 *                   participatesInCount: boolean, n: number|null, decidedBy: string }>}
 *          `n` 是该层参与交替时的计数值，不参与则为 `null`。
 *          `decidedBy` 记算法走的是哪一支，便于下游解释一个底色是怎么来的。
 */
export function paintSequence(steps, rhythm) {
  if (!Array.isArray(steps)) throw new PaintError('steps-not-array', 'sequence 必须是数组');
  const scheme = rhythm?.scheme;
  const surfaces = Array.isArray(rhythm?.surfaces) ? rhythm.surfaces : [];

  if (!E.RHYTHM_SCHEMES.includes(scheme)) {
    throw new PaintError('scheme-unknown', `rhythm.scheme \`${scheme}\` 不在闭集 ${E.RHYTHM_SCHEMES.join(' / ')} 内`);
  }
  if (scheme !== 'custom') {
    if (surfaces.length === 0) {
      throw new PaintError('surfaces-empty', `scheme: ${scheme} 必须给出非空的 surfaces 交替池`);
    }
    for (const s of surfaces) {
      if (E.RHYTHM_SURFACES_SKIPPED.includes(s)) {
        throw new PaintError('surfaces-pool', `\`${s}\` 是硬跳过项，不得进入交替池`);
      }
    }
  }

  const out = [];
  let n = 0;
  steps.forEach((raw, index) => {
    const step = raw && typeof raw === 'object' ? raw : {};
    const at = step.id || step.pattern || `sequence[${index}]`;
    const handwritten = step.surface;
    const resolved = handwritten === undefined || handwritten === null ? step.ownSurface : handwritten;
    const cls = classifyPaintStep({ role: step.role, taxonomy: step.taxonomy, surface: resolved }, rhythm);

    const emit = (surface, decidedBy, counted) => {
      out.push({
        index,
        id: step.id ?? null,
        surface: surface ?? null,
        participatesInCount: counted,
        n: counted ? n : null,
        decidedBy,
      });
      if (counted) n++;
    };

    if (cls.skippedByRole) return emit(resolved, 'skip-role', false);
    if (cls.skippedByTaxonomy) return emit(resolved, 'skip-taxonomy', false);
    if (cls.surfaceIsHardSkip) return emit(resolved, 'hard-skip-surface', false);

    if (scheme === 'custom') {
      if (handwritten === undefined || handwritten === null) {
        throw new PaintError('custom-surface-missing',
          'scheme: custom 时每条参与计数的条目必须手写 surface', at);
      }
      return emit(handwritten, 'custom', true);
    }
    if (handwritten !== undefined && handwritten !== null) return emit(handwritten, 'handwritten', true);
    if (scheme === 'monotone') return emit(surfaces[0], 'monotone', true);
    return emit(surfaces[n % surfaces.length], 'alternate', true);
  });
  return out;
}
