# fixture-lanyuan-lab · 视觉契约

人读投影。冲突以 `tokens.json` / `patterns/` / `voice.md` 为准。语义色引用必须带 `.$root`。

本文件**只交 §1 与 §8**：这是行为 eval 的冻结输入，不是线上站点的采集产物，§2–§7 与 §9–§10 无实测可写，整节省略而非留空壳。

## 1. Overview

虚构站点，单页。白底，青绿做行动色，靛蓝只作识别（logo），二者不同色、不 merge。字体走系统栈，无 webfont。

| 项 | 定档 |
| --- | --- |
| 楼层节奏 | `alternate-muted`；`hero` / `footer` / chrome 不占交替计数，故 `feature` 取 `default`、`cta` 取 `muted` |
| 签名手法 | 实心青绿钮 + 线框钮成对；卡片用 1px 描边，全站无投影 |
| 圆角 | 控件 6px，容器 12px，两档不同值 |
| 内容宽 | pc 1128 / tablet 704 / mobile 344，容器恒 `contained`（这三个是内容几何，不是 `@media` 声明值） |
| 断点声明值 | `@media` 只有两处：1024 划 tablet、768 划 mobile。机读副本在 `tokens.json` 的 `breakpoints` 组（合同 §3.8） |
| 已省 token | `elevation` · `motion` · `typography.label|display|caption` · 状态色 · `focus` · `overlay` · `surface.identity|inverse|transparent` · `border.muted` · `on.accent`：无观测，按条件必产出规则 omit，复刻时不得补造 |
| 未上屏第一方色 | `color.orange.1` 与 `color.accent.$root`（`#d97706` / `--lyl-color-accent-amber`）声明存在但从未上屏，保留 token 并标 `observed: false`，见 §8 的 `design-dont-declared-accent-amber` |
| 暗色 | 无第二套主题，`tokens.dark.json` 与 `resolver.json` 不交 |

## 8. Do's and Don'ts

### Do

- 主钮用青绿实心，次钮用线框；成对出现。
- 靛蓝只给 logo，不铺楼层底、不做按钮填充。
- 卡片用 `color.border.default` 描边区分层次，不用阴影。
- 新页楼层序列先落 `page_skeletons` 的 `sk-landing`。
- 楼层涂色按 `rhythm` 重算，不照抄单个 pattern 自带的 `rhythm.surface`。

### Don't

| id | check | 规则 |
| --- | --- | --- |
| design-dont-declared-accent-amber | unused-scale | `#d97706`（`--lyl-color-accent-amber`）从未上屏，禁止当第三行动色、链接色或强调底；要用琥珀必须先重采取得观测。 |
| design-dont-identity-as-fill | identity-misuse | 靛蓝 `color.identity.$root` 禁止做按钮或楼层底填充，本站只用它画 logo。 |
| design-dont-card-shadow | no-elevation | 卡片禁止加投影或 `filter: drop-shadow`，本站无 `elevation` token，层次一律靠 1px 描边。 |
| design-dont-hero-media | hero-plain | 首屏禁止铺背景图、渐变或视频，本站首屏恒为 `surface.default` 纯色底。 |
| design-dont-cta-second-button | cta-single | 转化条禁止出现第二枚按钮，本层实测形态恒为单钮。 |
| design-dont-invented-radius | radius-two-steps | 圆角只有 6px 与 12px 两档，禁止插入 8px / 16px 等中间值或改用 `pill`。 |

文案禁词见 `voice.md` §V4。
