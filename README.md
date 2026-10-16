# global-skills · page-theme-slim

从 skills-list 的 `page-theme-slim` 全量覆盖。只保留生成、检视和它们运行时要的工具与资产。

| 路径 | 做什么 |
| --- | --- |
| `.agents/skills/page-theme-generate/` | 新页用组件 class；刷主题只改原 CSS 里的主题值，换成资产变量 |
| `.agents/skills/page-theme-audit/` | 对照资产验收产物，不改页面 |
| `.agents/skills/page-theme-tools/` | 两包共用的 `theme.mjs`（check / lint / capture / inventory / baseline）。不是 skill，没有 `SKILL.md` |
| `page-theme/huaweicloud-com/` | 华为云风格资产。调用时作为资产目录 |

两包按相对路径 `../page-theme-tools/` 调工具。Node ≥ 20。截图前在 `page-theme-tools/scripts` 执行 `npm install`。

刷主题不换 class、不改 DOM。新做页面才引入 `components.css`。
