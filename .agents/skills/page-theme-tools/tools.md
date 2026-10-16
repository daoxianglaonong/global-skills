# 工具合同

page-theme-asset、page-theme-generate、page-theme-audit 三个 skill 与人都调同一个入口（本目录不是 skill，各包按 `../page-theme-tools/` 相对路径找到它）：

```text
node <skills-root>/page-theme-tools/scripts/theme.mjs <command> [args]
```

- 依赖：Node ≥ 20；`scripts/` 下 `npm install`。`capture` / `sample` 另需 `npx playwright install chromium`，其余命令不需要浏览器。
- 输出：stdout 一份 JSON（`inventory --format md` 例外）；诊断信息走 stderr。
- 退出码：`0` 通过（可能带 warnings）、`1` 有阻断项、`2` 用法错误或运行时异常。输入路径不存在、一个可扫描文件都没有、`--asset` 指向的 tokens.json 缺失或不合格，都退 `2`（stderr 一行原因），不会以「零发现」退 `0`。
- 路径：输出里的文件路径相对当前工作目录。
- 写盘：`preview` 的 `--out` 不得落在作为输入的资产目录内（审阅页不进资产）；`preview` / `baseline snapshot` / `capture` 的输出（含 `capture` 的 `--out` 目录本身与它将写出的每个文件）不得与受保护文件相同：本次输入，加输入 HTML / CSS 引用的全部本地资源（`href` / `src` / `srcset` / `url()` / `@import`，不论扩展名，递归）。路径按 realpath 比较（目标不存在时取最近存在的祖先），Windows 上不分大小写；违反即退 `2`，stderr 一行 `refusing to write …`，`capture` 在启动浏览器前就拒绝，不写任何东西。所有写盘（含 `css` 写 tokens.css）都先写同目录临时文件再 rename；写盘失败退 `2`，stderr 一行 `cannot write …`，不留半截文件。

## check

`check <asset-dir>` → `{ ok, asset, errors[], warnings[], summary }`

阻断（`errors[].code`）：`missing-file`、`bad-json`、`bad-format`、`no-tokens`、`bad-token`、`bad-type`、`bad-value`、`missing-css-var`、`bad-css-var`、`duplicate-css-var`、`missing-usage`、`bad-source`、`bad-public`、`bad-site-names`、`bad-spec-name`、`bad-deprecated`、`bad-replaced-by`（废弃 token 的 `replacedBy` 不存在、非 public 或本身已废弃）、`component-ref`（组件 token 引了 private token，或写字面值却没有 `note`）、`bad-version`（非 semver）、`bad-value-policy`（`valuePolicy` 不是 `spec-only`）、`spec-only-source`（声明了 `spec-only` 的资产里有 `site-provisional` / `draft` token）、`unknown-alias`、`alias-cycle`、`bad-color`、`tokens-css-stale`、`broken-ref`。资产有 `components.css` 时对它跑 lint 同款规则，阻断项原 code 照报（`color-outside-asset`、`unknown-var`、`font-family-outside-asset`），`where` 为 `components.css:<行>`。

报警：`needs-confirmation`（存在 `draft` / `site-provisional` token），附 `count` 与全量 `ids`；`changelog-missing`（有 `version` 但 `CHANGELOG.md` 缺失或没提到该版本）；`components.css` 的 lint 报警原样转来。

`summary`：`tokens`、`publicVars`、`markdownFiles`、`modules[]`（实际存在的可选模块）。

## css

`css <asset-dir>` 写资产自己的 tokens.css（`:root`、不包 layer 的标准形态）→ `{ ok, file, changed }`。`--check` 只核对 → `{ ok, file }`，不一致退 1。tokens.json 无效时退 1 并给 `errors[]`。

`css <asset-dir> --out <file> [--scope <selector>] [--layer <name>]` 给消费项目出副本 → `{ ok, file, scope, layer }`；`--out` 不得落在资产内。`--scope` 把变量挂到该选择器（默认 `:root`）；`--layer` 把整块包进 `@layer <name>`，默认不包：包进 layer 的规则输给项目里所有未分层的规则（含 reset），变量只声明一次时分层没有收益，需要分层的项目也可以在引用处写 `@import url(tokens.css) layer(theme)`。`--scope` / `--layer` 不带 `--out` 退 2。

输出形态：引用 public token 的 token 输出 `var(--被引用者)`（组件 token 因此跟着语义 token 走）；引用 private token 的输出解析后的字面值；`deprecated` token 输出 `旧名: var(新名)`；有 `version` 时第二行是 `/* <id> <version> */`。

## preview

