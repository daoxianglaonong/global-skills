# 验证规程

开工必读。`SKILL.md` 定硬序、十道门与退出码；本文件定**每一步具体怎么做**。资产字段形状读 `scripts/vendor/page-theme-core/schemas/`（DSL 见 `shape-dsl.md`）。

## 1. 先定三件事

| 项 | 规则 |
| --- | --- |
| 资产 | `--asset` 必给。四份必读件 `closed-set.json` · `tokens.json` · `DESIGN.md` · `voice.md`，任一缺失或解不开即退 1，输出 `{ verdict: "blocked", precheck: { code, file, nextAction }, findings: [] }`。`code`：目录不在 → `asset-missing`；四份里缺文件或 `tokens.json` JSON 解不开 → `asset-incomplete`；`closed-set.json` 解不开 → `closed-set-unparseable`。`nextAction` 是一句可执行提示（该缺件该怎么补）。成功态（过了前置）输出 `{ verdict, styleSetId, declarationCount, gates, findings, trace }`，`verdict` 看 findings 是否为空，`gates[]` 十行恒在；`trace` 是白名单读面（未给 `--trace` 时为 `null`） |
| 产物面 | `--artifact` 指文件即单文件；指目录则**递归**收 `*.html` / `*.css`，跳过 `node_modules` 与点开头目录，按相对路径升序读。收到 0 份即退 1（`artifact-empty`） |
| trace | 只在产物真带 trace 时给 `--trace`。不给不是缺陷，`image-evidence` 那一行写 `status: "no-input"`。产物里有合成型（`synth:` 前缀）层根时**必须给**：`layout-envelope` 靠白名单里的 `floors[].unobservedBreakpoints[].inheritFrom` 把它连回真实型记录，不给即 `synth-inherit-unreadable` 退 1（判不出就不放行，不静默放过） |

缺件本身**不判**，只拒绝在残件上出结论（缺件归采集侧 `validate-asset.mjs`，用 `nextAction` 指出来）。本包不加 `package.json`；跑测试一律 `node --test tests/*.test.mjs`，**必须带 glob**——对目录跑在 Windows 上会 `MODULE_NOT_FOUND`，core 那句 `"test": "node --test"` 是坏的。

## 2. 判据从哪来

跨包 import 被禁：判据得能跟着包搬走，import 会让「同一把尺」变成一条随别人目录结构断裂的链。复用生成侧判据只有一条路——**整文件拷贝**进 `scripts/lib/`，判据字节级同一套。下面头四份都只 import `node:fs` / `node:path` 或零 import；`source-shape.mjs` 照拷是因为本包同样不许派生变量名（候选 token 的 `cssVar` 一律从闭集那一列取），射程同为 `scripts/**/*.mjs` 的代码部分。

前六道门函数（`gateColorLiteral` · `gateFontStack` · `gateVarInClosedSet` · `gatePrimitiveLeak` · `gateUnresolvedVar` · `gateImageEvidence`）及它们依赖的模块级常量（`COLOR_EXEMPT` · `FONT_EXEMPT` · `CSS_NAMED_COLORS`）从 generate 的 `gates.mjs` **抠出源文本逐字对照**，由 `tests/copied-helpers.test.mjs` 锁着；换行归一成 LF（git 在 Windows 上会把 generate 那份转成 CRLF）。这不是整文件拷：`gates.mjs` 不能整文件拷，见下。

| 拷来的文件 | 行 | 用到的导出 |
| --- | ---: | --- |
| `image-probe.mjs` | 130 | `ImageProbeError` · `decodeImage` · `probeImageFile` |
| `css-scan.mjs` | 170 | `splitDeclarations` · `scanCss` · `scanHtml` · `scanArtifact` |
| `closed-set.mjs` | 77 | `ClosedSetError` · `loadClosedSet` · `varReferences` |
| `source-shape.mjs` | 181 | `collectSourceFiles` · `codeLines` · `findVarDerivation` · `findRuntimeDependencies` |

`gates.mjs`（generate 568 行）**不能单独拷**：它 import vendored core 与 `./outline.mjs`（372 行）。本包不承接 `sequence-approval`，拷门时把 `gateSequenceApproval` / `verifyPageSequence` / `AUTHORITATIVE_SEQUENCE_SOURCES` / `CANDIDATE_SEQUENCE_SOURCES` 整段留下不带走，`readOutlineSources` 的 import 一并不带——于是 `outline.mjs` 本包**不需要**。本包的后三道资产侧门与 `DESIGN.md` / `voice.md` 解析在 `scripts/lib/gates-asset.mjs`；值映射行逻辑在 `scripts/lib/value-rows.mjs`（CLI 仍是 `scripts/value-map.mjs`，不与 lib 同名）。

第十道门另有两份整文件拷贝（`R4-06` 带进来的）：`layout-envelope-gate.mjs`（611 行，判据全在这里，另 import vendored core 的 `parseYaml` 与下一份）与 `paint-floors.mjs`（46 行，层根解析）。**字节同源不等于同源**：`R4-08` 给判据加了可选 `trace` 入参，生成侧传了本包没传，两份判据 SHA256 一模一样而同一份合成型页在生成侧过门、在本包退 1。所以入参也上锁——`tests/copied-layout-envelope-wiring.test.mjs` 两层：两侧调 `checkLayoutEnvelope` 的键集合必须同为 `{ htmlFiles, declarations, assetDir, trace }`（静态），且同一份合成型页走两侧各自的公开入口（`lintArtifact` / 生成侧 `lintFloor`）得出的 `layout-envelope` findings 逐字相同（行为）。静态那层挡不住 `trace: null` 与白名单剥字段，行为那层挡不住「两边碰巧一致」，两层都得在。

门序写死一份 `GATE_ORDER`，十项，顺序即报告顺序：`color-literal` · `font-stack-literal` · `var-not-in-closed-set` · `primitive-leak` · `unresolved-var` · `design-dont-section-missing` · `primitive-dont-id` · `voice-forbidden-term` · `image-evidence` · `layout-envelope`。finding 工厂与生成侧同形 `{ gate, level: 'block', ...detail }`，十道全 `block`。附加字段：

| 门 | 附加字段 |
| --- | --- |
| `color-literal` · `font-stack-literal` | `file` `selector` `prop` `value` `reason` |
| `var-not-in-closed-set` · `unresolved-var` | `file` `selector` `prop` `var` `reason` |
| `primitive-leak` | 同上再加 `layer` |
| `image-evidence` | `floor` `field` `reason` + 可选 `image` `code` |
| `design-dont-section-missing` | `assetFile: "DESIGN.md"` `unobservedCount` `reason` |
| `primitive-dont-id` | `assetFile: "DESIGN.md"` `tokenPath` `code` `reason` + `orphan` 那一支再带 `dontId` |
| `voice-forbidden-term` | `file` `assetFile: "voice.md"` `term` `source` `context` `reason` |
| `layout-envelope` | `code` `reason` + 按维可选 `pattern` `rule` `at` `file` `selector` `prop` `mode` `inheritFrom`；定序另有一份写死的 `CODE_ORDER`（`layout-envelope-gate.mjs`），与包络里规律的排布无关 |

资产侧用 `assetFile` 而不是 `file`：产物里也可能有一份 `DESIGN.md`，共用一个键名会让读者分不出这条说的是谁。排序键逐项字典序、缺席按空串：`[GATE_ORDER 序号, file, assetFile, tokenPath, selector, prop, floor, field, var, value, term, image]`，路径全部相对化后再排。

## 3. 跨包判据不得重叠

