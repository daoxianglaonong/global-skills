# 鸿蒙开发实践中心 · 视觉契约

人读投影。冲突以 `tokens.json` / `patterns/` / `voice.md` 为准。语义色引用必须带 `.$root`。数字为候选 / 非权威，do not infer。本份资产只采 1 页（软停合格）；pc / tablet 槽 landmarks 为空、截图近白，几何以 mobile 为准。

## 1. Overview

浅色落地页：白底与 `#fafafa` 交替，近黑 `#191919` 做行动填充，华为红只作顶栏 logo 识别，二者不同色、不 merge。装饰蓝 `#0a59f7` 只出现在首屏光斑 / 浅蓝渐变，不是 CTA 填充。正文字体栈以 Manrope 打头，第一方 `HuaweiSans` 已加载。楼层节奏 `alternate-muted`。签名手法：实心近黑胶囊主钮 + 线框次钮成对；识别红不铺楼层底。页壳复用华为云顶栏 / 页脚文案与备案，内容楼层是鸿蒙实践中心自己的黑白卡面。

## 2. Colors

生成时走路径，表内 hex 仅人读。

| 角色 | 路径 | hex | 观测 |
| --- | --- | --- | --- |
| 行动色 | `{color.primary.$root}` | `#191919` | 观测（首屏实心「立即体验」） |
| 识别色 | `{color.identity.$root}` | `#c7000b` | 观测（顶栏华为云 logo 红瓣；paintedRatio=0，confidence low） |
| 第三色 | `{color.accent.$root}` | `#0a59f7` | 观测（首屏 radial 光斑 / hero 浅蓝渐变） |
| 行动色上的字 | `{color.on.primary.$root}` | `#ffffff` | 观测 |
| 正文 | `{color.text.default.$root}` | `#191919` | 观测 |
| 次要字 | `{color.text.muted.$root}` | `#595959` | 观测 |
| 正文链接 | `{color.text.link.$root}` | `#191919` | 观测（与正文同色，照实记） |
| 默认底 | `{color.surface.default.$root}` | `#ffffff` | 观测 |
| 交替底 | `{color.surface.muted.$root}` | `#fafafa` | 观测 |
| 默认底上的字 | `{color.on.surface.default.$root}` | `#191919` | 观测 |
| 交替底上的字 | `{color.on.surface.muted.$root}` | `#191919` | 观测 |
| 默认描边 | `{color.border.default.$root}` | `#e6e6e6` | 观测（卡片描边） |
| 弱描边 | `{color.border.muted.$root}` | `#c2c2c2` | 观测（线框钮） |

未产出（omit，禁止当可用值）：`color.primary.hover` · `color.identity.hover` · `color.on.identity` · `color.on.accent` · `color.focus` · 状态色 `success/warning/danger/info` · `color.surface.identity/inverse/transparent` · `color.overlay`。理由见 §8。

未上屏第一方具名色不进本表可用列：`design-dont-unobserved-hwc-red-hover` · `design-dont-unobserved-brand-blue-1476ff` · `design-dont-unobserved-accent-orange`。

### surface 降级

semantic 只留 `default` / `muted` 两档。页脚实测 `#efefef`，与 muted `#fafafa` 近同，**不建第三档**；复刻页脚取 `{color.surface.muted.$root}`，若必须贴 `#efefef` 标 `lossy: true` + `observedHex`。工具链楼层里的深色工作台（`#0d0d0d` / `#1e1e1e`）是媒体，不是楼层底，不进 `surface.inverse`。

## 3. Typography

| 角色 | 路径 | 栈 / 字号 / 字重 / 行高 |
| --- | --- | --- |
| 正文 | `{typography.body}` | `{fontFamily.sans}` · 14px · 400 · 22px |
| 标题 | `{typography.heading}` | 同栈 · 28px · 700 · 42px（mobile 实测；pc 未采到） |
| 标签 | `{typography.label}` | 同栈 · 12px · 400 · 18px |

`{fontFamily.sans}` = `Manrope, -apple-system, HuaweiSans, Helvetica Neue, …, Microsoft YaHei, SimSun, sans-serif`。代码预览走 `{fontFamily.mono}`（Consolas / Menlo / Fira Code），不另立 typography 角色。`display` / `caption` omitted。

## 4. Layout

