// VENDORED-FROM: page-theme-core/src/tokens-tree.mjs
// VENDORED-BY: node .agents/skills/page-theme-core/sync-vendor.mjs
// DO-NOT-EDIT: 手改副本会被 --check 拦下；改判据请改 core 源再重放

// tokens.json 的树遍历与 alias 解析 —— **唯一**实现。
//
// 存在理由与 css-var.mjs 同类，但分歧更隐蔽：闭集快照要把「有哪些叶子」冻成一张表，
// 校验器要判「这张表是不是当前 tokens 的投影」。两边若各写一套 `$value` 判定，
// 分歧不会报错——只会让快照少一条或多一条，而下游查表查不到时会退回自己派生，
// 「规则变查表」当场失效。故遍历与 alias 解析在这里定一次，校验器与生成器都引它。
//
// 本模块**不新增任何 token 字段**，也不判合法性：树里有什么就报什么，
// alias 解不开就把错因交出去，由调用方决定是报错还是记进快照。

import { DTCG_META_KEYS } from './enums.mjs';

const META = new Set(DTCG_META_KEYS);

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

/** 子键：DTCG 保留键不算「子 token」。T-17 */
export const kidsOf = (o) => Object.keys(o).filter((k) => !META.has(k));

/** 叶子判定：带 `$value` 即叶子。带 `$value` 又带子键是违规，但那由校验器报，本模块照实返回。 */
export const isTokenNode = (v) => isObj(v) && '$value' in v;

/** DTCG alias 形态 `{a.b.c}`；挖内部字段（`{a.b.c.hex}` 之类的花括号残缺写法）不算。 */
export const isAlias = (v) => typeof v === 'string' && /^\{[^{}]+\}$/.test(v);

/** 从 `{a.b.c}` 取出 `a.b.c`。调用前必须先过 `isAlias`。 */
export const aliasPath = (v) => v.slice(1, -1);

/**
 * 深度优先走整棵 tokens 树。
 * @returns {{ list: Array<{path: string, node: object, kids: string[], isToken: boolean, parent: string}>,
 *             byPath: Map<string, object> }}
 *          `list` 含 group 与叶子两种节点，顺序即声明顺序；根节点自身不入表。
 */
export function walkTokens(root) {
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

/**
 * 顺 alias 链取终点 token。
 * @returns {{ entry: object|null, hops: number, error: null|'cycle'|'missing' }}
 *          `hops` 是跳数（0 表示起点本身就不是 alias）；出错时 `entry` 为 `null`，
 *          错因必须交给调用方——静默返回起点会让「解不开的 alias」看起来像一个真实值。
 */
export function resolveAlias(byPath, startPath, seen = new Set()) {
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