**同一个事实只许一个包判一次**，两包各判会让判据分叉：一边改了阈值另一边没改，两份报告给不同结论，没有一处能指着说哪个对。所以本包不新立契约，只把**契约原文**应用到采集侧跳过的那一类：

| 判什么 | 归谁 | code |
| --- | --- | --- |
| 缺 `DESIGN.md` | 采集侧（必交件那一族） | — |
| 有 `DESIGN.md` 但没有 §8 Don't 节 | **本包** | `design-dont-section-missing` |
| `component.*` · 非 primitive 的 `color.*` · `dimension.*` · `fontFamily.*` 未上屏项缺 `dontId` / `dontId` 对不上 | 采集侧 | `dont-id-missing`（T-126）/ `dont-id-orphan`（T-94） |
| **primitive 色阶**未上屏缺 `dontId` / `dontId` 对不上 | **本包** | `primitive-dont-id-missing` / `primitive-dont-id-orphan` |

后两行是同一条契约按 token 类切开，判据逐字同源、不重叠。切口是**色**不是层：`dimension.*` / `fontFamily.*` 虽然也是 primitive，采集侧 `needsDontId()` 自 T1 起对它们返回 `true`，本包不接（射程写死 `layer=primitive` ∧ `type=color`）。两行合起来已覆盖契约的全部未上屏项，**不再有谁都不判的残留**。

- 未上屏项从 `tokens.json` 走 vendored core 的 `walkTokens` 取，条件 `$extensions['page-theme'].observed === false`。层级**不派生**：按 `path` 去 `closed-set.json` 的 `entries` 查 `layer` 与 `type`，`primitive` + `color` 即本包射程。
- 两支判据逐字照采集侧：`typeof dontId !== 'string'` 出 `primitive-dont-id-missing`；`DESIGN.md` **全文** `includes` 不到该 `dontId` 出 `primitive-dont-id-orphan`。全文子串匹配连 §1 里一句交叉引用也算对上（冻结 fixture 的 §1 就提了那个 id），本门**不单独收严**——收严就是同一条契约在两包里有两把尺。
- 同一行 Don't 被多个 token 共指是**预期形态，不判唯一性**：契约要的「整盘一条合并 Don't」正是这么成立的。冻结 fixture 里 `color.orange.1`（primitive，本包）与 `color.accent.$root`（semantic，extract）共指同一 `dontId`，演示的是**跨两包共指同一条 §8 行**，不是「多个 primitive 共指」。两个 primitive 共指的用例从 fixture 派生，见 `tests/primitive-dont-id.test.mjs`。也**不判** §8 表的 `check` 列（`unused-scale` 那类）——契约里没定义它，拿它当判据是给自己立新契约。
- §8 节定位（只供 `design-dont-section-missing`）：标题行（`^#{1,6}\s`）文本小写化后同时含 `8` 与 `don` 即算有节（本门只问节在不在，不读节里的字）。`## 8 Do's and Don'ts`（无点）与 `## §8 Do's and Don'ts` 都算有节。只有 `### Don't`、标题里没有 `8`，不算有节。`## 18. Something don't` 也会命中——`18` 含 `8`、`don't` 含 `don`，这是这把尺的已知宽度，不另收严。

## 4. §V3 词表两种形状

节按契约标题定位（标题行含 `§V3`，或含 `V3` 与「词汇」），射程到下一个同级或更高级标题为止。节内只取 `avoid` 与 `forbidden_topics`，`prefer` 不取：

| 形状 | 长相 | 取法 |
| --- | --- | --- |
| markdown 列表 | `- avoid：赋能 · 引领 · 生态 · 一站式 · 全方位` | 行首 `-`/`*`/`+` 起，取首个 `：` 或 `:` **右侧**，按 `·` `、` `/` `,` `，` 切 |
| yaml 围栏 | ` ```yaml ` 内 `avoid:` 下 `- { term: 点击这里, replace: 了解详情 }` | 整块交 vendored core 的 `parseYaml`，取 `avoid[].term` 与 `forbidden_topics[].topic` |

- 冒号**右侧**才是词。取左侧就把字段名 `avoid` 本身当成禁词（旧切词犯的正是这个错）：于是任何含「avoid」的页面都红，真正的禁词一个都没查。yaml 形状里 `replace` 与 `severity` 不是词。
- 每个词剥反引号、星号、首尾引号后为空即丢。纯 ASCII 词按大小写不敏感比（`lorem` 与 `Lorem` 是同一件事），含 CJK 的词原样比。词表为空、无 §V3 节、`voice.md` 空：**不触发，不报错**。
- **已知盲区：** yaml 围栏 `parseYaml` 抛错时整块跳过，不报错。围栏是唯一词源且写坏时，词表为空，本门 `no-input` 报绿。不在本门补 `voice.md` 资产校验。
- 匹配面是产物的**人读文案**：HTML 文本节点，加 `alt` / `title` / `aria-label` / `placeholder` 四个属性。`<script>` / `<style>` 体、CSS 文件、`class` / `id` / `data-*` 都不扫——那些是代码不是文案。`context` 取命中处前后各 12 字符，`trim` 后落盘。

## 5. 用途映射表

**用途 = CSS 属性归并后的用途类**，由这张显式表从 `prop` 得出。表序即报告行序：

| usage | prop |
| --- | --- |
| `background` | `background` · `background-color` · `background-image` |
| `text` | `color` · `-webkit-text-fill-color` · `caret-color` · `text-decoration-color` · `text-emphasis-color` |
| `border` | 以 `border` 开头的任一 prop · `outline` · 以 `outline-` 开头的任一 prop · `column-rule` · `column-rule-color` |
| `shadow` | `box-shadow` · `text-shadow` · `filter` · `backdrop-filter` |
| `fill` | `fill` · `stroke` · `stop-color` · `flood-color` · `lighting-color` |
| `accent` | `accent-color` |
| `other` | 以上都不命中 |

- 分类**只看 `prop`，不看值**，所以不设 `gradient` 一类：按值分类会让同一个 prop 在两类之间跳，而「同一 (源值, 用途) 归一行」要求的正是分类只依赖能稳定读出的那一列。渐变里的色值照样进 `background` 行，一处不漏。
- `other` 不是垃圾桶：`summary.unmappedProps[]` 与 Markdown 的「未归并的 prop」小节**必须点名**列出落进 `other` 的 prop 名（升序去重）。
- 射程只有**色值字面量**，抽取器与 `color-literal` 门同一份 `colorLiterals()`。`transparent` / `currentColor` 与色值门同一套豁免，不进候选行。字体族与尺寸不进**这张表**——它们归 §7 那张「源值 × 类目」的非色表（`type-map.mjs`），越界字体族仍由 `font-stack-literal` 挡；闭集外的 `var()` 引用两张表都不进（那是门的事）。

## 6. 值映射的形状与回灌

```json
{
  "schemaVersion": 1, "styleSetId": "fixture-lanyuan-lab", "asset": "../fixture-lanyuan-lab", "artifactRoot": ".",
  "summary": { "rows": 2, "occurrences": 5, "pending": 2, "unmappedProps": ["mask-image"] },
  "rows": [{
    "id": "vm-background-3f9a1c2d", "sourceValue": "#0F7A6C", "normalizedValue": "#0f7a6cff", "usage": "background", "alpha": 1, "occurrenceCount": 3,
    "occurrences": [{ "file": "index.html", "selector": ".hero", "prop": "background-color", "value": "#0F7A6C" }],
    "candidates": [
      { "path": "color.primary.$root", "cssVar": "--color-primary", "layer": "semantic", "matchedBy": "hex-exact", "deltaE00": 0 },
      { "path": "color.teal.3", "cssVar": "--color-teal-3", "layer": "primitive", "matchedBy": "hex-near", "deltaE00": 0.364 }
    ],
    "verdict": null, "acceptedCssVar": null, "note": ""
  }]
}
```

- `normalizedValue` 走 vendored core 的 `normalizeColorKey`（含 alpha）：`#FFF` / `#ffffff` / `rgb(255,255,255)` 归同一行，而 `transparent` 与 `#000` 不归——alpha 是值不是写法。
- `id` = `vm-<usage>-<hex8>`，`hex8` 取 `sha256(usage + "\u0000" + normalizedValue)` 前 8 位小写十六进制（`node:crypto`，零依赖）。**从源值与用途派生，不用序号**：用序号时删一行加一行，回灌就整份对不上。
- `candidates` 从闭集反查，**两档**（2026-09-03 起）：`hex-exact` 是**剥掉 alpha 后**的 RGB 逐位相等，`hex-near` 是 CIEDE2000 距离 `deltaE00 ≤ 2` 的近邻。命中多条闭集条目时**全收**，不挑一条；序是「`hex-exact` 全在前，`hex-near` 按 `deltaE00` 升序、同距按 `path`」。两档都反查不到写 `[]` 并在该行 `note` 留「无候选」。`verdict` 三值枚举加 `null`，**没有第四个枚举值**。
- `alpha` 与 `deltaE00` 是这一趟新加的两列，**都只是读数，不是结论**。`alpha` 从 `normalizedValue` 末两位派生（归一把 alpha 量化成一个 hex 字节，`0.7` 落成 `b3` = `0.702`）；`deltaE00` 是实算的色距，精确档恒 `0`。为什么阈值是 `2`：CIEDE2000 的通行解读是 `≤1` 肉眼不可分辨、`1–2` 凑近细看才看得出、`>2` 一眼就是两个颜色，而候选是**递给人的选项**，越过「一眼看得出」那条线的东西不该出现在选项里。**这个数只在 `value-rows.mjs` 的 `NEAR_DELTA_E00_MAX` 里，不接 CLI 旗标**：阈值一可调，报告守的就不再是同一件事。
- **alpha 从检索键里剥出来，但不从行键里剥。** `rgba(255,255,255,0.7)` 与 `#ffffff` 仍是两行（`normalizedValue` 与 `id` 一个字节不动，否则一切已填好的表当场 stale），但两行拿到同一批候选——闭集那一侧本来就是 alpha 盲的（token 的值是 6 位 hex），剥离之后两侧口径才一致。`alpha < 1` 的行，`note` 里写明「候选是不透明 token，执行侧写 `color-mix(in srgb, var(选中 token) p%, transparent)`」，生成侧的兑现门为此多守一条 `accept-alpha-carrier-missing`。alpha 恰为 `0`（`rgba(0,0,0,0)`）不给候选：那是「不涂」，任何 token 在 0% 上都是同一个结果。
- 近邻档**不是把精确档放宽**：越过阈值仍是零候选（`#000` 到 `#191919` 是 `5.2`，`#3FB950` 到最近色是 `32.8`，两者都仍无候选）。它也不是在 `gradeColorMatch` 之外新造判档——那个函数仍只回答「是不是同一个色」。`deltaE00` 只决定「先给人看哪一个」；换不换、换成哪一个仍由人在裁决那一格拍板，而 `accept` 一个近邻候选会在 `warnings[]` 留一条 `accepted-token-near` 记下这一步的精度损失。
- `acceptedCssVar` 是 `accept` 行选中的那个候选的 `cssVar`，其余情况恒 `null`。`--out` 产出时一律 `null`，**不预填**，哪怕该行只有一个候选：预填就是本包在裁，而「只有一个候选」不等于「该换成它」。生成侧的承诺兑现率门以这一个字段为唯一执行依据，所以它只存 `cssVar` 那一半——执行侧要写进 `var()` 的就是这一串，另存一列 `path` 只会给两列打架留出空间。
- 行序 `[usage 在 §5 表里的序号, normalizedValue, id]`；`occurrences` 序 `[file, selector, prop, value]`。

