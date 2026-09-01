# 资产共享契约

采集写资产、生成段读资产，两段共用本文件。**一条规则一行祈使句**。写完必须跑 `node scripts/validate-asset.mjs <资产目录>`，退出码 `1` 属阻断，必须改到不为 `1`。

---

## 1. 资产目录清单

| 路径 | 必交 | 承载 |
| --- | --- | --- |
| `README.md` | 是 | 入口：怎么读我 |
| `DESIGN.md` | 是 | 人读风格说明 + Don't 清单（散文允许） |
| `tokens.json` | 是 | DTCG 主 token 表 |
| `tokens.dark.json` / `resolver.json` | 有第二套主题才交 | 暗色 overlay 与 DTCG Resolver |
| `voice.md` | 是 | 文案语气（散文允许） |
| `patterns/index.yaml` | 是 | 楼层序列、节奏、骨架型库 |
| `patterns/chrome.yaml` | 是 | 整站页壳，一篇 |
| `patterns/{id}.yaml` | 每条内容楼层一篇 | 可复用构图契约 |
| `patterns/{id}.notes.md` | 否 | 人写补充（散文允许） |

**刚性输出四条**（全体必须服从）：

1. 每个产出文件必须能过 `validate-asset.mjs`；失败属阻断类。
2. 结构化字段一律闭集枚举 + 定长形状；**散文只准出现在** `DESIGN.md` / `voice.md` / `{id}.notes.md` 的散文节。
3. 缺观测必须保留字段 + `observed: false` + `confidence`；**不得**省字段、**不得**填 `null`、**不得**写「未知」。
4. 同一事实只存一处；需要写第二处时开票，不得复制。

**统一命名（跨文件强制）**：`color.primary` = 行动色 · `color.identity` = 品牌识别色（**不叫** `brand`）· `surface.default` / `surface.muted` 只此两档 · `on.surface.*` 成对 · `rhythm.surface` 枚举含 `identity` / `image` · 刻度序数 `1..N` · component 最小下限 `button-primary`。

---

## 2. 通用字段（tokens / patterns / voice 共用语义）

一律落 `$extensions["page-theme"]`（tokens）或同名平铺键（patterns / voice）。DTCG 无这些一等概念，**本项目自定**。

| 字段 | 取值 | 何时必须 |
| --- | --- | --- |
| `observed` | boolean | tokens 每个叶子必须有 |
| `confidence` | `high` \| `medium` \| `low` | `observed:false` **必须**带；缺即资产不合格 |
| `source` | `measured` \| `supplied` \| `autodetected` | tokens 每个叶子必须有 |
| `lossy` | boolean | 词表档位不够、上取或近义拼时为 `true`，必须同时带 `observedHex` |
| `merged` | boolean | 仅 `identity` 与 `primary` 同色且 `$value` 是 alias 时为 `true` |
| `unmapped` | boolean | 实测色落不进供给刻度盘、已照实追加 |
| `measured` | `{ oklchL }` 或 `{ px }` | 序数档必须有 |
| `paintedRatio` | 0–1 | `observed:true` 应当有 |
| `dontId` | `design-dont-<slug>` | 未上屏项必须有，且必须等于 `DESIGN.md` 某行的 `id` |

**`source` 拆两轴，不做一维闭集。** 下列两个是**派生态**，不得写进 `source` 枚举：`first-party-declared` = `source ∈ {supplied, autodetected}` ∧ `observed === false`；`corroborated` = 供给 / 自探测与实测 `exact`（或 `near` 经判定归并）且 `$value` 取实测。

**判官永远是实测。** 供给与第一方声明只改名与补空，**不得改 `$value`**；冲突值落 `suppliedValue` + `conflict: true`。
**供给↔实测色彩三档**：`exact`（规范化 hex 相同，可合并）/ `near`（记 `deltaE00`，**不设 fail 线**）/ `different`（不得合并）。
**未观测一律不编造**：值缺口 omit，或用资产已有最近语义拼并标 `lossy`。

---

## 3. `tokens.json`

### 3.1 文件形状

