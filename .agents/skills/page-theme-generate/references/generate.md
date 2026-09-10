# 生成规程

开工必读。`SKILL.md` 定的是硬序与门，本文件定的是**每一步具体怎么做**。

资产字段的形状不在这里——那是资产自己的事，读 `scripts/vendor/page-theme-core/schemas/`
（DSL 见同目录 `shape-dsl.md`），要知道没有本包脚本时人工核哪几条，读**该资产自己的**
`README.md`。本包不跨包 import 采集侧的脚本，也不复制它的散文契约。

门射程外的构图取舍在 `composition.md`（构图 Don't / 新页读者四问 / 第一视口自检）：那份**一条门都
不加**，本文件里的判据、阈值、退出码不受它影响。

## 1. 先定三件事

| 项 | 规则 |
| --- | --- |
| 目标 variant | 必须显式定下来；`""` 表示 `default`。资产体检判「疑似多套设计语言」时**不得**用缺省，要让用户点名 |
| 楼层序列来源 | 原站已采过这一页 → 取 `patterns/index.yaml` 里该页的 `sequence`；`surface` 那一列随 scheme 分流（§4 第 7 条）：非 `custom` 丢掉，`custom` 原样留下。原站没有这一页 → 先在 `floor-index.json` 的 `skeletons` 里选型，全部型都装不下才走共现回退；`custom` 下每条参与计数的层都得手写 `surface` |
| 产物粒度 | 整页 / 单楼层 / 单组件。整页必读 `patterns/chrome.yaml`，单楼层与组件**不读** |

- **单层与组件产物受门最少、几何最自由**：不读 `chrome.yaml`；`sequence-approval` 整门不开口；
  `paint-consistency` 页级判据要 ≥ 2 个层根才触发。仍管着它们的是语法六门、`variant-lock` 三条与 `responsive-inheritance`。
- 读 `chrome.yaml` 时只取匹配目标 variant 的那条，无匹配回退 `default`。一页之内不得混用
  多个 variant 的页壳条目——混出来的页壳在原站任何来源里都不存在。
- `tokens.json` 与 `voice.md` 不按 variant 分叉，它们是 style-set 级派生物。
- 骨架型库是同一份东西的两个键名：采集侧 `patterns/index.yaml` 叫 `page_skeletons`，投影进
  `floor-index.json` 后叫 `skeletons`（形状同构，`observed_on` 投影时丢掉）。消费侧一律读后者。
- 「没有对应型」是机械判定：想要的 taxonomy 不在该型 `steps` 里。全部型都装不下时**不得硬失败**
  ——走共现回退出一条提案；提案里没有型可用的那几步按形态缺口处理，只用资产已有的 token 与节奏。
- 骨架选型与共现回退产出的序列**永不是** `high`，一律当候选：出页前必须先出大纲由用户拍板，
  trace 记 `sequence.approvedBy: "user"` 与被拍板的 steps，否则 `sequence-approval` 挡下。

## 2. 取用粒度

资产是给人和 agent **查**的，不是给你整盘读进上下文的。整盘读入的代价不只是 token：一份
被完整灌进来的 `tokens.json` 会让后面每一步都在「我记得好像有这个值」的模糊里做决定，
而查表做出的决定可以指着说是从哪一行来的。

1. 先读资产 `README.md`，它是入口。
2. `DESIGN.md` 默认只读 Overview 与 Don't 两节；做色 / 字 / 形时再打开对应节。
3. `patterns/index.yaml` 只取节奏、目录指针，以及**目标页的序列来源一项**。生成段不得预加载
   全站所有页的序列，也不得把全部骨架型灌进来；大纲阶段的共现统计是本条唯一的例外，它按下面
   那两段只取全站的 **taxonomy 一列**，不取任何构图字段。
4. 楼层文件只打开序列里的内容楼层。
5. `voice.md` 只在本页有文案槽时读，只取本页用到的槽与禁词；示例文案全文不得预加载。
6. `tokens.json` 只取本页将用到的 semantic / component 路径。引用组根值必须写成带
   `.$root` 的路径，只写到组名不构成可用 token 引用。
7. 截图经 `screenshots/index.json` 寻址后逐张取，不得无索引扫目录。
8. `raw/`、`run-meta.json`、`input/design-system/` 原文、`holdout.yaml` 一律不进生成上下文。
   留出页不得当临摹稿——它存在的全部意义就是没被你看过。

**大纲阶段读两份，各有取用面。** `floor-index.json` 出型目录（选型所需的 `taxonomy` / `variant` /
`container` / `density` / `slots` / `contentCount`，以及大纲三列要的 `labelZh` / `summary`）、骨架型库
与节奏；`patterns/index.yaml` 只取 `taxonomy_layers`（词表闭集）与 `pages.*.sequence` 的
**taxonomy 那一列**（已采页序列与共现统计）。两份都不逐篇打开 `patterns/{id}.yaml`。

不要写成「大纲阶段只读 `floor-index.json`」：页级序列与共现统计只存在于 `pages.*.sequence`，投影
函数不投 `pages`，而 `FLOOR_INDEX_SHAPE` 禁止未知键，所以也不能私自补进那一份。共现只取 taxonomy
一列，不是「预加载全站构图」——构图字段在 `floor-index.json` 里已经有了。

## 3. 变量名与色值

- 变量名查 `closed-set.json` 的 `cssVar`；该条带 `alias` 时写 `var(--aliasVar)`。
- 该条带 `resolveError` 时**没有可用值**，按值缺口处理，不得把 `resolveError` 当成一个值。
- 产物里不出现任何色值字面量，包括复合值里嵌的（`border` / `box-shadow` / 渐变）。
- 字体族走 `var()`；确需字面写时，每一个族名都必须是资产声明过的。
- 圆角、间距（`padding` / `margin` / `gap` 一族）与描边宽同样只写 `var()`，名字同样查闭集：门十一
  `type-literal` 扫这三类的 px 字面量。`0` 与关键字不进射程；轨道尺寸（`grid-template-columns` /
  `width` / `max-width`）是布局量不是主题量，压根不在白名单。
- 颜色默认取 semantic 层。primitive 是调色盘不是用色决策，component 只在资产已观测过该
  控件时用。

## 4. 楼层涂色

**不要逐层预存「这层该涂什么」**，那个值没有定义。涂色末行是「已参与交替的楼层个数」取模
表面色池，而跳过的层不占计数——同一个楼层排在不同序列里、或前面多跳过一层，算出来就是不同
的底色。所以「应涂色」是整条序列的函数。

七条做法，`paint-consistency` 门检的就是产物真的走了这七条：

1. **不预存。** 任何地方都不写「这层该涂什么」：不写进楼层选型索引、不写进 trace、不写进产物的
   注释。要知道某层底色，只有一条路——把整条序列跑一遍。
2. **执行体只有一个**：vendored core 的 `paintSequence(steps, rhythm)`，整条序列进、整条涂色出。
   纯函数，同一份资产 + 同一条序列必得同一份输出。不照散文手算一遍，也**不复用采集侧的
   `paint-sequence.mjs:69`**——跨包 import 被禁，且它把手写 `surface` 原样传进算法：非 `custom` 时
   第 7 条禁这个、`custom` 时第 7 条要这个。本包从 `scripts/vendor/page-theme-core/` 引。
3. **`rhythm` 取 `floor-index.json` 的 `rhythm`，直接喂。** 那份是投影时归一过的
   （`scheme` / `surfaces` / `skipRoles` / `skipTaxonomies`，camelCase）。**不得**再对它调
   `normalizeRhythm`：那个函数吃的是 `patterns/index.yaml` 的 snake 形状，喂投影后的形状会把
   `skipRoles` 读成空数组、把 `skipTaxonomies` 悄悄换回默认的 `["hero", "footer"]`（`skip_taxonomies`
   缺席就走默认分支，所以资产改过这一列的话会被改回去），跳过裁定整片翻转，而且一声不响。
4. **每条 step 的 `role` / `taxonomy` / `ownSurface` 一律从资产取**：`floor-index.json` 里该型那一行的
   `role` / `taxonomy` / `paint.ownSurface`。不从 trace 上的同名字段取，也不按自己的判断填——
   `taxonomy` 决定跳不跳，让产物侧自报等于把跳过裁定的开关交给被检的一方。
5. **跳过层保留 resolve 后的 surface**，不改成交替池里的值。这是 `paintSequence` 的既有行为：
   `transparent` / `image` 硬跳过；`role ∈ chrome/overlay`、`taxonomy ∈ hero/footer` 默认不占计数，
   且这两份名单可被资产的 `skipRoles` / `skipTaxonomies` 改写。
6. **两侧的 `paint` 段同一条口径：只存算法输入与跳过裁定。** `floor-index.json` 的 `paint` 段如此，
   trace 的 `paint` 段也如此（形状见 §6）。**不写 `surface` / `n` / `decidedBy`**——三个都是算法输出，
   写进任何一份纸面就是把第 1 条禁的那个预存值换个地方存回来。
7. **`surface` 那一列随 scheme 分流。** 非 `custom`：不得手写——它改变 resolve 结果，可能连带改掉跳过
   裁定；资产侧合法带它（`SEQUENCE_ITEM_SHAPE` 闭集枚举），抄进 trace 与喂算法前都**要丢掉**，留着
   算法走 `decidedBy: handwritten`，重算的就不是资产口径。`custom`：那一列是**页级观测**，是重算的独
   立信源——抄已采页留下，新页每条参与计数层必须手写，缺则 `paint-recompute-failed`（`custom-surface-missing`）。

**产物侧要写成门读得到的形状。** 两件事：每个楼层根带 `data-pattern="<型 id>"`（型 id 即
`floor-index.json` 的 `floors[].id`，也是序列条目的 `pattern`）；该层底色写成层根类选择器上的一条
`background-color: var(--color-surface-*)`。比较只走一个方向——**产物侧的变量名 → 闭集反查 →
取 `path` 为 `color.surface.<X>.$root` 的那个 `X`**，再与重算结果比字符串。不从期望的 surface 名拼
`--color-surface-<X>`：那正是形状门禁止的派生，而派生错了不报错。

**混搭一致性门的 code。** 顺序即下表行序：先输入与粒度（`no-input` / `artifact-kind-missing` / `page-sequence-missing`），
再对位（哪一层是哪一层），再跑前置（形状与重算），再比产物侧底色（主判据），最后拿 trace 交叉核。
findings 按序列位置升序、同位置按表内行序。

