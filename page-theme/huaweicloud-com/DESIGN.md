# 华为云中国站 · 视觉契约

人读投影。冲突以 `tokens.json` / `patterns/` / `voice.md` 为准〔G-21〕。语义色引用必须带 `.$root`。数字为候选 / 非权威，do not infer。

## 1. Overview

白底门户，深灰近黑做行动填充，华为红只作识别（注册钮、logo），二者不同色、不 merge。正文字体走系统栈 + 第一方 `HuaweiSans` webfont。楼层节奏 `alternate-muted`：白底与浅灰交替，hero / footer / chrome 不占交替计数。签名手法：实心深色胶囊主钮 + 线框次钮成对；识别红不铺楼层底。本份资产 10 页：门户 / 产品 / 智果园 / AI / 联系 / 关于 / 新闻 + 合规中心（`securecenter-compliance-compliance-center.html`）。合规中心是独立资质全景墙，启用 L2 `credentials`；`content.certs-grid-3` 仍嵌在 ECS 等宿主楼层，不升格。

## 2. Colors

生成时走路径，表内 hex 仅人读。

| 角色 | 路径 | hex | 观测 |
| --- | --- | --- | --- |
| 行动色 | `{color.primary.$root}` | `#191919` | 观测（产品首屏实心钮） |
| 行动色悬停 | `{color.primary.hover}` | `#515151` | 观测 |
| 识别色 | `{color.identity.$root}` | `#c7000b` | 观测（注册填充 / footer 红标） |
| 识别色悬停 | `{color.identity.hover}` | `#d64a52` | 观测 |
| 行动色上的字 | `{color.on.primary.$root}` | `#ffffff` | 观测 |
| 识别色上的字 | `{color.on.identity.$root}` | `#ffffff` | 观测 |
| 正文 | `{color.text.default.$root}` | `#191919` | 观测 |
| 次要字 | `{color.text.muted.$root}` | `#595959` | 观测 |
| 正文链接 | `{color.text.link.$root}` | `#191919` | 观测（与正文同色，照实记〔T-58〕） |
| 默认底 | `{color.surface.default.$root}` | `#ffffff` | 观测 |
| 交替底 | `{color.surface.muted.$root}` | `#f5f5f5` | 观测 |
| 默认底上的字 | `{color.on.surface.default.$root}` | `#191919` | 观测 |
| 交替底上的字 | `{color.on.surface.muted.$root}` | `#191919` | 观测 |
| 默认描边 | `{color.border.default.$root}` | `#ebebeb` | 观测（精确 hex 取第一方声明，confidence low） |

未产出（omit，禁止当可用值）：`color.focus` · `color.accent` · 状态色 `success/warning/danger/info` · `color.surface.identity/inverse/transparent` · `color.overlay` · `color.border.muted`。理由见 §8 已知缺口。

未上屏第一方具名色不进本表可用列，见 §8 合并 Don't：`design-dont-microsite-accent-red-e41e2b` · `design-dont-microsite-link-blue-3b82f6` · `design-dont-brand-blue-1476ff`。

### surface 降级〔G-14〕

semantic 只留 `default` / `muted` 两档。跨页浅底实测还有 `#f7f7f7`（home）、`#f3f3f3`（modelarts / ai）与 `#f5f5f6`（合规中心资质墙底），与选中的 `#f5f5f5` 近同，home / modelarts 已记 `tokens.json` `color.surface.muted.$root` 的 `observations`；`#f5f5f6` 只在本节记账，**不建第三档 token、不改 `$value`**。复刻时一律取 `{color.surface.muted.$root}`；component 若必须贴某一页的实测浅底，标 `lossy: true` + `observedHex`（该页那一值）。hero / 深色能力带是图底（`rhythm.surface: image`），不进 token。

## 3. Typography

