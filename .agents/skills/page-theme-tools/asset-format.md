# 资产格式 v2

写盘时按节查。只有 `tokens.json` 有机器形状；其余都是给人和 agent 读的 Markdown，不设固定节号。

## tokens.json

```json
{
  "format": "page-theme-asset/2",
  "id": "example-com",
  "tokens": {
    "color.blue.600": {
      "type": "color", "value": "#1a5fd6", "cssVar": "--ex-blue-600", "public": false,
      "usage": "基础色阶，只经语义 token 使用", "source": "spec"
    },
    "color.action.primary": {
      "type": "color", "value": "{color.blue.600}", "cssVar": "--ex-action-primary",
      "usage": "主按钮底色、文字链接", "source": "spec", "siteNames": ["--site-brand"]
    },
    "font.body.size": {
      "type": "dimension", "value": "14px", "cssVar": "--ex-text-body-size",
      "usage": "正文字号", "source": "spec", "specName": "Text Body"
    },
    "font.body.line-height": {
      "type": "dimension", "value": "22px", "cssVar": "--ex-text-body-line-height",
      "usage": "正文行高，与 --ex-text-body-size 同用", "source": "spec", "specName": "Text Body"
    },
    "font.body.weight": {
      "type": "fontWeight", "value": 400, "cssVar": "--ex-text-body-weight",
      "usage": "正文字重", "source": "spec", "specName": "Text Body"
    }
  }
}
```

顶层：`format` 固定 `page-theme-asset/2`；`id` 是资产的稳定短名（通常与目录名相同，但工具不校验；目录改名或拷到别的仓库不影响有效性）；`version` 可选，semver（`1.4.0`）；`valuePolicy` 可选，唯一取值 `"spec-only"`：有正式规范的主题声明它，表示值只取规范，`check` 对 `site-provisional` / `draft` token 报 `spec-only-source`（工具看不出主题有没有规范，只能靠资产自己声明）；`tokens` 是 token id → 定义的平铺表，按阅读顺序排（基础层在前、语义层在后、组件层最后）。

| 字段 | 必需 | 说明 |
| --- | --- | --- |
| `type` | 是 | `color` / `dimension` / `fontFamily` / `fontWeight` / `number` / `shadow` / `gradient` / `duration` / `breakpoint` / `other` |
| `value` | 是 | CSS 可用的字面值（字符串或数字），或 `{token.id}` 引用 |
| `cssVar` | 是 | 完整变量名，如 `--ex-text`；全表唯一。工具不从 id 推导，也不认前缀 |
| `usage` | 是 | 一句话：用在哪、给谁用。消费方靠它选 token |
| `source` | 是 | `spec` 规范（含用户按标注模板补的红线）/ `user` 用户确认或补充 / `site-provisional` 无规范时取站点值待确认 / `draft` 无规范时模型起草；`spec-only` 资产只许前两种 |
| `public` | 否 | 默认 `true`。`false` 不导出到 tokens.css，产物不得直接 `var()` 它 |
| `siteNames` | 否 | 站点现用的旧变量名，刷主题时 `inventory` 据此给候选 |
| `specName` | 否 | 规范上印的原名（可含空格、大写、中文），cssVar 规范化后靠它对回原图 |
| `note` | 否 | 冲突、取值依据等短注；长说明写 DESIGN.md |
| `deprecated` / `replacedBy` | 否 | 改名时旧 token 标 `deprecated: true`，`replacedBy` 写新 token id（须存在且 public）；tokens.css 输出 `旧名: var(新名)`，lint 对 `var(旧名)` 报警 |

规则：

- token id 用点分小写，分组自定（`color.*`、`font.*`、`space.*`、`radius.*`、`shadow.*`、`breakpoint.*` 只是推荐），不设闭集。
- 引用只能指向表内 token，不得成环。引用 public token 时 tokens.css 输出 `var(--被引用者)`；引用 private token 时输出解析后的字面值。
- `color` 的值必须可解析（hex / rgb[a] / hsl[a] / 命名色）。阴影、渐变里的颜色同样算资产颜色，产物可用。
- cssVar 只许 `--` 加字母、数字、`-`、`_`。规范印名不合法时按此规范化：转小写，连续的空格 / 斜杠 / 点等非法字符换成一个 `-`，去掉首尾 `-`（`Text Body/Bold` → `--ex-text-body-bold`）；中文名改用英文语义名。原印名写进 `specName`。
- 排印角色（规范里一行「字号 + 行高 + 字重 …」，如 `--por-text-body`）没有复合类型：拆成同一角色前缀的多条 token，字号、行高用 `dimension`（无单位行高用 `number`），字重 `fontWeight`，字间距 `dimension`；token id 与 cssVar 共用角色前缀（`font.body.size` / `font.body.line-height` / `font.body.weight` → `--ex-text-body-size` …），同填 `specName`。`source` 逐项定：规范印了值的项 `spec`；没印的项不建 token，列进待标注清单（无规范的主题才从站点补 `site-provisional`，无证据 `draft`）。从印名推出的值只在名字字面就是该值时算 `spec`（`bold` → 700、`normal` / `regular` → 400、名字里的数字如 `text-14` → 14px），在 `note` 写「由印名推出」；`m`、`10xl` 这类档位码不是值，不推。
- `fontFamily` 写完整字体栈；lint 只认栈里出现的族名，通用族（`sans-serif` 等）也要写进栈才放行。
- `breakpoint` 写 `@media` 声明值（如 `768px`），不是截图采样宽度。通常 `public: false`。
- 暗色或多主题：另起 token（如 `color.surface.page-dark`），在 DESIGN.md 说明切换方式；v2 不做 mode 机制。
- 资产前缀不得与源站自用的变量前缀相同（源站 `--por-*` → 资产 `--porx-*`），免得同名不同值；源站原名放 `specName` / `siteNames`。

