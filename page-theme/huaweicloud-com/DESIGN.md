# huaweicloud-com · 视觉契约

人读投影。冲突以 `tokens.json` / `patterns/` / `voice.md` 为准。语义色引用必须带 `.$root`。

本文件的断点与采样宽度分列，口径见合同 §2.1：断点是站点 CSS `@media` 声明值；采样宽度是本次采集视口。生成响应式几何只准取断点节，不得取采样宽度表。

## 1. Overview

华为云中国站门户 + 智果园子域。本趟受理十条 URL，**十页全采成**，`session.failures` 为空。默认浅色：`raw/session.json` 记 `darkMode: omitted`（无 dark media、无根切换器、无 inverse 楼层），故不交 `tokens.dark.json` / `resolver.json`。

| 项 | 定档 |
| --- | --- |
| 行动色 `color.primary.$root` | `#191919` 实心钮（六页内容区 CTA 众数；about / 合规中心页头白描边钮另组） |
| 识别色 `color.identity.$root` | `#c7000b` 花标与注册钮；与 primary 不同色，不 merge |
| 表面 | 白底 `surface.default` / 浅灰 `surface.muted`（`#f5f5f5`，跨页有 `#f7f7f7` / `#f3f3f3`，上取并标 `lossy`） |
| 字 | 正文与链接同色 `#191919`，照实记录，不改成蓝链 |
| 圆角 | 控件 32px 胶囊，容器 24px |
| 楼层节奏 | `custom`。`hero` / `footer` / chrome / `image` 仍跳过且不占计数；池仍只放 default / muted，无识别色楼层底。**不是** `n % 2`：10 页 74 条手写对 `alternate-muted` 占计数只 18/49；`monotone`（`surfaces[0]=default`）30/49；翻池 30/49。7/10 页连续同色（modelarts 7×default、about 6×default、home 4×default）。选 `custom` 是因为闭集里没有一个生成规则成立，不是因为降幅好看。页级手写是观测，型级 `ownSurface` 不能替代——`cta.centered-band` 在 orchard / ai 手写 `muted`、在 agentarts 手写 `image`。 |
| 暗色 | 不交第二套主题 |

主题一致性体检走 `cohesionAxes`，不得手改：`verdict: mixed-suspected`。`color.primary` 落 `different`（`#191919ff` = source-01…07；`#ffffffff` = source-08 / 09 / 10，对应 about / 新闻 / 合规中心）。本趟收 10 源。`color.identity` 与 `typography.fontFamily` 只进 `pending`（两侧 low / 仅系统回退），不构成分歧。建议分组见 `coverage.cohesion.suggestedSplit`，本次不拆资产。

## 2. Color

- 主钮：黑实心 `{color.primary.$root}`，白字 `{color.on.primary.$root}`。本趟五个黑钮页（home / AgentArts / ModelArts / ECS / 联系页）主 CTA 悬停背景均为 `rgb(89, 89, 89)` = `#595959`，与声明链 `--por-button-background-color-primary-hover` → `--por-color-background-secondary` 一致。`{color.primary.hover}` 指向已有 primitive `{color.neutral.4}`（`#595959`）。上一趟写成 `#545454` / `#565656` 两档，是 0.2s ease 过渡的中间帧，不是站点事实。`#545454` 本趟 painted-area 与 interaction-states 均未出现，原 `{color.neutral.5}` 已从色阶删除；原 `{color.neutral.6}` `#191919` 稠密重编号为 `{color.neutral.5}`。
- 识别红：注册钮与智果园内容区实心 CTA 用 `{color.identity.$root}` `#c7000b`，其上白字 `{color.on.identity.$root}`。智果园 / about / 合规中心 / AI / 新闻该钮悬停 `#d64a52`，写入 `{color.identity.hover}`（内容楼层可点击填充，条件成立）。
- Logo 位图主色脚本候选是 `#e50213` / `#e40213` / `#e40214`（`confidence: low`，pending，不入分歧）。身份色取第一方声明并在注册钮上实测的 `#c7000b`。
- 链接与正文同色，禁止改成未上屏的蓝。
- 未上屏第一方色保留 primitive + `observed: false` + `dontId`，见 §8。
- 未观测、已 omit 的条件必产出角色（不得补造）：`focus`（`:focus-visible` 只换填充亮度，无可见焦点环）、`overlay`（无模态 / 抽屉）、`success` / `warning` / `danger` / `info` 及对应 `on.*`、`surface.identity` / `surface.inverse` / `surface.transparent` 及对应 `on.surface.*`、`accent`（中性族禁止当 accent，也不许 alias 到 primary）。`border.muted` 选产出，未单独立档。

