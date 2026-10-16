# 组件

本资产只收规范里有的颜色、阴影，以及样张画出的形态。按钮、输入框、单选、复选只有悬浮和禁用，没有聚焦、按下、错误。深色反白先不做，预览页不放深底。规范没印、但已经指定来源的尺寸按来源实现。输入框尺寸等后续规范。按钮圆角等于该档高度，不是高度的一半。视频圆钮按样张整圆裁切，见该节。待标注项见各节，填写表在 [spec/annotation-template.md](spec/annotation-template.md)。

## 组件清单

| 组件 | 状态 | 来源 | 缺什么 |
| --- | --- | --- | --- |
| 按钮 | 已收录 | 控件样张（胶囊、四档、主/次/危险/文本、禁用）+ 色板 | 无 |
| 文字链 | 已收录 | 控件样张（悬浮下划线）+ 色板链接色 | 无 |
| 标签 | 已收录 | 控件样张 + 色板（底为该标签字色的 10%；金色是渐变） | 无 |
| 输入框 | 已收录 | theme-token.css 尺寸 + 色板色 | 无 |
| 图标 | 已收录 | theme-token.css 的 por-icon 字体 | 无 |
| 复选与单选 | 已收录 | 控件样张（方框、圆点、选中近黑）+ 门户 demo 尺寸 | 悬浮色。样张和 demo 都没单列 |
| 视频控件 | 已收录 | 控件样张整圆裁切（40 / 60，浅色与深色，禁用 / 默认 / 悬浮） | 无 |
| 提示条 | 已收录 | theme-token.css 的 por-tip + 截图 | 无 |
| 下拉选择 | 待补充 | 无规范样张 | 整件，含触发器、面板、选项 |
| 开关 | 待补充 | 色板只标了关闭底和打开蓝，没有轨道样张 | 轨道、圆点、内距和状态 |
| Tab | 待补充 | 色板只标了字色和页签底，没有页签样张 | 高度、间距、选中条 |
| 分页 | 已收录 | theme-token.css 页码尺寸和状态色 | 无 |
| 图标按钮 | 待补充 | 样张角落只有一组图标，没有状态说明 | 直径、图标尺寸、状态色 |

## 按钮

结构：容器 + 文字，不带图标。变体：主、次、危险、文本。四档是大、中、默认、小。默认无额外类。大 `--lg`、中 `--md`、小 `--sm`。圆角等于该档高度，不是高度的一半。文本按钮不圆角。字重都不加粗。

| 档 | 外框 | 高度 / 圆角 | 水平内边距 | 垂直内边距 | 字号 / 行高 |
| --- | --- | --- | --- | --- | --- |
| 大 | 152×48 | 48 | 48 | 12 | 14 / 22 |
| 中 | 120×40 | 40 | 32 | 8 | 14 / 22 |
| 默认 | 104×32 | 32 | 24 | 4 | 14 / 22 |
| 小 | 80×24 | 24 | 16 | 2 | 12 / 18 |

内边距在 1px 边框内侧，边框色等于该状态的底色。只有悬浮和禁用；按下、聚焦、错误都不单设。胶囊按钮的禁用态不按变体区分，只有尺寸不同：底和描边都是色板禁用底 `rgba(0, 0, 0, 0.05)`，字 `#C2C2C2`。白底样张 `spec/data-input-white.png` 上底是 `#F2F2F2`，描边没有另一条深色。危险按钮默认和悬浮底是白，悬浮字 `#FAA9A5`，悬浮边 `#F76360`。次要按钮悬浮底是 5% 黑，字仍是 `#191919`。文本按钮不是胶囊，各状态都无底；样张上默认和悬浮字色都是 `#1476FF`，悬浮下划线厚 1px，距字形实底 1px；禁用行是 `#C2C2C2`，无下划线、无框。

| 部位 | token |
| --- | --- |
| 主按钮底 / 悬浮 / 字 | `--porx-button-primary-bg` / `--porx-button-primary-bg-hover` / `--porx-button-primary-fg` |
| 次按钮边框 / 悬浮底 | `--porx-button-secondary-border` / `--porx-button-secondary-bg-hover` |
| 危险按钮字和边 / 悬浮字 / 悬浮边 | `--porx-button-danger-fg` / `--porx-button-danger-border` / `--porx-button-danger-fg-hover` / `--porx-button-danger-border-hover` |
| 文本按钮字 | `--porx-button-text-fg` |
| 禁用底 / 禁用字 / 禁用边 | `--porx-button-bg-disabled` / `--porx-button-fg-disabled` / `--porx-button-border-disabled` |

