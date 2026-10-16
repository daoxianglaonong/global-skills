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

## 接入提示词

资产目录用 `page-theme/huaweicloud-com/`。下面三段按模式整段发给已装本仓库 skill 的 agent，尖括号里换成自己的页面。

### 生成模式

```text
使用 page-theme-generate 的创作模式。风格资产是 page-theme/huaweicloud-com/。
按下面的内容和结构做新页面，颜色、字体、控件都用这份资产。
控件用资产 components.css 的 class，不要照搬门户 demo 的 DOM，也不要从图上取色、取字号。
整页若资产 recipes 里没有同类页型，先只出楼层大纲，等我确认再写页面。
不要改资产目录里的文件。

页面要求：
<写页面内容、楼层和要落盘的路径>
```

### 优化模式

```text
使用 page-theme-generate 的刷主题模式。风格资产是 page-theme/huaweicloud-com/。
只改下面这些本地文件里的主题值，换成资产公开变量 var(--porx-…)，映射到变量，不要抄成色值。
文本、链接、图片、DOM、class、选择器、@media 保持不动，不要换成组件 class。
先出一张「源值 × 用途 → token」表，列：源值、用途、处数、例、token、匹配、决定。
整表停下等我确认，确认后再改文件。不要现抓线上页面，原始 CSS 必须已经在本地。

要改的文件：
<本地 HTML/CSS 路径>
```

### 检视模式

```text
使用 page-theme-audit。对照风格资产 page-theme/huaweicloud-com/ 验收下面的页面，只判断合不合这份资产。
只出报告，不改页面、不改资产、不顺手优化。
客观阻断（资产外颜色、未知变量、字体越界）和视觉意见分开写。

要审的页面：
<本地文件或 URL>
```
