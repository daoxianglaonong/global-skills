# global-skills · page-theme-v2

从 `skills-list` 同步拆包后的 **生成 / 优化** 与 **校验**，不含采集包。资产只带这两包会读的那两份。

| 路径 | 是什么 | 谁用 |
| --- | --- | --- |
| `.agents/skills/page-theme-generate/` | 按资产生成新页，或刷既有页主题（优化模式） | 任务入口 |
| `.agents/skills/page-theme-audit/` | 对照资产验产物，出十道门结论与值映射 | 任务入口 |
| `.agents/skills/page-theme-workspace/fixtures/fixture-lanyuan-lab/` | 冻结夹具，评测 / 单测硬依赖 | generate + audit 的 tests / evals |
| `page-theme/huaweicloud-com/` | 华为云风格资产（消费仓库约定路径） | generate + audit 运行时 `--asset` |

本仓打开后 Cursor 会从 `.agents/skills/` 加载 skill。两包都是 Node ≥ 20、零运行时依赖，不需要 `npm install`。

## 为什么是这两份资产

- **`fixture-lanyuan-lab`**：两包测试与行为 eval 写死的输入。真实站点资产会随重采漂移，eval 规定不得改用。夹具站点走 `.invalid`，禁止放进 `page-theme/`，也禁止对它跑采集。
- **`huaweicloud-com`**：本体系里唯一一份真采集资产，也是 generate / audit 实际能拿来出页、出结论的运行时输入。脚本不写死这条路径，调用时显式传 `--asset page-theme/huaweicloud-com`。

没有同步：

- `page-theme-extract`（采集）与 `page-theme-core` 源码（两包已自带 `scripts/vendor/` 副本）
- 采集过程件：`raw/` 里除四类归纳 JSON 以外的抓取残片、截图 PNG 原图
- v1 单体 `.agents/skills/page-theme/` 及其旧资产

没有采集包时，generate 准入若得到 `absent` 会提示串采集——本仓做不了那一步，必须自备合格资产再开工。

## 提示词参考

```text
使用 page-theme-generate，按 page-theme/huaweicloud-com 这份资产对页面做华为云主题改造：
1、仅做主题适配，禁止改动项目/楼层骨架或功能，禁止直接修改内容
2、仅改造内容区域，不动页头、页尾
```