Do：一屏一个主按钮。Don't：把辅助蓝铺成主按钮底。

```html
<button class="porx-button porx-button--primary">主要按钮</button>
<button class="porx-button porx-button--primary is-hover">悬浮</button>
<button class="porx-button porx-button--primary" disabled>禁用</button>
<button class="porx-button porx-button--secondary">次要按钮</button>
<button class="porx-button porx-button--secondary is-hover">悬浮</button>
<button class="porx-button porx-button--secondary" disabled>禁用</button>
<button class="porx-button porx-button--danger">危险按钮</button>
<button class="porx-button porx-button--danger is-hover">悬浮</button>
<button class="porx-button porx-button--danger" disabled>禁用</button>
<button class="porx-button porx-button--text">文本按钮</button>
<button class="porx-button porx-button--text is-hover">文本按钮</button>
<button class="porx-button porx-button--text is-disabled">文本按钮</button>
```

## 文字链

结构：文字，可在右侧带图标。字号 14px，行高 22px。默认链悬浮加粗并加下划线，不另设下划线厚度。图标与文字间距 4px。深底白链悬浮仍是白。浅色链默认 `#595959`，悬浮 `#191919`。禁用光标为默认。没有聚焦和错误。

| 部位 | token |
| --- | --- |
| 默认 / 悬浮 / 禁用 / 蓝 / 白 | `--porx-link-fg` / `--porx-link-fg-hover` / `--porx-link-fg-disabled` / `--porx-link-fg-blue` / `--porx-link-fg-white` |

Do：正文里的链接用近黑。Don't：把蓝链当成所有链接的颜色。

```html
<a class="porx-link" href="#">链接按钮</a>
<a class="porx-link is-hover" href="#">链接按钮</a>
<a class="porx-link is-disabled" href="#">链接按钮</a>
<a class="porx-link porx-link--blue" href="#">链接按钮</a>
<a class="porx-link porx-link--blue is-hover" href="#">链接按钮</a>
<a class="porx-link porx-link--light" href="#">链接按钮</a>
<a class="porx-link porx-link--light is-hover" href="#">链接按钮</a>
```

## 标签

结构：短文字，无关闭图标。高度 18px，水平内边距左右各 4px，圆角 4px（金色 2px），字号 12px，行高 16px，描边 1px 透明（金色无描边）。灰字 `#191919`，橙字 `#A64D00`，橙底是该色的 10%。红、绿、蓝、紫、华为红仍是字色的 10%。金色渐变从 `#E8CDA4` 的 3% 到 `#F8EDDB`。

| 部位 | token |
| --- | --- |
| 红底 / 红字 | `--porx-tag-red-bg` / `--porx-tag-red-fg` |
| 金底 / 金字 | `--porx-tag-gold-bg` / `--porx-tag-gold-fg` |
| 华为红底 / 字 | `--porx-tag-huawei-bg` / `--porx-tag-huawei-fg` |

Do：标签底用该标签字色的 10%。金色用色板渐变。Don't：另铺一块实色。

```html
<span class="porx-tag porx-tag--gray">标签</span>
<span class="porx-tag porx-tag--red">标签</span>
<span class="porx-tag porx-tag--orange">标签</span>
<span class="porx-tag porx-tag--green">标签</span>
<span class="porx-tag porx-tag--blue">标签</span>
<span class="porx-tag porx-tag--purple">标签</span>
<span class="porx-tag porx-tag--gold">标签</span>
<span class="porx-tag porx-tag--huawei">NEW</span>
```

## 输入框

结构：单行输入。默认高 32px，大档 `--lg` 高 40px。水平内边距 12px，圆角 6px，描边 1px，字号 14px，行高 22px。色板标了边框、占位和禁用色，阴影图把 s 档标给输入框。交互只有悬浮和禁用。禁用字是占位色 `#808080`。

待标注：无。尺寸来自 theme-token.css。

| 部位 | token |
| --- | --- |
| 底 / 字 / 占位 | `--porx-input-bg` / `--porx-input-fg` / `--porx-input-placeholder` |
| 边框 / 悬浮与聚焦 | `--porx-input-border` / `--porx-input-border-hover` |
| 错误边 / 错误底 | `--porx-input-border-error` / `--porx-input-bg-error` |
| 禁用边 / 禁用底 | `--porx-input-border-disabled` / `--porx-input-bg-disabled` |
| 阴影 | `--porx-input-shadow` |

Do：错误态同时改边框和底。Don't：另做一套聚焦色。

```html
<input class="porx-input" placeholder="请输入">
<input class="porx-input porx-input--lg" placeholder="大">
<input class="porx-input is-hover" value="悬浮">
<input class="porx-input" disabled value="禁用">
```