| code | 判据 | 一条会挂的输入 |
| --- | --- | --- |
| `no-input` | 调用方没传 `html`（`undefined` / `null`，不是空串）。缺输入写 `no-input`，不与「层根缺属性」混。空串是空文档 | 直接调 `runAllGates` / `gatePaintConsistency` 漏传 `html`，却带了页级 sequence |
| `artifact-kind-missing` | 给了 trace，`trace.artifact.kind` 缺席或不在 `page` / `floor` / `component` 内。判不出粒度就不放行，**不许退回按层根数猜**。压根没传 trace 是另一件事，本码不开 | trace 的 `artifact` 只写了 `html` 与 `css` 文件名 |
| `page-sequence-missing` | `trace.artifact.kind` 是 `page` 而无 `trace.sequence`。**层根只有一个也照报**——粒度是声明的，不是数出来的；声明 `floor` / `component` 的产物多少层都不报 | `kindTrace('page')` 配只有一层 hero 的产物 |
| `floor-pattern-attr-missing` | 序列里某条的 `pattern`，在产物 HTML 里一个 `data-pattern` 都对不上 | 合格页夹具（hero + feature×2）删掉 hero 那层的 `data-pattern` |
| `floor-pattern-attr-count` | 对上了，但该 id 的 `data-pattern` 出现次数 ≠ 序列里该 id 的条目数。次数相等时，按 DOM 内该 id 的第 k 次出现对上序列里该 id 的第 k 条。**只停该型的所有步**，别的型照比 | 序列排两个 `feature.grid-3-cards`，产物只放一层 |
| `floor-not-in-sequence` | 产物里某个 `data-pattern` 的值不在本次序列里：多出来的那一层不受本门管，而它在真实页面里会改掉整条交替计数 | 序列 `[hero, feature]`，产物多插一层 `data-pattern="cta.centered-band"` |
| `step-surface-handwritten` | `sequence.steps[i]` 上出现 `surface` 键，**值是什么都不看**（第 7 条）。**只在资产 `rhythm.scheme` 不是 `custom` 时开口**——`custom` 那一列是观测 | 已对齐的合格页序列某一步上写出 `surface` 键（整份抄 home 序列会同时亮对位码，验不出本码独占） |
| `step-pattern-not-in-asset` | 序列里的 `pattern` 不在 `floor-index.json` 的 `floors[]` 里：`role` / `taxonomy` / `ownSurface` 三项取不到。该步及其后的层不比对底色与 skip，**前面的合法层照常比**。**`synth:` 前缀的合成型不在此列**——它本来就不在 `floors[]` 里 | 序列末尾写 `pricing.table-3`，并在它之前的合法层涂错：同时亮本码与 `surface-mismatch` |
| `paint-recompute-failed` | `paintSequence` 抛 `PaintError`；`finding.code` 固定为本行名，`PaintError.code` 写入 `finding.paintError`（不覆盖 `code`，否则表内这个名字对不上）。**整条停**，所有层的 `surface-*` 与 `paint-skip-mismatch` 本趟不报 | 合成资产把 `rhythm.surfaces` 写成 `[]`，并让 `trace.paint.rhythm.surfaces` 同步为空（只改资产还会亮 `paint-rhythm-mismatch`）；另一条：资产 `scheme: custom` 而某条参与计数的 step 没写 `surface` → `paintError: custom-surface-missing` |
| `surface-mismatch` | **主判据。** 该层产物侧读到的底色 ≠ 重算给该层的 `surface` | cta 打头的序列，cta 层照抄 `ownSurface: muted`，算法 `n=0` 给的是 `default` |
| `surface-unreadable` | 重算给了该层一个期望底色，产物侧一条可归属的 `--color-surface-*` 都读不到 | 把 cta 那层底色写进内联 `style=`——`scanHtml` 给内联声明的选择器是 `<section inline>`，N 层长得一模一样，无从归属 |
| `surface-ambiguous` | 该层根抽到的 `--color-surface-*` 候选去重后大于 1。门不解析级联，判不出哪条生效，保守报错。来源不限：类选择器、更具体的选择器、内联 `style`、`@media` 块；同选择器两条不同 var 是这条的特例 | `.pt-cta` 写对了 `--color-surface-default`，再用 `section.pt-cta` / 内联 `style` / `@media` 盖成 `muted` |
| `paint-record-missing` | `sequence` 在、`paint` 整块不在：没有它就没有可交叉核的那一半 | 合格页夹具的 trace 删掉 `paint` 整块 |
| `paint-record-output-field` | `paint.steps[]` 上出现 `surface` / `n` / `decidedBy` 任一：那是算法输出，写进去就是预存底色 | 合格页夹具的 `paint.steps[0]` 写出 `surface` |
| `paint-steps-misaligned` | `paint.steps` 与 `sequence.steps` 长度不等，或逐位 `pattern` 对不上 | `paint.steps` 少最后一条 |
| `paint-rhythm-mismatch` | `paint.rhythm` 与资产 `floor-index.json` 的 `rhythm` 不逐字相同（四个键逐位比） | `skipTaxonomies` 写成 `["hero"]`，把 `footer` 丢了 |
| `paint-own-surface-mismatch` | `paint.steps[i].ownSurface` ≠ 资产该型的 `paint.ownSurface`（两侧缺席都归一成 `null` 再比） | cta 那条写 `default`，资产是 `muted` |
| `paint-skip-mismatch` | `paint.steps[i].skippedBy` ≠ 重算的裁定。映射写死：`decidedBy` 为 `skip-role` → `"role"`、`skip-taxonomy` → `"taxonomy"`、`hard-skip-surface` → `"surface"`，其余（`alternate` / `monotone` / `custom`）→ `null` | hero 那条写 `null`（声称参与计数），重算是 `taxonomy` |

**为什么两头都比。** 只比 trace 不成立：产物和 trace 出自同一个 agent，可以被一起写错，那时 trace
内部自洽、交叉核全绿，门是纸面的。只比产物也不成立：trace 谎报跳过裁定时，产物这一次可能恰好蒙对，
放行的是下一条序列。所以主判据在产物侧（票面主语是产物），trace 那一半只防谎报。

**哪些序列真会出分歧。** 这不是测试细节，是混搭时该警觉的那几种排法——照抄 `ownSurface` 与算法结果
**碰巧相等**的排法占多数，用它们当失败用例，用例永远绿：

- home 的实测序（`navbar` / `hero` / `feature` / `cta` / `footer`）与大纲那条 `[hero, feature, cta]`，
  照抄 yaml 自带的 `surface` 恰好等于算法结果（`feature` 落 `n=0` → `default`、`cta` 落 `n=1` →
  `muted`）。**造不出分歧**。
- `cta` 打头（`[cta, …]`）：照抄是 `muted`，算法 `n=0` → `default`。分歧。
- 两个 `feature`（骨架 `sk-landing` 允许 `feature` 重复 1–2 次）：第二层照抄是 `default`，算法 `n=1` →
  `muted`。分歧。

同一个型在一条序列里出现两次而底色不同（上面第三种）时，**底色不得挂在两层共用的那个类上再用修饰类
覆盖**：两条规则都命中第二层，而门不解析级联，会报 `surface-ambiguous`。写法是共用类只管布局，底色各
挂一个只出现在该层的类（`.pt-feature-grid--default` / `.pt-feature-grid--muted`），一层恰好命中一条。
这条不是门的怪癖：没有行号、没有 specificity 计算时，「哪条生效」在纸面上确实判不出来，保守报错比猜
一条对得多。

**射程边界，逐条明写，不许让门看起来比射程大：**

- **比对只认两种命中**：规则块的选择器整体等于楼层根的某个类选择器（`.<类名>`），或
  `[data-pattern="<型 id>"]`。后代选择器、`:where()` 一律不算命中，不拿来当「这一层涂了什么」
  去跟重算比。
- **候选集合另收一层，去重后大于 1 即报 `surface-ambiguous`。** 来源不限：类选择器、更具体的
  选择器（`section.x`）、该层根自己的内联 `style=`、`@media` 块。同选择器两条不同 var 是这条的
  特例。门不解析级联，判不出哪条生效，拒绝认证而不是静默放行。**本模式下一层只许有一个底色
  声明；需要按断点换底色的，本门挡下来，属于已知代价而不是误报。**
- **prop 只取 `background-color` 与 `background`。** `background` 简写里嵌在渐变中的 surface 变量会被
  读成该层底色，门不解析简写分量。
- **只认本名那一列**：闭集条目的 `path` 形如 `color.surface.<X>.$root`，且产物引用的名字等于该条的
  `cssVar`。写 alias 名（多是色相族名）不算底色，那种写法另有 `primitive-leak` 挡。
- **`data-pattern` 只保证「能对上是哪一层」**，不保证那一层的 DOM 真是那个 pattern 的形状。构图不在本门，归 §5 第 1 条。
- **跳过层的期望底色是 resolve 后的 `ownSurface`**，不是交替池里的值。resolve 结果是 `transparent` /
  `image` / 缺席时**不比底色**（没有 `--color-surface-*` 可比），只核 trace 的跳过裁定。
- **`rhythm.scheme` 是 `custom` 时整门开口。** 期望底色取序列手写 `surface`（页级观测），产物必须对上；
  参与计数层缺手写报 `paint-recompute-failed`。换成 `custom` 却让门闭嘴，等于涂色对不对整件事无人检查。
  `scheme` **只看资产** `floor-index.json` 的 `rhythm.scheme`，只在 trace 里写成 `custom` 关不掉本门，还会
  亮 `paint-rhythm-mismatch`。冻结 fixture 是 `alternate-muted`、现役资产是 `custom`，两条通路都在射程内。
- **`sequence` 整块不写、或压根没传 `--trace` 时不开口**，与 `sequence-approval` 同构。**例外两条：**
  `artifact.kind` 是 `page` 而无 `sequence` 报 `page-sequence-missing`；给了 trace 却读不到闭集内的
  `kind` 报 `artifact-kind-missing`。**粒度只信声明，不数层根**（§4.3）。`generate-trace.good.json`
  声明 `floor` 且无 `sequence`，是这一支的基线；`assetDir` 缺席时同样不开口，而 `lintFloor` 一定带
  资产，真实通路上门在。
- **html 未提供**（`undefined` / `null`）写 `no-input`，不得报成 `floor-pattern-attr-missing`。
  空串是空文档，按空文档判。`runAllGates` / `gatePaintConsistency` / `checkPaintConsistency`
  都不得给 `html = ''` 缺省——那会把「没传」与「传了空文档」揉成一件。
- **三处停手，吞噬范围不同。** `data-pattern` 缺席或次数对不上时，只停**该型**所有步的产物侧
  `surface-*`，别的型照比。第一个不在资产里的型只停**它自己及其后续层**的底色与 skip 比对，
  前面的合法层照常比（`step-pattern-not-in-asset` 仍照报）。`paintSequence` 抛错则**整条**不重算，
  所有层的 `surface-*` 与 `paint-skip-mismatch` 本趟不报。门仍阻断，但涂色错被挡住的那一段本趟
  不报——修完对位 / 换掉未知型 / 重算能跑再跑才会亮。这不是豁免，是「没有可对的层 / 没有可算
  的期望」时没有底色可比。
- **仍看不见的假阴性：** 同选择器后一条 hex、JS 运行时、背景图盖住底色。hex / primitive 若是该层
  唯一底色，报的是 `unreadable` 不是 `mismatch`。类选择器写对了再用更具体选择器 / 内联 / `@media`
  盖成别的 `--color-surface-*`，不再是假阴性——报 `surface-ambiguous`。