Markdown 八列固定，表头逐字如下。「选中 token」插在「候选 token」与「裁决」之间——人是从左边那格
把变量名抄过来的，两格相邻才抄得动；裁决与备注仍挨着，右边三格连成一片人填区。裁决列留空即 pending：

```markdown
| id | 源值 | 用途 | 处数 | 候选 token | 选中 token | 裁决 | 备注 |
| --- | --- | --- | ---: | --- | --- | --- | --- |
| vm-background-3f9a1c2d | `#0F7A6C` | background | 3 | `color.primary.$root` → `--color-primary` | | | |
```

「选中 token」单元格只认**变量名本身**，剥掉首尾空白与反引号后逐字比该行 `candidates[].cssVar`。写成
`color.primary.$root`（候选那一格的左半）或 `var(--color-primary)` 都算填错，报错文本要指出只填
`→` 右边那一串。只认一种形式是为了让「填错」有唯一诊断，也为了不在门里再引一次 `path → cssVar` 的
映射——那张表只有闭集那一列有权威。

回灌按 `id` 匹配，十三种情况处置不同、理由不同，不得合并：

| 情况 | 处置 | 理由 |
| --- | --- | --- |
| 裁决列空 | 记 pending，退 0 | 刚生成的报告整列都空，那是正常状态 |
| 枚举外的值（`ok` / `同意`） | **阻断** `verdict-unknown`，退 1 | 读不懂就不猜；把「同意」读成 `accept` 是替用户下裁决 |
| id 认不出 | **阻断** `row-id-unknown`，退 1 | id 由源值与用途派生，认不出说明产物或资产已变，这份裁决对的不是眼前这份产物 |
| 同一 id 两行、裁决不同 | **阻断** `row-id-duplicate`，退 1 | 冲突裁决没有合并规则，取任一条都是本包在裁 |
| 同一 id 两行、裁决逐字相同 | 报警 `row-id-repeated`，退 0 | 复制粘贴一行没改内容不是分歧 |
| JSON 里有、表里缺行 | 报警 `row-missing`，退 0 | 人手删行是常见裁剪，缺的按 pending 处理 |
| `accept` 但「选中 token」空着 | **阻断** `accepted-token-missing`，退 1 | 多候选行占多数，不填就只能让执行方猜，而兑现率门没有可对账的依据 |
| 「选中 token」填了，但不在该行 `candidates[].cssVar` 里 | **阻断** `accepted-token-unknown`，退 1 | 候选是闭集 hex 反查的结果，表外的名字要么不在这份资产里，要么换的是另一个颜色 |
| `accept` 但该行 `candidates` 是空的 | **阻断** `accept-without-candidate`，退 1 | 这种行是常态而非畸形：把合格产物一处 `var()` 改成 `#123456`，闭集反查不到，`note` 就写「无候选」。承诺一件没有落点的事，兑现率门只能整片报漏做 |
| `reject` / `defer` / 未填，却填了「选中 token」 | **阻断** `accepted-token-unexpected`，退 1 | `acceptedCssVar` 只有一个用途——兑现率门的执行依据。让非 `accept` 行携带它，等于给执行方一份没有承诺的指令，「defer 不计入兑现率」会被静默破坏。想记「以后换成这个」写 `备注` 列，那一列不进任何判据 |
| `accept` 选中的候选 `layer` 是 `primitive` | 报警 `accepted-token-primitive`，退 0 | 判阻断会让「只有 primitive 候选」的行永远迁不动，而那时的正确出路是 `defer`。引用处真写了会在生成侧 `primitive-leak` 亮，这里只提醒 |
| `accept` 选中的是 `hex-near` 候选 | 报警 `accepted-token-near`（带 `deltaE00`），退 0 | 判阻断等于把近邻档白开——那正是这一趟要修的洞。色表八列固定、已填好的表要能原样读回，所以精度损失不另开一列，走 `warnings[]` 留痕（`--read-back --json` 会落盘）。不接受这笔损失的出路是改判 `defer` |
| `accept` 的行 `alpha < 1` | 报警 `accepted-token-alpha-carrier`（点名该写的 `color-mix()`），退 0 | 候选是不透明 token，透明度只能由执行侧的承载体带着。这里判阻断会让半透明行永远迁不动；真写成裸 `var()` 会在生成侧兑现门报 `accept-alpha-carrier-missing`，那才是阻断的位置 |

