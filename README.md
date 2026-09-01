# global-skills

内容取自 `skills-list` 的 `page-theme` 分支，不跑新采集。

| 路径 | 是什么 |
| --- | --- |
| `.agents/skills/page-theme/` | 原来的单体主题 skill（采集 + 生成同一包） |
| `page-theme/huaweicloud-com/` | 该 skill 默认约定下的华为云风格资产 |

资产目录就是 skill 文档里的 `page-theme/<style-set-id>/`。本仓打开后 Cursor 会从 `.agents/skills/page-theme/` 加载 skill。

首次跑采集需在 `.agents/skills/page-theme/scripts/` 执行 `npm install` 与 `npx playwright install chromium`。只按已有资产生成则不必。