- `$schema` 必须恒为 `https://www.designtokens.org/schemas/2025.10/format.json`。
- 根 `$extensions["page-theme"].defaultScheme` 必须是 `light` \| `dark`，**不得**因缺测写死 `light`。
- 顶层 group 闭集：`color` `dimension` `fontFamily` `fontWeight` `number` `duration` `cubicBezier` `shadow` `typography` `motion` `elevation` `shape` `component`。未观测到的可选顶层 group 必须**省略**，不得写空对象凑结构；**不得**建 `layout` 组。
- `resolver.json` 的 `modifiers.theme.default` 必须等于 `defaultScheme`；同名 context 必须是空数组，另一 context 引用 `./tokens.dark.json`。
- `tokens.dark.json` 顶层**只含**被换值的 semantic 色路径，不得重写 primitive、不得含 `dimension` / `typography` / `component`。不得用 `$extends`、`$extensions.darkValue` 或同一 `$value` 表达双主题。

### 3.2 类型与写法

| 项 | 规则 |
| --- | --- |
| 原子类型 | `color` `dimension` `fontFamily` `fontWeight` `duration` `cubicBezier` `number` `shadow` |
| 复合类型 | 只准两处：semantic 用 `typography`，component 观测到描边时用 `border` |
| 禁用类型 | `transition` `gradient` `strokeStyle` `fontStyle` `percentage` `file` |
| `color.$value` | 必须是 `{ colorSpace: "srgb", components: [R,G,B], alpha?, hex }`；禁止纯 hex 字符串 |
| `dimension` / `duration` | 必须是 `{ value, unit }`（`px`\|`rem` / `ms`\|`s`）；禁止 `"16px"` 字符串 |
| `fontWeight` | 1–1000 或规范关键字 |
| alias | 必须写完整花括号路径 `{color.neutral.3}`；不得挖内部字段 |
| 命名 | 不得以 `$` 开头（`$root` 除外），不得含 `{` `}` `.`；路径用嵌套 group |
| `$type` | 每个叶子必须自带；组上写只是继承默认 |
| **组的根值** | 必须写 `$root`；**group 同时含 `$value` 与子 token 为非法**。消费方必须写 `{color.primary.$root}`，`{color.primary}` 只是 group |

```json
"primary": {
  "$root": { "$type": "color", "$value": "{color.blue.1}",
             "$extensions": { "page-theme": { "observed": true, "confidence": "high", "source": "measured" } } },
  "hover": { "$type": "color", "$value": "{color.blue.2}" }
}
```

### 3.3 三层结构

| 层 | 键前缀 | `$value` 约束 |
| --- | --- | --- |
| primitive | `color.{family}.{step}` · `dimension.*` · `fontFamily.*` · `fontWeight.*` · `duration.*` · `cubicBezier.*` · `number.*` · `shadow.*` | **只允许真值**，禁止 alias |
| semantic | `color.{角色}` · `typography.*` · `motion.*` · `elevation.*` · `shape.*` | **只允许 alias**，最终必须落到 primitive |
| component | `component.{并列 kebab}` | 颜色必须 alias 到 semantic；尺寸类可直引 primitive |

- 颜色**禁止**跳过 semantic 直引 primitive；尺寸类放开，不得为单消费者控件高度另造 semantic 空壳。alias 必须单向、**三跳封顶**、禁止成环。
- 生成 Agent 的默认读取层是 **semantic**；primitive 供 alias 解析与刻度阅读，component 供已观测控件复用。
- **生成页的 CSS 变量名必须由 token 路径确定性派生**：丢掉尾部 `$root`，段名原样保留，段间 `-` 连，前缀 `--`（`color.surface.default.$root` → `--color-surface-default`；`color.neutral.3` → `--color-neutral-3`）。**不得**自造变量名、**不得**复用原站变量名。lint 两项都必须为 0：`primitiveLeak.color`（可证引了色相族刻度）与 `unresolvedVar`（反解不出 token 路径，防「改个名就绕过」）。判据实现在 `scripts/schemas/css-var.mjs`，lint 侧只准 import，不得另写一套。

### 3.4 primitive 刻度

- **两档判据**：站点声明了成套档名 → 用声明档名（`scale.mode = "declared"`，键名原样）；否则 → 实测序数（`mode = "ordinal"`）。
- 「成套」= alias 网门之后同族 **≥2 个值不同**的档。该「2」是刻度的**定义元数**，不是经验阈值。
- 序数键名必须是稠密 `1..N`：颜色按 OKLCH L **从浅到深**（L 降则号升），尺寸类按 px **从小到大**；**无跳号概念**，必须记 `measured`。
- **禁止空档补齐**；补空的唯一合法来源是第一方真盘，算法生成的邻居不在授权内。
- 识别出公开体系**只改键名，不授权造色**；体系名只落 `scale.guessedSystem`，**不产生行为差异**。识别粒度按维度独立，同维度内 family 也可以不一致，**逐 family 记 `scale`**。
- 禁止拿外来 `xs/sm/md` T 恤表套本站；站点**自称**的档名（`--text-sm`）原样保留。