| 角色 | 路径 | 栈 / 字号 / 字重 / 行高 |
| --- | --- | --- |
| 正文 | `{typography.body}` | `{fontFamily.sans}` · 16px · 400 · 24px |
| 标题 | `{typography.heading}` | 同栈 · 40px · 600 · 60px |
| 标签 | `{typography.label}` | 同栈 · 14px · 400 · 21px |

`{fontFamily.sans}` = `-apple-system, HuaweiSans, Helvetica Neue, Helvetica, Arial, PingFang SC, …, Microsoft YaHei, SimSun, sans-serif`。第一方 `@font-face` 交付 `HuaweiSans`（及图标族）。`display` / `caption` omitted。

## 4. Layout

已采三档字段位 `pc` / `tablet` / `mobile`（像素见 §10，本节不重复常量）。楼层列数、槽宽、`content_width_px` 以各篇 `{id}.yaml` 的 `responsive.*.grid` 实测为准，**不设站级默认栅格**。节奏 `alternate-muted`，跳过 chrome / overlay / hero / footer。页壳横向靠 `container.mode` + `grid.content_width_px`，竖向靠 `density`，无高度字段。智果园顶栏是同 taxonomy 另一 `id`（`navbar.orchard-subbrand`），不是第二篇 chrome 文件。

## 5. Elevation

omitted。卡片读图为填充 / 柔阴影，本票未立 `elevation.*` / `shadow` token；不得把未上屏海拔写成系统阶。

## 6. Shapes

| 角色 | 路径 | 值 |
| --- | --- | --- |
| 控件圆角 | `{shape.radius.control}` | 32px（主钮胶囊） |
| 容器圆角 | `{shape.radius.container}` | 24px（卡片） |

胶囊半径活在 `component.button-primary.rounded`，不升 primitive 闭集。`pill` / `full` 无独立 semantic。

## 7. Components

| key | 默认 | hover |
| --- | --- | --- |
| button-primary | `{color.primary.$root}` 底 + `{color.on.primary.$root}` 字 + `{shape.radius.control}` | `{color.primary.hover}` 底，字不变 |
| button-outline | `{color.surface.default.$root}` 底 + `{color.text.default.$root}` 字与描边 + `{shape.radius.control}` | 第 2 票已测；不得把「注册 / 提交」当本档 |
| input-outline | `{color.surface.default.$root}` 底 + `{color.text.muted.$root}` 字；描边近 `{color.border.default.$root}`（lossy） | 顶栏搜索框；圆角走 `dimension.radius.1`（20px） |

动效：`{motion.duration.control}` / `{motion.easing.control}` 已测，其余 motion omit。浮层走 `float-widget.service-rail`（右侧客服栏），不进 sequence。
表内不得新增 tokens 没有的 key。识别红钮是 identity 填充，不是 `button-primary`。

## 8. Do's and Don'ts

### Do

- 主按钮用深灰实心胶囊，次按钮用线框；成对出现。
- 识别红只给注册 / logo / 少量 chrome，不铺楼层底。
- 正文链接与正文同色，不要改成蓝。
- 新页楼层序列先落 `page_skeletons` 某型。

### Don't

| id | check | 规则 |
| --- | --- | --- |
| design-dont-unobserved-first-party-scale | unused-scale | 整盘未上屏第一方具名色禁止当可用色，合并为一条：`design-dont-microsite-accent-red-e41e2b`（#e41e2b / `--text-accent`）· `design-dont-microsite-link-blue-3b82f6`（#3b82f6 / `--text-link`）· `design-dont-brand-blue-1476ff`（#1476ff / `--por-base-color-brand-2`）。不得写成第三行动色或链接蓝。 |

文案禁词见 voice.md。

### 已知缺口