**实现落点。** 四套改动理由拆成四个模块：`scripts/lib/paint-floors.mjs`（解析层根 / 对位）、
`scripts/lib/paint-surface.mjs`（产物侧底色反查）、`scripts/lib/paint-recompute.mjs`（非 `custom` 丢掉
手写 `surface` 后喂 `paintSequence`，`custom` 保留）、`scripts/lib/paint-check.mjs`（编排与 trace 交叉核）。
`gates.mjs` 只加一个薄壳 `gatePaintConsistency()` 与 `runAllGates` 数组里那一行。`gates.mjs` 是
audit 逐字抠源文本的那份文件，越薄越不容易撞上那条锁；「解析 HTML 取层根」与「按闭集反查底色」
各自单测。新模块同样受两道形状门管：不许拼 `--` 开头的名字，不许引第三方包。

### 4.1 目标 variant 锁（`variant-lock`）

**`variant-undeclared` / `variant-unknown` / `source-id-*`：** 有 `trace` + 可读 `coverage` 即开口（单层楼层也会判）。
**`chrome-variant-mismatch`：** 只在产物出现页壳 `data-pattern` 时开口。`trace` 缺席时整门不开口，与 `sequence-approval` / `image-evidence` 同构。

判据源在 `scripts/lib/variant-lock.mjs`：读资产 `README.md` 围栏里的 `coverage`（体检结论与
`pages[].variant` 词表）与 `patterns/index.yaml` 的 `chrome` 挂载点（按 `hosts` 解析该 variant
该用哪条页壳）。**词表外的名字一律算未知**——采集侧按子域算 variant，不是可以现编的标签。

| code | 判据 | 一条会挂的输入 |
| --- | --- | --- |
| `variant-undeclared` | 体检 `coverage.cohesion.verdict = mixed-suspected` 而 `trace.targetVariant` 留空 | 华为云式资产 + 空 `targetVariant` |
| `variant-unknown` | 声明的 `targetVariant` 不在 `coverage.pages[].variant` 非空去重集合里 | 写 `about-light` 而词表只有 `agentorchard` |
| `source-id-undeclared` | `coverage.pages[]` 记着 `sourceId` 而 `trace.sourceId` 缺席或空串 | 华为云式资产 + 不写 `sourceId` 的 trace |
| `source-id-unknown` | 声明的 `sourceId` 不在 `coverage.pages[].sourceId` 非空去重集合里 | 写 `source-99` 而资产只采了十页 |
| `chrome-variant-mismatch` | 产物某 `data-pattern` 是页壳候选，却不是所声明 variant 在该挂载点解析出的那条 | 声明 `orchard` 却写 `navbar.utility-left` |
| `variant-source-unreadable` | 读 coverage 或 `patterns/index.yaml` 失败 | README 里 coverage 块 yaml 解不开 |

**抓不住什么：** 资产没有 `coverage` 那份 yaml 时（冻结夹具），`variant-undeclared` 不开口——判不出
不等于判为 `mixed-suspected`。产物顶栏没有 `data-pattern` 时零信号，与 `paint-consistency` 认层根
同一条口径。`coverage` 在而 `pages[]` 没记 `sourceId` 时，来源两条也不开口：没有权威集合就判不出
符不符，也没有可指名的东西可缺。**本门不判 `sourceId` 与 `targetVariant` 指的是不是同一页**——
那要求资产每页 variant 与 sourceId 一一对得上，是下一步的事。

trace 必须记录本次实际使用的 `targetVariant`（空串表示 default）与其来源 `sourceId`（照着哪条来源
URL 做的）。体检判 `mixed-suspected` 时不得用缺省代替显式声明；`sourceId` 一律不得用缺省。

### 4.2 缺观测继承（`responsive-inheritance`）

资产里 `responsive.<档>.grid.observed: false` 的档没有实测几何。产物用到该型时，trace 必须逐档声明，
字段挂 `floors[]` 那一层（缺测是「型 × 档」的事实，同一页不同层缺测的档不同）：

```json
"unobservedBreakpoints": [
  { "breakpoint": "tablet", "inheritFrom": "pc" },
  { "breakpoint": "mobile", "inheritFrom": null }
]
```

- **只登缺测档**：漏登报 `inherit-undeclared`，多登报 `inherit-breakpoint-observed`，两头都封——「三档
  全登一遍」不是出路。该型三档全有实测时整块不写。
- `inheritFrom` 是本型另一个**有实测**的档，或 `null`（不继承，本档没出任何断点相关的值，§5 第 2 条
  第三种）。**键缺席不等于 `null`**：选填字段等于没有字段，正是本仓库反复栽的那个坑。
- **射程由产物侧层根界定**（`data-pattern`，与 `paint-consistency` 同一条口径），不由 trace 自报——
  让被检的一方定射程，漏写一层就免检。

**本门不判继承得对不对。** 「窄档继承宽档读起来对不对」「该继承还是该 omit」「有没有往宽找」全是语义
判断，机器不接：`pc` 声明继承自 `mobile` 本门放行。它只判四件事——声明了没有、来源档存不存在、声明与
产物对不对得上、产物里的 `@media` 数值在不在资产的断点闭集里。

| code | 判据 | 一条会挂的输入 |
| --- | --- | --- |
| `no-input` | 调用方没传 `html`（`undefined` / `null`，不是空串）：没有产物就没有射程。不与「没声明」混 | 直接调 `gateResponsiveInheritance` 漏传 `html` |
| `inherit-pattern-unreadable` | 产物某 `data-pattern` 的型，`patterns/<id>.yaml` 与 `patterns/chrome.yaml` 里都取不到 `responsive` 记录：判不出缺不缺测就不放行。**`synth:` 合成型不在此列** | 层根写 `data-pattern="pricing.table-3"` |
| `inherit-synth-undeclared` | 合成型三档全无实测，trace 该层 `unobservedBreakpoints` 漏登某一档 | 产物 `synth:pricing.table-3`，trace 不写 `unobservedBreakpoints` |
| `inherit-synth-source-missing` | 合成型某档没有 `inheritFrom: { pattern, breakpoint }` 对象（键缺席、null、或仍是常规模型的档名字符串） | pc 档只写 `{ breakpoint: "pc" }` |
| `inherit-synth-source-invalid` | 继承源不是本资产里 `grid.observed: true` 的真实型档位 | `inheritFrom: { pattern: "feature.grid-3-cards", breakpoint: "tablet" }` 而 tablet 缺测 |
| `inherit-undeclared` | 该型某档 `grid.observed: false`，trace 该层 `unobservedBreakpoints` 里没有这一条 | 夹具 `feature.grid-3-cards` 的 tablet 改成 `grid: { observed: false }`，trace 不动 |
| `inherit-breakpoint-observed` | 登的档在资产里不是 `grid.observed: false`。三档外的名字同判——那种档资产里压根没有 | 冻结夹具三档全有实测，trace 仍登一条 tablet |
| `inherit-source-invalid` | `inheritFrom` 不是本型另一个有实测的档：键缺席 / 非三档名 / 指向自己 / 指向同样缺测的档，四种同判 | tablet 与 mobile 都缺测，mobile 登 `inheritFrom: "tablet"` |
| `inherit-floor-absent` | trace 登了某型的缺测档，产物里一个同名 `data-pattern` 层根都没有 | 单层夹具的 trace 给 `cta.centered-band` 登一条 |
| `breakpoint-map-unreadable` | 产物有 `@media` 宽度条件，而资产 `tokens.json` 的 `breakpoints` 组（合同 §3.8）缺席 / 读不出一个整数：判不出就不放行 | 夹具拷贝里删掉 `breakpoints` 组 |
| `breakpoint-value-unmapped` | 产物 `@media` 里的宽度值不在资产断点闭集（代表值 ∪ `aliases`）内。读不出 px 的写法（`63.9375em`）同判 | 夹具 CSS 的 `@media (max-width: 1023px)` 改成 `900px` |
| `inherit-null-media-written` | 某档登了 `inheritFrom: null`（本档不出任何断点相关的值），产物却有一条**只划这一档**的 `@media` | mobile 缺测且登 null，而夹具 CSS 里有 `@media (max-width: 767px)` |

- **断点数值那一半查的是资产 `tokens.json` 的 `breakpoints` 组**（T6 起），不是散文。该组把每个声明值
  连同它的 `aliases` 与 `slots`（这个值划哪几档）一起写死，所以 `(max-width: 767px)` 与代表值 768 同待遇。
  生成侧**不派生断点**，与色值同一条纪律：一律查表，查不到就是这站没在那个宽度上换过布局。
- **档映射有歧义时不判 `inherit-null-media-written`**：只在某值的 `slots` 恰好只有一档时开口。同时划两档的
  值（华为云 768 既是 mobile 上沿又是 tablet 下沿）判不出这条 `@media` 写给谁——判不出就不猜，也不两档都报。
- **`@media` 里的规则内容一概不判**：某档该不该有断点样式、写了几条、写得对不对，全不在射程。
- `trace` 或 `assetDir` 缺席时整门不开口，与 `sequence-approval` / `variant-lock` 同一个已知洞。
- 同一档登两条时逐条验、按「登过没有」算覆盖；两条源档互相矛盾不判。

**合成型身份（`synth:` 前缀，R4-08）。** 原站不存在的页型用 `data-pattern="synth:pricing.table-3"`，
不在 `floor-index.json` 的 `floors[]` 里，**不得写回 `patterns/`**（投影脚本不区分采来的与人写的，
写进去会变成下一轮包络的「观测证据」——机检落点：`findSynthInPatterns()` / `tests/synth-identity.test.mjs`）。
trace 里 `floors[].id` 与产物 `data-pattern` 同写带前缀的 id；三档全无实测，每档必须声明：

```json
"unobservedBreakpoints": [
  { "breakpoint": "pc", "inheritFrom": { "pattern": "feature.grid-3-cards", "breakpoint": "pc" } },
  { "breakpoint": "tablet", "inheritFrom": { "pattern": "feature.grid-3-cards", "breakpoint": "tablet" } },
  { "breakpoint": "mobile", "inheritFrom": { "pattern": "feature.grid-3-cards", "breakpoint": "mobile" } }
]
```

`inheritFrom` **必须是对象**，须指向某个 `grid.observed: true` 的真实型档位；留空即退 1。
门会真的去读 `patterns/<pattern>.yaml` 核实该档 `observed: true`，不是只查字段非空。
包络门（§4.3）用继承源连回真实型记录判型级四维；**两侧都须把 trace 传给 `checkLayoutEnvelope`**：
generate 侧 `gateLayoutEnvelope`（`scripts/lib/gates.mjs:773`），audit 侧 `lint-artifact` 自 `R4-14`
起经 `wrapLayout` 传到（`page-theme-audit/scripts/lib/gates.mjs:576` 定义 / `:606` 调用），四个入参键由
该包 `tests/copied-layout-envelope-wiring.test.mjs` 静态 + 行为两层锁住。哪一侧漏传，合成型层根就在
那一侧报 `synth-inherit-unreadable`——判据字节相同也会分家，靠的是入参锁不是纪律。

### 4.3 布局包络（`layout-envelope`）

资产根 `layout-envelope.json` 由采集侧投影产出（不得手写），分三层：`blocking` 反例为零，是硬约束；
`demoted` 出过反例已被降级；`advisory` 是观测集合的如实投影。**本门只吃 `blocking`**，另两层一个字不读。
判据整份在 `scripts/lib/layout-envelope-gate.mjs`，**与 page-theme-audit 那份逐字节相同**——只在生成侧
跑等于自由构图自产自检。判据集合跟着资产走：包络里有几条 `blocking` 就判几维，出现本门没实现的规律
id 报 `envelope-rule-unimplemented`，不静默少判一维。