`scale` 对象（挂 family / 维度 group 的 `$extensions["page-theme"]`）：

| 字段 | 必填 | 说明 |
| --- | --- | --- |
| `mode` | 是 | `declared` \| `ordinal` |
| `declaredFrom` | `declared` 时是 | 声明档名的变量形态 |
| `measure` | `ordinal` 时是 | `oklch-l` \| `px` |
| `guessedSystem` / `basePx` | 否 | 注记与观测记录，**不决定键名** |

**色相族闭集**（本项目自定）：`neutral` `red` `orange` `yellow` `green` `teal` `cyan` `blue` `indigo` `violet` `pink` `brown`；禁止发明 `slate` / `zinc` / `navy-2`。中性判据 `OKLCH C < 0.04`；alpha < 0.08 且面积大的走 `color.transparent`（独立，不进阶）。
`radius` 语义档 `none/xs/sm/md/lg/xl` + 必收 `pill` / `full`，站点自称档名优先；随高度变化的胶囊半径**归 component 的 `rounded`**，不升 primitive。

### 3.5 semantic 角色词表

产出档：**必** = 必产出（无观测走保留字段 + `observed:false` + `confidence`）· **条** = 条件必产出（不满足则 **omit** 并写 `DESIGN.md`）· **选** = 选产出（观测不到就不写）。

| 路径 | 含义 | 产出 |
| --- | --- | --- |
| `color.primary.$root` / `color.on.primary.$root` | 行动色（CTA 填充）/ 其上的字 | 必 |
| `color.primary.hover` | 行动色悬停 | 条：测到换值 |
| `color.identity.$root` | 品牌识别色 | 必 |
| `color.on.identity.$root` | 识别色做填充时的字 | 条：该色被用作 `background-color` / SVG `fill` |
| `color.identity.hover` | 识别色悬停 | 条：被当可点击填充 **且** 观测来自内容楼层 |
| `color.accent.$root` / `color.on.accent.$root` | 第三色 / 其上的字 | 选 / 条 |
| `color.text.default.$root` / `.muted.$root` / `.link.$root` | 正文 / 次要字 / 正文链接 | 必 |
| `color.surface.default.$root` / `.muted.$root` | 默认底 / 交替底 | 必 |
| `color.on.surface.default.$root` / `.muted.$root` | 对应底上的字 | 必 |
| `color.surface.identity` / `.inverse` / `.transparent`（各 `.$root`） | 识别色底 / 反转底 / 透明底 | 条：观测到 |
| `color.on.surface.identity` / `.inverse` / `.transparent`（各 `.$root`） | 对应底上的字 | 条：上条成立 |
| `color.border.default.$root` / `.muted.$root` | 默认描边 / 弱分割线 | 必 / 选 |
| `color.overlay.$root` | 遮罩 | 条：有模态 / 抽屉 |
| `color.focus.$root` | 焦点环 | 条：观测到可见焦点态 |
| `color.success` / `warning` / `danger` / `info` 及 `on.*`（各 `.$root`） | 状态色 | 条：观测到 |
| `typography.body` / `.heading` / `.label` | 排印角色 | 必（至少 body + heading） |
| `typography.display` / `.caption` | 更大标题 / 更小说明 | 选 |
| `motion.duration.*` / `motion.easing.*` · `elevation.*` | 动效 / 阴影语义 | 条：观测到 |
| `shape.radius.control` / `.container` | 按钮 vs 卡片圆角 | 必（即使同值也要两条） |

- `identity` 与 `primary` 同色时**必须** alias 到 `{color.primary.$root}` 并标 `merged: true`，禁止写两份重复实值。
- 中性色可以当 `identity` 与 `primary`（黑字 wordmark 照实记 + `confidence: low`）；中性族**禁止**当 `accent`，`accent` 也禁止为凑必产出而 alias 到 `primary`。
- 状态色 / `focus` / `hover` 无观测必须 **omit** 并写 `DESIGN.md`，禁止合成通用绿红、禁止 alias 到 `primary` 充数。
- `surface` 浅色只留 `default` / `muted` 两档；多出的浅表面**不建 token**，降级写 `DESIGN.md` 散文，component 上取时标 `lossy: true` + `observedHex`。
- 默认链接与正文同色必须**照实记录**，不得因「链接该是蓝的」改 `$value` 或降 `confidence`。未上屏的第一方具名色必须**保留 token**：`observed:false` + `source ∈ {supplied, autodetected}` + `confidence` + `dontId`。

