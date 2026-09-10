// VENDORED-FROM: page-theme-core/src/closed-set.mjs
// VENDORED-BY: node .agents/skills/page-theme-core/sync-vendor.mjs
// DO-NOT-EDIT: 手改副本会被 --check 拦下；改判据请改 core 源再重放

// 闭集快照：把 tokens.json 投影成一张「token 路径 · CSS 变量名 · 当前值」的查表。
//
// ## 为什么要这张表
//
// 变量名派生本身只有一行（丢 `$root`、段名原样、`-` 连），但它是**每个下游各算一遍**的一行：
// 生成侧算出 `--color-surface-default` 写进页面，验证侧再算一遍去查。两边算法一旦不同步，
// 分歧是静默的——页面直接白底，没有任何一处会报错。把结果在采集时算好并写死，
// 下游就只剩查表，没有再算错一次的机会。
//
// ## 派生规则不改，改的是「谁来算」
//
// 段名原样保留意味着真实资产里的 `dimension.fontSize.1` 派生出 `--dimension-fontSize-1`，
// 驼峰原样留在变量名里。这是**已裁决的产出**，不是疏漏：`component.button-primary.backgroundColor`
// 同样靠原样保留才能派生出 `--component-button-primary-backgroundColor`，
// 把驼峰折成 kebab 会连带改掉 component 层的全部属性名。裁决因此取「保留」，
// 并用三件事把它从「静默」变成「言明」：变量名写进本快照、派生测试向量取自真实资产、
// 两条路径撞进同一个变量名时由 `collisions` 报出来。

import { tokenPathToCssVar, classifyCssVar } from './css-var.mjs';
import { walkTokens, resolveAlias, isAlias, aliasPath } from './tokens-tree.mjs';

export const CLOSED_SET_SCHEMA_VERSION = 1;

const clone = (v) => (v === undefined ? undefined : structuredClone(v));

/**
 * @param {object} tokens 已解析的 tokens.json
 * @param {{ dark?: object|null }} [options] `dark` 是已解析的 tokens.dark.json（暗色 overlay）
 * @returns {{ schemaVersion: number,
 *             entries: Array<{ path: string, cssVar: string, type: string, layer: string,
 *                              value: unknown, alias?: string, aliasVar?: string,
 *                              resolved?: unknown, resolveError?: 'missing'|'cycle', dark?: unknown }>,
 *             collisions: Array<{ cssVar: string, paths: string[] }> }}
 *
 * 条目顺序即 tokens.json 的声明顺序——快照是那份文件的投影，顺序跟着它走，
 * 人把两份并排看时行对得上。
 */
export function buildClosedSet(tokens, options = {}) {
  const { list, byPath } = walkTokens(tokens || {});
  const darkTree = options.dark ? walkTokens(options.dark).byPath : null;

  const entries = [];
  const seen = new Map();

  for (const entry of list) {
    if (!entry.isToken) continue;
    const cssVar = tokenPathToCssVar(entry.path);
    const value = entry.node.$value;
    const row = {
      path: entry.path,
      cssVar,
      // T-16 要求每个叶子自带 `$type`，故这里不设兜底：缺了就让键缺席，
      // 由 schema 的 required 报出来，而不是写个 `null` 把「资产不合格」伪装成「类型是空」
      type: entry.node.$type,
      layer: classifyCssVar(cssVar).layer,
      value: clone(value),
    };

    if (isAlias(value)) {
      // 直接目标就是下游要写进 `var(--x)` 的那个名字，不是链尾——写链尾会把 alias 关系抹平
      row.alias = aliasPath(value);
      row.aliasVar = tokenPathToCssVar(row.alias);
      const r = resolveAlias(byPath, entry.path);
      if (r.error) row.resolveError = r.error;
      else if (r.entry) row.resolved = clone(r.entry.node.$value);
    }

    if (darkTree) {
      const d = darkTree.get(entry.path);
      // 暗色 overlay 只覆盖被换值的路径；没被覆盖的不写 `dark`，缺席即「暗色下同值」
      if (d && d.isToken) row.dark = clone(d.node.$value);
    }

    entries.push(row);
    if (!seen.has(cssVar)) seen.set(cssVar, []);
    seen.get(cssVar).push(entry.path);
  }

  const collisions = [];
  for (const [cssVar, paths] of seen) {
    if (paths.length > 1) collisions.push({ cssVar, paths });
  }

  return { schemaVersion: CLOSED_SET_SCHEMA_VERSION, entries, collisions };
}