## 版本

有 `version` 就要有 `CHANGELOG.md`（每版一节，标题含版本号，列新增 / 改值 / 废弃 / 删除的 token id）。规则：

- 新增 token、改值：升次版本（`1.3.0` → `1.4.0`）；只改 usage / note / 文档：升修订号。
- 删除或改名：升主版本。改名时旧 token 保留、标 `deprecated` 指向新 token，保留一个主版本后再删（`2.x` 标废弃，`3.0.0` 删）。

## 组件层（可选）

不做组件库、不写框架代码；三件一起给：组件 token、`components.md`、`components.css`。

**组件 token**：id 以 `component.` 开头，`component.<组件>[.<变体>].<部位>[-<状态>]`（`component.button.primary.bg`、`component.button.primary.bg-hover`、`component.input.border-focus`）；cssVar 同理（`--ex-button-primary-bg`）。推出的 cssVar 若已被别的 token 占用（如 `size.button.height` 已是 `--ex-button-height`），不另建组件 token，components.css 直接用已有变量；cssVar 全表唯一，重名 `check` 报 `duplicate-css-var`。`value` 必须是 `{...}` 引用 public 语义 token，tokens.css 里输出 `var(--语义变量)`，改主色自动传导；确需字面值时写 `note` 说明理由，否则 `check` 阻断。

**components.md**：开头一节 `## 组件清单`，一张表 `组件 | 状态 | 来源 | 缺什么`，状态只有「已收录」「待补充」；「来源」写清是哪种：控件样张（形态与颜色都算 `spec`）、色板用途标注（只有颜色算 `spec`）、站点页面（只用于无规范的主题）。收录按来源，不按固定清单：有规范的主题只收规范样张或标注覆盖到的组件与属性，站点上有、规范里没有的进待补充，缺的尺寸、状态形态写进「缺什么」；无规范的主题按站点证据起草。待补充的只占清单一行，不写规范节、不建 token。新增一个组件 = 清单改状态 + 加一节 + 一组组件 token + 一段 css + CHANGELOG 一行（升次版本），不改格式、不改 skill。清单节不放 html 代码块（`preview` 只渲染带 html 块的节）。

之后每个已收录组件一节 `## <组件名>`，固定小节：结构（部位清单）/ 变体 / 尺寸 / 状态 / 部位 → token 表 / Do · Don't，最后是 ```` ```html ```` 全家福代码块：列出各变体、尺寸与状态的静态 HTML，`preview` 原样渲染它。默认白底；用在深底上的写 ```` ```html surface=--ex-surface-dark ````（值是资产里 public 的底色变量），一个组件可以浅、深各一块。

**components.css**：纯 CSS，不带 JS、不带布局：外边距、容器宽、grid / flex 排布组件之间的关系、定位都不写；组件自身部位的固有尺寸（复选框方框、开关轨道、图标按钮的 `width` / `height` / `min-width`）可以写，值用 token。只写有来源 token 的属性：规范只给了颜色和形态、没给尺寸时，不写尺寸和间距，交给消费方自定；形态用无数值写法表达（`border-radius: 50%` 表圆；`999px` 表胶囊，仅当样张画了胶囊），并在 `components.md` 该节标「待标注：尺寸」。只用 `var()` 引公开变量（`check` 对它跑 lint 同款规则，资产外颜色、未知变量阻断）。约定：

- class 前缀 = token 前缀去掉 `--`（`--ex-` → `.ex-`）；组件 `.ex-button`，变体 `.ex-button--primary`，尺寸 `.ex-button--sm`，部位 `.ex-input__icon`。
- 状态同时写伪类与静态 class，全家福用静态 class：`.is-hover`、`.is-focus`、`.is-active`、`.is-checked`、`.is-error`、`.is-disabled`；禁用另认 `[disabled]` / `:disabled`。

最小范例：