| code | 判据 | 一条会挂的输入 |
| --- | --- | --- |
| `envelope-unreadable` | 包络解不开 / 没有数组形状的 `blocking` / 某条规律的 `detail` 形状不认得 | 把 `layout-envelope.json` 截断成 `{` |
| `envelope-rule-unimplemented` | 包络阻断层里有本门没有判据的规律 id | 往 `blocking` 里加一条 `future-rule` |
| `floor-index-unreadable` | 有需要型记录才判得动的规律，而 `floor-index.json` 读不出 `floors[]` | 把 `floor-index.json` 截断成 `{` |
| `floor-pattern-unknown` | 产物层根的型在资产 `floors[]` 里查不到 | 层根写 `data-pattern="pricing.table-3"` |
| `synth-inherit-unreadable` | 合成型层根：没传 trace、trace 无继承源对象、或继承源不是 `observed: true` 的真实型档位 | 产物 `synth:pricing.table-3` 而 trace 缺 `unobservedBreakpoints` |
| `artifact-kind-missing` | 给了 trace，`trace.artifact.kind` 缺席或不在 `page` / `floor` / `component` 内。页级两维（首末、正文起手）判不出粒度就不判，也不猜 | trace 的 `artifact` 只写了 `html` 与 `css` 文件名 |
| `container-mode-out-of-envelope` | 产物用到的型，其 `container.mode` 不在包络 `detail.byMode` 列出的模式内（`container` 缺席同判） | 把 `feature.grid-3-cards` 的 mode 改成 `breakout` |
| `container-width-out-of-envelope` | `contained` 的型缺整数 `maxWidthPx`，或 `full-bleed` 的型带了 `maxWidthPx` | 删掉产物用到那型的 `maxWidthPx` |
| `merge-spacing-with-prev` | 层根自己的顶外边距是负值——把本层并进上一层 | `.pt-feature-grid { margin-top: calc(-1 * var(--dimension-spacing-2)) }` |
| `page-shell-out-of-order` | 在场的 `navbar` 型层根不在首位、或 `footer` 型层根不在末位。**不看粒度**：片段里的错位顶栏照开，修法同样是重排 | 把顶栏插到首屏后面 |
| `page-shell-ends-missing` | `artifact.kind` 是 `page`，首层 taxonomy 不是 `navbar` 或末层不是 `footer`（`R4-13`） | 整页忘了写页脚 |
| `float-widget-in-sequence` | 层根是 `float-widget` 型（taxonomy 或包络 `floatWidgetFloors` 点名的 id） | 页里插一层 `data-pattern="float-widget.service-rail"` |
| `body-start-out-of-envelope` | `artifact.kind` 是 `page`，跳过 `role ∈ chrome / overlay` 之后的第一个层根，taxonomy 不在包络 `detail.byTaxonomy` 列出的开场型内 | cta 打头的整页 |
| `paint-skip-out-of-envelope` | 按包络三个跳过集合重算的「这型跳不跳」，与资产 `paint.participatesInCount` 不一致 | 把 hero 那行的 `participatesInCount` 改成 `true` |

- **包络是准入必交件，本门走不到「缺席」那一支。** `layout-envelope.json` 自 `R4-10` 起在
  `admit-asset.mjs` 的 `REQUIRED_FILES` 里（第九份），缺它准入即 `incomplete` / `reject`，而
  `lint-floor` 的前提是准入退 0。门里那一支（`no-input`）只在本门被直调时还有意义，留着是为了
  不在门里私造第二套准入——**它不是「缺席也算合规」的降级路径**。缺席的修法是补投影一次
  （`node scripts/build-envelope.mjs --asset-dir <资产目录>`，采集侧脚本，从 `patterns/` 直算、
  不起浏览器、不碰人拥有的输入），不是重采。包络在而读不动，则一律阻断：判不出就不放行。
- **容器宽那一维只判两个方向**：`contained` 有宽、`full-bleed` 无宽。宽度值落不落在包络枚举出的集合里
  一个字不问——包络自己写着「集合本身是观测」，拿观测集合当允许值清单就是把报警口径塞进阻断层。
- **单层内部几何一概不判**：列数、排列方向、模块顺序、间距大小归 §5 第 1 条的自由度。本门只判
  「用了哪些型、排成什么序、容器怎么声明」。
- **型级四维的反例只可能来自资产漂移**：型记录出自资产，产物只能引用它。这四维挡的是「包络与
  `floor-index.json` 已经对不上了，产物还在照用那几型」；资产内部那份对不上归采集侧 `envelope-out-of-sync`。
- **粒度只信 `trace.artifact.kind`，不数层根。** 开场与首末两维只在声明 `page` 时判：1 个层根的页照
  判，5 个层根的 `floor` 片段一条不开。层根数当粒度两头都错——多层片段挨误伤、1 层的页漏网。
- **抓不住什么**：**没给 `--trace` 时页级两维整块不判**（`--trace` 是可选旗标，把「没给」判成越界是改
  契约），代价是**不带 trace 的整页忘了写页脚，本门抓不到**；**声明与产物打架不判**——`kind: "floor"`
  写在 5 层整页上、`kind: "page"` 写在 0 层根上，今天都没有码；顶外边距只认层根自己的类选择器与
  `[data-pattern]`，内联 `style=`、后代选择器、`position: absolute` / `transform` 造成的重叠一概不算；
  `patterns/{id}.yaml` 不读，第三维判的是产物侧负顶外边距而不是资产字段。

## 5. 响应式：几何自定，断点查表

1. **单层内部几何由 agent 定**：列数、排列方向、模块顺序按本页内容逐层定，不套站级默认栅格。资产该
   档 `responsive`（`patterns/{id}.yaml`）是可查的依据，**不是必须复制的模板**——153 档几何里 84 档
   `observed: false`，照抄等于把缺测当实测。自由度只在**单档内部**，跨档降列归第 2 条。**型身份与色 /
   字 / 底色仍受门约束**：`data-pattern` 必须是资产 `floors[]` 里的型 id、底色由 `paintSequence` 重算
   比对（§4）、色值与字体族查闭集（§3）；字号 / 圆角 / 间距 / 描边宽同样只引资产 token。
   · **自由排时查 `layout-envelope.json`**（资产根，采集侧投影产出）。`blocking` 是硬约束，门
     `layout-envelope`（§4.3）逐条判，退 1；`advisory` 是**观测的如实投影，不是必须遵守的规矩**，
     可查可背离，门一个字不读它。`demoted` 出过反例，同样不是规矩。**这张表恒在**——包络是准入
     必交件（§4.3），拿不出它就没开工这回事，不存在「无表可查」的自由排。
2. 某断点没有实测几何（资产该档 `grid` 标 `observed: false`）时**不得臆造**：**不为该档写任何
   `@media` 规则**，让它继承更宽且有观测的那一档。不得为该档编一套列数或间距；也不得反过来去改资产
   字段——`responsive.*.grid` 的实测几何不归生成侧写（采集侧 `extract.md` §13.1 权限尺）。**已知代
   价**：继承会让窄档偏宽，读起来不对也只能记进 trace，不许拿最佳实践补一套。
   · **更宽的档也缺测时，继续往宽找**，直到 `pc`；`pc` 也缺测就落到下一条。
   · **三档全缺时（页壳按采集侧规程就是这样）**：按 `variant`（`layout` / `columns` /
     `media_position`）与 `container` 布，**仍然不许**为任一档写 `@media`。
   · **落点是 trace 的 `floors[].unobservedBreakpoints`，门是 `responsive-inheritance`（§4.2）**：漏声明
     即阻断；**继承得对不对、往不往宽找，门不判**，靠人评审。

断点像素**查资产 `tokens.json` 的 `breakpoints` 组**（合同 §3.8；`DESIGN.md` 的断点节是人读副本）。
不要取采样宽度那张表：后者是「我们在多宽的屏上看的」，不是「这站在多宽处换布局」，
两者混写会直接做出错的几何。查表之外的数一律不许写进 `@media`——`breakpoint-value-unmapped` 逐条查。

若环境装了 `responsive-design`，可再读其原文，但它自带的默认列数与断点像素表、它的风险停止确认机制都不引入——本包除准入外全程不阻塞。

## 6. trace

产物之外必须落一份生成 trace。它不是日志，是**让别人能复核你每个非显然决定**的东西。

```json
{
  "schemaVersion": 1,
  "styleSetId": "<资产的 styleSetId>",
  "targetVariant": "",
  "sourceId": "source-01",
  "artifact": { "kind": "page", "html": "page-open-day.html", "css": ["page-open-day.css"] },
  "sequence": {
    "source": "skeleton",
    "page": null,
    "skeleton": "sk-landing",
    "steps": [
      { "id": "s1", "pattern": "hero.centered-pitch" },
      { "id": "s2", "pattern": "feature.grid-3-cards" },
      { "id": "s3", "pattern": "cta.centered-band" }
    ],
    "approvedBy": "user",
    "approvedSteps": [
      { "id": "s1", "pattern": "hero.centered-pitch" },
      { "id": "s2", "pattern": "feature.grid-3-cards" },
      { "id": "s3", "pattern": "cta.centered-band" }
    ]
  },
  "paint": {
    "rhythm": { "scheme": "alternate-muted", "surfaces": ["default", "muted"],
      "skipRoles": ["chrome", "overlay"], "skipTaxonomies": ["hero", "footer"] },
    "steps": [
      { "pattern": "hero.centered-pitch", "ownSurface": "default", "skippedBy": "taxonomy" },
      { "pattern": "feature.grid-3-cards", "ownSurface": "default", "skippedBy": null },
      { "pattern": "cta.centered-band", "ownSurface": "muted", "skippedBy": null }
    ]
  },
  "floors": [
    {
      "id": "feature.grid-3-cards",
      "pattern": "patterns/feature.grid-3-cards.yaml",
      "skeleton": null,
      "unobservedBreakpoints": [{ "breakpoint": "mobile", "inheritFrom": "pc" }],
      "fields": [
        { "field": "variant.columns", "value": 3, "confidence": "high", "imageConfirmed": false },
        { "field": "container.max_width_px", "value": 1128, "confidence": "medium",
          "imageConfirmed": true, "image": "screenshots/home/floors/pc--sec-03.jpg" }
      ]
    }
  ]
}
```

- **`artifact.kind` 必写，三取一：`page` / `floor` / `component`。** 产物粒度的唯一信源，两侧包络门与
  生成侧混搭一致性门都读它；缺席或写第四个值 → 两侧同样退 1，码 `artifact-kind-missing`。**没人替
  它兜默认值**（默认值就是又一套启发式），也没人判声明与产物打不打架（§4.3）：写错声明换来的是别
  的维不判，不是报错。`schemaVersion` 不为加字段而升——缺 `kind` 即退 1，旧 trace 不存在被静默读成
  合法的那条路径，不靠版本号分辨。