## 3. Typography

门户众数栈：`-apple-system, HuaweiSans, Helvetica Neue, Helvetica, Arial, PingFang SC, …`。第一方 `@font-face` 本趟各页几乎只有 `por-icon`，`HuaweiSans` 在栈里但未在本趟 `fonts.json` 落独立 face，字体轴 pending 属 system-fallback-only，不拆资产。正文 16/24、标题 40/60、标签 14/21；字重 400 / 600。

## 4. Layout

容器在门户主栏测得 `max-width` 候选 1600（navbar `container.max_width_px`）。内容宽随页变化，写在各 pattern 的 `responsive.*.grid.content_width_px`，那是内容几何，不是断点。

**生成新页的响应式换档取 §5 断点声明值，不要取 §6 采样宽度。** 像素常量不在本节重复。

### 4.1 间距九档（`tokens.json` 的 `dimension.spacing.1`–`.9`）

来源是本趟成功十页 `raw/{pageId}/first-party-variables.json` 的 `fromComputed[]`，取
`--primitive-space-*` 与 portal 同格的 `--por-base-size-*`，`calc(2px*N)` 归一成 `2N px`。
**档不另裁**：按 microsite 已声明的九级梯，九档在十页全部有 resolved px。重放：
`node runs/round3/derive-t7-spacing.mjs`。

| 档 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| px | 8 | 12 | 16 | 20 | 24 | 32 | 40 | 48 | 60 |
| 源变量 | `--primitive-space-2` | `-3` | `-4` | `-5` | `-6` | `-8` | `-10` | `-12` | `-15` |

梯级键（2/3/4/5/6/8/10/12/15）不是档序号：源站按 `2px × N` 命名，本资产按序号 `.1`–`.9` 落盘，
两侧靠上表对齐。`por-base-size` / `primitive-space` 并集另有 36 个正 px（含非梯值），未入组。

## 5. 断点声明值（@media）

本节只写站点 CSS 里 `@media` 的声明值。来源是本趟成功十页 `raw/{pageId}/media-queries.json` 的 `clusteredBucketsPx`（按 `aliases` 有交集跨页合并）。**不要数 `rawUnique`**：它保留声明原文，`(max-width:768px)` 与 `(max-width: 768px)` 会裂成两条。

本趟合并后按强度降序，取出现于全部 10 成功页的主档：

| 代表 px | 区间 | 合计 count | 出现页数 | 用途 |
| ---: | --- | ---: | ---: | --- |
| **768** | 767–769 | 814 | 10 | 主断点 |
| **1024** | 1023–1025 | 412 | 10 | 主断点 |
| **1280** | 1279–1281 | 394 | 10 | 主断点（about / 合规中心代表值落 1279，按 aliases 并入 1280） |
| **1600** | 1599–1601 | 345 | 10 | 主断点 |
| **979** | 979 | 260 | 10 | 次档，站点确有此声明 |

其下仍出现于 10 页、但弱一档：1440（144）、1920（104）、1200（40）、799（30）。更弱：1775 / 1364 / 375 / 350 / 599 / 840，以及 count 为 10 的 413 / 920 / 1340。

**生成断点取本节主档 768 / 1024 / 1280 / 1600；需要更密的中间档时才用 979。** 不得用 §6 的 1688 / 1240 / 1002 / 784 / 684 / 1640 / 1450 充当断点。

上表五个代表值另有一份机读副本，在 `tokens.json` 的 `breakpoints` 组（合同 §3.8）：那一份多带 `aliases`（本桶合并进来的原始声明值）与 `slots`（这个值给哪几档划边界，取自各页 `sampled[]` 命中的 `bands[]` 的 `lower` / `upper`）。**两侧代表 px 必须逐个相等**，只改一侧即阻断。本资产的档映射：768 同时是 mobile 上沿与 tablet 下沿（11 处）· 979 / 1024 / 1280 只划 tablet（8 / 8 / 1 处）· 1600 只划 pc（8 处）。

about / 合规中心两页 1440 桶特别强（各 36，其它页约 9）、1600 桶偏弱（各 8），与第一方变量规模一起记为另一套模板，见 §7。不得因此改写上表代表值。

## 6. 采样宽度（本次采集视口）