### 3.6 component 层

- 命名 `component.{element}-{variant}[-{state}]`，rest 态省略 state；焦点采样必须是 `:focus-visible`。

| 段 | 闭集 |
| --- | --- |
| `element` | `button` `link` `input` `textarea` `select` `checkbox` `radio` `card` `badge` `chip` `nav` `tab` `tooltip` `modal` |
| `variant` | `primary` `secondary` `ghost` `outline` `destructive` `link`；卡片 `outlined` `filled` `lifted` `glass` |
| `state` | `hover` `active` `focus` `disabled` `loading` |

- 属性名必须 camelCase，禁 `bg` / `fg` / `radius` 别名：`backgroundColor`（必）`textColor`（必）`rounded`（必）`borderColor`（有边才写）`typography` `padding` `height` `width` `size` `border`。
- 规格只设最小下限 `button-primary` + `button-primary-hover`；其余观测到就写，不设必产出清单也不设上限。
- 只出现在页壳的控件记 `chrome.yaml` 或标了来源的 component，**不得**把其 hover 升格进 semantic。

### 3.7 必须过的硬门（写完自查）

| 触发 | 层 |
| --- | --- |
| group 同时含 `$value` 与子 token（组根值未走 `$root`） | 阻断 |
| `observed:false` 缺 `confidence` | 阻断 |
| `paintedRatio = 0` 且 `confidence ≥ medium` | 阻断 |
| `identity` 与 `primary` 同色但 `$value` 不是指向 `{color.primary.$root}` 的 alias；或 `accent` 与 `primary` 同色 / alias 到它 | 阻断 |
| 颜色 component / semantic 直引 primitive | 阻断 |
| 供给改写了 `$value`；出现算法生成的假盘邻居；条件必产出角色被编造出实值 | 阻断 |
| 表面多档上取未标 `lossy` + `observedHex`；`merged: true` 但 `$value` 不是 alias | 阻断 |
| 未上屏项缺 `dontId`，或 `dontId` 在 `DESIGN.md` 里对不上 | 阻断 |
| 对装饰边宣称「原站 WCAG 失败」（未写 `wcag.alert`） | 报警 |

**对比度**：`on-*` 先取该底上实际渲染过、对比度最高且面积最大者；无观测时按底相对亮度选最深 / 最浅 `neutral`。失败时**只改 `on-*`**（沿 OKLCH L 每次 ±0.03），保留 `observedHex`；**禁止**为过 AA 改 `primary` / `identity` / `surface.identity` 的填充。border 只报警不判失败。

---

## 4. `patterns/`

### 4.1 楼层词表闭集

每条楼层必须同时给 `role`（L0）与 `taxonomy`（L1/L2），缺任一即资产不合格；机器名一律小写 kebab，人读名写 `label_zh`。

**L0 `role`（3）**：`chrome`（页壳，不占节奏槽）· `section`（内容楼层）· `overlay`（浮层，不占节奏槽）。

**L1（26，任何站点必启用）**：

| 类 | 机器名 |
| --- | --- |
| chrome | `navbar` `announcement` `floor-nav` `float-widget` |
| overlay | `cookie-consent` |
| section | `hero` `page-header` `feature` `content` `stats` `logo-cloud` `testimonial` `case-study` `gallery` `pricing` `comparison` `cta` `newsletter` `faq` `team` `blog` `contact` `timeline` `career` `event` `footer` |

**L2（3，站点含中文或出现相应形态时启用，须在 `taxonomy_layers` 写 `L2`）**：`credentials`（资质墙，section）· `qr-lead`（独立二维码楼层，section 或 overlay）· `legal-bar`（独立备案块，chrome）。

