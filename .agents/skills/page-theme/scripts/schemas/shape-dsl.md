# 形状描述 DSL（`scripts/schemas/*.schema.mjs` 用）

`validate-asset.mjs` 遍历这些声明式对象做形状校验，校验器本身不含逐字段 if。
所有节点为普通 JS 对象，字段含义如下。

| 键 | 适用 | 含义 |
| --- | --- | --- |
| `kind` | 全部 | `object` \| `map` \| `array` \| `scalar` \| `union` \| `any` |
| `clause` | 全部 | 溯源条款号，进报错行 |
| `level` | 全部 | `block`（默认）\| `warn`。本节点及其子节点违规的默认层 |
| `required` | `object` | 必填键名数组 |
| `fields` | `object` | 键 → 子节点 |
| `unknown` | `object` | `forbid`（默认）\| `warn` \| `allow` |
| `keyPattern` | `map` | 动态键必须匹配的正则 |
| `keyEnum` | `map` | 动态键闭集 |
| `value` | `map` | 每个值的子节点 |
| `item` | `array` | 元素子节点 |
| `min` / `max` | `array` | 元素条数上下限 |
| `type` | `scalar` | `string` \| `int` \| `number` \| `boolean` \| `null` |
| `enum` | `scalar` | 取值闭集 |
| `const` | `scalar` | 定值 |
| `pattern` | `scalar` | 字符串正则 |
| `min` / `max` | `scalar` | 数值上下限 |
| `minLength` | `scalar` | 字符串最短长度 |
| `nullable` | 全部 | `true` 时允许 `null`（**仅**用于规格明写「值为 `null` 表示无此件」的位，如 P-25 挂载位） |
| `options` | `union` | 候选子节点数组，命中任一即通过 |

跨字段、跨文件的语义规则（alias 解析、闭集互斥、硬门）不进本 DSL，
落 `validate-asset.mjs` 的规则表，每条同样挂条款号。