```json
"component.button.primary.bg": { "type": "color", "value": "{color.action.primary}", "cssVar": "--ex-button-primary-bg", "usage": "主按钮底色", "source": "spec" },
"component.button.primary.bg-hover": { "type": "color", "value": "{color.action.hover}", "cssVar": "--ex-button-primary-bg-hover", "usage": "主按钮悬停底色", "source": "spec" }
```

```css
.ex-button { font: inherit; border: 0; border-radius: var(--ex-radius-md); padding: var(--ex-space-2) var(--ex-space-4); cursor: pointer; }
.ex-button--primary { background: var(--ex-button-primary-bg); color: var(--ex-text-on-action); }
.ex-button--primary:hover, .ex-button--primary.is-hover { background: var(--ex-button-primary-bg-hover); }
.ex-button:disabled, .ex-button.is-disabled { opacity: .4; cursor: not-allowed; }
```

````markdown
## 组件清单

| 组件 | 状态 | 来源 | 缺什么 |
| --- | --- | --- | --- |
| 按钮 | 已收录 | spec/controls.png；首页、产品页 | — |
| 开关 | 待补充 | 仅控制台一页孤证 | 规范图或第二处站点用例 |

## 按钮

结构：容器 + 文字（+ 可选前置图标）。变体：主 / 次 / 文字。尺寸：默认、`--sm`。状态：默认、悬停、禁用。

| 部位 | token |
| --- | --- |
| 主按钮底色 / 悬停 | `--ex-button-primary-bg` / `--ex-button-primary-bg-hover` |

Do：一屏一个主按钮。Don't：主按钮里放图标以外的装饰。

```html
<button class="ex-button ex-button--primary">提交</button>
<button class="ex-button ex-button--primary is-hover">悬停</button>
<button class="ex-button ex-button--primary" disabled>禁用</button>
```
````

## tokens.css

`theme.mjs css <asset>` 生成，首行是生成注释（有 `version` 时第二行注明 `id` 与版本），随后一个 `:root {}`，按 tokens.json 顺序列 public token。不手改；`check` 发现与重建结果不一致即阻断。

消费方拷一份带版本号的副本（`tokens.1.4.0.css`）进项目，在入口引一次，然后只用其中的变量。副本用 `css <asset> --out <file>` 生成，可加 `--scope <selector>`（变量挂在该选择器下，给不想要全局变量的项目）与 `--layer <name>`（包进 `@layer`）。资产目录里的 tokens.css 始终是 `:root`、不包 layer 的标准形态。

## DESIGN.md

唯一入口，脱离本 skill 也要能用。建议包含：

1. 一段话的视觉语言（基调、密度、用色克制程度、圆角与阴影性格）；
2. 怎么取用：引入 tokens.css，关键变量速查（主色、正文、底色、字体栈、正文字号、常用间距）；
3. 可选模块索引：有哪些 layouts / recipes / voice，各自何时读；
4. Do / Don't：只写消费者会犯的错；
5. 裁决记录：规范与站点冲突时最终取谁、为什么；
6. 待确认：存在 `draft` / `site-provisional` 时在顶部注明；`spec-only` 资产改为列「待标注」（规范没印、因此资产里没有的值，可指向 `spec/README.md`）。

不写采集过程、不贴大表、不复制 tokens.json。

## layouts/

`index.md` 列出每个布局一行：名称、适用场景、链接。`<layout-id>.md` 一条一个：

```markdown
# 三列特性卡

适用：产品页「核心能力」楼层，3–6 项并列卖点。
结构：标题区 + 等宽卡片网格（桌面 3 列、平板 2 列、手机 1 列）；卡片 = 图标 + 标题 + 两行说明。
常用 token：`--ex-surface`、`--ex-radius-md`、`--ex-space-6`、`--ex-shadow-card`。
禁忌：卡片内不放主按钮；说明超过三行改用列表楼层。

![桌面](../evidence/layouts/feature-cards/desktop.jpg)
```

分类词（hero、feature、form、table…）只是推荐语言。后台、文档站、工具类产品换成自己的范例。

## recipes/

一种页面类型一条：楼层顺序、必选与可选布局（链接到 layouts/）、底色节奏、内容注意事项。

## voice.md

语域与人称、标题句式、CTA 用词、实测原句（带出处页）、禁用词。结构自定。

## evidence/、illustrations/、spec/

- `evidence/`：只收被 Markdown 引用的截图，按引用方分目录。`check` 会核对所有相对链接存在。
- `illustrations/`：配图风格样张，DESIGN.md 或 recipes 里说明何时用哪类。
- `spec/`：规范原图（英文文件名，如 `color.png`）与 `README.md` 转写说明：每张图对应哪些 token、像素核对结果、待标注清单（规范没印的项）。可放 `annotation-template.md`：按待标注清单列成表（项 | 用途 | 值 | 备注），用户填好或补红线后转写为 `source: spec`。