- `sourceId` 取资产 `README.md` 那份 `coverage.pages[].sourceId`（`source-01`……），不是可以现编的
  标签，也不从 `run-meta.json` 抄（那份是快照）。资产没记 `sourceId` 时写空串，门不开口。
- `skeleton` 无所选骨架型时写 `null`，并在同层给一句理由。
- `unobservedBreakpoints` 是**产物用到的每个缺测档**的必交声明（形状与九条 code 见 §4.2）；该型三档
  全有实测时整块不写，登一条也会挂。写 `inheritFrom: null` 时该档不得有只划这一档的 `@media`。
- `imageConfirmed: true` 且 `confidence` 非 `high` 的条目，`field` 与 `image` 两项都必须
  非空，且 `image` 必须指向随资产进 git 的那一份缩略图。自检门逐条核。
- **不要为了让门好看而编 `image`。** 一份没有采集运行的资产一张图都没有，这时正确写法是
  `imageConfirmed: false` 加一句备注，说明这个值是按 pattern 声明值直取、未读图确认。
- 文案槽每个一条记录。像素重建类任务不写文案槽、不写骨架型，其序列来自原页 DOM。
- trace 与门的报告落生成工作区，**不得**写进资产目录，**不得**并进 `run-meta.json`。

**`sequence` 与 `paint` 是 `artifact.kind: "page"` 的必交两块**，`floor` 与 `component` 两块都不写
（两道门都不开口，见 §4 末与 `SKILL.md`「自检门」）。写了就得成对：`sequence` 在而 `paint` 不在，报
`paint-record-missing`。

- `sequence.source` 三取一：`page-sequence` / `skeleton` / `cooccurrence`。白名单，打错一个字报
  `source-unknown`，不静默放行。
- `page` 只在 `page-sequence` 档有意义（必填，且与该页实测记录逐位对上），别的档写 `null`；
  `skeleton` 只在 `skeleton` 档有意义，别的档写 `null`。
- `steps[]` 每条只两个必填键：`id`（本次产物内的稳定短 id）与 `pattern`（型 id，等于
  `floor-index.json` 的 `floors[].id`，不是 `patterns/{id}.yaml` 路径）。`taxonomy` 可选，
  只有 `page-sequence` 档核对页记录时会读它，涂色重算一律不读——`role` / `taxonomy` / `ownSurface`
  三项一律从资产取（§4 第 4 条）。
  **`surface` 不许出现**，报 `step-surface-handwritten`。
- `approvedBy: "user"` 与 `approvedSteps[]` 在候选档（`skeleton` / `cooccurrence`）必填，且
  `approvedSteps` 与 `steps` 逐位同型。`page-sequence` 档不需要。
- `paint.rhythm` 是资产 `floor-index.json` 的 `rhythm` **原样抄**（四个键 camelCase），不重排、
  不补默认、不调 `normalizeRhythm`。抄错就是 `paint-rhythm-mismatch`——这一条守的是「我按另一套
  skip 名单涂的」。
- `paint.steps[]` 与 `sequence.steps[]` **逐位对齐**，每条三个键：`pattern`、`ownSurface`
  （资产该型的 `paint.ownSurface`，资产没声明就写 `null`）、`skippedBy`（`"role"` / `"taxonomy"` /
  `"surface"` / `null`，`null` 表示该层参与交替计数）。
- **`paint` 里没有底色。** 不写 `surface`、不写 `n`、不写 `decidedBy`：那些是算法输出，写进 trace 就是
  §4 第 1 条禁的预存值，报 `paint-record-output-field`。要复核某层底色，读产物的 `--color-surface-*`
  再跑一遍算法，两边比。

## 7. 优化模式：值映射 → 裁决 → 执行

只刷主题、不动内容那一路。`SKILL.md` 的「优化模式」一节定硬序、九道门与射程边界，本节定每一步
具体怎么做。本节**不接**第 1、4、5、6 节：不定 variant、不涂色、不做响应式几何、不写
`generate-trace.json`——没有新序列，也没有读图声明。第 2 节的取用粒度与第 3 节的「变量名一律查
闭集」照旧适用。

**输入面五份**：资产目录、`--before`（改造前那份，第 2 步拷下来的基线）、`--after`（改造后产物）、
`--verdicts`（色值裁决记录，即 `value-map.mjs --read-back --json` 的那份输出）、`--type-verdicts`
（非色裁决记录，即 `type-map.mjs --read-back --json` 的那份输出）。两份产物侧输入按相对
路径配对，且 `--before` 必须与产出这两张映射时 `--artifact` 指的是**同一个根**，否则
occurrence 的 `file` 相对路径对不上，兑现率门会整片报 `accept-occurrence-lost`。

**两张表为什么不合成一张。** 票面禁止「两种形状挤进同一张表却仍叫同一个 id 体系」，而合表的代价
是数据事实：色值按 hex 反查（精确档 + ΔE00 ≤ 2 的近邻档），同一 hex 的多个候选是**同一颜色的不同
角色**，人裁 usage 即可；
维度按数值反查则会跨**物理量类别**串——现役华为云资产的 `24px` 同时是 `dimension.lineHeight.2` 与
`dimension.radius.2`，冻结夹具同样（`radius.1=6` / `radius.2=12` / `fontSize.2=32`）。非色表因此按
类目分桶建索引：`radius` 行只查 radius 类目的条目，查不到就是无候选，不跨类目递。合表则要么加
`kind` 列（破坏已填好的八列色表），要么让 `USAGE_ORDER` 的 `other` 爆炸。

`--type-verdicts` **必给**，除非改造前产物里一条非色字面量都算不出来。缺它退
`type-verdicts-missing`——这条准入是两道非色门 `no-input` 状态的唯一防线：没有它，「不传就哑着报
绿」会是本仓库第五次踩「空门」。

**dev server、DOM 快照怎么落成 `--before` 能吃的文件。** 本包不负责抓取。本地文件直接指过去；
线上页或 dev server 上的页、浏览器 DOM 快照，由用户或上游（另存为、代理、采集脚本）把当时的
HTML / CSS 落盘成与本地产物同形的文件或目录，再把那条路径传给 `--before`（`--after` 同理）。
落盘之后与一开始就是本地文件的没有差别——门只认磁盘上的 `.html` / `.css`，不问它们从哪来。

**本门保证的是「没有裁决记录就过不了门」，不保证「没有裁决就改不了文件」。** 与创造模式的
`sequence-approval` 同构：lint 只挡过门，不挡动笔。有人跳过「用户裁决后再改」直接动文件，
机器拦不住，只是跑 `lint-migration` 时会因找不到裁决或对不上而退 1。不要用代码去挡动笔。

**本模式覆盖色值与非色两条映射链路 + 裁决保持锁 + 内容锁（含图片射程）+ 结构锁 + 断点锁 + 主题
API 锁，射程差如实列在下面，一条都没藏。**

**优化模式不迁移响应式行为。** 迁的只有色与标量：列数、排列、断点档位一律保持改造前那份——
`grid-template-columns` 不在非色表的 prop 白名单（布局尺寸整类不收），`breakpoint-lock` 不许长出
`--before` 里没有的 `@media` 宽度条件，`content-lock` 锁着文案的有序序列。**迁完只有色与标量像目标
站，页面整体不像**；要整页像，那一层另起创造模式重做。**`variant-lock` 与 `responsive-inheritance`
因此压根不在本模式射程里**：那是创造模式的第九、第十道自检门，由 `lint-floor.mjs` 跑（§4.1 / §4.2），
`lint-migration` 一道都不跑——本模式不定 variant、不写 `generate-trace.json`，页壳不由本包选，
`tokens.json` 也不按 variant 分叉，**这里没有那两个决策点**，不是「有射程差」，是不该有门。

仍**零门**、仍需人工：**未裁（pending）行被改动**（理由见本节 `verdict-hold-lock` 那一段的末条）、
`form[action]` 与 `sizes`，外加下面三处**已判定为在纯 HTML + CSS 产物上不可机检、有意不占空编号**的：

- **「不改路由与接口」** —— 理由见 `structure-lock` 那节。
- **「只改指定页」与页壳 / 文案两把开关** —— 门只看得见 `--before` / `--after` 圈进来的文件，改一份
  没纳入 `--after` 的源文件零信号，造不出独占失败输入。**靠人：圈路径时把射程钉死。** 另有一处真
  射程差：内容锁恒开，本模式只实现了提示词的「改文案=否」，**「改文案=是」有意不支持**。
- **纯线上无源码只落对照页、框架页先抽 `snapshot.html` + css** —— 产物是对照副本还是线上真身、是框架
  源码还是抽出来的快照，`.html` / `.css` 上不带这个信号。**靠人：对照页落进工作区、不动线上；框架页
  先抽快照再跑门。**

非色链路自身的射程边界（判据在 `lib/type-rows.mjs` 模块头，改那里必须同步这里）：

- prop 白名单之外一律不收，**不是「归 other」**。已知不收 `line-height` / `font-weight` /
  `letter-spacing` / 布局尺寸，以及 `border` / `font` 这类复合简写里的分量——切开 `border: 1px solid
  #123456` 会让 occurrence 的 `value` 不再是声明里那一串，而色表那侧对同一条声明只抽 hex，两边打架。
- 零值（`padding: 0` / `margin: 0 auto`）不进表：资产不会为 0 出 token。
- px 之外的长度与 `var()` / `calc()` / `clamp()` 不进表，但**落进 `summary.outOfScopeValues` 并在
  Markdown 里单列一节**，不静默丢。
- `omit` 与 `defer` 在门上**等价**（都算已背书、都不进兑现分母）。omit 多守的只有一条：只许零候选
  行用，回灌那侧报 `omit-with-candidate`，准入那侧报 `type-verdicts-omit-with-candidate`。别把它
  说成多守了别的。
- `lossy` 与 `omit` 一样是**两侧各判一次**：回灌那侧 `lossy-required` / `lossy-without-near` /
  `lossy-unknown`，准入那侧 `type-verdicts-lossy-required`。补上准入这一半是独立复核的结论——原来
  手写一份 `verdict: "pass"` 的信封把近义行的 `lossy` 改成 `false` 就能让那面旗在执行侧消失，
  `lintMigration` 退 0。它不让人逃兑现（accept 行照样得换成 `var()`），只让「有失真」这件事无痕。

本模式取代的那份约百行提示词（旧单体包的 `prompts/huaweicloud-inspect-and-fix.md`）**已于 2026-09-02
随老包删除**：它管过的每一格现在要么是门、要么在上面那份零门清单里。**不要从 git 里捞它回来当参照**
——它写「建 token 路径派生的 CSS 变量」，那正是本包禁止的派生。

跑门之前先过准入，逐条阻断，输出 `{ verdict: "blocked", precheck: { code, file, nextAction }, findings: [] }`，与 audit 同形：

