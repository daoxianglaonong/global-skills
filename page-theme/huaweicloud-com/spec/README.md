# 规范图转写

四张图是色值、阴影和控件角色的来源。像素核对用 `theme.mjs sample`，取色块中心、避开文字。印刷 hex 与像素一致的，token 用印刷值。没印的尺寸不要从站点补，填 [annotation-template.md](annotation-template.md)。

| 图 | 对应 token |
| --- | --- |
| [color.png](color.png) | `color.*`（色阶为 private，语义色为 public） |
| [font.png](font.png) | 只提供角色名和用途。图上没有字号，数值不在这里 |
| [shadow.png](shadow.png) | `shadow.none` / `shadow.s` / `shadow.m` / `shadow.l` |
| [data-input.png](data-input.png) | 按钮、文字链、标签、复选、单选、视频控件。图上没有印色值和尺寸 |

## 色板核对

抽查像素与印刷 hex 一致：`#191919`、`#1476FF`、`#808080`（weak-1）、`#C2C2C2`（weak）、`#191919`（link-active）、`#F0F0F0`、`#DBDBDB`、`#C7000B`、`#F23030`。金色标签是渐变，中心像素 `#F0DDBF` 落在 `#E8CDA4` 与 `#F8EDDB` 之间。华为红 10% 铺在白底上的像素约为 `#F9E5E6`，与 `rgba(199, 0, 11, 0.1)` 的合成结果相符。

透明色的 token 写 `rgba()`，保留色板印的百分比。白底上的白色透明色块几乎看不见，以印刷百分比为准，不拿合成后的白当色值。

## 字号图的角色

图上没有字号和行高，这些数不从图上量，也不另造尺寸 token。每个角色一条字重 token，`source: spec`，值是名字里的 lighter / normal / bold。`specName` 是印刷名。资产 cssVar 用 `--porx-`，在印刷名后加 `-weight`。

| 印刷名 | token | 字重 |
| --- | --- | --- |
| `--por-text-s-lighter` / `s-normal` / `s-bold` | `font.s-lighter.weight` 等 | lighter / normal / bold。辅助文字 |
| `--por-text-s-English tag` | 未建 token | 图上没印字重。字号、行高、字重都待标注 |
| `--por-text-m-normal` / `m-bold` | `font.m-*.weight` | 正文；加粗也用于小标题 |
| `--por-text-l-*` 到 `--por-text-9xl-*` | `font.l-*.weight` … `font.9xl-*.weight` | 小标题到品牌页大数字。`*` 为 `-normal` 与 `-bold` |
| `--por-text-10xl-normal` / `10xl-bold` | `font.10xl-*.weight` | 页面大数字。通栏广告 / 通栏广告大文字-常规 这一格印的也是 `--por-text-10xl-normal`，没有第二个名字，不另建 token |
| `--por-text-11xl-*` | `font.11xl-*.weight` | 官网 banner 大标题 |

字号和行高没有印，不入库。首页 CSS 没有 `--por-text-*`。

## 控件样张

`data-input.png` 是深底上的控件状态，没有印 hex 或像素。`data-input-white.png` 是同一套控件的白底，用来核对深底上看不清的透明色。能确认的角色：主要 / 次要 / 危险 / 文本按钮，各约四档胶囊；链接按钮；标签；复选和单选；视频播放按钮。没有画出输入框、下拉、开关、Tab、分页。尺寸不从站点补。颜色用色板上已经写明用途的变量，不从这张图取样。组件对照见文末。

## 阴影

| token | 印刷值 |
| --- | --- |
| `--por-base-shadow-none`（资产 `--porx-base-shadow-none`） | `0 0px 0px 0 rgba(0,0,0,0.00)` |
| `--por-base-shadow-s`（资产 `--porx-base-shadow-s`） | `0 1px 4px 0 rgba(0,0,0,0.08)` |
| `--por-base-shadow-m`（资产 `--porx-base-shadow-m`） | `0 2px 12px 0 rgba(0,0,0,0.08)` |
| `--por-base-shadow-l`（资产 `--porx-base-shadow-l`） | `0px 4px 22px 0 rgba(0,0,0,0.08)` |

用途分别是无阴影、输入框与 Tips、卡片 / Tips / 下拉、弹窗。

## 全家福对照

对照图是 `.page-theme-work/huaweicloud-com/preview-capture/01-preview/1440.jpg` 顶部。深底条用 `--porx-color-bg--primary`（`#191919`），样张底是纯黑。

- 白底上复选选中是近黑方框加浅勾，单选是近黑圆点。深底条上这块近黑和底色相同，选中格会沉进去；样张深底上的未选框是浅色环。
- 视频圆钮按样张整圆裁切：小 40px、大 60px；上面浅色、下面深色；从左到右是禁用、默认、悬浮。复选框仍按 `1em` 画，边长样张没印。
- 标签底是该标签字色的 10%。金色是色板渐变，不是字色的 10%。样张上的色块看起来更实，不另取样。
- 次按钮悬浮是色板 `#595959` 加反白。站点悬浮是浅灰底、深字。
- 输入框、提示条在控件样张上没有整件。提示条尺寸按 theme-token.css 的 por-tip。
