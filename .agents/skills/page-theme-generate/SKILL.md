---
name: page-theme-generate
description: >
  按风格资产出页面或刷主题。终点是页面：新页、楼层、组件，或把既有页面的主题换掉。
  「照 xxx 风格做」里的 xxx 可以是已有资产目录、风格名、任意网站 URL、一组参考页；
  输入可以是一句话、布局描述、截图、本地 HTML/CSS、项目源码。产物是引用目标资产
  `tokens.css` 公开变量的 HTML/CSS（或项目原生文件）加一段简短交付摘要。
  还没有资产时先软串 `page-theme-asset` 建资产，再回来出页。
  Use when the end goal is a page, floor, section, or component built or restyled to match
  a page-theme asset or a site's style: 照着某站做一个新页、按某套主题拼楼层、把某页配色 /
  主题刷成某套资产、把写死的色值换成资产变量、先出楼层大纲或映射表我确认再动手;
  "make me a page that looks like it belongs on <site>" even when nothing is extracted yet.
  Not when the end goal is the asset itself (extract / re-extract a site's style or tokens ->
  page-theme-asset). Not when the user only wants a verdict, diff, or value list on an
  existing page against an asset and nothing gets changed (-> page-theme-audit). Not
  mockup-vs-implementation pixel fidelity (-> fidelity-audit). Not multi-breakpoint mockup
  implementation without a theme asset (-> responsive-design). Not build config such as
  `tailwind.config.js`.
---

# page-theme-generate

资产定值，模型做设计。内容与布局自由，颜色、排印、控件、语气听资产。本包零脚本：
客观检查全部调用同级目录 `../page-theme-tools/` 的共享工具，不复制实现。

## 输入

什么形状都收。先分清两件事：**风格从哪来**、**做什么**。

| 用户给的 | 当作 |
| --- | --- |
| 资产目录、风格名 `xxx` | 风格源，直接解析资产 |
| 网站 URL、一组参考页 | 风格源；找不到对应资产 -> 软串 `page-theme-asset` |
| 一句话、楼层名、布局描述、截图 | 做什么：内容与结构 |
| 本地 HTML/CSS、项目源码 | 刷主题的输入；或新页要落进的项目 |

截图、布局描述只定内容与结构，不从图上取色、取字号。用户只拿截图当风格源 ->
交 `page-theme-asset` 判断能否建资产，本包不自己量值。

## 解析资产

1. 找目录：给了路径用路径；给了名字或站点，查 `page-theme/<style-set-id>/`
   （消费仓库另有约定听仓库）。
2. 找到 -> 调 `check`。
3. 没找到 -> 一句话告知「先建资产」，软串 `page-theme-asset`，不等确认。
   资产包自己的人审点照它走；资产过 `check` 后回到本流程。
   `page-theme-asset` 不可用 -> 停，报「需要资产」。不看着站点手抄值。
4. `check` 不过（残件）-> 只报缺口，停。不重采、不补文件、不凭空造值。

最小资产三件：`DESIGN.md`、`tokens.json`、`tokens.css`。其余模块
（`layouts/`、`recipes/`、`voice.md`、`evidence/`、`illustrations/`、`spec/`）可选。
缺可选模块不是残件：照常做，摘要里写缺了什么、因此靠什么判断。

## 读资产

- 先读 `DESIGN.md`，它是入口。
- 变量名只从 `tokens.json` 的 `cssVar` 取，公开集 = `tokens.css` 声明的变量。
  前缀任意；不猜 `--por-*` 或任何品牌前缀，不按 token 路径拼名字。
- 可选模块按需读：只读本次相关的 recipe、layout、证据图、voice 段落，不整包灌。

## 两种模式

| 模式 | 什么时候 | 规程 |
| --- | --- | --- |
| 创作 | 新页、楼层、组件；目标页可以是源站没有的 | `references/create.md` |
| 刷主题 | 已有页面，保内容与结构，只换主题 | `references/retheme.md` |

拿不准：用户要保住原内容 -> 刷主题；要新内容或新结构 -> 创作。

## 创作

1. 解析资产。
2. 判页型：
   - 楼层、组件 -> 直接做。
   - 整页，`recipes/` 里有匹配页型 -> 已知页型，直接做。
   - 整页，无匹配（含资产没有 `recipes/`）-> 新页型：出大纲，**停**。
3. 读相关 recipe / layout / 证据 / voice。它们是参考，不是模板：按本页内容取舍，不照抄。
4. 写 HTML/CSS，引入资产 `tokens.css`，值规则见下。
5. `lint`：阻断项修到 0。
6. `capture` 三宽 1440 / 768 / 375，对照证据图自查，最多改两轮。
7. 交付摘要。

## 刷主题

1. 解析资产。
2. `baseline` 记下原页；`inventory --format md` 出「源值 × 用途」底稿。
3. 模型给每行补 token / 匹配 / 决定（映射或保留），成为**一张**「源值 × 用途 -> token」表，**停**。
4. 用户整表确认（可改几行）后，下一次调用执行：确认映射的行换成 `var()`，
   保留行原样；文本、链接、图片、DOM 结构、选择器、`@media` 一律不动。
