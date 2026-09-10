// VENDORED-FROM: page-theme-core/src/schemas/closed-set.schema.mjs
// VENDORED-BY: node .agents/skills/page-theme-core/sync-vendor.mjs
// DO-NOT-EDIT: 手改副本会被 --check 拦下；改判据请改 core 源再重放

// closed-set.json（闭集快照）的声明式形状。
// DSL 见 shape-dsl.md。构建逻辑在 ../closed-set.mjs，本文件只描述落盘形状。

const STR = (extra = {}) => ({ kind: 'scalar', type: 'string', minLength: 1, clause: 'asset-contract.md §7', ...extra });
const INT = (extra = {}) => ({ kind: 'scalar', type: 'int', clause: 'asset-contract.md §7', ...extra });

/**
 * 一条 token 的查表行。三列硬要求是 `path` · `cssVar` · `value`；
 * 其余四个字段只在**该条确实是 alias** 或**确实有暗色覆盖**时出现，
 * 缺席即「不是 alias」「暗色下同值」——不写 `null` 占位，
 * 因为 `null` 在 tokens 里本身就不是合法值，占位会把「没有」读成「值是空」。
 */
const ENTRY_SHAPE = {
  kind: 'object', clause: 'asset-contract.md §7', unknown: 'forbid',
  required: ['path', 'cssVar', 'type', 'layer', 'value'],
  fields: {
    path: STR(),
    cssVar: STR({ pattern: /^--[A-Za-z0-9-]+$/ }),
    type: STR(),
    layer: STR({ enum: ['primitive', 'semantic', 'component', 'unresolvable'] }),
    value: { kind: 'any', clause: 'asset-contract.md §7' },
    alias: STR(),
    aliasVar: STR({ pattern: /^--[A-Za-z0-9-]+$/ }),
    resolved: { kind: 'any', clause: 'asset-contract.md §7' },
    resolveError: STR({ enum: ['missing', 'cycle'] }),
    dark: { kind: 'any', clause: 'asset-contract.md §7' },
  },
};

export const CLOSED_SET_SHAPE = {
  kind: 'object', clause: 'asset-contract.md §7', unknown: 'forbid',
  required: ['schemaVersion', 'styleSetId', 'entries'],
  fields: {
    schemaVersion: INT({ const: 1 }),
    styleSetId: STR(),
    entries: { kind: 'array', clause: 'asset-contract.md §7', min: 1, item: ENTRY_SHAPE },
  },
};