- `footer` 的 `role` 必须仍是 `section`，只是文件并入 `chrome.yaml`。
- 常见形态必须并入既有词条：新闻动态 → `blog` + `variant.layout: list`；合作伙伴 → `logo-cloud`；关于我们长文 → `content`；行业 Tab → `feature`/`content` + `variant.layout: tabs`；客服浮球 → `float-widget`；电梯导航 → `floor-nav`。
- `bento` / `off-grid` / `marquee` / `slider` 必须写 `variant.layout`（或 `variant.off_grid`），**不得**当 `taxonomy`。
- 落不下词表的楼层**必须**记 `taxonomy: content` + 非空 `unmapped_reason`；真·长文图文楼层**不得**写 `unmapped_reason`。`taxonomy` 与 `slots[].name` **不得**使用 `x-*` 或任何现场自造前缀，需要新词必须开票。
- 二维码 / 备案嵌在宿主内时记宿主的 `qr` / `beian` 槽，不另标 `qr-lead` / `legal-bar`。

### 4.2 `index.yaml`

未知顶键不得出现。

```yaml
schema_version: 1                  # 必须为 1
style_set_id: example-corp         # 必须与资产目录名一致
taxonomy_layers: [L1, L2]          # L1 必有
catalog: { chrome: chrome.yaml, sections: [hero.split-image-right, feature.grid-3] }   # chrome 恒为 chrome.yaml
rhythm:
  scheme: alternate-muted          # alternate-muted | alternate-identity | stripe-3 | monotone | custom
  skip_roles: [chrome, overlay]    # 必须至少含这两个；skip_taxonomies 应当默认含 [hero, footer]
  surfaces: [default, muted]       # 交替池；不得放入 transparent / image
chrome: { navbar: navbar.logo-left-cta, footer: footer.multi-column }   # 键闭集见下；值 null | id | { default, variants[] }
page_skeletons:                    # 必产出，至少 1 型
  - id: sk-product
    label_zh: 产品页型
    observed_on: [agentarts, modelarts]
    steps:
      - { taxonomy: hero, required: true, repeat: { min: 1, max: 1 } }
      - { taxonomy: feature, required: true, repeat: { min: 2, max: 4 } }
    confidence: low                # 不得为 high
layout: { grid: { derived: true, columns: 12, gutter_px: 24, content_width_px: 1200 } }   # 可选
pages:
  home:
    url: https://example.com/
    title_zh: 首页
    sequence:
      - { id: home-hero, pattern: hero.split-image-right, taxonomy: hero, surface: transparent, label_zh: 首屏 }
```

- `chrome` 挂载位闭集：`navbar` `footer` `float_widget` `legal_bar` `breadcrumb` `announcement` `floor_nav` `cookie_consent`。**挂载位闭集 ≠ `taxonomy` 闭集**——`breadcrumb` 是挂载位、无 L1 词条，观测到上屏面包屑时并入 `navbar` 的槽或按兜底记 `content` + `unmapped_reason`，**不得**自造 `breadcrumb` 词条。
- `variants[].hosts` 必须是**完整 host**，不得写 eTLD+1 或 `style-set-id`；页 host 落不进任何 `hosts[]` 时必须回退 `default`。跨注册域来源同样只走 variant。
- `sequence[].pattern` 必须引用 `catalog.sections` 某 id 或 `chrome.yaml` 内某 id；`taxonomy` 若写必须与被引 pattern 一致。
- `sequence` 条目**不得**出现 `variant` / `slots` / `responsive` / `container` / `density`——构图变了必须新写一篇 `{id}.yaml` 再引用。
- `sequence` 只允许覆盖 `content_count.typical`，不得改 pattern 的 `min` / `max`；可以含顶栏 / 页脚 / 备案条以记录位置（顶栏在最前、页脚在最后）但必须按涂色规则跳过；**overlay 不得写入 `sequence`**。
- `layout.grid` 只在各楼层能整除到同一基准时才写，且必须 `derived: true`；量不出就整块省略，**不得**默认 12 或 24 列。
- `page_skeletons.steps` **只列内容楼层**，chrome 与 overlay 不进；`steps[].taxonomy` 指向词表而非具体 pattern id。
- 生成新页时楼层序列**必须 ∈ 本站某型**，允许在该型 `repeat` 区间内增删同 taxonomy 楼层；型库里无对应型时按形态缺口兜底并在 trace 写 `skeleton: null` + 理由，**不硬失败**。

### 4.3 `{id}.yaml`（`chrome.yaml` 内每个条目同 schema）