同一行撞上多条时按病因取一条，不叠报：无候选行裁 `accept` 只报 `accept-without-candidate`（不是忘填，是压根没得填），不另报 `accepted-token-missing`；非 `accept` 行那一格填了东西只报 `accepted-token-unexpected`（那一格本来就该空，填得对不对不改变结论），不另报 `accepted-token-unknown`。

报警落 `warnings[]`，**不进 findings、不影响退出码**。回灌结果打 stdout，`--json` 时另写一份，形状为 `{ verdict, summary, rows, warnings, findings, peerMap }`（`peerMap` 是对表读面，见 §7.1），`rows[]` 带上 `acceptedCssVar`（未填与非 `accept` 行为 `null`）——生成侧的 `lint-migration.mjs` 收的就是这份 JSON；**不回写** `value-map.md` / `value-map.json`，人填的那份是输入。`--out` 与 `--read-back` 都不给是用法错误，退 1。

## 7. 非色映射的形状与回灌

**另一张表，不是色表加一列。** 决策单元是「源值 × 类目」，落 `type-map.json` + `type-map.md`，
行 id 前缀 `tm-`，文档带 `mapKind: "type"`。为什么不扩色表的 schema（2026-09-01 用户拍板）：

1. 色表的 `usage` 是从 prop 归并出来的**角色**（background / text / border…），而非色的「用途」
   其实就是**类目**，prop 与类目近乎 1:1，硬塞进 `USAGE_ORDER` 只会让 `other` 爆炸。
2. **反查形状不同。** 色按 hex 反查（精确档 + ΔE00 近邻档），同一 hex 的多个候选是「同一颜色的不同角色」；维度是
   **跨类目数字复用**——现役华为云资产里 `24px` 同时是 `dimension.lineHeight.2` 与
   `dimension.radius.2`，只按数值反查会把行高变量当成圆角候选递给人。
3. 值缺口的第三条路 `omit` 只有非色迫切（间距在闭集里常常一条 token 都没有），塞进色表会逼色值
   行也解释 omit，那 11 种回灌处置要整个重写——而色链路刚过完破坏性复核与两轴 review，且被
   generate 侧逐字节锁着。

`value-rows.mjs` 因此**一个字节都不动**，`copied-value-rows.test.mjs` 也一个字节不动；两份表的 id
前缀不撞车（色 `vm-`、非色 `tm-`）由 generate 侧新立的 `copied-type-rows.test.mjs` **互相**锁住。

```json
{
  "schemaVersion": 1, "mapKind": "type", "styleSetId": "fixture-lanyuan-lab",
  "summary": { "rows": 3, "occurrences": 7, "pending": 3, "outOfScopeValues": [{ "prop": "padding", "value": "1.5rem" }] },
  "rows": [{
    "id": "tm-radius-1a2b3c4d", "kind": "radius", "sourceValue": "8px", "normalizedValue": "8px", "occurrenceCount": 2,
    "occurrences": [{ "file": "index.html", "selector": ".card", "prop": "border-radius", "value": "8px" }],
    "candidates": [{ "path": "dimension.radius.1", "cssVar": "--dimension-radius-1", "layer": "primitive", "matchedBy": "px-exact" }],
    "verdict": null, "acceptedCssVar": null, "lossy": false, "note": ""
  }]
}
```

- **类目五个，序固定**：`font-stack` / `font-size` / `radius` / `stroke` / `space`。类目由 prop
  **白名单**（`KIND_BY_PROP`）得出，白名单外的 prop **一律不收，不是归 `other`**。
- **`id` = `tm-<kind>-<hex8>`**，`hex8` 取 `sha256(kind + "\u0000" + normalizedValue)` 前 8 位。
  与色表同一套派生法，同一个理由：用序号时删一行加一行，回灌就整份对不上。
- **归一**：字体栈去引号压空白小写、逗号后统一一个空格；维度 `24.0px` 与 `24px` 归一行。
- **候选按类目分桶反查**，闭集条目的类目**按 token path 判、不按数值判**（`entryKind`）——这正是
  跨类目碰撞的解法：行高条目根本不进任何类目索引，所以它不会成为圆角行的候选。三种 `matchedBy`：
  `px-exact` · `stack-exact` · `stack-near`（去掉通用族名后仍有交集）。排序精确在前近义在后。
  通用族名必须剔除，否则几乎每个栈都以 `sans-serif` 收尾，`stack-near` 当场退化成「永远命中」。
- 行序 `[kind 在上表里的序号, normalizedValue, id]`；`occurrences` 序与色表同为 `[file, selector, prop, value]`。

### 射程（写死，不许让表看起来比射程大）

| 不收的 | 为什么 |
| --- | --- |
| `line-height` · `font-weight` · `letter-spacing` · `width` / `height` / `max-width` | 不在白名单。前两个在闭集里有 token 但归纳口径未定，布局尺寸不是主题量 |
| `border` / `font` / `background` 这类**复合简写** | 切开它会让 occurrence 的 `value` 不再是声明里的那一串；色表对同一条声明只抽 hex，两边会打架 |
| 零值（`padding: 0`、`margin: 0 auto` 里的 `0`） | 资产不会为 0 出 token，收进来只会逼人给每个 0 裁一次 |
| `%` / `em` / `rem` / `vw` 等非 px 长度、`var()` / `calc()` / `clamp()` | 判不了。**但不静默丢**：落进 `summary.outOfScopeValues`，Markdown 里单列「射程外的值（未进表）」一节 |
| `--*` 自定义属性声明、widget 段 | 与色表同一套排除 |

**现役与冻结夹具已有 `dimension.spacing` 组**（T7 从 raw/ `--primitive-space-*` 梯归纳），`space` 行可反查候选；认不出的 `dimension.*`（`lineHeight` 除外）出 `token-kind-unmapped`。两表读回的交叉判定见 §7.1。

### 裁决四值与 lossy

`accept` / `reject` / `defer` / **`omit`**，加 `null`（pending 仍用未填表达，不是第五个枚举值）。

- `defer`：这次不迁，字面量留下，**以后还会再来**。
- `omit`：资产里根本没有这个值，承认缺口，**这一处到此为止**。因此只许零候选行用。
- **两者在生成侧的门上等价**：都算已背书（不进残余字面量的漏网名单）、都不进兑现率的分子分母。
  差别只有回灌这一侧的 `omit-with-candidate` 合法性检查。**这句话必须写出来**，免得有人以为
  `omit` 多守了一道门。

`lossy` 是 **accept 行上的旗标**，不是第五个裁决值。Markdown 九列，它在「裁决」与「备注」之间；
空即否，填「是 / y / yes / true / lossy」为真，其余读不懂就阻断，不猜。维度没有近义匹配，所以
lossy 目前只可能出现在字体栈行。

Markdown 九列固定，表头逐字如下：