| code | 什么情况 |
| --- | --- |
| （准入三结论） | 资产走 `admit-asset.mjs`，非 `ok` 不许跑门；`precheck.code` 就是 `absent` / `incomplete`，不另起名字 |
| `baseline-missing` | `--before` 没给，或指的路径不存在 |
| `baseline-empty` | `--before` 路径在，但一份 `.html` / `.css` 都收不到。空目录不是 `no-input`：内容锁会整段哑掉，必须挡在准入 |
| `after-empty` | `--after` 一份 `.html` / `.css` 都收不到 |
| `verdicts-missing` · `verdicts-unparseable` | `--verdicts` 读不到，或 JSON 解不开 |
| `verdicts-shape` | 不是 `--read-back --json` 那份输出：缺 `rows[]`，或行里缺 `usage` / `normalizedValue` / `verdict` / `acceptedCssVar` |
| `verdicts-accept-token-absent` | 有 `accept` 行的 `acceptedCssVar` 是空的（`null` / `undefined` / `''` / 只空白，同一条）。回灌那侧本该挡下（`accepted-token-missing`），这里是第二道保险：有人手改过这份 JSON。判在准入而不是门里——一份自相矛盾的裁决记录压根不该进门 |
| `verdicts-blocked` | 那份记录的 `verdict` 不是 `pass`——裁决自己都没读回通过，拿它当准绳等于拿一份没读懂的裁决当依据 |
| `verdicts-stale` | 拿 `--before` 与 `--asset` 重算一遍值映射，行 id 集合与 `--verdicts` 对不上：这份裁决对的不是这份改造前产物 |
| `type-verdicts-missing` | 改造前产物里算得出非色行，却没给 `--type-verdicts`。**这条是两道非色门 `no-input` 的唯一防线**，缺了它「不传就报绿」 |
| `type-verdicts-unparseable` | `--type-verdicts` 的 JSON 解不开 |
| `type-verdicts-shape` | 不是 `type-map.mjs --read-back --json` 那份输出：缺 `mapKind: "type"` 或 `rows[]`，或行里缺 `kind` / `normalizedValue` / `verdict` / `acceptedCssVar` / `lossy`。**把色值那份错喂过来就报这条**——只按字段名判会让它一路走到 stale 才报，报出来还指错方向 |
| `type-verdicts-accept-token-absent` | 有 `accept` 行的 `acceptedCssVar` 是空的，同 `verdicts-accept-token-absent` |
| `type-verdicts-blocked` | 那份非色记录的 `verdict` 不是 `pass` |
| `type-verdicts-stale` | 重算的非色行 id 集合与 `--type-verdicts` 对不上 |
| `type-verdicts-omit-with-candidate` | 有行裁了 `omit`，但拿 `--before` 重算下来它**有候选**。回灌那侧已经判过一次，这里再判一次：准入只信封上验 id 集合与 `verdict: pass`，手写一份 `pass` 的信封本来能把 `omit` 当免检咒语用 |
| `type-verdicts-lossy-required` | 有 `accept` 行选中的是**近义栈**（拿 `--before` 重算，该候选 `matchedBy === 'stack-near'`），信封里 `lossy` 却不是 `true`。与上一条同构：回灌判过一次不够，手写信封能把那面旗抹掉。判据现查重算结果，不抄回灌那侧的结论 |

**变量层怎么建。** 一份新文件 `theme-vars.css`，只有一个 `:root` 块，一行一条，按 `cssVar` 升序：

```css
/* 变量层：名字与值全部查 closed-set.json，一律不派生。 */
:root {
	--color-primary: #0f7a6c;
	--color-surface-default: #ffffff;
}
```

- 收哪些名字：裁决记录里全部 `accept` 行的 `acceptedCssVar`，去重。`defer` / `reject` 行不收——那些
  处还是字面量，声明一个没人引用的变量只会让下一个人以为迁过了。
- 取哪个值：按 `acceptedCssVar` 查 `closed-set.json`（`loadClosedSet` 的 `byVar`，它同时收 `cssVar`
  与 `aliasVar` 两列），alias 条取 `resolved.hex`、本名条取 `value.hex`，**照抄那一串**。不归一、不
  补 alpha、不改大小写——归一出来的 `#0f7a6cff` 是派生值，而这份文件的每一个字符都该能指着闭集说
  是从哪一行抄的。
- 不写「这是主色」这类逐条注释：既不可验证，又会跟着资产漂。
- 不写 `var(--aliasVar)`：`primitive-leak` 不跳过自定义属性声明，alias 目标多是色相族名，写在 `:root`
  右侧照样挂。只有 `color-literal` 跳过自定义属性声明，所以右侧写 hex 才是过得去的那一种。
- 落在 `--after` 收得到的范围内，并按项目自己的方式引入（`<link>` 或入口 CSS 的 `@import`，门不管
  哪一种）。收不到就会亮 `accept-var-undeclared`，那是设计好的失败方向。

**accept 行怎么执行。** 逐 occurrence 改，**不做全局字符串替换**：全局替换会命中裁决没覆盖的地方
（别的 usage、注释、`srcset`、文案里的字符串），而那几处恰恰是背书门与内容锁要抓的。复合值只换那
一段——`border: 1px solid #123456` 改成 `border: 1px solid var(--color-border-default)`，其余原样。
选中的 token 是 primitive 层时，引用处会在 `lint-floor` / `lint-artifact` 的 `primitive-leak` 亮，回灌
那一侧已就此报警（`accepted-token-primitive`）：要么回去改成 semantic 候选，要么把该行改判 `defer`，
**不许**为此在本模式里放宽任何一道门。

**`accept-fulfillment`。** 逐行走裁决记录里 `verdict === 'accept'` 的行，逐处走它的
`occurrences[]`，按 `file + selector + prop` 在 `--after` 的声明里取出那一组：

| code | 判据 |
| --- | --- |
| `accept-occurrence-lost` | 那一组一条声明都取不到（含选择器被改写） |
| `accept-literal-remains` | 取到了，但组里仍有一条的值含该行源值。按 `normalizeColorKey` 比，`#0F7A6C` 与 `#0f7a6c` 是同一件事 |
| `accept-var-missing` | 组里没有任何一条含 `var(<acceptedCssVar>)` |
| `accept-var-undeclared` | `--after` 里找不到 `<acceptedCssVar>` 的自定义属性声明。**按 cssVar 去重**（一个变量一条，带受影响处数），兑现率仍按 occurrence 记账 |
| `accept-var-value-mismatch` | 声明找到了，右侧不等于闭集查表值（大小写不敏感比） |
| `accept-alpha-carrier-missing` | 该行源值带 alpha（`normalizedValue` 末两位 < `ff`），组里引用了选中 token 的那条声明却没有透明度承载体 |
| `fulfillment-rate-short` | `fulfillment.rate !== 1`（`rate` 为 `null` 除外）。**独立阻断**，不依赖任何其它 finding |

`accept-alpha-carrier-missing` 是 2026-09-03 与审计侧「候选剥离 alpha」同一趟加的那一半。剥离之后
`rgba(255,255,255,.7)` 的候选是**不透明** token，「accept 一个半透明行」第一次成为可能；不补这一条的
话，执行侧写成裸 `var(--color-surface-default)` 在机器眼里完全兑现（源值没了、var 也写了），而页面上
那块半透明玻璃当场变实心。承载体认两种写法：`color-mix(in srgb, var(--t) 70%, transparent)`（审计侧
备注里点名的那一种）与相对色语法 `rgb(from var(--t) r g b / .7)`。**不比对百分数**——归一把 alpha 量化
成一个 hex 字节（`0.7` → `b3` → `70.2%`），比数字会把合法写法判成不合法。alpha 从 `normalizedValue`
现算，**不读裁决记录里的 `alpha` 字段**：信封是手写得出来的，行 id 与归一值有 `verdicts-stale` 兜着，
多出来的那一列没有。一处都没引用选中 token 时只报 `accept-var-missing`，不叠报本条。

一组多条时的判据是「一条都不许再含源值，且至少一条含选中的 `var()`」，两半各守一件事：前半守「实际
生效的那条没被漏掉」（没有行号，不知道哪条生效，就要求都不含），后半守「真的换成了那个变量」。

`fulfillment.rate` = 兑现的 occurrence 数 ÷ accept 行 occurrence 总数，门要求它**恰好是 `1`**，
`0.9` 不放行。`defer` / `reject` 行既不进分子也不进分母——渐进迁移是票面允许的。分母为 `0` 时写
`null` 且**不阻断**：一份全 `defer` 的裁决是合法的，把它算成 0% 等于把「什么都没承诺」读成「承诺
全没兑现」。

同一处 occurrence 可以并列叠报：`accept-literal-remains` 与 `accept-var-missing` 各守一半，
`accept-var-value-mismatch` 再按该变量的**每一处** occurrence 各报一条。`accept-var-undeclared`
按 cssVar 去重（一个变量一条，带 `occurrenceCount`），兑现率分母仍按 occurrence 数，两件事分开。
再加 `literal-verdict-backing` 的 `literal-accept-residue` 与独立的 `fulfillment-rate-short`。

**`literal-verdict-backing`。** 走 `--after` 的每一处色值字面量（抽取器与 `color-literal` 同一份
`colorLiterals()` 加 `COLOR_EXEMPT`，同样跳过 `widget` 子树与 `--` 开头的 prop），按
`usageOf(prop)` 与 `normalizeColorKey(literal)` 配裁决记录的行：

| code | 判据 |
| --- | --- |
| `literal-unbacked` | 这个 (usage, normalizedValue) 在裁决记录里没有对应行：改造中新引进的越界色，或这份裁决对的不是这份产物 |
| `literal-pending` | 对上了，该行 `verdict` 是 `null`：裁决没填完就动了代码 |
| `literal-accept-residue` | 对上了，该行裁的是 `accept`：与 `accept-fulfillment` **有意重叠**，两门都报，不合并 |

重叠的理由与双闸门同理：`accept-fulfillment` 只走裁决记录里那份 occurrence 清单，抓不到「改造中在别处
新加的一处同值字面量」；本门从产物侧走，抓得到。**反过来不成立**：原处留下源值时，
`accept-literal-remains` 被 `literal-accept-residue` 完全包含。不合并：合并进 `accept-fulfillment` 会丢掉
别处新加；合并进本门会让兑现率找不到发生在哪一处。`accept-fulfillment` 那条是按 occurrence 记账，不是
因为它能单独抓到什么字面量。

两边抽取器与 `color-literal` 同一份，所以本门挡住的每一处字面量，`color-literal` 也挡。本门**不是
更严**：裁过 `defer` / `reject` 的残留 hex，`color-literal` 红、本门绿。优化模式的准绳是本门，正
因为老项目会故意留字面量。

**`verdict-hold-lock`（第五道，2026-09-03 加）。** 判据一句话：裁成 `defer` / `reject` / `omit` 的行，
它的**每一处** occurrence 在改造后那一组声明里仍然带着源值。两条 code：

| code | 判据 |
| --- | --- |
| `held-literal-removed` | 那一组取到了声明，但**一条都不含**该行源值（色行按 `normalizeColorKey` 比，非色行按类目归一值比） |
| `held-occurrence-lost` | 按 `file + selector + prop` 连那一组声明都取不到（含选择器被改写） |

findings 带 `rowId` `sourceValue` `verdict` `table`（`"color"` / `"type"`）`file` `selector` `prop`。
**两张表一道门**：它守的那句承诺与「值是什么类目」无关，`table` 那一列足够分辨来路；色行是必填输入，
所以整门恒 `ran`，非色那半边跟着 `--type-verdicts` 有没有给。