```yaml
id: feature.grid-3                 # 必须与文件名（去 .yaml）一致
taxonomy: feature
label_zh: 能力·三列卡栅
role: section
summary: 居中标题 + 三列等宽能力卡。
variant:                           # 选填：off_grid（默认 false）· align: start|center|end|justified · card: none|outlined|filled|lifted|glass
  layout: grid                     # stacked|centered|split|grid|bento|off-grid|overlay|slider|marquee|tabs|accordion|stepper|list
  columns: 3                       # split 必须 2；stacked/centered 必须 1；bento 可省改记 bento_map
  media_position: top              # none|left|right|top|bottom|background|start|end
  overlay: false                   # true 时必填 responsive.mobile.overlay_strategy
container: { mode: contained, max_width_px: 1200 }   # full-bleed|contained|breakout；full-bleed 时 max_width_px 必须 omit
density: default                   # compact|default|spacious
content_max: full                  # prose-narrow|prose|prose-wide|full
slots:
  - { name: heading, required: true, typical_chars: "8-16" }
  - { name: item_title, required: true, repeatable: true }
content_count: { unit: item, min: 3, max: 6, typical: 3, observed: [3, 6] }
responsive:
  pc:     { columns: 3, order: "heading,grid", grid: { content_width_px: 1200, columns: 3, gutter_px: 24, item_widths_px: [384,384,384] } }
  tablet: { columns: 2, grid: { content_width_px: 720, columns: 2, gutter_px: 16, item_widths_px: [352,352] } }
  mobile: { columns: 2, grid: { content_width_px: 358, columns: 2, gutter_px: 12, item_widths_px: [173,173] } }
  stack_below: tablet              # pc|tablet|mobile|never
rhythm: { surface: muted, alternate: prefer-contrast-with-prev, full_bleed_media: false, merge_spacing_with_prev: false }
observed_on: [home, product]       # index.yaml 的页面 id
screenshot: screenshots/home--feature.grid-3--pc.webp   # 可选；dom_hint 同为可选
observations:                      # 条件产出：仅当存在落选的跨页观测。赢家与输家都要入库
  - { path: responsive.pc.grid.gutter_px, pageId: product, pageUrl: "https://example.com/product", value: 20, selected: false }
dont: ["不要把能力卡改成客户 logo 灰度条"]
confidence: medium
```

**槽位闭集 36 条**（`slots[].name` 必须落入；文案侧 `slotHint` 与 `slot_caps` 键是它的**子集**）：

`eyebrow` `heading` `subcopy` `body` `primary_cta` `secondary_cta` `media` `logo` `item_icon` `item_title` `item_body` `quote` `attribution` `avatar` `stat_value` `stat_label` `price` `price_period` `feature_list` `form` `input` `faq_q` `faq_a` `nav_item` `social` `legal` `beian` `phone` `map` `qr` `channel_label` `certificate` `badge` `tab` `step_label` `date`

- `content_count.unit` 闭集：`item` `plan` `quote` `logo` `stat` `slide` `certificate`；`typical` 必须落在 `[min, max]`。
- `content_count.observed` 只记**同一页内多实例**的条数；**跨页分布一律走 `observations`**（`path: content_count.typical`）。
- 三档 `responsive` 必须齐全且**实采**，禁止只采两档推第三档；`columns` 是该断点的**视觉列数**，禁止把「小屏一律单列」当默认或回退。
- `responsive.*.grid` 每档必写；`columns > 1` 时 `gutter_px` 与 `item_widths_px` 必填；`grid.columns` 必须等于同档 `columns`。栅格必须来自**几何实测**，禁止扫 class 前缀反推列数、槽或容器宽。
- `patterns/` 下**不得**复制 `viewport_px` / `viewportSource`——`pc`/`tablet`/`mobile` 是槽位语义不是像素记录。缺测几何字段必须保留字段 + `observed: false` + `confidence`，不得用邻档或惯例填数。
- `confidence`：`taxonomy` / `variant` / `sequence` **不得**标 `high`；几何类标 `high` 必须两条测法一致。`dont[]` 是自由字符串、无 `id`，生成该 pattern 时必须读，但不进机检表。
- v1 **不做** z 阶：pattern 与 tokens 均不得新增 `layer.*` / `elevation.z.*`。

**跨页合并**：同一篇被多页共用是默认行为。合并成立的条件是 **`taxonomy` 相同且 `variant` 逐字段全等**；文字差异不影响合并、槽位有无走 `required: false`、条数差异走 `content_count`、几何微差走 `observations`。`variant` 任一字段不同（含 `columns`）即**新写一篇**。**不得设像素容差**。

**`observations`**：`path`（本文件内点分字段路径）+ `pageId` + `pageUrl` + `value` + `selected` 五键全必填；同一 `path` 下至多一条 `selected: true`，其 `value` 必须等于该字段现值；各页全等或只有单页观测时**整键 omit**。