```markdown
| id | 源值 | 类目 | 处数 | 候选 token | 选中 token | 裁决 | lossy | 备注 |
| --- | --- | --- | ---: | --- | --- | --- | --- | --- |
| tm-radius-1a2b3c4d | `8px` | radius | 2 | `dimension.radius.1` → `--dimension-radius-1` | | | | |
```

回灌**十一种阻断、三种报警、一种 pending**，报警落 `warnings[]`、不进 findings、不影响退出码：

| 情况 | 处置 | 理由 |
| --- | --- | --- |
| 裁决列空 | 记 pending，退 0 | 刚生成的报告整列都空 |
| 枚举外的值 | **阻断** `verdict-unknown` | 读不懂就不猜 |
| id 认不出 | **阻断** `row-id-unknown` | 这份裁决对的不是眼前这份产物 |
| 同一 id 两行、裁决不同 | **阻断** `row-id-duplicate` | 冲突没有合并规则 |
| lossy 格填了读不懂的字 | **阻断** `lossy-unknown` | 与裁决列同一条纪律：不猜 |
| `omit` 但该行有候选 | **阻断** `omit-with-candidate` | omit 的意思是「资产里没有这个值」。有候选还 omit 就是拿它当免检咒语——那时的正路是 accept 换过去或 defer 留着 |
| `accept` 但该行无候选 | **阻断** `accept-without-candidate` | 承诺一件没有落点的事，兑现率门只能整片报漏做。无候选行的出路是 `omit` 或 `defer`——这正是 `omit` 存在的位置 |
| `accept` 但「选中 token」空着 | **阻断** `accepted-token-missing` | 不填执行方只能猜 |
| 「选中 token」不在该行候选里 | **阻断** `accepted-token-unknown` | 只认 `→` 右边那一串变量名 |
| 非 `accept` 行填了「选中 token」 | **阻断** `accepted-token-unexpected` | 给执行方一份没有承诺的指令 |
| `accept` 选中近义栈却没标 lossy | **阻断** `lossy-required` | 近义栈视觉不等价，不标这笔拼并在报告里看不出来，而报告正是人复核的唯一入口 |
| 标了 lossy 却不是「accept 近义候选」 | **阻断** `lossy-without-near` | 给一次等价替换扣帽子，会让「有几处失真」这个数字失真 |
| 同一 id 两行、逐字相同 | 报警 `row-id-repeated`，退 0 | 复制粘贴不是分歧 |
| JSON 里有、表里缺行 | 报警 `row-missing`，退 0 | 人手删行按 pending 处理 |
| `accept` 选中 `primitive` 层候选 | 报警 `accepted-token-primitive`，退 0 | 与色表同理：判阻断会让只有 primitive 候选的行永远迁不动 |

同一行撞上多条时按病因取一条、不叠报，取法与色表同源：`omit-with-candidate` 与
`accept-without-candidate` 先于选中 token 那一族判（那两种是裁决本身不成立，填没填第六格不改变
结论）；`lossy` 两条在选中 token 认下来之后才判（要先知道选中的是哪个候选才谈得上近义与否）。

`--json` 输出形状 `{ verdict, mapKind, summary, rows, warnings, findings, peerMap }`，`mapKind` 恒为
`"type"`——生成侧 `lint-migration.mjs` 的 `--type-verdicts` 就认这一个字段区分两张表，把色表喂进去
会当场形状不合而阻断，反之亦然。**这份 JSON 里的 `omit` 与 `lossy` 两件事，生成侧准入会拿
`--before` 重算再判一次**（`type-verdicts-omit-with-candidate` / `type-verdicts-lossy-required`）：
准入只信封上验 id 集合与 `verdict: pass`，手写一份 `pass` 的信封本来能把这两条绕过去。回灌这一侧
判过不等于执行那一侧守住了。同色表：**不回写**那两份文件，人填的那份是输入；`--out` 与
`--read-back` 都不给是用法错误，退 1。

### 7.1 两表交叉判定（`maps-cross-blocked`）

**两张表必须一起 pass。** 判定落在 `scripts/lib/map-cross.mjs` 的 `crossCheckMaps()`，两个 CLI 在
`--read-back` 分支各调一次——**这是 CLI 侧接线的唯一入口**，卸掉任一处，`tests/maps-cross.test.mjs`
里真 spawn 的那几条当场转红。

**为什么不挂在旗标上（2026-09-04 改）。** T7 把交叉判定挂在可选的 `--peer-read-back` 上，而硬序步 5
走的是两张表各自 `--read-back`：于是默认路径上「色表 pass、非色表 blocked」照样退 0，这道门要堵的
静默绿原样还在，且旗标从未在测试里出现过——卸掉两个 CLI 的整段对表接线，176 条仍然全绿。**旗标是
一道空门：它防不住「忘了传旗标」。** 现在的接法是把对表当成 `--read-back` 的一部分自己去找：

| 对表读回件 | 处置 |
| --- | --- |
| 同目录取到（默认名 `value-map.md` / `type-map.md`，两张表由 `--out` 落在同一个目录） | 读回来交叉判：任一表 `blocked` → 追加 `maps-cross-blocked`，两边都退 1 |
| 取不到，但对表按同一份产物**重算有行** | **阻断** `maps-cross-blocked`（同一个 code，另一种 `reason`）。判据来自产物不是文件系统，所以挪走对表 md 绕不过去 |
| 取不到，对表重算**零行** | 不开口，退 0。零行表的读回必然 pass，跳过与读回等价 |
| `--peer-read-back` 显式给了、却指不到 | 用法错误，stderr `读不回对表：<路径>` 后退 1。显式指错路不许降级成「没有对表」 |

`--peer-read-back` 因此**不是开关**，只是对表不在同目录时的显式指路；它优先于同目录默认名。

「对表有行就必须给」这条与生成侧准入的 `type-verdicts-missing` 是同一个形状（那边也是拿 `--before`
重算，有行就必须给 `--type-verdicts`），不是本包新发明的严格度。

回灌 JSON 上因此多一个 `peerMap`：`{ mapKind, file, verdict }`，对表重算零行时为 `null`。它是留痕
项——**「没找到就放过」与「读了且是 pass」不能在报告里写出来一模一样**，否则接线掉了没人看得出来。
`combineMapVerdicts()` 仍是纯函数、可单喂两个结论对象（`tests/type-map.test.mjs` 那条 helper 用例
不动），但它已经不是 CLI 直接调的那一层。

## 8. 布局映射表的形状（`layout-map.mjs`）

**第三张表，不是前两张加列。** 决策单元是「源布局 × 用途」，落 `layout-map.json` + `layout-map.md`，
行 id 前缀 `lm-`，文档带 `mapKind: "layout"`。读面只有**产物**与资产的 `layout-envelope.json`
（外加 `tokens.json` 的 `breakpoints` 组），**一个字节的 trace 都不读**。

为什么另立一张：前两张表的行都是**一个可替换的字面量**，`accept` 的落点是闭集里的一个 `cssVar`；
布局越界没有这个形状——7 列换不成一个 token，「首层不是 navbar」压根不是一个值，候选来源也不是
闭集而是包络。而且本表多两列是那两张不需要的：**档位**与**建议**。`value-rows.mjs` /
`type-rows.mjs` 因此**一个字节都不动**（那两份与生成侧有逐字同源锁）。`max-width` 归本表不归非色表，
正是 §7「射程」那张表里「布局尺寸不是主题量」那一行留出来的口子，两张表不重叠。

### 档位三档，硬度不同，不许混读