## 图标

门户 `por-icon por-icon-more` 在本资产里是 `porx-icon porx-icon-more`。字体来自 theme-token.css 的 por-icon。复选勾是同一文件里的 confirm 字形，类名 `porx-icon-confirm`，字体单独一份，避免和 `porx-icon-search` 的码位撞车。

Do：用类名引出图标，不写字。Don't：用字符 ✓ 代替勾。

```html
<i class="porx-icon porx-icon-confirm"></i>
<i class="porx-icon porx-icon-menu"></i>
<i class="porx-icon porx-icon-more"></i>
<i class="porx-icon porx-icon-search"></i>
<i class="porx-icon porx-icon-caret-down"></i>
<i class="porx-icon porx-icon-minus"></i>
<i class="porx-icon porx-icon-plus"></i>
<i class="porx-icon porx-icon-close"></i>
<i class="porx-icon porx-icon-left"></i>
<i class="porx-icon porx-icon-right"></i>
<i class="porx-icon porx-icon-first"></i>
<i class="porx-icon porx-icon-last"></i>
<i class="porx-icon porx-icon-down"></i>
<i class="porx-icon porx-icon-up"></i>
<i class="porx-icon porx-icon-msg"></i>
<i class="porx-icon porx-icon-set"></i>
<i class="porx-icon porx-icon-about"></i>
<i class="porx-icon porx-icon-delete"></i>
<i class="porx-icon porx-icon-add"></i>
<i class="porx-icon porx-icon-full-screen"></i>
<i class="porx-icon porx-icon-doc"></i>
<i class="porx-icon porx-icon-share"></i>
<i class="porx-icon porx-icon-like"></i>
<i class="porx-icon porx-icon-star"></i>
<i class="porx-icon porx-icon-review"></i>
<i class="porx-icon porx-icon-watch"></i>
<i class="porx-icon porx-icon-list-card"></i>
<i class="porx-icon porx-icon-list"></i>
<i class="porx-icon porx-icon-change"></i>
<i class="porx-icon porx-icon-filter"></i>
<i class="porx-icon porx-icon-select"></i>
<i class="porx-icon porx-icon-error"></i>
<i class="porx-icon porx-icon-warn"></i>
<i class="porx-icon porx-icon-prompt"></i>
<i class="porx-icon porx-icon-success"></i>
```

## 复选与单选

结构：方框或圆框 + 标签字。样张选中是近黑，勾和圆点是浅色。尺寸来自门户 demo（`cnpm-baseui/3.0.18`），样张没印：框 16×16，描边 1px，复选圆角 4px，单选圆点 8px，与文字间距 10px，标签字 14px / 行高 22px。复选勾用 `porx-icon-confirm`（门户勾的字形，字体是同一份 theme-token 里的 u-icon）。单选标是 8px 圆点，不是图标。只有悬浮和禁用；没有聚焦和错误。悬浮色规范未印，未另设。

| 部位 | token |
| --- | --- |
| 复选字 / 选中底 / 勾 | `--porx-checkbox-fg` / `--porx-checkbox-bg-checked` / `--porx-checkbox-fg-checked` |
| 单选字 / 选中点 | `--porx-radio-fg` / `--porx-radio-bg-checked` |

Do：选中用近黑。Don't：把开关的蓝拿来做复选。

```html
<label class="porx-checkbox"><span class="porx-checkbox__box"></span> 选项</label>
<label class="porx-checkbox is-checked"><span class="porx-checkbox__box"><i class="porx-icon porx-icon-confirm"></i></span> 已选</label>
<label class="porx-checkbox is-disabled"><span class="porx-checkbox__box"></span> 禁用</label>
<label class="porx-checkbox is-disabled is-checked"><span class="porx-checkbox__box"><i class="porx-icon porx-icon-confirm"></i></span> 禁用已选</label>
<label class="porx-radio"><span class="porx-radio__box"></span> 选项</label>
<label class="porx-radio is-checked"><span class="porx-radio__box"></span> 已选</label>
<label class="porx-radio is-disabled"><span class="porx-radio__box"></span> 禁用</label>
```

## 视频控件

结构：圆形播放 / 暂停按钮。小 40px，大 60px。图形是样张上的整圆裁切，文件在 `icons/video/`，相对 `components.css`。同一组从左到右是禁用、默认、悬浮；上面浅色，下面深色。按下和聚焦不单设。错误态不单设。只有悬浮和禁用会换图。