### 4.4 涂色与页壳

`rhythm.surface` 六值：

| 值 | 含义 | token 指向 |
| --- | --- | --- |
| `default` | 默认实底 | `{color.surface.default.$root}` |
| `muted` | 弱对比实底 | `{color.surface.muted.$root}` |
| `identity` | 品牌识别色做楼层底（**不是** `color.primary`） | `{color.surface.identity.$root}`（条件） |
| `inverse` | 深底反白 | `{color.surface.inverse.$root}`（条件） |
| `image` | 图底 | **不进** `tokens.json`，只是楼层涂色语义 |
| `transparent` | 该节点自身无纯色背景（≠ 视觉白底） | `{color.surface.transparent.$root}`（条件） |

涂色顺序：`role ∈ skip_roles` → 跳过且不占计数；`taxonomy ∈ skip_taxonomies` → 同上；`surface ∈ {transparent, image}` → 跳过且不占计数（**硬规则，不得靠删 `skip_surfaces` 关闭**）；`scheme: custom` → 每条参与计数的条目必须手写 `surface`（无则资产不合格）；`monotone` → 全取 `surfaces[0]`；其余按 `surfaces[n % len]` 轮转。**已手写的 `surface` 不得被算法改掉**。
全站几乎无实底时必须用 `monotone` 或 `custom` + 逐条 `surface`，不得强行 `alternate-*`；站点无「识别色做楼层底」观测时 `surfaces` 池**不得**放入 `identity`，但枚举值必须保留。

**`chrome.yaml`**：整站一篇，是以 pattern `id` 为键的映射，每个值含 `id` 且**键名 == `id`**。全部 `role: chrome`、站点级 `overlay` 与 `taxonomy: footer` 必须写进这一篇；跨子域 / 跨注册域差异写成**多条同 taxonomy、不同 `id`** 的条目，由 `index.yaml` 的 `chrome.*.variants` 选择，**不得**拆第二篇文件。

页壳**没有高度字段**，也**不得**自造一个：竖向由 `density`（三档）承载，横向由 `container.mode` + `responsive.*.grid.content_width_px` 承载；吸顶收缩站的 navbar 高度本就是两个值，单值几何字段装不下。

**`{id}.notes.md`**：可选，文件名必须与对应 yaml 的 `id` 完全一致，一篇 yaml 最多一篇 notes；只准写气质长文、Don't 展开、切分备忘、软提醒，**不得**重复 yaml 已有的枚举与数字。

---

## 5. `voice.md`

一个 style-set 恰好一份；跨来源不得另写 `voice-<source>.md`。中英站共用同一 schema，中文排印与称谓落条件专章 `locale_pack.zh-CN`。

```yaml
---
schema: page-theme-voice/v1
locale: zh-CN
register: semi-formal              # formal | semi-formal | casual
tone_axes:
  humor: serious                   # serious | mixed | funny
  respect: respectful              # respectful | mixed | irreverent
  enthusiasm: moderate             # matter-of-fact | moderate | enthusiastic
brand_self: 示例云
reader: 您                          # 你 | 您 | 混合
audience_noun: [客户, 开发者]
primary_cta: [立即体验]
secondary_cta: [了解详情]
consult_cta: [立即咨询]             # 本图自定意图槽，不是业界视觉层级
headline_structures:
  - id: S_custom_short_slogan      # 必须匹配 ^S_custom_[a-z0-9_]+$
    evidence:                      # 每型 ≥2 条实测原句，各带来源 URL
      - { text: "云上创新，触手可及", url: "https://example.com/", pageId: home }
      - { text: "算力普惠，人人可用", url: "https://example.com/", pageId: home }
slot_caps:                         # 键必须 ⊂ 槽位闭集 36 条
  heading: { min: 8, typical: 16, max: 24, observed: true, confidence: high }
locale_pack: zh-CN                 # zh* 填 zh-CN；否则必须 null
few_shot_count: 6
chrome_upgrades: []                # 可空数组
---
```

- 上表 15 个键**全部必填**；枚举打不中时不得自造 front matter 值（如 `warm-tech`），更多气质只进正文 traits。
- 非中文站必须 `locale_pack: null` 且正文**整节物理删除** §V7，**不得**留空小节或 `omitted` 骨架。语言是 locale 不是第二人格：`register` / `tone_axes` / traits 对同一站点只有一套。
- 正文固定 8 节、顺序不可改，缺任一应出节标题 = 资产不完备：