| 档位 | 意思 | 硬度 |
| --- | --- | --- |
| `blocking`（阻断层） | 撞包络 `blocking[]` 某条的 `counterexampleRule` | 硬。判它的门在 `lint-artifact`，本表只列不判 |
| `advisory`（报警层） | 落在包络 `advisory[]` 的观测集合之外 | **不是违规**。报警层是观测的如实投影：不做判定、不参与退出码、不阻断任何东西 |
| `outside-envelope`（不在包络） | 该维包络根本没投影 | 判据在资产 `tokens.json` 的 `breakpoints` 组与生成侧 `breakpoint-lock`（无豁免），不是本表在裁 |

第三档不是凑数：**断点这一维包络里一条都没有**（`blocking` 七条 + `advisory` 八条逐条查过）。
写成 `advisory` 等于说「不阻断」，而 `breakpoint-lock` 无豁免；写成 `blocking` 等于给它安一个包络里
不存在的依据。两种都是假话。每行另带 `layerBasis` 一句，说清这一档从哪儿来。

**`container-width` 判成报警档是照包络原文来的**，不是本表放宽：取值集合出自
`blocking:contained-has-enumerated-max-width`，但那一条 `counterexampleRule` 原文写着「集合本身是
观测，两条方向性判断才是本条的判据」——判据只有「contained 必有宽 / full-bleed 必无」，而容器模式
产物侧读不出来。

### 射程（写死，不许让表看起来比射程大）

| 用途 | 源布局从哪来 | 依据 | 档位 |
| --- | --- | --- | --- |
| `breakpoint` | CSS `@media` 的宽度特性 px 值 | 资产 `tokens.json#breakpoints`（代表值 ∪ 该资产声明的 `aliases`） | 不在包络 |
| `container-width` | `@media` **之外**的 `max-width` px 值 | `blocking:contained-has-enumerated-max-width` 内的观测集合 | 报警层 |
| `columns` | `grid-template-columns` 轨道数 · `column-count` | `advisory:columns-pc` / `-tablet` / `-mobile` 三档并集 | 报警层 |
| `sequence-first` / `sequence-last` | 页级产物首 / 末个 `data-pattern` 层根 | `blocking:page-sequence-navbar-first-footer-last` | 阻断层 |
| `sequence-float-widget` | 序列里出现的 `float-widget.*` 层根 | `blocking:float-widget-never-in-sequence` | 阻断层 |

- **`@media` 不用来给列数分档。** 从 `(max-width: 900px)` 反推 pc / tablet / mobile 要一个阈值，
  而本轮硬约束写死「几何数字禁止人眼改，派生物同样禁止」。列数行因此拿**三档并集**比对，逐档观测
  原样列在「资产侧取值」里，分档由人看。
- **断点不设容差，改查资产自己声明的 `aliases`。** `1024` 档的 `aliases` 是 `[1023, 1024, 1025]`，
  所以 `(max-width: 1023px)` 这种整数补写法**由资产自己认领**。`900` 与 `901` 照样各自不匹配。
- **`@media` 里的 `max-width` 是该档内容宽，不是容器宽**（资产里是 `responsive.*.content_width`
  与 `container.max_width_px` 两个字段）。混用会把每条降档规则都报成越界——冻结夹具那份**合格**
  产物就有 `704px` / `344px` 两条。记进 `summary.outOfScopeValues` 的 `@media 内的 max-width` 一栏。
- **不判容器模式 / `merge_spacing_with_prev` / 涂色跳过 / 正文起手。** 产物侧读不出 `role`、
  `ownSurface` 与容器模式，**读不出来就不出行**，不靠型名猜。这四维归包络阻断门，不归本表。
- 只有**页级**产物（`data-pattern` 层根 ≥ 2）才出 sequence 行。`floor` / `none` / `multi-file` 都不出，
  且 `summary.sequence.scope` 必须写明是哪种——「没出行」与「这份产物压根不是页」要分得开。
  **本表按层根数猜粒度，是有意保留的，不是漏改**：两道包络门读 `trace.artifact.kind`，本表不跟，
  因为它的核心主张是「只读产物与包络、不读 trace」（§11 那三条断言），认 `kind` 就得给
  `layout-map.mjs` 加 `--trace`，那是推翻主张。代价照写：**只有一层的页在本表里分辨不出来**，
  `≥ 2` 层的楼层片段反过来被当成页照出 sequence 行——门与表在这一维上口径不同，而本表是报表
  不是门，阻断层行仍退 0。

### 候选只从包络取，取不到就写「无候选」

- `breakpoint` 与 `sequence-float-widget` **恒零候选**：前者包络没这一维，后者的出路是把该层从序列里
  摘出去而不是换一个值。两者的 `note` 各写各的理由，不共用一句「无候选」。
- `sequence-first` / `sequence-last` 的候选取自 `advisory:slot-combinations` 的
  `detail.combinations[].floorIds`——那一条 `sample` 是 51/51，是包络内**唯一一份完整层名册**。
  只取层名，不取该条目的任何观测数字。
- 数值候选按 `|差|` 升序、同距按值升序；层名候选按名升序。两次跑出来的表要逐字节可比。
- 包络里那个条目缺席时 `candidates` 为 `[]`、`assetValuesResolved` 为 `false`，并在
  `summary.envelopeRefs.missing[]` 与 Markdown「包络里取不到的条目」一节点名。**不拿别的维度顶上。**

### 双份产出与退出码

`id` = `lm-<usage>-<hex8>`，`hex8` 取 `sha256(usage + "\u0000" + normalizedValue)` 前 8 位，与前两张表
同一套派生法、同一个理由（用序号时删一行加一行，回灌就整份对不上）。行序
`[usage 在上表里的序号, normalizedValue, id]`；数值型用途按数值比，不按字典序。

Markdown **十一列固定**，人填区仍是右边三格（`选中值` / `裁决` / `备注`），`建议` 紧挨在它们左边。
表前有一段档位图例，表后三节：「本次扫描（零行不等于没扫）」逐用途给出扫到几个不同取值、进表几个；
「包络里取不到的条目」；「射程外的值（未进表）」。**「零行」必须能与「一个都没扫到」分开**，那一节
就是为此存在。

| 情况 | 退出码 |
| --- | --- |
| 出表成功（哪怕表里全是阻断层行） | `0` |
| 回灌读回、裁决全合法（哪怕三档行数都非零、报警一堆） | `0` |
| 用法错误（缺 `--asset` / `--artifact`；`--out` 与 `--read-back` 同时给或都不给；读不回） | `1` |
| 资产读不开（`precheckAsset` 那四份必读件） | `1` |
| **收不到产物** | `1`，`precheck.code` = `artifact-empty` |
| **读不开包络** | `1`，`precheck.code` = `layout-envelope-missing` / `-unparseable` / `-shape` |
| 回灌有阻断（裁决自身不成立，或对表 blocked） | `1` |

包络三个码**不合并**：缺件、解不开、形状不对是三件事，合并会让「资产没投影过包络」与「包络被改坏了」
在报告里长得一模一样。包络**先于产物读**——读不开就没有一条候选来源，出一张零行表等于把「没查」报成
「没问题」。反过来，**出表这一半，表里的行一条都不影响退出码**：报警层是观测投影不做判定，阻断层的门在
`lint-artifact`，出表只把越界写出来。回灌退 1 判的是「这份裁决自己不成立」，**不是**「这份产物越界」。

### 8.1 裁决回灌与「须另起创造模式重做该层」（`R4-09`）

出表把「选中值」「裁决」两格留空（Markdown 第 9 / 10 格），人填完走
`--read-back <layout-map.md> [--peer-read-back-value 路径] [--peer-read-back-type 路径] [--json 路径]`
读回。同前两张表：**`--out` 与 `--read-back` 互斥，两者都不给也是用法错误**（各退 1）；回灌
**不回写** `layout-map.md` / `layout-map.json`，人填的那份是输入。