**为什么要有它（起因是一次真实迁移）。** 88 行色值裁决里 75 行是 `defer`——当时审计侧的候选只有 hex
精确一档、alpha 还进检索键，近邻色与半透明值一律零候选，填 token 会报 `accept-without-candidate`，
只能裁 `defer`。而执行侧照样把那 75 行的 123 处全换成了 `var()` / `color-mix()`：`lint-migration` 退 0、
八道门 findings 全 0、两条兑现率都是 1，落地改动里 57% 的处数没有任何裁决背书。兑现率的分母只数
accept 行的 occurrence，`literal-verdict-backing` 只查**还留着**的字面量——那些字面量已经没了。
「不该动的动了」在原来那八道门里**没有任何一道能表达**。

**与 `literal-verdict-backing` 是相反方向的两问，不许合并、不许互相吞。** 残余背书从产物侧走、问「还
在的字面量有没有背书」；保持锁从裁决侧走、问「说了不动的动了没有」。同一处 occurrence 不可能既在
accept 行又在 held 行（行的键是「源值 × 用途」，一处 occurrence 只属于一行），所以保持锁与兑现门不会
对同一处提出相反要求。

射程边界：

- **继承按 `file + selector + prop` 重扫那三条盲区的全部**（同一个 `groupAfter`）：没有行号；同选择器
  同属性多条规则时对不上是哪一条，判据因此保守成「一条都不带源值才算被改」，同 prop 上另有一条带着
  源值就放行，误报方向偏放行；选择器被改写时报 `held-occurrence-lost`，不知道「改了选择器」这件事本身。
- **不**继承兑现门那条「分母只数 accept 行」——那正好是它的射程。也不看变量层：held 行本来就没有选中 token。
- 只认「源值还在不在」，不认「被换成了什么」：删成空声明、换成 `var()`、换成另一个 hex，都报同一条
  `held-literal-removed`；`#efefef !important`、或挪进同选择器的另一条声明，源值还在就放行。
- **新增盲区：未裁（`verdict` 为 `null`）的行不进射程。** pending 行只在字面量还留着时由残余背书门报
  `*-literal-pending`；字面量被换掉之后它落在所有门之外。不兜住是有意的——兜住等于让门替准入去判
  「表填完了没有」，而回灌那侧允许 pending 退 0（出表、填表本来是两步）。要让它有门，得先改准入那侧
  「`pass` 的信封里许不许有 pending 行」，那是另一件事，不在本门编号里。
- 用例在 `tests/migration-hold.test.mjs`：正例（defer 行源值原样留着）、每个 code 一条会挂的输入、
  「换成闭集内的 var() 时本门是唯一响的那道」、以及上面每一条边界各一条。

**`content-lock`。** 两半各自独立：**标签属性那半边**把 `--before` 与 `--after` 的 `.html` 按相对
路径配对逐份比六条序列；**CSS `url()` 那半边**吃两侧的**声明**（`.css` 文件与 HTML 内联 `style=`
都算），按 `file` 配对比 url 序列。

| code | 判据 |
| --- | --- |
| `content-file-missing` | `--before` 有这份 `.html`，`--after` 没有 |
| `text-changed` | 可见文本序列逐位比，每一处不同记一条 |
| `href-changed` · `src-changed` · `alt-changed` | 对应属性序列逐位比 |
| `srcset-changed` | `srcset` 序列逐位比。按**所有开标签**收，`<picture><source srcset>` 并进这一条 |
| `poster-changed` | `poster` 序列逐位比，与 `src` 同构 |
| `css-url-changed` | 声明里 `url()` 参数的序列按 `file` 逐位比。**必须把 `.css` 半边真的喂进来**——只扫 HTML 会让本 code 变成空门：CSS 文件路径永远没人读，而背景图正住在那里 |

- 可见文本：剔掉 `<script>` / `<style>` 体与 HTML 注释，取全部文本节点，解码实体，`\s+` 归一成单空格
  并 `trim`，丢掉空串，得一个**有序序列**。有序而不是集合——集合抓不住「两段文案调了位置」；归一
  空白——改缩进、跑一遍 formatter 不是改内容，不归一这道门会先被人关掉。
- `href` / `src` / `alt`：按文档序收全部元素上该属性的值，各成一个有序序列，**原样比**：不归一大小写、
  不解析相对路径、不排序。
- 实体解码表只有六条：`&amp;` `&lt;` `&gt;` `&quot;` `&#39;` `&nbsp;`（末条解成 U+00A0，随后被空白
  归一吃掉，所以「把空格换成 `&nbsp;`」抓不住）。`\s` 含 U+3000，全角空格与半角空格归一后相同，
  同样抓不住。表外的实体**原样比**——一份写 `&hellip;` 一份写 `…` 会报 `text-changed`。这是本门已
  知的宽度，不补全表：补全就得跟 HTML 规范那两千多个命名实体同步，而「同步到了」这件事没有测试
  能证明。全角/半角标点（`，` / `,`）不是空白，抓得住。
- `--after` 里多出来的 `.html` **不判**：新增页不是内容改动，本门只保证原有内容没变。把改过的文案
  挪到新文件、旧文件删掉，旧文件报 `content-file-missing`，新文件仍不判——删旧加新不是口子。
- `srcset` **原样比**：不拆 `1x` / `2x` 描述符、不排序、不折空白，与 `href` / `src` 同一合同。
  `1x, 2x` 与 `1x,2x` 会红，CDN 加 `?v=` 会红，描述符对调会红——已知宽度，不为此放宽。**不解析
  srcset 语法**：解析器会变成第五套口径，且本仓库没有一条真 srcset 能证伪它。
- **`<picture><source>` 并进 `srcset` 序列，不另占编号。** `<source>` 上没有 `src`，改它只动 srcset
  序列，写不出与 `srcset-changed` 不同的独占失败输入。硬约束是「写不出会挂的输入就不准占编号」，
  所以 `source-srcset-changed` / `picture-changed` 一律不设。`<source src="x.mp4">`（音视频）本来就
  在 `src` 序列里，不是洞。
- **CSS `url()` 收窄四处**，否则会和「只改色值」打架：`data:`（data-URI SVG 里常含填色，那半边归色
  门管）、`url(#fragment)`（SVG filter / clip-path 引用不是外链资源）、`--` 自定义属性声明右侧、
  `widget` 子树（第三方播放器 CSS 里全是自带图标 url）。抽取按**括号配平**，不用
  `/url\([^)]*\)/`——data-URI 里可以有嵌套括号与分号，正则会截出半截串，那比不抽更坏。
- `url()` 剥一层引号后比：`url(a)` / `url("a")` / `url('a')` 在 CSS 里是同一件事，原样比会让跑一遍
  formatter 就把这道门先关掉。但相对路径**不 resolve**（产物没有 base URL）、query **不剥**：
  `./a.png` 与 `a.png`、`a.png?v=1` 与 `a.png` 都红，与 `src` 同族。`--after` 里多出来的 `.css` 不判。
- **已知盲区：** `sizes`、`form[action]`、JS 运行时拼出来的 url。另有两个洞由上面那两条跳过规则
  自带：`--before` 侧本来就把图写在自定义属性（`--hero: url(a.png)`）或 widget 子树里时，那处 url
  从头到尾不进序列，改它不红。**反方向仍红**——改造中把 url 搬进自定义属性会让 before 侧那条消失，
  序列逐位比报得出来。
- 两半的输入互不牵连：`--before` 一份 HTML 都没有（纯 CSS 迁移）时标签那半边整段不判（`--after`
  里的 HTML 全部算「多出来的」），但 CSS `url()` 那半边**照跑**。**两半都没有输入**（既无 `.html`
  又无一条 url）才写 `status: "no-input"` 退 0。但 `--before` 整个缺失
  是 `baseline-missing`，路径在却零份 html/css 是 `baseline-empty`，**都不是** `no-input`：旧实现
  `runs/harmonybp-theme-rebuild/scripts/content-lock.mjs` 缺 HTML 也 `process.exit(0)`，那条路必须
  堵死。那份旧实现只借思路不拷代码——它只查「采集语料的每条文本仍是产物 HTML 的子串」，不扫
  `href` / `src` / `alt`，只查「缺」不查「多」，还绑死写死的语料路径。本门的基线是**改造前那份产
  物**，不是语料清单：优化模式天然有「改造前」，不必另立语料。
- `content-file-missing` 的 `index` / `before` / `after` 填 `null`：没有对上的那一份，这三个键没有
  可比的值。

**`structure-lock`。** 一个 code `tag-changed`：`--before` 与 `--after` 的 `.html` 按相对路径配
对，比**开标签名的有序序列**（小写归一），逐位 `!==`。不收 class、不收属性、不收层级深度、不收
节点数。

| 输入 | 判 |
| --- | --- |
| 楼层根外面包一层 `<div class="wrapper">` | 红（逐位比，插一位会让它之后每一位都错开，两位的序列报三条） |
| `<section>` 改 `<div>`、`<h2>` 改 `<h3>`、抽掉一层、`ul` 与 `h2` 对调、插一个 `<script>` | 红 |
| 只改 class / `id` / `data-*` / 属性顺序 | **绿**——改选择器的后果由 `accept-fulfillment` 的 `accept-occurrence-lost` 报，不由本门报 |
| `<img>` 与 `<img/>`、改缩进与换行、`<DIV>` 与 `<div>` | 绿 |
| `--before` 有而 `--after` 没有那份 | 本门**不报**：`content-lock` 的 `content-file-missing` 已经报过一次 |
| `--after` 多出来的 HTML | 不判 |
| `--before` 一份 HTML 都没有 | 整门 `status: "no-input"` |

- **另立一道门，不塞进 `content-lock` 的序列表里。** 理由是可证伪性：两道门必须能**分别**卸掉接线各自转红。
  本仓库前四次空门都是「卸一处两件事一起哑」。代价是 `gates[]` 多一行。
- `<script>` / `<style>` 的**体**不进序列（体里的 `a<b` 会被标签正则读成开标签），**开标签名进**——
  插一个 `<script>` 是换骨架。
- **最大的洞：只比序列不比树。** `<div><p>x</p></div>` 与 `<div></div><p>x</p>` 的开标签序列都是
  `[div, p]`，本门看不出来。配了用例锁住这句话，不许假装抓得住。比树会把「换一层标签名」与
  「挪一层」报成同一条，本轮不做。
- **候选判据里选了「开标签名序列」，另三个都不选**：节点数 + heading 骨架挡不住同层数换标签
  （`section`→`div`），且没有能与本判据分开的独占失败用例；锁 `data-*` / `id` 锚点对老页经常整门
  无输入（优化模式的产物不强制带 `data-pattern`，那是创造模式的要求），有输入时又挡不住包一层；
  扫 `href` 当路由与内容锁重复，造不出独占失败输入。