`preview <asset-dir> --out <file.html>` → `{ ok, out }`。按 type 分组渲染色块、字体栈样张、尺寸条、阴影，列 token id、cssVar、值、usage、source；`draft` / `site-provisional` 行高亮。资产同时有 `components.css` 与 `components.md` 时，页首加组件全家福：按 `components.md` 的 `## <组件>` 分节，原样渲染每节的 `html` 代码块并带上 `components.css`（默认白底，```` ```html surface=--x ```` 的块铺 `var(--x)` 底），状态靠静态 class（`.is-hover` 等）展示，可直接 `capture` 截图核对。`--components-only` 只出全家福、不带 token 表（截图短、组件看得清；资产缺 `components.css` 或 `components.md` 时退 2），截组件对照时用它。给人与规范原图并排审阅用，不进资产。

## capture

`capture <url|file>... [--out <dir>] [--widths 1440,768,375] [--timeout <秒>] [--png]`

- 目标可以是 URL、裸域名、markdown 链接或本地 HTML 路径。默认 `--out .page-theme-work/capture`。
- 每个目标落 `<out>/<nn-slug>/<width>.jpg`（全页），并汇总写 `<out>/evidence.json`。
- 导航与每张截图各自的超时默认 30 秒，`--timeout` 改秒数（重页面、慢网络调大）。全页截图失败（超时、页面过长）时自动退回首屏截图，记 `failures[]` 一条 `fullpage-fallback`，该目标仍算成功。
- 单个目标失败只记 `failures[]`；全部失败才退 1。
- stdout 只给摘要（url、ok、title、screenshots、failures）；细节读 evidence.json。

evidence.json 每个目标的字段：

| 字段 | 内容 |
| --- | --- |
| `customProperties` | 样式表与 `<style>` 中声明的 `--*` → 声明值（首次出现），原样保留，`var()` 别名不展开 |
| `resolvedProperties` | 声明值含 `var()` 的那些变量的计算值（别名已代换）：先取 `:root`；取不到时取声明它的第一条规则所匹配的第一个元素，再取不到取 `body`（变量挂在 `--scope` 选择器下的资产也有值）。跨域样式表读不到规则，那部分仍可能缺，需自己顺着 `customProperties` 解开。和色板比对时用这里的值 |
| `mediaQueries` | `@media` 条件与出现次数，按次数降序 |
| `colors` | computed 颜色 `{ value, usage: text/background/border, count }`，前 40；只丢完全透明（alpha 0）的值 |
| `fonts` | 有文字元素的 computed `font-family` 与次数 |
| `scalars` | `font-size` / `font-weight` / `line-height` / `border-radius` 的 computed 值与次数 |
| `fontSizeCount` | 有文字元素用到的不同字号个数 |
| `lowContrast` | 文字与最近实色背景对比度低于 WCAG AA（常规 4.5、大字 3）的样本，前 20；背景是图片或渐变的不判 |
| `overflow` | 各截图宽度下 `scrollWidth` 超出视口的记录 `{ width, scrollWidth }`；空数组即无横向溢出 |
| `copy` | 标题与按钮短文案（≤ 60 条） |
| `failures` | `http-status` / `little-text` / `navigation` / `fullpage-fallback` |

这些是事实，不是结论：哪个颜色是主色、哪个间距成体系，由模型判断。`lowContrast`、`overflow`、`fontSizeCount` 是生成自查与审计的指标，不阻断。

## sample

`sample <image> --at x,y [--at x,y ...]` → `{ image, points: [{ x, y, hex }] }`。用于核对规范图色块与转写 hex；取色点选色块中心，避开文字与描边。

## lint

`lint --asset <asset-dir> <file|dir>... [--baseline <baseline.json>]` → `{ ok, errors[], warnings[], files[] }`

扫描 `.html` / `.htm` / `.css` / `.vue` / `.svelte` / `.jsx` / `.tsx`：`<style>` 块、`style=""`、JSX `style={{ … }}` 里的字符串值、HTML 引用的本地样式表一并跟进；绑定表达式（`:style`、模板变量、CSS-in-JS 库）不解析。与资产 tokens.css 内容一致的文件跳过。每条发现：`{ code, file, line, prop, value, message }`。

**阻断清单只在这张表里维护**；generate、audit 引用这里，不另抄。

| code | 级别 | 判据 |
| --- | --- | --- |
| `color-outside-asset` | 阻断 | 颜色字面量（hex、rgb/hsl、命名色，含 `var()` 回退值与本地变量声明值）不在资产颜色集合；工具解析不了的颜色函数（`oklch()`、`lab()`、`color()` 等）一律算；`transparent`、`currentColor` 与 CSS 全局关键字除外 |
| `unknown-var` | 阻断 | `var(--x)` 既不是资产 public cssVar，也不在被扫描文件里声明 |
| `font-family-outside-asset` | 阻断 | `font-family` / `font` 中的族名不在任何 `fontFamily` token 的栈里；通用族（`sans-serif`、`monospace` 等）也须出现在某个栈里，只有 `inherit` 等 CSS 全局关键字豁免 |
| `baseline-drift` | 阻断 | 给了 `--baseline` 时，HTML 文件与快照按位置配对比较，标题 / 文本 / 链接 / 图片 / DOM 结构有变 |
| `color-literal` | 报警 | 资产颜色以字面量写在普通属性里（本地 `--x` 声明除外），应改用其 `var()` |
| `typography-literal` | 报警 | `font-size` / `line-height` / `font-weight` / `letter-spacing` 字面值不等于任一 token 值 |
| `spacing-literal` | 报警 | `margin*` / `padding*` / `gap` 的长度不等于任一 token 值（`0`、`auto`、百分比除外） |
| `radius-literal` | 报警 | `border-radius*` 同上 |
| `border-width-literal` | 报警 | `border*` / `outline*` 简写或 `-width` 里的长度同上 |
| `breakpoint-literal` | 报警 | `@media` 的 `min/max-width` 与所有 `breakpoint` token 相差超过 1px；资产无 breakpoint token 时不查 |
| `deprecated-var` | 报警 | `var(--x)` 引的是 `deprecated` token，message 给出替代变量；升级资产后据此替换 |
| `font-check-skipped` | 报警 | 资产没有 `fontFamily` token，字体族不查 |
| `scalar-check-skipped` | 报警 | 资产没有某类 token 时该类字面值不逐条报，每类汇总一条：`prop` 为类别，`value` 为跳过个数，`file` / `line` 为 `null`。类别：`typography`（`font-size` / `line-height` / `letter-spacing`，看 id 或 cssVar 含 `font`/`text`/`line-height` 的 dimension / number token，字重 token 不算）、`font-weight`（看有无 `fontWeight` token）、`spacing`（`space`/`gap`…）、`radius`、`border-width`（`border`/`stroke`） |

`var()`、`calc()`、`clamp()` 等包裹的值不做排印/间距检查。报警不改变退出码。对比度、横向溢出、字号种类数不是 lint 的事，看 `capture` 的 evidence 指标。

## inventory

`inventory <file|dir>... [--asset <asset-dir>] [--format md]` → `{ asset, entries[] }`

`entries[]`：`{ kind, value, usage, role?, state?, count, properties[], locations[], candidates[]? }`；候选每条带 token 的 `usage`。

- 扫描范围与 lint 相同；带生成注释头的 tokens.css 不计入。
- `kind`：`color` / `var` / `font-family` / `typography` / `spacing` / `radius` / `border-width`。
- `usage`：颜色与变量按属性分组（`text` / `background` / `border` / `shadow` / `icon` / `custom-property` / `other`）；尺寸类为属性名。
- 颜色另记选择器看出的 `role`（`button` / `link` / `input` / `tag` / `card` / `alert`，关键词匹配）与 `state`（`hover` / `disabled`）；同值同用途但角色或状态不同分行。
- 给 `--asset` 时附候选：颜色取前 3，先按关键词契合度（token 的 usage / id / cssVar 提到该角色且状态一致的最先，任意色差；只提到 `text` / `background` / `border` 用途的在 ΔE00 ≤ 10 内加分），再按 `exact`、ΔE00 升序。只是关键词提示，选哪个由模型按 usage 与 DESIGN.md 定；变量按 `cssVar` 或 `siteNames` 匹配；字体按族名重叠；尺寸按值相等。
- `--format md` 输出「源值 × 用途」底稿：`# / 类 / 源值 / 用途 / 处数 / 例 / 候选`（用途列含角色与状态，候选带 ΔE 与 usage）。没有裁决列，工具不做映射决定；刷主题时由模型补 `token / 匹配 / 决定` 三列，成为 page-theme-generate 的那一张「源值 × 用途 → token」表。

## baseline

- `baseline snapshot <html|dir>... --out <baseline.json>` → `{ ok, out, files[] }`
- `baseline compare <baseline.json> <html|dir>...` → `{ ok, files: [{ file, baseline, diffs[] }] }`，有漂移退 1

快照分五类记录：`title`（`<title>` 文本）、`text`（正文文本序列，含 `<textarea>` 内容与 `<input>` 的 `value` / `placeholder`；`<title>`、`<script>` 不计）、`links`（`<a href>`）、`images`（`<img src/alt>`）、`structure`（标签嵌套序列）。任一类有变都是漂移，经 `lint --baseline` 即 `baseline-drift` 阻断，`prop` 为类名。`class`、`style` 属性与 `<style>` / `<link>` / `<meta>` 元素不计，所以只换样式、补引 tokens.css 不算漂移。文件按传入顺序配对。`diffs[]` 按位置列出每一处差异，每类最多 20 条，超出部分合成一条 `{ kind, more }`。