`--peer-read-back`（单数那个名字）在本表**不收**：本表有两张对表，那个旗标指哪一张说不清，静默忽略
会让人以为对表指过路了，所以点名报错并退 1。

**裁决四值：`accept` / `reject` / `defer` / `recreate`**，加 `null`（未裁用未填表达，不是第五个枚举值）。

| 值 | 意思 | 只许用在 |
| --- | --- | --- |
| `accept` | 换成候选里那个值，「选中值」那一格绑定到具体候选 | `modeRequired: optimize` 且有候选的行 |
| `reject` | 这一处刻意留着 | 非 `blocking` 档的行 |
| `defer` | 这次不动，以后还会再来 | 任何行 |
| **`recreate`** | **须另起创造模式重做该层** | `modeRequired: create` 的行 |

**`recreate` 是本表独有的一档，本表也没有非色表那个 `omit`。**「建议」那一列写着「本模式做不到」的行
（`breakpoint` / `columns` / `sequence-first` / `sequence-last` / `sequence-float-widget` 五个用途）只能走它。
理由与那句建议是同一件事：布局建议里「合并两层 / 拆一层 / 包 wrapper / 改列数」这些动作要么动标签，
要么牵连内容条数与断点——改列数会让内容条数不对（`content-lock` 锁着文案的**有序序列**，3 列改 4 列就
多一个空格），也牵连降列行为（`breakpoint-lock` 不许碰 `@media`）。优化模式做不到。**没有这一档，那条
建议就是个死胡同**：人只能在 `defer` 与「假装 `accept`」之间选，而后者会让执行侧去干一件做不到的事。
本表不要 `omit`，是因为布局的零候选行（`breakpoint` / `sequence-float-widget`）不是缺口问题——它们的
出路本来就是重做，不是承认缺口就地收工。

**重做后整页跑 audit（`scripts/lint-artifact.mjs`），不是跑迁移门 `structure-lock`。** `structure-lock`
的前提是「这是一次主题迁移、结构本不该变」，拿它去验一次**批准过的**重做是用错了尺。这句话不只写在
报告里：它逐字进回灌 JSON 的 `recreateOrders[]`——每条重做指令带 `verifyBy: "lint-artifact"` ·
`notVerifyBy: "structure-lock"` · `verifyReason`（那句理由原文），另带该行的源布局、包络给出的候选与
那句建议。**两个字段必须同时在**：只写「跑 audit」的话，下一个人照旧会顺手跑迁移门——迁移门是主题
迁移的现成把手，而它的前提与一次批准过的重做正好相反。把该跑的与不该跑的都写出来，才叫指令。

**「重做的层真不真是那趟创造模式产出的」无法机检。** 沿用 `image-evidence` 那一档松紧：只验声称与实物
对不对得上，不假装能验流程真发生过。**不为它造新机制**——那种机制只能靠 trace 里的自述，而本表一个
字节的 trace 都不读。

回灌**十条阻断、四种报警、一种未裁**，报警落 `warnings[]`、**不进 findings、不影响退出码**：

| 情况 | 处置 | 理由 |
| --- | --- | --- |
| 裁决列空 | 记未裁，退 0 | 刚生成的报告整列都空 |
| 枚举外的值 | **阻断** `verdict-unknown` | 读不懂就不猜；枚举只有那四个 |
| id 认不出 | **阻断** `row-id-unknown` | 这份裁决对的不是眼前这份产物 |
| 同一 id 两行、裁决不同 | **阻断** `row-id-duplicate` | 冲突没有合并规则 |
| `modeRequired: create` 的行裁 `accept` | **阻断** `accept-needs-recreate` | 优化模式改不动它，accept 是承诺一件做不到的事。**这一条是 `recreate` 那一档的门牙**——没有它，「本模式做不到」那句建议仍可以被一个 accept 盖过去 |
| `modeRequired: optimize` 的行裁 `recreate` | **阻断** `recreate-not-required` | 反方向同样要挡：整层重做会动标签与文案，拿它去换一个 `max-width` 数字是代价换不回来的 |
| `blocking` 档的行裁 `reject` | **阻断** `reject-on-blocking-layer` | reject 声称「这一处刻意留着」，而 `lint-artifact` 那道门照样退 1，这个声称在这一行上不成立。出路是 `recreate` 或 `defer`——`defer` 不挡，它明说以后还会再来 |
| `accept` 但该行无候选 | **阻断** `accept-without-candidate` | 候选取自包络，一个都没有就是没有落点。出路是 `recreate` 或 `defer` |
| `accept` 但「选中值」空着 | **阻断** `accepted-value-missing` | 不填执行方只能猜 |
| 「选中值」不在该行候选里 | **阻断** `accepted-value-unknown` | 只认候选那一格里的那个数或那个层名。**数值行 `1128` 与 `1128px` 都收**（列数行另收 `3 列`）——候选那一格印的就是带单位的写法，人是从那一格抄过来的，单位由用途定死，收它不是猜 |
| 非 `accept` 行填了「选中值」 | **阻断** `accepted-value-unexpected` | 给执行方一份没有承诺的指令 |
| 裁了 `recreate` | 报警 `recreate-order-open`，退 0 | 这是一条**指令开出去了**的留痕，不是缺陷；报警文本里把「整页跑 audit、不是迁移门」再写一遍 |
| `accept` 的候选与本页那个值有差 | 报警 `accepted-value-delta`，退 0 | 这一步真改了几何，报表里记下来；不接受这笔改动的出路是改判 `defer` |
| 同一 id 两行、逐字相同 | 报警 `row-id-repeated`，退 0 | 复制粘贴不是分歧 |
| JSON 里有、表里缺行 | 报警 `row-missing`，退 0 | 人手删行按未裁处理 |

同一行撞上多条时按病因取一条、不叠报，取法与前两张表同源：**前三条判「这个裁决在这一行上压根不成立」**
（判据是行上已经写好的 `modeRequired` 与 `layer` 两列，不是现编的），`accept-without-candidate` 次之，
「选中值那一格填没填对」最后判——填得对不对不改变前者的结论。所以零候选又是 `create` 档的行（`breakpoint`
那两行）裁 `accept` 只报 `accept-needs-recreate`，**不**另报 `accept-without-candidate`。

`--json` 输出形状 `{ verdict, mapKind, summary, rows, recreateOrders, warnings, findings, peerMaps }`。
`summary` 比出表那份多两列：`byVerdict`（四值各几行）与 `recreateOrders`（开出几条重做指令）。
**三档行数都非零、四种报警都在，只要裁决合法就仍退 0**——报警层是观测投影，读成阈值即越界。

**三表交叉判定，单向。** 回灌恒判：默认取 `--read-back` 同目录的 `value-map.md` 与 `type-map.md`
（三张表由 `--out` 落在同一个目录），任一张 `blocked` 就追加一条 `maps-cross-blocked` 并退 1；两张都
blocked 出**两条**，不合并——报告要说得出是哪一张。对表取不到但按同一份产物**重算有行**同样阻断（判据
来自产物不是文件系统，挪走对表 md 绕不过去）；重算零行不开口，但 `peerMaps` 里**照样出一条**
（`verdict: null` · `rows: 0`），因为「零行所以跳过」与「读了且是 pass」在报告里必须分得开。判定落在
`lib/map-cross.mjs` 的 `crossCheckPeers()`，与前两张表的 `crossCheckMaps()` 共用 `resolvePeerReadBack()`
和同一个 `maps-cross-blocked` 码：**判据只有一套，形状有两套**（单数 `peerMap` / 复数 `peerMaps[]`）。
`crossCheckMaps()` 一个字节没动——它的 `peerMap` 形状被生成侧 `lint-migration.mjs` 读着。