已采三档字段位 `pc` / `tablet` / `mobile`。**仅 mobile 有楼层几何**（content 约 531–539px，左右 20px）。pc（1440）与 tablet（873）本票 `landmarks` 空、截图近白，pattern 里这两档 `content_width_px: 0` 是缺测占位，**不得当实测、不得用 mobile 数回填**。节奏 `alternate-muted`，跳过 chrome / overlay / hero / footer。不设站级默认栅格。

## 5. Elevation

卡片观测到 `{elevation.card}`：`0 24px 64px`、色 `{color.neutral.6}` alpha 0.13。其余海拔 omit。线框「查看案例」hover 另有 `0 2px 12px` 浅影，未立第二档 elevation。

## 6. Shapes

| 角色 | 路径 | 值 |
| --- | --- | --- |
| 控件圆角 | `{shape.radius.control}` | 12px（`--hm-radius-medium`；线框钮 / 卡） |
| 容器圆角 | `{shape.radius.container}` | 12px（同值也保留两条） |

首屏实心主钮胶囊半径 48px 活在 `component.button-primary.rounded`，不升 primitive。`--hm-radius-large` 24px 未上屏。

## 7. Components

| key | 默认 | hover |
| --- | --- | --- |
| button-primary | `{color.primary.$root}` 底 + `{color.on.primary.$root}` 字 + 48px 胶囊 | 未测到换色，omit `button-primary-hover` |
| button-outline | 白底 + `{color.text.default.$root}` 字 + `{color.border.muted.$root}` 1px + 12px | hover 主要加浅影、描边近透明，未立 hover token |
| card-outlined | 白底 + `{color.border.default.$root}` 描边 + 12px | — |

脚本把案例卡上的「查看案例」采成 `primary_cta`；读图后首屏主操作是实心「立即体验」，「探索案例」才是成对线框次钮。

## 8. Do's and Don'ts

### Do

- 主按钮用近黑实心胶囊，次按钮用线框；成对出现。
- 识别红只给华为云 logo，不铺楼层底、不当 CTA。
- 装饰蓝只做光斑 / 浅渐变，不要改成实心主钮或正文链接色。
- 正文链接与正文同色。
- 新页楼层序列先落 `page_skeletons` 的 `sk-home`。

### Don't

| id | check | 规则 |
| --- | --- | --- |
| design-dont-unobserved-hwc-red-hover | unused-scale | 第一方 `--color-hwc-red-hover` `#d64a52` 未上屏。不得写成识别色悬停或第二行动色。 |
| design-dont-unobserved-brand-blue-1476ff | unused-scale | 第一方 `#1476ff` 未上屏。不得写成链接蓝或第三行动色。 |
| design-dont-unobserved-accent-orange | unused-scale | 第一方 `--color-accent-orange` `#f5a623` 未上屏。不得写成强调橙。 |

文案禁词见 voice.md。

### 已知缺口

- `color.primary.hover` / `button-primary-hover`：实心主钮未采到 hover 换色 → omit。
- `color.identity.hover` / `color.on.identity`：红只在 logo 瓣上，无内容楼层可点击红底 → omit。
- `color.focus`：focus-visible 为浏览器 `auto` 环，无站定制 → omit。
- 状态色 / `surface.identity|inverse|transparent` / `overlay`：无对应楼层 → omit。
- `typography.display|caption`：未立。
- 无暗色 overlay（不交 `tokens.dark.json`）。
- pc / tablet 几何缺测（`HYDRATION_EMPTY`），见 coverage.blockers。
- 页壳高度不是对账项。

## 9. Accessibility

focus：未观测到站定制可见焦点环。描边 `{color.border.default.$root}` `#e6e6e6` 与 `{color.border.muted.$root}` `#c2c2c2` 在白底上对比弱，只报警不判失败；复刻时不要宣称原站 WCAG 失败，也不要为过 AA 改 `primary` / `identity` 填充。`on-*` 走实测最高对比（浅底深字、深钮白字）。

## 10. Viewport names

口径：**run 级**（`raw/session.json`）。禁止写成 `lg = 1440`。

| 对外 | 字段位 | 本站观测像素 | viewportSource |
| --- | ---: | ---: | --- |
| lg | pc | 1440 | clustered |
| md | tablet | 873 | clustered |
| sm | mobile | 571 | clustered |

pc / tablet 本票未采到楼层几何；生成断点可取本节像素，楼层 `responsive.pc|tablet.grid` 的 `0` 不得当内容宽。