类：默认是 40px 浅色播放。`--lg` 为 60px，`--pause` 为暂停，`--on-dark` 为深色。`disabled` 与 `.is-disabled` 用禁用图，`:hover` 与 `.is-hover` 用悬浮图。

| 部位 | token |
| --- | --- |
| 底 / 悬浮底 / 悬浮图标 | `--porx-video-bg` / `--porx-video-bg-hover` / `--porx-video-fg-hover` |

Do：直接用裁切图标。Don't：再叠一层圆，或用文字三角代替图标。

```html
<button class="porx-video" type="button" disabled aria-label="播放"></button>
<button class="porx-video" type="button" aria-label="播放"></button>
<button class="porx-video is-hover" type="button" aria-label="播放"></button>
<button class="porx-video porx-video--lg" type="button" disabled aria-label="播放"></button>
<button class="porx-video porx-video--lg" type="button" aria-label="播放"></button>
<button class="porx-video porx-video--lg is-hover" type="button" aria-label="播放"></button>
<button class="porx-video porx-video--pause" type="button" disabled aria-label="暂停"></button>
<button class="porx-video porx-video--pause" type="button" aria-label="暂停"></button>
<button class="porx-video porx-video--pause is-hover" type="button" aria-label="暂停"></button>
<button class="porx-video porx-video--pause porx-video--lg" type="button" disabled aria-label="暂停"></button>
<button class="porx-video porx-video--pause porx-video--lg" type="button" aria-label="暂停"></button>
<button class="porx-video porx-video--pause porx-video--lg is-hover" type="button" aria-label="暂停"></button>
```

## 提示条

结构：左侧状态图标、中间文字、右侧关闭。圆角 2px，字号 14px，行高 22px，字色 `#191919`。底是功能色的 10%，描边与底同色。图标 16px，距左 15px；关闭距右 15px；文字左距 40px，上下 12px。提示用 `porx-icon-prompt`，错误用 `porx-icon-error`，告警用 `porx-icon-warn`，成功用 `porx-icon-success`。没有致命告警和普通告警。

| 部位 | token |
| --- | --- |
| 错误底 / 告警底 / 成功底 / 提示底 | `--porx-alert-error-bg` / `--porx-alert-warning-bg` / `--porx-alert-success-bg` / `--porx-alert-info-bg` |
| 图标色 | `--porx-color-error` / `--porx-color-warning` / `--porx-color-success` / `--porx-color-info` |
| 字色 | `--porx-color-text-primary` |

Do：浅底提示的字用正文色，颜色只放在图标上。Don't：把功能色铺成整条字色。

```html
<div class="porx-alert porx-alert--info">
  <i class="porx-icon porx-icon-prompt porx-alert__icon"></i>
  <span class="porx-alert__text">DIV层提示是一种不打断用户操作行为的轻量级交互反馈</span>
  <i class="porx-icon porx-icon-close porx-alert__close"></i>
</div>
<div class="porx-alert porx-alert--error">
  <i class="porx-icon porx-icon-error porx-alert__icon"></i>
  <span class="porx-alert__text">错误、失败类提示，可以设置10s后消失</span>
  <i class="porx-icon porx-icon-close porx-alert__close"></i>
</div>
<div class="porx-alert porx-alert--warning">
  <i class="porx-icon porx-icon-warn porx-alert__icon"></i>
  <span class="porx-alert__text">通过华为云微认证，可提升专业技术能力，获得面试优先推荐机会</span>
  <i class="porx-icon porx-icon-close porx-alert__close"></i>
</div>
<div class="porx-alert porx-alert--success">
  <i class="porx-icon porx-icon-success porx-alert__icon"></i>
  <span class="porx-alert__text">成功提示</span>
  <i class="porx-icon porx-icon-close porx-alert__close"></i>
</div>
```

## 分页

结构：页码按钮。高 32px，左右内边距 8px，项间距 4px。默认字 `#595959`。悬浮和当前页底是 5% 黑，字 `#191919`。当前页字重 700。禁用字 `#C2C2C2`，无底。没有聚焦和错误。

| 部位 | token |
| --- | --- |
| 悬浮底 / 默认字 / 当前字 / 禁用字 | `--porx-color-bg--disable` / `--porx-color-text-secondary` / `--porx-color-text-primary` / `--porx-color-text-disabled` |

Do：当前页和悬浮用同一浅底。Don't：用 `#F5F5F5` 当页码底。

```html
<nav class="porx-pagination">
  <button class="porx-pagination__item" type="button">1</button>
  <button class="porx-pagination__item is-current" type="button">2</button>
  <button class="porx-pagination__item is-hover" type="button">3</button>
  <button class="porx-pagination__item" type="button" disabled>4</button>
</nav>
```