本节不是断点。来源是同一份 `media-queries.json` 的 `sampled[]`（`viewport_px` + `viewportSource`）。`raw/session.json` 的 `viewports` 只记了主页那一套，**不得**用它覆盖各页 `sampled[]`。本趟成功十页 30 个槽位全部 `viewportSource: clustered`，没有任何一档是 `fallback`。

| pageId | pc | tablet | mobile |
| --- | ---: | ---: | ---: |
| home | 1688 | 784 | 684 |
| product-agentarts.html | 1688 | 1240 | 684 |
| product-modelarts.html | 1688 | 1002 | 784 |
| agentorchard--home | 1640 | 1002 | 784 |
| ai | 1688 | 1002 | 784 |
| product-ecs.html | 1688 | 1002 | 784 |
| service-contact.html | 1688 | 1002 | 784 |
| about-index.html | 1450 | 1002 | 784 |
| news.html | 1688 | 1002 | 784 |
| securecenter-compliance-compliance-center.html | 1450 | 1002 | 784 |

多数页是 pc=1688 / tablet=1002 / mobile=784。例外如实记账：home 的 tablet/mobile 是 784/684；AgentArts tablet=1240、mobile=684；智果园 pc=1640；about 与合规中心 pc=1450。这些数是取样参数，不是 `@media` 声明值。

`patterns/` 只写 `pc` / `tablet` / `mobile` 槽位语义与几何实测，禁止复制 `viewport_px` / `viewportSource`。

## 7. 覆盖与异常

- 本趟成功十页。`session.failures` 为空，无 `ENCODE_ERROR`、无其它错码。`holdout.yaml` 在现役目录，禁采清单 9 条、本趟跳过 0。`site-overrides.yaml` 本趟 `present: true` / `effective: true`。
- **模板分裂（覆盖面事实，不是 cohesion 新阈值）**：`about-index.html` 与 `securecenter-compliance-compliance-center.html` 第一方变量 declared 270 / referenced 69（home 777/663，智果园 789/662，ModelArts 780/662，其余门户页 777/662），且 1440 桶特别强、1600 偏弱。cohesion 的 primary 分组是 08+09+10（新闻页本趟进白钮组）。
- **AgentArts 悬空引用**：`product-agentarts.html` referenced 却未声明 123 条，几乎全是 TinyVue `--ti-*` / `--cf-*` / `--tp-*`；其它成功页各 2 条。门户页共用 `--por-base-font-weight`、`--por-base-size-66`。原因未查，记待办，不抹平。
- `surface.muted` 跨页 `#f7f7f7` / `#f5f5f5` / `#f3f3f3`，词表只有 default/muted 两档，上取 `#f5f5f5` 并标 `lossy`。输入框描边实测近 `#ebebeb`，primitive `neutral.3` 未上屏，component 上取标 `lossy`。

## 8. Do's and Don'ts

### Do

- 产品首屏主钮用黑实心，次钮用黑描边白底；注册与智果园内容主操作才用识别红。
- 新页楼层序列先落 `page_skeletons` 对应型；换档几何看 §5，不看 §6。
- 链接保持与正文同色。
- 楼层涂色按 `rhythm`（`scheme: custom`）吃页级手写 `surface`，不把 identity 放进池；新页每条参与计数的层必须手写，禁止再摘已采页 sequence 的 `surface`。

### Don't

| id | check | 规则 |
| --- | --- | --- |
| design-dont-neutral-3-ebebeb | unused-scale | `#ebebeb`（`--por-base-color-gray-20` / `--por-color-border-drop`）primitive `color.neutral.3` 本趟未上屏，禁止当灰底或第三档表面铺开；描边只走已写的 `{color.border.default.$root}` / `component.input-outline`（lossy），禁止另开第三条灰阶用途。 |
| design-dont-microsite-accent-red-e41e2b | unused-scale | `#e41e2b`（`--primitive-red-500` / `--text-accent`）本趟未上屏，禁止当第三行动色或替代 `#c7000b`。 |
| design-dont-microsite-link-blue-3b82f6 | unused-scale | `#3b82f6`（`--text-link` / `--primitive-blue-500`）未上屏，禁止把正文链接改成蓝。 |
| design-dont-brand-blue-1476ff | unused-scale | `#1476ff`（`--por-base-color-brand-2`）未上屏，禁止当第二品牌色铺底或做按钮。 |
| design-dont-identity-as-site-cta | identity-misuse | 门户产品首屏禁止把识别红当成默认主 CTA；红只给注册钮与智果园已观测的内容实心钮。 |
| design-dont-sample-as-breakpoint | breakpoint | 禁止把 §6 采样宽度（1688 / 1240 / 1002 / 784 / 684 / 1640 / 1450）写进生成断点或 `@media`。 |
| design-dont-invent-status | no-status | 禁止补造 success / warning / danger / info / focus / overlay 通色。 |
| design-dont-dark-scheme | no-dark | 禁止发明暗色主题或 inverse 整页底；本趟 `darkMode: omitted`。 |
| design-dont-agentarts-tinyvue | coverage | AgentArts 页 `--ti-*` 悬空引用不得当成已观测 token 盘；未重采前不要把 TinyVue 档名写进 `tokens.json`。 |