- `color.focus`：focus-visible 截图只有浏览器默认 `auto` 环，无站定制可见焦点 → omit，复刻时不补假 focus token〔G-64〕。
- 状态色 / `accent` / `surface.identity|inverse|transparent` / `overlay` / `border.muted`：无内容楼层观测 → omit。
- `elevation` / `typography.display|caption`：未立 token。`motion.duration.control` / `motion.easing.control` 已立，禁止编造其它 duration / easing。
- 无暗色 overlay（`tokens.dark.json` 不交）。
- 页壳高度两侧可不同，高度不是对账项〔B-19〕。
- 活动子域体检（第 6 票）：**继续禁采** `activity.huaweicloud.com`，未经重裁不得写入 extract `--url`。依据：(1) 活动红 `#e41e2b` / 链接蓝 `#3b82f6` / 品牌蓝 `#1476ff` 已是未上屏第一方色（`dontId` 见 §2 / Don't），不得写成第三行动色或链接蓝；(2) 本份资产 cohesion 已因 about 页（source-08）`color.primary` `#ffffff` vs 其余 `#191919` 报 `mixed-suspected`，再并活动子域会加重多语言风险；(3) 本票默认跳过采集。holdout 案例页与活动子域分开，互不顶替。未拆资产、未并进、未跑活动 URL。
- 第 5 票跳过 `https://www.huaweicloud.com/service/protection.html`：该页是「服务保障 + 免费备案 + 建议反馈 + 退订流程」锚点拼盘，没有独立资质墙。按本票「若该页只是锚点拼盘，改采一个独立合规中心页」，改采 `https://www.huaweicloud.com/securecenter/compliance/compliance-center.html`。未采 intl 站、证书下载登录墙、单证详情（`soc.html` / `iso-27001.html` 等）。
- 资质墙边界：合规中心 `sec-02` 是独立「华为云合规认证全景图」四列证卡墙（Tab + 国际/国家权威认证），启用 L2 `credentials`（`credentials.grid-4-tabs`，骨架 `sk-compliance`）。`content.certs-grid-3` 仍嵌在 ECS 等宿主楼层（`taxonomy: content`），本票不改其层级。footer 备案条继续留在 `footer.multi-column` 的 `beian` 槽，`chrome.legal_bar` 保持 `null`；本页不是独立备案块，tablet/mobile 多出来的「7*24 多渠道服务支持 / 免费备案服务」带也不升格 legal-bar。
- cohesion `mixed-suspected` 必须继续曝光，不得为合并改 `$value`：脚本 `color.primary` 候选 `#191919`（source-01–07）vs `#ffffff`（source-08 about 白描边、source-09 新闻页脚本、source-10 合规页把证卡白底误报成 CTA 填充）。权威行动色仍是 `{color.primary.$root}` `#191919`。

## 9. Accessibility

focus：未观测到站定制可见焦点环（`color.focus` omitted）。描边 `{color.border.default.$root}` `#ebebeb` 在白底上对比弱，只报警不判失败〔T-119〕；复刻时不要宣称原站 WCAG 失败，也不要为过 AA 改 `primary` / `identity` 填充或编造 focus token。`on-*` 走实测最高对比（浅底深字、深钮白字）。

## 10. Viewport names

口径：**run 级**（`raw/session.json` = home 聚类）。各页独立聚类可以不同，下游不得假定跨页同一像素〔E-08 · B-29〕。禁止写成 `lg = 1440`。

| 对外 | 字段位 | 本站观测像素 | viewportSource |
| --- | --- | ---: | --- |
| lg | pc | 1688 | clustered |
| md | tablet | 784 | clustered |
| sm | mobile | 684 | clustered |

逐页 `sampled` 漂移（只记账，不另开第三档）：`product-agentarts.html` tablet=1240；`product-modelarts.html` / `ai` tablet=1002、mobile=784；`agentorchard--home` pc=1640、tablet=1002、mobile=784；`securecenter-compliance-compliance-center.html` pc=1450、tablet=1002、mobile=784。生成断点取本节 run 级表，该页 sequence 的几何仍取该页 pattern 实测。