5. `baseline` 比对：必须零漂移。`lint`：红项只许来自保留行。
6. `capture` 前后三宽对照，交付摘要。

## 值规则

- 颜色只用资产公开变量；`currentColor`、`transparent` 可用。资产外色值 `lint` 阻断；
  资产色写成字面量 `lint` 只报警，照样改成 `var()`。
- `var()` 只引资产公开变量，或产物本地声明且值本身合规的变量。
- 字体族只用资产声明的字体栈；通用族也要在栈里才算。
- 字号、行高、圆角、间距、描边、`@media` 能用 token 就用，用不上写进摘要。
- 资产整类缺值（字号、间距、圆角、断点、组件尺寸、字体栈，有规范的资产常缺）：模型自定，
  在页面 CSS 开头集中声明成本页局部变量（`--page-space-4: 16px`，不得用资产前缀），
  其余地方只 `var()` 它们；摘要「规范缺口」逐条列出。不去站点抓值，不冒充资产值。

阻断与报警的完整清单只在 `../page-theme-tools/tools.md`（lint 节），本包不另抄。
报警不阻断。对比度、横向溢出、字号种类数不归 lint，看 `capture` evidence 的
`lowContrast` / `overflow` / `fontSizeCount`，同样只报不阻断。

缺口三分：

- **值缺口**：资产里没有这个颜色角色 / 状态（如没有错误色）-> 省掉，或用最近的
  已有语义并在摘要标精度损失。**不造色、不补档**。
- **规范缺口**：资产整类没有的非颜色值 -> 按上条自定成局部变量并列出；颜色永远不自定。
- **形态缺口**：资产没有这类布局或页型 -> 可以自由设计，但只用资产已有的值。

## 组件与引用

控件（按钮、输入框、Tab、卡片……）按顺序取第一条能用的：

1. 项目有组件库 -> 用项目组件，用资产组件 token（`--<前缀>-button-primary-bg` 等）覆盖其样式，不重写组件。
2. 资产有 `components.css` -> 引入它，用它的 class 与状态 class。
3. 不引入 -> 照 `components.md` 的部位 → token 表手写。
4. 资产没有组件层 -> 按 `DESIGN.md` 自行设计，摘要「缺口」列「组件层」。

`tokens.css` 进项目时拷带版本号的副本、在入口引一次；项目不要全局变量就用 `css --out --scope`。
细节见 `references/create.md`，资产升级见 `references/retheme.md`。

## 工具

全部住在同级目录 `../page-theme-tools/`（三包共用，不是 skill）。本包只调用；命令名与参数以
`../page-theme-tools/tools.md` 为准，入口 `node ../page-theme-tools/scripts/theme.mjs <command>`。

| 能力 | 用在 |
| --- | --- |
| `check` | 资产能不能用、缺什么 |
| `lint` | 产物值规则，出阻断与报警 |
| `capture` | 1440 / 768 / 375 截图（URL 或本地页）与溢出 / 对比度指标 |
| `inventory` | 刷主题：源值 × 用途行与候选 token |
| `baseline` | 刷主题：文本 / 链接 / 图片 / DOM 结构锁 |

工具不可用：照常出产物，摘要写「lint 未跑」「未截图」及原因。
不自写替代脚本，不把没跑说成通过。

## 停点

只有两个，都是「这次调用到此结束，用户确认后下一次继续」：

- 新页型的大纲。
- 刷主题的映射表。

其余不停：无资产自动串建资产；缺可选模块照做；报警不停；
`lint` 阻断自己修。修不掉才回话，不把挂着的产物标完成。

## 交付

产物落用户要的地方；在项目里就写项目原生文件。不往资产目录写任何东西，
不改 `tokens.css`。不出 trace、批准账本、涂色记录、多份门报告。

摘要只写这些：

```text
产物：<文件>
资产：<目录>；缺席模块：<无 / 列表>
参考：recipe <id>；layout <id, …>（或：无，按 DESIGN.md 自行设计）
组件：项目组件库 / components.css / 照 components.md 手写 / 无组件层（缺口）
缺口：值 <…>；形态 <…>
规范缺口：<类别：本页自定的局部变量与取值，逐条；无则写「无」>
lint：阻断 <n>；报警 <n>（<要点>）
截图：1440 / 768 / 375 -> <路径>；溢出 <无 / 宽度>；低对比 <n>
刷主题另加：映射 <已换 n / 保留 n>；baseline <零漂移 / 漂移项>
```

## 不做

- 建资产、重采资产 -> `page-theme-asset`。
- 只要结论、差异、值清单，不改产物 -> `page-theme-audit`。
- 设计稿还原度 -> `fidelity-audit`；无资产的多断点稿实现 -> `responsive-design`。
- 改构建配置（`tailwind.config.js` 等）。
