# global-skills · page-theme-v2

只同步 **page-theme-generate**、**page-theme-audit** 执行硬序需要的文件，以及它们运行时读的那份资产。

| 路径 | 执行时做什么 |
| --- | --- |
| `.agents/skills/page-theme-generate/` | 创造模式出新页；优化模式刷既有页主题 |
| `.agents/skills/page-theme-audit/` | 对照资产验产物：十道门 + 色 / 非色值映射 |
| `page-theme/huaweicloud-com/` | `--asset` 指向这里 |

两包只留 `SKILL.md`、`references/`、`scripts/`（含 vendor）。`tests/`、`evals/` 不随迁。

资产只留准入与两包会读的：tokens / voice / DESIGN / 闭集 / 楼层索引 / 包络 / `patterns/` / 已缩过的 PC 楼层截图。不带 `raw/`、`run-meta.json`、`holdout.yaml`、`site-overrides.yaml`。

本仓打开后 Cursor 从 `.agents/skills/` 加载 skill。Node ≥ 20，零运行时依赖。调用传 `--asset page-theme/huaweicloud-com`。没有采集包，准入 `absent` 无法串采集。

## 提示词参考

```text
使用 page-theme-generate，按 page-theme/huaweicloud-com 这份资产对页面做华为云主题改造：
1、仅做主题适配，禁止改动项目/楼层骨架或功能，禁止直接修改内容
2、仅改造内容区域，不动页头、页尾
```