- **「不改路由与接口」在纯 HTML + CSS 产物上不可机检，因此不占空编号。** 产物合同只有 `.html` 与
  `.css`（`collect-artifact.mjs` 只收这两种），没有 JS 入口也没有网络日志；内容锁对 `<script>` 整段
  剥掉，写在脚本里的 fetch URL 看不见。标记里能当路由的只有 `href`（已在 `content-lock`）与 `form[action]`
  ——后者冻结夹具与源站采集**两侧都没有真样本**，本轮不占编号，如实记成射程边界。REST / GraphQL /
  云 API 在无 JS 的产物上零信号，占 `api-changed` 就是空门。**这一格靠人。**
- 「包一层容器」按操作句是**不许**的动作（步 6「选择器、DOM、文案、链接、图片一律不动」，提示词
  P22「不要重写业务 DOM」），所以必红不是误伤。**创造模式那条「插一个没有同名 `data-pattern` 的
  wrapper 不错位」是涂色对位的宽容，不是优化模式的许可**，不许搬过来当豁免。

**`breakpoint-lock`。** 一个 code `media-condition-added`：`--after` 不得引入 `--before` 里不存在的
`@media` **宽度条件**。条件归一成无空白小写串（`(MIN-WIDTH : 641px)` → `min-width:641px`），凡括号里
含 `width` 的都收（`min-`/`max-`/`device-`/区间语法 `width>=48em`）。抽取器在 `lib/breakpoint-lock.mjs`，
从**原始文本**扫 `@media` 前奏——`css-scan.mjs` 递归进 `@media` 时把条件丢了，而它被 audit 逐字锁着。

| 输入 | 判 |
| --- | --- |
| `--after` 多一档 `@media (min-width: 1281px)` | 红 |
| 把 `(max-width: 1023px)` 改成 `(max-width: 900px)`（条数不变） | 红 |
| `--before` 里已有的 `@media` 原样保留、只改块里的声明、换写法（大小写 / 空白 / 加媒体类型） | 绿 |
| 把一档 `@media` 从 `a.css` 挪进 `b.css` | 绿——条件集合按整个 `--before` 取并集，不按文件配对 |
| `--before` 里就有的采样宽 `@media`（如 1688） | **不报**：本门只判增量，资产 §5 表本身对不对归采集侧 |

- **判增量，不判「产物所有 `@media` ⊆ 资产 §5 白名单」。** 后者会误伤：优化模式的产物是老页，源站
  CSS 本来就有 §5 之外的弱档（现役华为云资产 `DESIGN.md` 记着 1440 / 1920）。判增量后零误伤——合法
  改动（换色值为 `var()`、建变量层、换 class）一处不碰 `@media` 条件。
- **判据里不许写死任何断点数字**，两边都现读。源站改版、断点值变了本门零代码改动跟着走；
  `migration-breakpoint.test.mjs` 有一条扫模块源码的断言钉着这句话。
- 与采集侧 `breakpoint-is-sample` **不是同一把尺，别合并**：那道守资产 §5 表里的代表 px ∈ 各页
  `clusteredBucketsPx`，本门守产物没长出新断点。对象不同。
- **不留豁免口子。** 产物确实需要资产里没有的断点时，出路是先改资产、重采，不存在「登记理由后放行」。
- 抓不住：不含 `width` 的条件（`prefers-color-scheme` / `orientation` / `@media print`）、`@container`；
  单位不换算、数值不归一（`48em` 与 `768px`、`768.0px` 与 `768px` 各算一条，误报方向是把改写法报成加断点）；
  按原始文本扫，`<script>` 里字符串拼出来的 `@media (…) {` 会被当成条件（只多报，不漏报）。
- `.html` 与 `.css` **两侧都喂**：楼层可以是自带 `<style>` 的单文件页，只喂 `.css` 就是空门。

**`theme-api-lock`。** 一个 code `foreign-var-introduced`：`--after` **新引入**的 `var()` 引用
（after 引用集减 before 引用集）必须在 `closed-set.json` 内。引用集用 `closed-set.mjs` 的
`varReferences` 抽，fallback 里的嵌套 `var()` 各自算一条。

| 输入 | 判 |
| --- | --- |
| 裁成 `defer` / `reject` / `omit` 的行，字面量换成 `var(--por-x)` | 红——与 `verdict-hold-lock` **有意同时响** |
| 新写一条规则引用闭集外的变量，前缀是什么都一样（`--brandkit-accent`） | 红 |
| `--before` 里就有的 `var(--por-*)` 原样保留（渐进迁移） | 绿 |
| 新引入闭集内的 `var(--color-primary)`（正常兑现） | 绿 |
| `:root { --color-primary: #0f7a6c }`（变量层的**声明**） | 绿——声明不是引用 |

- **这道门堵的洞**：裁成 `defer` / `reject` / `omit` 的行，产物把字面量换成 `var(--por-x)` 之后，兑现率
  不管（那些行不进分子分母）、`literal-verdict-backing` 也不管（字面量已经没了）。2026-09-03 起
  `verdict-hold-lock` 在这一处与本门重叠，但**换成闭集内的名字时只有保持锁能报**（本门按定义放行），
  **改造中新写一条规则引私有变量时只有本门能报**（那一处压根没有 held 行）。两道各有对方够不到的地方。
- **判据前缀无关**：不写 `--por` / `--ti` / `--cf` 黑名单。那三个是华为云的例子不是判据，写成黑名单
  等于新造一套站点特例，换个站就空转；判「不在闭集」即可，私有前缀自然落网。
- **判增量**：源站原有引用在 `--before` 里就有、不进差集。判绝对集合会让老页每页必红。
- 与创造模式的 `gateVarInClosedSet`（`lib/gates.mjs`）**同族不同物**：那个判绝对集合、只接在
  `runAllGates`；本门判增量、只接在 `runMigrationGates`。门名与 code 都不撞车，`gates.mjs` 一个字节不动。
- 抓不住：`widget` 子树里的引用（两侧同待遇）；变量层右侧把闭集已有的名字覆写成别的值——名字在闭集里，
  本门按定义放行，那是两道兑现门的射程。

**报告形状。**

```json
{
  "verdict": "pass",
  "styleSetId": "fixture-lanyuan-lab",
  "fulfillment": { "acceptRows": 3, "acceptOccurrences": 12, "fulfilled": 12, "rate": 1 },
  "typeFulfillment": { "acceptRows": 2, "acceptOccurrences": 2, "fulfilled": 2, "rate": 1 },
  "gates": [{ "gate": "accept-fulfillment", "status": "ran", "findings": 0 }],
  "findings": []
}
```

`gates[]` **九行恒在**，顺序写死 `accept-fulfillment` · `literal-verdict-backing` ·
`type-accept-fulfillment` · `type-literal-backing` · `verdict-hold-lock` · `content-lock` ·
`structure-lock` · `breakpoint-lock` · `theme-api-lock`；某道门没有输入时写
`status: "no-input"` 而不是 `findings: 0`——「没有 HTML 可锁」与「锁过了全对」必须在报告
里分得开。**末两道恒 `ran`**：准入已保证 `--before` / `--after` 两侧各有输入，没有 `no-input` 档。顶层另有 `fulfillment` 与 `typeFulfillment` 两份账，形状相同、各判各的。
finding 与两包同形 `{ gate, level: 'block', code, reason, ... }`，每条必带非空 `reason`。
附加字段：两道兑现门带 `rowId` `sourceValue` `acceptedCssVar` `file` `selector` `prop`
（`accept-var-undeclared` / `type-accept-var-undeclared` 按 cssVar 去重，带 `occurrenceCount`）；
色值背书门带 `file` `selector` `prop` `value` `usage`，非色背书门同形但末位是 `kind`；`verdict-hold-lock`
带 `rowId` `sourceValue` `verdict` `table` `file` `selector` `prop`；内容锁与结构锁
带 `file` `index` `before` `after`。排序键 `[gates 序号, file, selector, prop, rowId, index]`，路径
相对化后再排。`--json <路径>` 写文件的同时仍打 stdout（与 `lint-artifact` 同形）。

**判据从哪来。** `usageOf` 与行 id 的口径必须与 audit 逐字同一套，否则同一处字面量两包归到不同
usage，裁决就对不上。跨包 import 被禁（判据得能跟着包搬走），走**整文件拷贝**：把 audit 的
`scripts/lib/value-rows.mjs`、`scripts/lib/type-rows.mjs` 与 `scripts/lib/collect-artifact.mjs` 原样
拷进本包 `scripts/lib/`，**一个字符都不改**——`value-rows.mjs` 只 import `node:crypto`、
`../vendor/page-theme-core/index.mjs` 与 `./gates.mjs`，`type-rows.mjs` 只 import `node:crypto`
（非色归一不碰颜色，也就不需要 vendored core），`collect-artifact.mjs` 只 import `node:fs` /
`node:path`，路径两包同构。各配一份逐字节对照锁（`tests/copied-value-rows.test.mjs` /
`tests/copied-type-rows.test.mjs`），写法照 audit 的 `tests/copied-helpers.test.mjs`。
`lint-migration.mjs` 收 `--before` / `--after` 时 import 这份拷来的 `collectArtifactFiles`，不得再嵌
一份同形函数；非色兑现门 import 拷来的 `typeLiteralsOf` / `closedSetTypeValue`，不得另写一份归一。

因此 `scripts/lib/gates.mjs` 有且只有一处许可改动：**末尾补一行 `export { COLOR_EXEMPT }`**。它现在
是模块内 `const`，而拷来的 `value-rows.mjs` 要 import 它；audit 那份 `gates.mjs` 的末行早就是这一句。
这一行进不了 `extractFunctionSource` / `extractConstSource` 的提取范围（后者只认 `const COLOR_EXEMPT =`
那一处），所以 audit 的逐字锁照样绿。**除此之外优化模式一个字节不动 `gates.mjs`**：九道迁移门整套在
`migration-gates.mjs`（抽取器在 `lib/content-lock.mjs` / `lib/structure-lock.mjs` / `lib/breakpoint-lock.mjs`，
只抽不判），一道都不进 `runAllGates`。非色那两道同样不碰 `gates.mjs`——`type-rows.mjs` 连
`COLOR_EXEMPT` 都不需要（它不认色值）；`theme-api-lock` 只 import `closed-set.mjs` 的 `varReferences`，
不改它，也不动同族的 `gateVarInClosedSet`。

锁的射程别读大：audit 那份逐字锁只锁**前六道门的函数体**与三个常量（`COLOR_EXEMPT` / `FONT_EXEMPT` /
`CSS_NAMED_COLORS`），`runAllGates` 不在里面。所以**创造模式加门时可以动 `runAllGates` 的数组与签名**
——`paint-consistency` 就是这么加进去的，它要多吃一个 `html` 入参（前六道门只吃声明数组，而
`data-pattern` 与层根类名只在 HTML 原文里）。优化模式仍然不动它，理由不是那份锁，是两套门问的不是
同一件事。

## 8. 自证

自证只认机检结果。「我读了 Don't 清单」「已遵循正向纪律」这类自述不算，读取顺序即便写进
trace 也只是线索、不是因果证据。

门退 1 时自行修复并重跑，修不了才向用户回话——**不得把挂着门的产物标成完成**。门的报错
指向的是病因不是症状：`asset-admission` 说的是资产的事，`var-not-in-closed-set` 说的是这
份资产没有这个 token，两者不要互相当解释。