**反过来色表 / 非色表不读布局表**，这是明写的单向，不是漏做：布局表重算要先读得开
`layout-envelope.json`。包络自 `R4-10` 起是**生成侧**准入必交件，而本包不跑准入（资产合不合格归采集侧
校验器），所以一份没投影过包络的资产照样递得进来。让色表回灌去重算布局行，等于把「这份
资产还没投影过包络」变成色链路退 1 的理由，而那件事与色值一个字都不相干。要谈对称得先在本包补一道
资产准入，那是另一件事。`tests/maps-cross.test.mjs` 有一条用例把这句话钉住：同目录摆一份
**已 blocked** 的 `layout-map.md`，两张表照样退 0 且 `peerMap` 仍是单数。

## 9. 自证

自证只认机检结果，自述不算。门退 1 时如实报，**不得把有阻断的产物报成合规**；本包不改产物，所以「修到退 0」是调用方的下一步。测试分工是硬的：

- **行为断言只用冻结 fixture**（`.agents/skills/page-theme-workspace/fixtures/fixture-lanyuan-lab`），不得改用真实站点资产——后者随重采漂移，一漂移测试就红，红的原因还跟被测代码无关。
- fixture 禁改，而它正是这几道门的**正例**（两条 `observed: false` 都带 `dontId` 且对得上；没有 `screenshots/`，所以正例 trace 不声称读图）。坏输入一律走「整份拷到临时目录再改一处」：门 (e) 删掉 `color.orange.1` 的 `dontId`、或把它改成 `DESIGN.md` 里没有的 id；(b) 删掉 §8 整节；`image-evidence` 另需往副本里装一张图并登记 `thumb`。**冻结 fixture 一个字节都不动。** 需要多页多型时才造合成资产，且一律从真实条目派生，**不手写精简形状**——手写的会随 schema 漂移，漂了测试还是绿的。
- 坏产物从合格产物**改一处**派生：手写的「近乎相同」在改判据时会漏同步一半，于是失败用例悄悄变成两处违例，而它本该证明「只这一处也会挂」。
- 「选中 token」那一族五条同理，坏输入从 `--out` 产出的那份 Markdown **改一格**派生：`accept` 行第六格留空（`accepted-token-missing`）；第六格填候选之外的名字（`accepted-token-unknown`）；给无候选那行裁 `accept`（`accept-without-candidate`）；`defer` 行填上第六格（`accepted-token-unexpected`）；`accept` 行选 primitive 那个候选（`accepted-token-primitive` 报警，退 0——fixture 的 `#0F7A6C` 四个候选里 `--color-teal-2` 就是）。手写一整份表会让「只这一格错」变成两处错。
- **非色表那十一条阻断同样从 `--out` 产出的那份 Markdown 改一格派生**，一条码一条会挂的输入，写不出会挂的输入就不准占一个码：给有候选的行裁 `omit`（`omit-with-candidate`）；给无候选的 `space` 行裁 `accept`（`accept-without-candidate`）；lossy 格填 `maybe`（`lossy-unknown`）；给字体栈行 accept 一个近义候选却把 lossy 留空（`lossy-required`）；给 accept 精确候选那行标上 lossy（`lossy-without-near`）。另五条与色表同形（`verdict-unknown` / `row-id-unknown` / `row-id-duplicate` / `accepted-token-missing` / `accepted-token-unknown` / `accepted-token-unexpected`），不复用色表的用例——两张表读的是两份不同的表头，共用用例证不了非色这一份真的接上了。
- **跨类目碰撞要有一条专门的用例。** 造一份闭集，让同一个 px 数值同时出现在 `dimension.lineHeight.*` 与 `dimension.radius.*`，断言 `border-radius` 那行的 `candidates` 里**没有**行高那一条。这是「另立一张表」这个裁断的唯一证据；这条一去，本表退化成色表加一列也没人看得出来。
- `tests/prose-invariance.test.mjs` 必须存在，断言同一份产物 + 同一份资产 + 两份仅在 trace 白名单**外**字段上不同的输入，两次 `lint-artifact.json` 序列化后字节相同。这是本包核心主张的唯一证据。
- **布局表那一侧另有一条同形断言**：同一个产物目录、同一个 `--out`，两跑之间**只有目录里那份 `generate-trace.json` 的内容变了**（另用 `--trace` 显式递一遍），`layout-map.json` 与 `layout-map.md` 双份字节相同，且产出里搜不到 trace 里的任何一个标记字。两跑不许各用各的临时目录——那样 `artifactRoot` 会不同，字节不等的原因就不再唯一。同条用例断言 `summary.rows > 0`：零行表的字节当然相同，证不了什么。另加一条扫源码的形状断言，`layout-map.mjs` 与 `layout-rows.mjs` 剥掉注释后不许出现 `trace` 字样。
- **布局表的包络输入不手写。** 用例把 fixture 整份拷到临时目录，在拷贝上跑采集侧真正的投影脚本 `build-envelope.mjs` 产一份出来，坏输入从这份真产出**改一处**派生（`blocking` 整键删掉、整份写成非 JSON），要造「没投影过」就把它删掉。手写一份精简包络会随 schema 漂移，漂了测试还是绿的；读 fixture 自带那份（`R4-10` 起它是准入必交件，所以 fixture 也有）同样不行——那样 schema 改动会在本族静默通过。
- **两条退 1 的路各有独占用例，且都断言「没落下那两个文件」**：收不到产物、读不开包络。反向那条同样要有——表里有阻断层行时 CLI 仍退 0，并断言 `summary.byLayer` 三档都非零，否则「本表是报表不是门」这句话没人守。
- **布局回灌那十条阻断同样从 `--out` 产出的那份 Markdown 改一格派生**（`tests/layout-readback.test.mjs`），一条码一条会挂的输入，写不出会挂的输入就不准占一个码：给列数行裁 `accept`（`accept-needs-recreate`，`recreate` 那一档的门牙）；给容器宽行裁 `recreate`（`recreate-not-required`）；给阻断层行裁 `reject`（`reject-on-blocking-layer`，同一行裁 `defer` 必须**不挡**，否则挡的就不是那个声称）；把包络的 `contained-has-enumerated-max-width#detail.maxWidthPx` 删掉再给容器宽行裁 `accept`（`accept-without-candidate`——这条要额外断言那一行的 `modeRequired` 仍是 `optimize`，否则病因会被前一条抢走）；选中值留空 / 填 `9999` / 给 `defer` 行填上（后三条）。`verdict-unknown` / `row-id-unknown` / `row-id-duplicate` 不复用前两张表的用例——三张表读的是三份不同的表头。
- **「报警不影响退出码」要有一条把四种报警凑齐的用例**：三档行数都非零（`byLayer` 逐档断言）、`recreate-order-open` + `accepted-value-delta` + `row-id-repeated` + `row-missing` 四码都在，`findings` 为空、退 0。缺了「三档都非零」那一句，这条用例证不出报警与档位无关。
- **重做指令要断言 `verifyBy` / `notVerifyBy` 两个字段的值**，不是只断言它存在：调包成 `structure-lock` 必须转红。这是「重做后整页跑 audit 而不是跑迁移门」那句话在产物里的唯一落点。
- **单向那条也要有用例**：同目录摆一份**已 blocked** 的 `layout-map.md`，色表 / 非色表照样退 0 且 `peerMap` 仍是单数（`tests/maps-cross.test.mjs`）。不钉住的话，下一个人会把它当成漏做的对称性顺手补上，而那会让「资产没投影过包络」变成色链路退 1 的理由。