文案禁词见 `voice.md` §V4。

## 9. 待办（本趟未改，审计留痕）

1. **51 篇 pattern 已按本趟 landmarks 归纳。** 几何数字不再沿用上一趟人读值；写入判据与分桶见 §10，逐份底表在过程件 `.page-theme-work/induct-geometry/huaweicloud-com/slot-table.md`（不进资产）。人读对了但 landmark 说 `floor-root` 的档、被口径覆盖的 gutter，线索在对应 `{id}.notes.md`，不写进字段。
2. **`feature.grid-2-text` 三档本趟全部 `floor-root`。** 人读仍是两列浅底卡，字段走缺观测。线索在该篇 notes。
3. **`page-header.banner` tablet / mobile、`blog.dated-list` pc、`feature.bento-scenes` pc / mobile 仍是实测；** pc 横幅仍是 `floor-root`；新闻列表窄档与 Bento tablet 仍 `link-miss`。
4. **`sk-product` 可选 `taxonomy: gallery` 保留**（R5-A2）：本趟 catalog 无 `gallery.*`、`patterns/` 无 `taxonomy: gallery` 楼层。删槽会改包络 `advisory[].detail.skeletons[1].steps`（8→7），本票禁止碰包络，故留槽并明写：**型库预留、无观测**。生成侧不得因此发明画廊楼层。
5. **`primary.hover` 本趟五页黑钮悬停均为 `#595959`。** 已改指向 `{color.neutral.4}`，并从色阶删除无人引用、本趟像素里也不存在的 `#545454`。`identity.hover` = `#d64a52` 在智果园 / about / 合规中心 / AI / 新闻注册钮上都测到。
6. **轮播嫌疑不再把 `columnsBbox` 的滑片总数写进字段。** 逐档点名见 §10.4。可靠认出轮播要采集侧去量 `overflow` / `scrollWidth`，另立票。
7. **`blog.analyst-list` tablet 本趟 `link-miss`。** 上一趟该档是实测 2 列；被覆盖的旧值留在该篇 notes。`content.numbered-stack` / `content.about-stories` 的 tablet 本趟翻回实测；两篇 mobile 仍缺观测（`link-miss` / `floor-root`）。
8. **最佳实践详情稿（`detail.html`，本机 Figma 导出）。** 线上客户案例页仍 holdout。采集未切层，新篇 `page-header.case-hero` / `content.practice-split` 三档几何缺测。稿面标签与链接涂了 `#1476ff`，与 §8 `design-dont-brand-blue-1476ff`（十页门户未上屏）冲突——本页型若上线需按页型收窄 Don't，未重裁前不得当全站第二品牌色。

## 10. 本趟几何归纳（landmarks → patterns）

口径见 `extract.md` §13.5 与合同 §4.3。字段里的数字只来自本趟 landmark；人读旧值与删除记录不进字段。逐份底表（153 档对照，含连接键级别、`containerSource`、旧/新四字段、理由码）在 `.page-theme-work/induct-geometry/huaweicloud-com/slot-table.md`，**不进本资产**。本节只留汇总与下游读法。

### 10.1 分桶

51 篇 × 3 档 = 153 档。理由码一档一码，顺序与底表 `reasonOrder` 相同（先失败先落桶）：`chrome` → `link-miss` → `skipped` → `floor-root` → `container-unknown` → `carousel-layout` → `carousel-span` → `content-width-nonpositive` → `columns-invalid` → `items-not-same-row` → `measured`。

