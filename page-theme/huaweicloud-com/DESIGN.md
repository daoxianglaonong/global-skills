# 华为云 huaweicloud.com

`--porx-` 是本资产前缀，x = next，与站点 `--por-` 隔离，以免同名不同值。规范印名和站点原名分别在 `specName`、`siteNames`。

本资产只含规范值（`valuePolicy: spec-only`）。字号、行高、间距、圆角、断点、字体栈和控件尺寸规范没有印，不在 token 里。生成时由模型自定，并在摘要里列为规范缺口，不得写成资产值。待补的项见 [spec/annotation-template.md](spec/annotation-template.md)。色值冲突已按规范取值，站点差异见文末对照表。

黑、白、灰是这套界面的主调，蓝 `#1476FF` 只做辅助。重要按钮是近黑胶囊，文字默认 `#191919`，次要文字 `#595959`。圆角偏大，按钮常做成胶囊；阴影很轻，只用来把输入框、卡片和弹窗从底上抬起来。营销页楼层疏朗，一屏一件事。

## 怎么取用

```css
@import "tokens.css";
```

只用 `tokens.css` 里的变量。色阶 `--porx-ramp-*` 不导出，语义色已经写成最终色值。按钮、输入框、标签等控件见 [components.md](components.md)，样式在 `components.css`。

| 用途 | 变量 |
| --- | --- |
| 主色 / 重要按钮底 | `--porx-color-bg--primary` |
| 辅助蓝 | `--porx-color-brand-2` |
| 正文 | `--porx-color-text-primary` |
| 次要文字 | `--porx-color-text-secondary` |
| 页面底 | `--porx-color-bg-container-1` |
| 卡片阴影 | `--porx-base-shadow-m` |

## 可选模块

- [components.md](components.md)：按钮、文字链、标签、输入框、复选与单选、视频控件、提示条、分页、图标。
- [voice.md](voice.md)：语域、CTA、从代表页摘的原句。
- [layouts/](layouts/index.md)：产品首屏、场景卡。
- [recipes/](recipes/index.md)：产品页楼层顺序。
- [spec/](spec/README.md)：四张规范图和转写对照。

## Do / Don't

- 用语义变量，不要用未导出的色阶名。
- 主按钮底用 `--porx-color-bg--primary`，字用 `--porx-color-text-inverse`。这个变量名里的双连字符是规范图上的写法。
- 链接默认是近黑 `--porx-color-text-link-default`，不要把辅助蓝当成所有链接的颜色。蓝链接只用 `--porx-color-text-link-blue`。
- 标签底用 10% 透明色，不要另铺一块实色。
- 不要加规范图里没有的重阴影，弹窗到 `--porx-base-shadow-l` 为止。
- 不要把站点灰阶序号直接当成规范灰阶。两边的 gray-40 到 gray-70 不是同一个色值。
- 不要在页面里写站点的 `--por-*`。同名色值和本资产不一定相同。

## 规范与站点对照

已取规范值。下表只留站点差异备查，站点名保持 `--por-`。

| token | 已取值 | 站点值 |
| --- | --- | --- |
| color.text.weak-1 | #808080 | `--por-color-text-weak-1` = #C2C2C2 |
| color.text.weak | #C2C2C2 | `--por-color-text-weak` = gray / #808080 |
| color.text.link.active | #191919 | 同名变量 = #595959。色板阶名印 gray-60，hex 与色块是 #191919 |
| color.border.secondary-active | #C2C2C2 | 同名变量 = gray / #808080 |
| color.border.disabled | #DBDBDB | `--por-color-border-disabled` = #C2C2C2；`--por-color-border-input-disabled` = #DBDBDB |
| color.bg.footer | #F0F0F0 | 无同名变量；站点 gray-20 = #EBEBEB |
| color.alert.fatal | #B50E65 | 站点 rose-70 = #940A54 |
| color.alert.ordinary | #F2E70C | `--por-color-function-alarm` = #F7D916 |
| shadow.none / s / m / l | `0 0px 0px 0 rgba(0,0,0,0)`；`0 1px 4px 0 rgba(0,0,0,0.08)`；`0 2px 12px 0 rgba(0,0,0,0.08)`；`0px 4px 22px 0 rgba(0,0,0,0.08)` | `--por-base-box-shadow-none` = none；light / normal / dark 无 spread |

灰阶序号按规范：gray-70 是 #595959。站点 gray-70 是 #333333，#595959 在站点叫 gray-60。blue-60、red-60、orange-60、kelly-60 的色值在站点上有，序号写成 50。首页 `resolvedProperties` 复核过上表，没有新的色值冲突。站点字号不入库。首页没有 `--por-text-*` 变量。

规范图上的笔误照抄进 `specName`，资产变量只把前缀换成 `--porx-`：`--por-color-bg--primary`、`--por-color-bg--disable`、`--por-color--alert-ordinary`、`--por-color-aler-error`、`--por-color-aler-warning`、`--por-color-warining-subtle`。`--por-text-s-English tag` 没有可抄的字重，未建 token。

字号图只印了角色名（字重写在名字里），没有印字号、行高和字体栈。这些数以及间距、圆角、断点、控件尺寸已从资产删除。规范图没有栅格列数。