| 节 | 标题 | 必须包含 |
| --- | --- | --- |
| §V0 | 一句话本质 | 单句 ≤40 字，不列产品清单 |
| §V1 | 气质对 | is / not **成对**表 + 证据页；禁止只写 is |
| §V2 | 槽位句式 | 每槽 `structure` / `length` / `example` / `rewrite_hint` 四字段 |
| §V3 | 词汇 | `prefer` / `avoid` / `forbidden_topics`（有则记录，可缺） |
| §V4 | Don't | 有条目时每条带 `id`（`voice-dont-NN`）+ `check: copy` + `text`（可缺） |
| §V5 | 金句 | 原文 + 槽位 + `pageId` + **来源 URL** |
| §V6 | 情境变调 | 情境 / 偏移 / 仍须遵守的不变量（至少含 `register`、`reader`、CTA 三表） |
| §V7 | 中文专章 | 仅中文站；必须含 `punctuation` / `numbers` / `cjk_latin` / `address` 四子节 |

- 写入 `voice.md` 的每条规则必须至少挂 1 条原文证据（原文 + `pageId` + 来源 URL）；禁止开放标签云。
- `slotHint` / `slot_caps` / §V2 小节标题的键必须是**槽位闭集 36 条的子集**；拿不准必须 omit，**不得**用闭集外占位。`nav_item` 只进 chrome 附录，不进营销语气统计分母。
- 频率不等于气质：全站最高频 CTA **不得**自动升为 `primary_cta`，主 CTA 以产品首屏实心按钮文案为准。某槽实测样本 `n < 3` 时该槽 `slot_caps` 必须 `observed: false` + `confidence`，**禁止**编造 `typical`。
- 口号型：每站应当归纳 **3–7 个** `S_custom_*` 型再填词，每型必须附 **≥2 条**实测原句；不足 3 个可立型时能立几个立几个并标 `observed:false` + `confidence`，**不得**为凑数编造，超过 7 个必须合并近义型。
- 生成新页的 heading **必须 ∈ 本站 `headline_structures`**；复合结构允许主型 + 辅型，主型只能标一个。**不得**写「必须 ∈ 全球闭集」或「禁止自创第 8 型」。
- 金句单条必须同时 ≤ 该槽 `slot_caps.max` **且** ≤ **80 个码点**，取更严者；缺来源 URL 则该条不合格。
- 公告条可见文本默认归 chrome、不进营销语料；升格单条时必须同时标 `slotHint` + `fromChrome` + `ephemeral: true` 并写进 `chrome_upgrades`，且**不得**再进 §V5 金句。
- 浮动 CTA 不得自行丢弃或自行入表：脚本写 `ctaUnmapped[]` + `geometry: floating`，由采集阶段的 agent 判定全站功能（丢）还是本屏主操作（进 `primary_cta`）。
- 中英混排**复刻原站作者习惯**，不得为「更正确」插入 U+0020，不得先跑 pangu 再统计。某槽 `ratioWithSpace ≥ 0.9` 或 `≤ 0.1` 才可立硬规则（**本项目自定**），其余一律写 `mixed`；标 `mixed` 的槽必须注明「原站混用」且要求同一页内自洽。
- 源码空格与屏幕间隙必须分记：`text-autospace ≠ no-autospace` 时，源码比例**不得**当生成页的视觉空格规则。corpus 全文不得入库，`voice.md` 里不得贴 corpus 全文。

---

## 6. 校验器

```
node scripts/validate-asset.mjs <资产目录> [--json] [--max-per-code=N]
```

退出码：`0` = 通过；`1` = 存在阻断类条目，**必须**修到不为 `1` 再交付；`2` = 仅报警，可交付但报警项应当写进产出物的待办清单。

- 形状描述在 `scripts/schemas/`（DSL 见同目录 `shape-dsl.md`），跨字段规则在 `validate-asset.mjs`，每条报错都带条款号。
- 校验器零第三方依赖，YAML 走内置子集解析器：**不支持**锚点 `&` / 别名 `*` / 标签 `!` / 多文档，资产 YAML 必须写成平铺形状（命中即报错，不静默）。
- 调用方已有解析结果时可以 `validateAsset(dir, { parsedYaml: { 'patterns/index.yaml': obj } })` 传入，绕开内置解析器。