| 判定 | 档数 | 理由码拆分 |
| --- | ---: | --- |
| 写实测 | 69 | `measured` 69 |
| 缺观测 | 84 | `floor-root` 34 · `link-miss` 25 · `chrome` 12 · `carousel-span` 6 · `skipped` 3 · `carousel-layout` 3 · `items-not-same-row` 1 |
| `stack_below` | — | 有一档缺观测则整键省掉 39 篇；三档都实测则按 `columns` 重算，本趟改值 0 篇 |
| `observations` | 删 0 条 | 本趟无过期跨页观测可删 |

缺观测档 `confidence` 一律 `low`。`content-width-nonpositive`、`columns-invalid`、`container-unknown` 本趟 0 档。

相对 `20260903T041441Z-4ea8`：原先对上的实测数字本趟未变。**缺观测 → 实测 2 档**：`content.about-stories` tablet（heading 命中 `sec-06`「客户案例」）、`content.numbered-stack` tablet（heading 命中 `sec-03`「做企业级AI创新的硅基黑土地」），值见各自 yaml。**实测 → `link-miss` 1 档**：`blog.analyst-list` tablet（上一趟 2 列，被覆盖的旧值见该篇 notes）。`feature.grid-2-text` 三档仍是 `floor-root`。`content.about-stories` mobile 仍 `floor-root`；`content.numbered-stack` mobile 仍 `link-miss`。

### 10.2 页壳 `chrome.yaml`

`navbar.portal-utility` · `navbar.orchard-subbrand` · `footer.multi-column` · `float-widget.service-rail` 共 4 条 × 3 档，`responsive.*.grid` 一律 `{ observed: false, confidence: low }`。

理由：页壳走固定结构、**不走楼层量法**（`extract.md` §6.1，`gridSkippedReason: chrome-fixed-structure`）。landmarks 侧已经不量；把页尾 / 导航用楼层尺量出来的数写进资产，是假数。这是有意的信息损失。

### 10.3 `containerSource` 四格（给下游对账门）

该字段在 `raw/*/landmarks.*.json` 的 `grid` 上，**不随资产迁移、不进 `patterns/`**。下游几何对账必须按四格分支，**不得把 `single-column` 与 `floor-root` 混成一个值**。与合同 §4.3 同义：

| 取值 | 含义 | 本趟怎么写 `patterns/` |
| --- | --- | --- |
| `content-row` | 量到了承载可见列的容器 | 其余两条写入判据也过则写实测 |
| `single-column` | 量到了一列竖叠内容，`columns` 记 `1`，**这是一个事实** | 写实测 1 列 |
| `floor-root` | 没量出内容行，**不是**「实测为 1 列」 | 该档必须走缺观测 |
| `null` | 这一档没量（合并层或页壳） | 缺观测（`skipped` / `chrome`） |

混读会把「这层就是一列」抹成「没量出来」。本趟对上的 `floor-root` 34 档全部缺观测，不写 1 列。

### 10.4 轮播嫌疑（并集，不当认定）

两把尺几乎不重合，并集只算嫌疑，**不把「已认定是轮播」写进任何字段**。嫌疑档走缺观测：`columnsBbox` 在这些档上数的是含屏外滑片的总数，不是合同 §4.3 的「该断点的视觉列数」。

**`variant.layout ∈ {slider, marquee}`（2 篇）**

| 篇 | 档 | 本趟理由码 | 说明 |
| --- | --- | --- | --- |
| `feature.slider-cards-3` | pc / tablet / mobile | `carousel-layout` | layout 尺先命中 |
| `hero.slider-split` | pc / tablet | `floor-root` | layout 也标了 slider，但已对上的档是 `floor-root`（先失败先落桶），跨度不溢出 |
| `hero.slider-split` | mobile | `link-miss` | 没连上，轮不到 layout 尺 |

**子项 x 跨度 `max(x+width)−min(x) > contentWidthPx + 8`（5 篇）**

| 篇 | 档 | 本趟理由码 |
| --- | --- | --- |
| `feature.slider-cards-3` | 三档 | 已被 `carousel-layout` 收走（交集） |
| `case-study.split-stats` | mobile | `carousel-span` |
| `content.merged-industry-case` | tablet | `carousel-span`（pc 是 `merged-floor`，mobile 是 `link-miss`） |
| `feature.grid-4-dark-cards` | pc / tablet / mobile | `carousel-span`（只超 54–259px、三档都只有 4 个盒子，更像盒子比内容行略宽，不是滑轨；仍按并集缺观测） |
| `stats.map-cities` | mobile | `carousel-span`（pc 已写实测 2 列；tablet 是 `floor-root`） |

可靠认出轮播要采集侧去量 `overflow` 与 `scrollWidth`，另立票。
