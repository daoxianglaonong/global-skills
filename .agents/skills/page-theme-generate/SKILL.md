---
name: page-theme-generate
description: >
  柔性收待生成页面，刚性出过门产物。输入什么形状都收——一句「照着某站做个页」、一个
  楼层名、一份既有页面文件、一份还没采过的域名；产出只有一种形状：全部用色 / 排印 /
  间距都引用 `page-theme/<style-set-id>/` 资产（tokens / patterns / voice / closed-set /
  floor-index）的 HTML + CSS，且必须过完十二道自检门。拿不出合格资产就不开工：准入校验
  先跑，判定无资产则自动串采集再回来。
  Use when the user wants to build, generate, restyle, or re-theme a page, floor, section,
  or component **against a page-theme asset**; when they ask to 照着某站做一个新页、
  按某份主题资产拼一个楼层、把某个页面配色换成某套资产、把某个页面里写死的色值改成
  引用某份资产的变量、先给楼层大纲或改动方案我逐条拍板了再动手; or say "make me a page
  that looks like it belongs on <site>" even when nothing has been extracted yet. Not for
  turning URLs into an asset (that is page-theme-extract), not for judging whether an
  existing page conforms to an asset (that is page-theme-audit), and not for editing build
  config such as `tailwind.config.js`.
compatibility: >
  人读提示，不是安装或依赖解析契约：Node ≥ 20 · 零运行时依赖（不需要 npm install）。
---

# 按资产生成页面（page-theme-generate）

**柔性收输入，刚性出产物。** 要生成什么怎么说都收：一个楼层名、一页大纲、一份既有页面、一个
还没采过的站。产出只认一种形状——所有色值 / 字体 / 间距都是 `var()` 引用，每个名字都在这份资产
的闭集里，十二道门全绿。把柔性收敛成刚性，就是本包的活。

**资产是唯一输入面**：不读采集过程、不读 `raw/`、不问那趟 run 怎么跑的。也不替下游下结论——
「像不像那个站」归 `page-theme-audit`，那一侧有意不接收本侧的任何过程叙述。

| 项 | 归属 |
| --- | --- |
| 准入把关（拿不出资产就不许开工） | 本包，`scripts/admit-asset.mjs` |
| 按资产产出楼层 / 页 / 主题替换 | 本包 |
| 楼层大纲与序列来源 | 本包，`scripts/sequence-sources.mjs` · `scripts/lint-outline.mjs` |
| 产物自检门（语法层面有没有背叛资产） | 本包，`scripts/lint-floor.mjs` |
| 优化模式的迁移门（承诺兑现 / 残余背书 / 内容锁） | 本包，`scripts/lint-migration.mjs` |
| 从 URL 采出资产 | `page-theme-extract` |
| 判一份产物合不合资产、值映射与裁决回灌 | `page-theme-audit` |
| CSS 变量分层判据 · 颜色判档 · 涂色算法 · 四份 schema | `page-theme-core`，本包只用 `scripts/vendor/` 副本 |

文件地图：`references/generate.md`（生成规程，开工必读）·`references/composition.md`（门射程外的
构图取舍，不加门不改退出码）·`scripts/`·`tests/`·`evals/`。
对其它 skill 一律软引用：装了可再读，不装也不失败。

## 硬序

不得调换，不得跳步。下表是创造模式那条；优化模式走另一条七步，见「优化模式」一节。

| 步 | 动作 | 失败时 |
| --- | --- | --- |
| 1 | 跑准入校验 | 见下节三种结论，动作互斥 |
| 2 | 定目标 variant 与楼层序列来源 | 候选来源必须先出大纲拍板，见下节，不硬猜 |
| 3 | 按取用粒度逐份读资产 | 不整盘灌 `tokens.json` / 全部 pattern |
| 4 | 写产物（HTML + CSS） | 变量名一律查闭集，不派生；楼层底色不手算，整条序列交 `paintSequence` |
| 5 | 跑自检门 | 退 1 必须自行修到退 0；修不了才回话，不得把挂着的产物标成完成 |
| 6 | 落 trace | 声称读图确认过的字段，必须指名具体图像文件 |

```text
node scripts/admit-asset.mjs <资产目录> [--json]
node scripts/sequence-sources.mjs --asset <资产目录> [--want hero,pricing] [--json]
node scripts/lint-outline.mjs --asset <资产目录> --steps <序列.json> [--json]
node scripts/lint-floor.mjs --asset <资产目录> --html <楼层.html>
     [--css a.css,b.css] [--trace generate-trace.json] [--json]
node scripts/lint-migration.mjs --asset <资产目录> --before <改造前产物> --after <改造后产物>
     --verdicts <色值裁决.json> [--type-verdicts <非色裁决.json>] [--json <输出路径>]
```

参数只认上面列出的旗标。判据阈值不得升为 CLI 参数——门一旦可调，它守的就不再是同一件事。
混搭一致性门**不新增旗标**：它吃 `--html` 那份产物、`--css` 那几份样式与 `--trace` 那份 trace，
三个都已在表内，资产从 `--asset` 来。为它单开一个开关等于给一道阻断门配一个关掉它的办法。

最后那条 `lint-migration` 属优化模式，与前四条不同段，见「优化模式」一节；它的 `--json` **带路径**
（`lint-floor` 的 `--json` 是布尔），因为迁移报告是要留档对账的那一份，打屏后还得人手重定向就等于
没留档。只写 `--json` 不给路径是用法错误，退 1。

## 准入把关

**物理手段，不是纪律。** 生成侧最容易出的事故不是写错色值，而是压根没有资产就「凭感觉照着
做」：产物看着像那么回事，没有一处能追溯到观测，而这种坏法不报错，只是慢慢把一个虚构的设计
语言当成真的。

| 结论 | 什么情况 | 动作 |
| --- | --- | --- |
| `ok` | 九份必交件齐全且闭集读得开 | 开工 |
| `absent` | 目录不存在，或存在但没有 `README.md` | **自动串采集**：开跑前一句话告知，不等确认；采完回第 1 步 |
| `incomplete` | 有 `README.md` 但缺别的必交件，或闭集读不开 | **拒绝**，报出缺了哪几份，请用户处置 |

两者必须分开，因为动作相反：`absent` 是空手，办法是去采；`incomplete` 是残件，重采会盖掉
`holdout.yaml` / `site-overrides.yaml` / `input/design-system/` 这类**人拥有的输入**。合并成
一句「资产不合格」，等于把「该去采」和「不许去采」揉成一个。

第九份是 `layout-envelope.json`（`R4-10` 升进来的）：门 `layout-envelope`、验证侧布局表、合成型
身份的型级四维都读它，缺它这三处判据集合静默变空。**它不构成死锁**——修法是在采集侧补投影一次
（`node scripts/build-envelope.mjs --asset-dir <资产目录>`，从 `patterns/` 直算、不起浏览器、不碰
人拥有的输入），所以 `incomplete` 那条「不许自动串采集」照旧成立。

退出码只有 `0` / `1`，非 `0` 一律不许直接生成。有意不给 `absent` 单开 `2`：那个数字在采集侧
校验器里是「仅报警、可交付」，同一个数字在相邻包里表示相反的意思，误读一次的代价是「没有资产
也开工了」。只有两档时，误读方向永远是安全的那一侧。

## 楼层序列与大纲

序列三种来源，档位不同：

| 来源 | 怎么来 | 档位 |
| --- | --- | --- |
| 已采页 `sequence` | `patterns/index.yaml` 的 `pages.<id>.sequence` | 实测记录，权威 |
| 骨架型 | `floor-index.json` 的 `skeletons`，装得下想要的 taxonomy 才算选中 | 候选 |
| 共现回退 | 全部骨架型都装不下时：共现次数选谁、已采页平均序位定顺序 | 候选 |

**排列这件事脚本不给 `high` 档**，所以后两种产出的都是候选：出页前必须先出大纲、由用户拍板，
trace 记 `sequence.approvedBy: "user"` 与被拍板的 steps——`sequence-approval` 验这件事，拍了 A 交 B 也挡。

已采页序列不用拍板，但**要指名哪一页并与该页实测记录逐位对上**：这一档一旦只凭声明就放行，
「把候选序列写成 `page-sequence`」就成了比打错来源名还省事的免检咒语。另一头也说明白：`sequence`
整块不写时 `sequence-approval` 不开口——`floor` 与 `component` 产物本来就没有序列这件事。「页级产物
必须带这一块」是拼页那一步的形状要求，归下一节的 `paint-consistency`。

「全部骨架型都装不下」是机械判定：想要的 taxonomy 不在该型 `steps` 里。回退用统计而不是「挑一个
最接近的已采页照抄」——照抄会把那一页的特异性整份带进新页，而目标页与所有已采页都不像时「最接近」
本身是假的。页数不够时统计如实报弱证据，不硬失败也不假装是统计。

大纲三列（型 id / 中文标签 / 关键内容点）全部从资产查出来，所以三列齐全是**结构保证**不是纪律：
填不出中文标签只有一种原因——那个型不在资产里，而那件事同一趟就被挡下。

大纲阶段的门，两档两果：

- taxonomy 不在**词表闭集**（资产 `taxonomy_layers` 启用的那几层）→ 阻断。现场自造的词没有出路，
  采集侧、`page-theme-audit`、涂色都不认识它。
- 在词表内、但本资产没有对应型（fixture 里的 `pricing`）→ **不阻断**，走形态缺口，但必须写一句
  理由。判它阻断等于「本站没采到的正当楼层类一概不许做」；理由不能省，静默的缺口和忘了写长得
  一模一样。

**形状提示另立一族，不进自检门，不影响退出码。** 「三个 feature 连着排」是程度问题、可以是刻意的，
把它做成阻断是越权——交给拍板的人裁，正是大纲这个阶段存在的理由。但「自称按某型排的却落在该型
`repeat` 区间外」不是程度问题而是自我矛盾，仍然阻断。

读哪些文件：`floor-index.json` 出型目录 / 骨架型 / 节奏；`patterns/index.yaml` 只取 `taxonomy_layers`
与 `pages.*.sequence` 的 **taxonomy 那一列**。两份都不逐篇打开 `patterns/{id}.yaml`。骨架型库采集侧
叫 `page_skeletons`、投影后叫 `skeletons`，形状同构，消费侧一律读后者。

## 楼层涂色与混搭一致性

**底色不是楼层的属性，是整条序列的函数。** 涂色末行取模的是「已参与交替的楼层个数」，跳过的层不占
计数——同一层排在不同序列里、或前面多跳过一层，算出来就是不同的底色。所以逐层预存「这层该涂什么」
在数学上没有定义。混搭外来楼层时最容易踩的正是这一处：照抄那一层 yaml 自带的 `surface`。

**执行体只有一个**：vendored core 的 `paintSequence(steps, rhythm)`，整条序列进、整条涂色出，纯函数。
`rhythm` 取 `floor-index.json` 那份（投影时已归一），`role` / `taxonomy` / `ownSurface` 逐层从该资产
`floors[]` 的对应行取。序列条目上的 `surface` 随 scheme 分流：非 `custom` 时**不得手写**，喂算法前要
丢掉；`custom` 时那一列是**页级观测**、是重算的独立信源，新页每条参与计数层必须手写，缺则
`paint-recompute-failed`。现役 `huaweicloud-com` 就是 `custom`。七条做法逐条在
`references/generate.md` §4，那一节是本门的判据来源，不是它的说明。

**混搭一致性门（`paint-consistency`）两头都比。** 主判据在产物侧：按 `data-pattern` 对上是哪一层，取
该层实际引用的 `--color-surface-*` 变量，与「按本次序列重算一遍」的结果比。再拿 trace 的 `paint` 段
记的跳过裁定与同一份重算交叉核。**不能只比 trace**：产物与 trace 可以被一起写错，那时门只是纸面的。
**也不能只比产物**：trace 谎报跳过裁定时产物可能恰好蒙对，放行的是下一条序列。

**产物侧只认一种写法**：楼层根的类选择器（或 `[data-pattern="<型 id>"]`）上，一条 `background-color`
或 `background` 引用了 `--color-surface-*`。内联 `style=` 的选择器对不上层根：若那是该层唯一底色
声明，报 `surface-unreadable`（阻断，不是豁免）。同一层根只要能抽到多于一个 `--color-surface-*`
候选——不论来自类选择器、更具体的选择器、内联 `style`、还是 `@media` 块——一律报
`surface-ambiguous`，拒绝认证而不是静默放行。**本模式下一层只许有一个底色声明；需要按断点换底色
的，本门挡下来，属于已知代价而不是误报。** JS 运行时、背景图盖住底色、同选择器后一条 hex 仍看不见。
逐条射程边界在 `references/generate.md` §4 末，写在那里是因为它们是判据的一部分，不是免责声明。

**产物每层必须带 `data-pattern="<型 id>"`，缺了即阻断**（独立 code）。对位按该 id 在文档里的第 k 次
出现，不按「第几个 section」：插一个没有同名 `data-pattern` 的 wrapper 不会把后面的层错位。同一型
出现两次时，两个同值属性仍按文档序第 k 次对上序列里该 id 的第 k 条。现役夹具
`tests/fixtures/floor-good.html` 早就带这个属性，本节把夹具习惯升成成文约定。

**没有 `sequence` 时本门不开口**，与 `sequence-approval` 同构：`floor` 与 `component` 产物本来就没有
序列这件事，既无序列可重算，也无「哪一层」要对位。不传 `--trace` 时同理，两道判「出处声明」的门共享
这个已知洞。**例外两条：** `trace.artifact.kind` 是 `page` 而无 `sequence` 报 `page-sequence-missing`，
**只有一层的页也照报**；给了 trace 却读不到闭集内的 `kind` 报 `artifact-kind-missing`。
调用方漏传 `html` 写 `no-input`，不与「层根缺属性」混。

**产物粒度写在 `trace.artifact.kind`，三取一：`page` / `floor` / `component`。** 粒度的唯一信源，本门
与包络门都读它，**不数层根、没有默认值**——默认值就是又一套启发式。缺席或写第四个值两侧同样退 1。
声明与产物打架（`kind: "floor"` 的 5 层整页）今天不判，见 `references/generate.md` §4.3。

**根级 `sequence` / `paint` 两块不进 `page-theme-audit` 的 trace 白名单，一个键都不加。** 那一侧的
prose-invariance 靠「只读白名单内的机读字段」成立，白名单里**没有一个自由文本字段**（逐项见那边
`SKILL.md`「不读说辞」，本节不抄第二份）。把序列加进去，两份仅在序列上不同的 trace 会让报告字节
不同，那条断言当场红。所以混搭一致性留在本包，与 `sequence-approval` 同一个理由、同一个位置。后人
若「顺手补全白名单」，撞的是 audit 的核心主张，不是一处遗漏。

## 变量名一律查闭集

要一个 CSS 变量名，就去 `closed-set.json` 查 `cssVar` 列；该条是 alias 时写 `var(--aliasVar)`，
不要把链尾 hex 拍进去。**不做任何派生。**

派生规则只有一两行，却是每次都可能算错一遍的一两行，而算错不报错：本包写出的名字与
`page-theme-audit` 查的对不上，两边都绿，页面直接白底。真相源只有那张表；派生函数属于采集侧，
它负责**造**那张表。一道扫源码的形状门守着：引入 core 的派生函数、或用字符串拼 `--` 开头的名字，
当场红。这道门只钉这两个动作，射程只到 `scripts/**/*.mjs` 的代码部分，两处不扫各有各的理由：
**文档不扫**，`SKILL.md` 与 `references/` 得把被禁的写法举出来才讲得清，扫它等于禁止把纪律讲明白；
**注释不扫**，讲清「为什么不许派生」同样必然要在注释里写出那个函数名，于是「解释这条纪律」会
变成违反它。存心拆开写（`fromCharCode`、`'-' + '-'`）也抓不住——它守的是「下一个人顺手写了」，
不是「有人存心绕」。

## 自检门

十二道，各自独立，全是阻断，无报警档——判的都是可证伪的事实（这一处用了什么、这件事声明过没有），
不是程度问题。程度问题在大纲那一族，见上节。判据在 `scripts/lib/gates.mjs`（`paint-consistency` 的
判据主体拆在 `scripts/lib/paint-check.mjs` / `paint-floors.mjs` / `paint-surface.mjs` /
`paint-recompute.mjs`，`variant-lock` 的判据源在 `variant-lock.mjs`，`responsive-inheritance` 的在
`responsive-inherit.mjs`，`gates.mjs` 只留薄壳），每道门都配了一条真的会挂的输入。

| 门 | 判什么 | 常见的踩法 |
| --- | --- | --- |
| `color-literal` | 写死了色值：hex、颜色函数、命名色，含复合值内嵌 | 写 `border:` 简写时顺手打了 hex；或觉得 `white` 不算色值 |
| `font-stack-literal` | 字体族不在资产已声明的字体栈内 | 在 `var(--fontFamily-sans)` 后面补一个「更安全」的系统字体兜底 |
| `var-not-in-closed-set` | 引用了本资产闭集里没有的变量 | 名字看着很合理，但这份资产没有这个 token |
| `primitive-leak` | 颜色跳过 semantic 直引 primitive | 直接用色相族刻度，换主题时这一处不会跟着变 |
| `unresolved-var` | 变量名反解不出 token 路径 | 就地起了个自定义变量 |
| `image-evidence` | trace 声称读图确认，图却指不出或解不开 | 随手写个路径充数 |
| `sequence-approval` | 候选序列没经用户拍板就出页，或拍了 A 交了 B | 大纲这一步看着像客套，跳过去直接拼 |
| `paint-consistency` | 楼层底色与按本次序列重算的结果不一致，或对不上是哪一层 | 照抄那一层 yaml 自带的 `surface`，没跟着本次序列重算 |
| `variant-lock` | 体检判疑似多套设计语言却没点名 variant、点了词表外的名字、没点名或点错来源 `sourceId`、页壳跨 variant 混用 | `mixed-suspected` 时 trace 的 `targetVariant` 留空；资产 `coverage.pages[]` 记着 `sourceId` 而 trace 不写 |
| `responsive-inheritance` | 产物用到某型 `grid.observed: false` 的档，trace 没声明这一档无实测、数值继承自哪一档；产物 `@media` 用了资产断点闭集之外的数 | 给一个从没实测过的窄档臆造 `@media` 值（现役资产 153 档里 84 档缺测，这是多数情况） |
| `type-literal` | 圆角 / 间距 / 描边宽写死了 px 字面量，没引闭集里的名字 | 觉得 `border-radius: 12px`、`gap: 24px` 只是尺寸、不算主题量 |
| `layout-envelope` | 型身份、序列位置、容器声明越出资产 `layout-envelope.json` 的**阻断层**（该文件的 `advisory` / `demoted` 两层一个字不读） | 自由排时让 cta 打头、把 `float-widget` 排进序列、给 `full-bleed` 的型加容器宽 |

**`responsive-inheritance` 不判继承得对不对**——往不往宽找、继承来的窄档读起来对不对，都是语义判断，
机器不接；它只判声明了没有、来源档存不存在、声明与产物对不对得上、`@media` 那个数在不在资产的断点闭集里。
断点闭集读资产 `tokens.json` 的 `breakpoints` 组（合同 §3.8）：**生成侧不派生断点，一律查表**，与色值同一条纪律。
字段形状（trace `floors[].unobservedBreakpoints`）与九条 code 在 `references/generate.md` §4.2，规程本体在 §5 第 2 条。

`primitive-leak` 与 `unresolved-var` 是**双闸门，必须同时关上**：只查前者，把 `--color-neutral-1`
改名成 `--brand-bg` 就溜了；只查后者，规规矩矩写 `var(--color-neutral-1)` 也溜了。两门在「顶层是
`color` 却既非色相族也不在角色词表内」这一类上**有意重叠**，那是判据定义使然。

射程与豁免就三条：

- 只有 `currentColor` 与 `transparent` 免检——它们是颜色，但表达「跟着继承走」「不上色」，没有
  token 能替代。`inherit` / `none` / `0` 不是颜色，压根不进射程。
- `data-pt-widget="third-party"` 子树内部色与字体不归本站主题管；**读不到那个标记就不豁免**，
  否则「说自己是 widget」会变成一句免检咒语。
- 不扫自定义属性声明（`--x: …`）：token 层那一片右侧按定义全是字面量，扫它等于要求资产不许有
  值。这不留洞——就地自造一个变量再引用它，会在引用处被闭集门挡下。

样式藏哪都扫得到：外部 CSS、HTML 里的 `<style>`、内联 `style=`、`@media` 嵌套。单文件楼层不传
`--css` 也照判，不会以「零声明」全绿通过。

## 优化模式

**刷既有页的主题，不动内容。** 老项目通常一个变量都没有、色值全硬编码，所以本模式的产物不是新页，
而是**一层 CSS 变量 + 把硬编码色值换成 `var()` 引用**。方案不由本包拍脑袋定：先让
`page-theme-audit` 以空 baseline 出值映射，用户逐行裁决，回灌校验过了，才动代码。内容来源不限
（本地文件、dev server 落的页、DOM 快照都收），**本包不负责抓取**。

**另起一套门，不塞进 `runAllGates`。** 迁移门在 `scripts/lint-migration.mjs`。锁的射程要分清：
`color-literal` 等**前六道门的函数体**与它们依赖的三个模块级常量（`COLOR_EXEMPT` / `FONT_EXEMPT` /
`CSS_NAMED_COLORS`）一个字节不动——`page-theme-audit` 的 `tests/copied-helpers.test.mjs` 逐字锁着它们，
改一处会同时撞两包。`runAllGates` **不在那份锁里**：创造模式加门时它的数组与签名都可以动，
`paint-consistency` 就是这么进去的（它要吃 HTML 原文，前六道门只吃声明数组）。优化模式那一套仍然独立，
一道都不进 `runAllGates`。

**两套门问的不是同一件事。** 十二道自检门问「这份产物在语法层面有没有背叛资产」，迁移那九道门问
「这次改造有没有兑现裁决、有没有动不该动的、有没有动内容」。优化模式**不给那十二道加门也不减门**——加减门只发生在创造模式那一侧。

**准绳不是 `lint-floor` 十二道全绿。** 老项目跑 `lint-floor` / `lint-artifact` 注定退 1（一份全硬编码的
页实测报 `color-literal` 四条加 `font-stack-literal` 一条），那**不代表不能开工**；迁移做完也仍可能
退 1——裁成 `defer` 的字面量留在原地，`color-literal` 照报。本模式的准绳只有下面那九道门。

硬序另一条，同样不得调换、不得跳步：

| 步 | 动作 | 失败时 |
| --- | --- | --- |
| 1 | 跑准入校验 | 与创造模式同一套三结论 |
| 2 | 留基线：把要改的那几份文件整份拷进 `<工作区>/before/` | 没有基线不许动代码——内容锁与兑现率门都以它为准 |
| 3 | 调 `page-theme-audit` 出**两张**映射：`value-map.mjs --out`（色值）与 `type-map.mjs --out`（非色） | 退 1 说的是资产或产物收不进来，不是「没有越界值」 |
| 4 | 人填两张表的选中 token 与裁决 | 本趟 run 到此结束回话；带着填好的表回来是下一次调用 |
| 5 | 两张表各自回灌校验（`--read-back --json <裁决记录>`） | 退 1 请人改表重来，**不得**自行替人改裁决 |
| 6 | 建变量层，把两张表 accept 行的每一处换成 `var()` | 只改值：选择器、DOM、文案、链接、图片一律不动——文案 / 链接 / 图片 / 骨架四样由第 7 步的内容锁与结构锁机检，选择器不改这件事没有门（改了只会在 `accept-fulfillment` 报 `accept-occurrence-lost`） |
| 7 | 跑 `lint-migration.mjs`，两份裁决都传 | 退 1 自行修到退 0；修不了才回话，不得把挂着的产物标成完成 |

**两张表分家，不是一张表加一列。** 色值走 `value-map.*`（行 id `vm-`），字体栈 / 字号 / 圆角 /
描边宽 / 间距走 `type-map.*`（行 id `tm-`）。互喂会当场 `verdicts-shape` / `type-verdicts-shape`。
分家的理由是数据事实而不是口味：闭集里同一个数字常常跨类目复用（现役华为云资产的 `24px` 既是
`dimension.lineHeight.2` 又是 `dimension.radius.2`），只按数值反查会把行高变量当圆角候选递给人；
非色表因此按**类目**建索引，色表按 hex 反查，两种检索不共存于一张表。

**`--type-verdicts` 不是可选装饰。** 改造前产物里但凡有一条落在非色表射程里的字面量，缺它就退
`type-verdicts-missing`。能省掉它的只有「一条都算不出来」的产物，那时两道非色门写 `no-input`。

**本门保证的是「没有裁决记录就过不了门」，不保证「没有裁决就改不了文件」。** 与 `sequence-approval`
同构：lint 只挡过门，不挡动笔。有人跳过第 4–5 步直接改文件，机器拦不住，只是第 7 步会因找不到
裁决或对不上而退 1。不要用代码去挡动笔，那超出 lint 的射程。

**开工前那一趟验证写死为 `value-map --out`**，不是 `lint-artifact`、也不是 `lint-floor`。对一份零
`var()`、全硬编码的页配一份合格资产，它正常出报告并退 0（裁决整列 `verdict: null`、pending 等于行
数）——「空 baseline」是现成能力，不用新做。第 3–5 步不许压缩成「我看了一眼就动手」：少哪一步，
accept 都没有可对账的执行依据，兑现率门只会报「找不到裁决」。

本模式不出楼层大纲、不跑涂色、不写 `generate-trace.json`——没有新序列，也没有读图声明。它的纸面是
那份裁决记录加 `lint-migration.json`，与 `before/` 同落
`.page-theme-work/<style-set-id>/<migration-run-id>/`，`<migration-run-id>` 用 UTC `YYYYMMDDTHHMMSSZ`。

**变量层：单独一份新文件，`:root` 一块，值一律查表。** 现役楼层产物
（`tests/fixtures/floor-good.css`）里**零条自定义属性声明**——「只引用、不声明」就是本包产物 CSS 的
现役形状，所以变量层不塞进被改造的业务 CSS，另落一份 `theme-vars.css`，`diff` 里「新增声明」与
「替换引用」因此分得开。选 `:root` 是因为老项目的硬编码值散在任意选择器上，只有它无条件落在所有
引用处的祖先链上。名字只许用 `closed-set.json` 里存在的 `cssVar`，值照抄该条的 hex（alias 条取
`resolved.hex`，本名条取 `value.hex`），**不派生、不归一、不补 alpha**。**变量层里不许写
`var(--aliasVar)`**：alias 目标多是色相族名，写在 `:root` 右侧照样被 `primitive-leak` 抓——那道门不跳
过自定义属性声明，只有 `color-literal` 跳过。

九道门，各自独立，全是阻断，无报警档。判据与 code 表在 `references/generate.md` §7。

| 门 | 判什么 | 一条会挂的输入 | 抓不住什么 |
| --- | --- | --- | --- |
| `accept-fulfillment` | 裁成 `accept` 的每一行、每一处 occurrence 都不再含源值，已写成 `var(<该行选中的 cssVar>)`，且该变量在变量层声明过、值对得上；源值带 alpha 时那一处还得有透明度承载体 | 十处里改了九处；`rgba(255,255,255,.7)` 那行换成了裸 `var(--color-surface-default)` | 兑现率的分母只数 accept 行的 occurrence；`defer` / `reject` 行一处不数（那是 `verdict-hold-lock` 的射程） |
| `literal-verdict-backing` | 改造后**剩下的每一处**色值字面量，都能在裁决记录里找到一行 `defer` 或 `reject` | 顺手新调了一个 hex 进去 | 自定义属性声明右侧不进射程，否则变量层自己会把整片报成未背书 |
| `type-accept-fulfillment` | 非色表同上，值比对走闭集的**类目归一值**（`12px` / 字体栈）而不是 hex | 圆角没换、`border-radius: 12px` 还在 | 与色门同一套盲区；`omit` / `defer` / `reject` 都不进分母 |
| `type-literal-backing` | 改造后剩下的每一处非色字面量，都能在非色裁决记录里找到一行 `defer` / `reject` / `omit` | 顺手调了一个表里没有的 `border-radius: 20px` | 射程只到 `lib/type-rows.mjs` 的 prop 白名单 |
| `verdict-hold-lock` | 裁成 `defer` / `reject` / `omit` 的行，**每一处** occurrence 在改造后那一组声明里仍带着源值（两张表一道门，findings 上标 `table`） | 裁成 `defer` 的那行，字面量被换成了 `var(--color-text-muted)`（闭集内，所以主题 API 锁放行、兑现率仍是 1） | 未裁（`verdict` 为 null）的行不进射程；同 prop 另有一条带着源值时算原样保留 |
| `content-lock` | 可见文本、`href`、`src`、`alt`、`srcset`、`poster` 六条标签序列，外加 CSS 声明里的 `url()` 序列，改造前后逐位相同 | 顺手把一句文案改通顺了；把 `a@2x.png` 换成 `b@2x.png`；换一张 CDN 背景图 | JS 运行时拼出来的字；`sizes`；`form[action]`；`data:` URI 的内容（归色门）与 `url(#fragment)` |
| `structure-lock` | **开标签名**的有序序列改造前后逐位相同（小写归一） | 把楼层根外面包一层 `<div class="wrapper">`，文案一个字没动 | 只改 class / `id` / `data-*` / 属性顺序；JS 里的路由与接口 |
| `breakpoint-lock` | `--after` 不含 `--before` 里没有的 `@media` **宽度条件**（判增量，两边现读） | 顺手加一档 `@media (min-width: 1281px)`；把 `(max-width: 1023px)` 改成 `(max-width: 900px)` | `--before` 里就有的采样宽 `@media`（那是资产 / 采集侧的事）；不含 `width` 的媒体条件；`@container` |
| `theme-api-lock` | `--after` **新引入**的 `var()` 引用（after 引用集减 before 引用集）都在 `closed-set.json` 内 | 裁成 `defer` 的那行，把字面量换成 `var(--por-text-muted)` | `--before` 里就有的源站私有变量引用（渐进迁移必须绿）；`widget` 子树；变量层右侧写错值 |

两条兑现率（`fulfillment.rate` / `typeFulfillment.rate`）**各自独立阻断**，不依赖任何 finding：把
findings 清空、只把其中一条造成 0.9，仍必须退 1。合成一条会让非色那侧被色值那侧的满分静默吞掉。

`literal-verdict-backing` **不是比 `color-literal` 更严**，问的是另一件事。`color-literal` 一律禁止
字面量；本门允许有 `defer` / `reject` 背书的字面量留下——这正是优化模式的准绳。两边抽取器同一份，
所以本门挡住的每一处字面量，`color-literal` 也挡；反过来不成立：裁过 `defer` 的残留 hex，
`color-literal` 红、本门绿。

`verdict-hold-lock` 与 `literal-verdict-backing` 是**相反方向的两问，不许合并**：残余背书问「还留着
的字面量有没有裁决背书」，保持锁问「说了不动的动了没有」。2026-09-03 加这一道的直接起因是一次真实
迁移：88 行色值里 75 行裁 `defer`（当时近邻色与半透明值一律无候选，裁 `accept` 会报
`accept-without-candidate`），而执行侧照样把那 123 处全换成了 `var()`——`lint-migration` 退 0、八道门
findings 全 0、两条兑现率都是 1，落地改动里 57% 的处数没有任何裁决背书。兑现率的分母只数 accept 行，
残余背书只查**还在的**字面量，那些字面量已经没了：「不该动的动了」在原来那八道门里没有任何一道能
表达。同一趟里 `page-theme-audit` 的候选生成也改了（近邻档 + alpha 剥离），两件事一起，才让「该
accept 的能 accept、裁了 defer 的动不了」同时成立。

退出码只有 `0` 全绿与 `1` 有阻断，与两包一致，**不用 `2`**：`2` 在采集侧校验器里是「仅报警、可交
付」，同一个数字在相邻包里表示相反的意思，误读一次的代价是把没兑现的迁移当成过了。

**射程边界逐条明写，不许让门看起来比射程大：**

- **没有行号。** `css-scan` 的声明只有 `{file, selector, prop, value, widget}`，定位只能按
  `file + selector + prop` 重扫改造后的产物。
- 同一选择器同一属性有多条规则（级联、重复声明）时，**对不上是哪一条**。判据因此保守：那一组声明
  里一条都不许再含源值，且至少一条含选中的 `var()`。误报方向是「把同 prop 上该保留的另一个值报成
  漏做」，那时的出路是把该行裁 `defer`，不是放宽判据。
- `border: 1px solid #123456` 这类复合值，occurrence 的 `value` 只是抽出来的那个 hex、不是整串。
- **选择器被改写**（加一层、换类名）会让整行对不上，报 `accept-occurrence-lost`。优化模式本来就不该
  改选择器，但门抓不住「改了选择器」这件事本身——它只知道那一处找不到了。
- **`verdict-hold-lock` 继承上面三条盲区的全部**（同一个按 `file + selector + prop` 重扫的实现）：没有
  行号；同选择器同属性多条规则时对不上是哪一条，判据因此保守成「那一组里**一条都不带**源值才算被
  改」，同 prop 上另有一条带着源值就算原样保留，误报方向偏放行；选择器被改写时它报
  `held-occurrence-lost`，同样不知道「改了选择器」这件事本身。它**不**继承兑现门那条「分母只数
  accept 行」——那正好是它的射程。它也不看变量层：held 行本来就没有选中 token。
- **`verdict-hold-lock` 只认「源值还在不在」，不认「被换成了什么」。** 删成空声明、换成 `var()`、换成
  另一个 hex，报的都是同一条 `held-literal-removed`；反过来，改成 `#efefef !important`、或挪进同选择器
  的另一条声明，源值还在就放行——它守的是「那个值还在那一组里」，不是「那一行一个字节没动」。
- **`verdict-hold-lock` 新增一条盲区：未裁的行不进射程。** `verdict` 为 null 的行只在字面量**还留着**
  时由残余背书门报 `*-literal-pending`；字面量被换掉之后，pending 行落在所有门之外。不兜住它是有意
  的——兜住等于让门替准入去判「表填完了没有」，而回灌那侧允许 pending 退 0（出表、填表本来是两步）。
  想让它有门，得先改准入那侧「pass 的信封里许不许有 pending 行」，那是另一件事。
- 内容锁抓不住 JS 运行时拼出来的字。HTML 实体按**解码后**比：`&amp;` 与 `&` 判成相同，理由是它们
  渲染出来是同一个字，把「顺手补一个实体」判成改内容，门会先被人关掉；代价是「把空格换成
  `&nbsp;`」也抓不住——归一空白时 U+00A0 就是空白。`\s` 含 U+3000，全角空格同样抓不住。未列进
  解码表的实体原样比，见 §7。
- `--before` 路径在但零份 html/css 是准入 `baseline-empty`，不是内容锁 `no-input`。
- `--before` 没有 HTML（纯 CSS）时，`--after` 里的 HTML 全部算多出来的，不判；结构锁整门写
  `no-input`。但内容锁的 CSS `url()` 那半边照跑——它按声明走，不按 HTML 走。
- **`srcset` 原样比**：不拆 `1x` / `2x` 描述符、不排序、不折空白，`1x, 2x` 与 `1x,2x` 会红。
  `<picture><source srcset>` 并进同一条序列，**不另占一个 code**——`<source>` 上没有 `src`，
  改它只动 srcset 序列，造不出与 `srcset-changed` 不同的独占失败输入，占编号就是空门。
- **CSS `url()` 收窄四处**：`data:`（内容归色门，data-URI SVG 里常含填色）、`url(#fragment)`
  （SVG 引用不是外链）、`--` 自定义属性声明右侧、`widget` 子树。剥一层引号后比
  （`url(a)` 与 `url("a")` 不红），但相对路径不 resolve、query 不剥（`./a.png` 与 `a.png`、
  `a.png?v=1` 与 `a.png` 都红，与 `src` 同族）。
- **结构锁只比开标签名，只比序列不比树。** 不锁 class、不锁层级深度、不锁节点数。
  `<div><p>x</p></div>` 与 `<div></div><p>x</p>` 的序列都是 `[div, p]`，**抓不住**——这是本门最大的
  洞，配了用例锁住这句话。「不改路由与接口」这半句在纯
  HTML + CSS 产物上**不可机检**，因此**不占空编号**：产物合同只有 `.html` 与 `.css`，没有 JS 入口也
  没有网络日志；标记里能当路由的只有 `href`（已在内容锁）与 `form[action]`（两侧都没有真样本，
  本轮不占编号）。REST / GraphQL / 云 API 零信号。**这一格靠人，不靠门。**
- **「只改指定页」与页壳 / 文案两把开关、纯线上只落对照页，同判为不可机检、同不占编号。** 门只
  看得见 `--before` / `--after` 圈进来的 `.html` / `.css`：改一份没纳入 `--after` 的源文件，门零
  信号；产物落进 git 仓库还是工作区对照目录、是框架源码还是抽出来的 `snapshot.html`，产物本身
  不带这个信号。**靠人：圈路径时就把射程钉死，纯线上无源码时把对照页落进工作区、不动线上，框架
  页先抽 `snapshot.html` + css 再跑门。** 内容锁恒开，等于本模式只实现了提示词里「改文案=否」
  那一半——**「改文案=是」有意不支持**，要动文案就不是优化模式的活。
- **断点锁与主题 API 锁都判增量，不判绝对集合。** 判绝对集合会让老页每页必红：源站 CSS 本来就有
  资产 §5 之外的弱档，本来就在引源站私有变量。判增量后零误伤——合法改动一处不碰 `@media` 条件，
  也不新引闭集外的名字。两道门**恒 `ran`**，没有 `no-input` 档：准入已保证两侧各有输入。
- **断点锁的判据里没有任何写死的断点数字**，`--before` 的条件集合现扫。源站改版、断点值变了，
  本门零代码改动跟着走（`migration-breakpoint.test.mjs` 有一条扫源码的断言钉着）。它与采集侧的
  `breakpoint-is-sample` **不是同一把尺**：那道守资产 §5 表本身对不对，本门守产物没长出新断点。
  单位不换算、数值不归一：`48em` 与 `768px`、`768.0px` 与 `768px` 各算一条，误报方向是把改写法报成加断点。
- **主题 API 锁的判据前缀无关**：不写 `--por` / `--ti` / `--cf` 黑名单，判「不在闭集」，私有前缀自然落网。
  「裁成 `defer` / `reject` / `omit` 的行把字面量换成源站私有变量」这一处它与 `verdict-hold-lock`
  **有意同时响**：本门只在换成的名字**不在闭集**时开口，换成闭集内的名字（`var(--color-primary)`）它
  按定义放行，那时只有保持锁能报；反过来，改造中新写一条规则引私有变量时只有本门能报。与创造模式判
  绝对集合的 `gateVarInClosedSet` 同族不同物，两边门名与 code 都不撞车。
- 变量层里把闭集已有的名字**覆写成别的值**（`--color-primary: #f00`、`--shape-radius-container: 20px`），
  `color-literal` 按定义不扫，九道门里只有两道兑现门（`accept-fulfillment` / `type-accept-fulfillment`）
  的值比对能撞上它，而那只覆盖被 accept 选中的那些名字。别的名字写错了，机器无人接管——这是本模式
  已知的洞，靠「一律查表」这条纪律顶着。非色进来之后洞的形状没变，只是撞得上的名字多了一类。

**本模式覆盖色值 + 非色（字体栈 / 字号 / 圆角 / 描边宽 / 间距）两条映射链路，外加裁决保持锁、内容锁
的图片射程、结构锁、断点锁与主题 API 锁。裁决的两个方向现在都有门**：accept 行必须兑现（两道兑现
率），`defer` / `reject` / `omit` 行必须原样保留（保持锁）。仍**不在射程内**、仍需人工的是：未裁
（pending）行被改动，`form[action]` 与 `sizes`，
「不改路由与接口」、「只改指定页」与页壳 / 文案两把开关、纯线上只落对照页（后**三处均已判定为不可
机检**，理由见上，都不占空编号）。`target_variant` 那三条**不在本清单里，也不归本模式**：本模式不定
variant，见下一段。**断点没有豁免口子**：产物确实需要资产里没有的断点时，出路是先改资产、
重采，不存在「登记理由后放行」。非色射程本身也有边界：`line-height` / `font-weight` /
`letter-spacing`、`border` 与 `font` 这类复合简写里的分量、零值、px 之外的长度与 `calc()` /
`clamp()`，一律不进表（`calc()` 那类落进报告的「射程外的值」一节，不静默丢）。

**`target_variant` 显式、一页不混 chrome variant、`mixed-suspected` 不得缺省——这三条本模式没有门，
也不该有。** 它们已经装成创造模式的第九道自检门 `variant-lock`（`lint-floor.mjs` 跑，判据见
`references/generate.md` §4.1），本模式的 `lint-migration` 一道都不跑它。不是「判定为不可机检」，
是**本模式压根没有这个决策点**：产物是老页、页壳不由本包选（`chrome.yaml` 只有整页生成才读）、
`tokens.json` 与 `voice.md` 也不按 variant 分叉。要按 variant 出页，走创造模式。

**本模式取代的那份约百行提示词（旧单体包的 `prompts/huaweicloud-inspect-and-fix.md`）已于 2026-09-02
随老包删除。** 它管过的每一格现在要么是门、要么写在上面两段的零门清单里，没有第三种归宿。**不要从
git 里捞它回来当参照**：它写「建 token 路径派生的 CSS 变量（丢 `$root`、段间 `-`、前缀 `--`）」，
那正是本包禁止的派生，本模式一律查闭集那一列。

## 读图 trace

非 `high` 档字段**若**声称读图确认过，trace 必须指名**具体字段 + 具体图像文件**；那张图必须是
`screenshots/index.json` 里 `thumb` 那一列所指的一份、随资产进 git、且结构完整——探针一路走到
PNG 的 `IEND` / JPEG 的 `EOI`，截断的残片挡得住，像素流内容坏不坏不验。（`path` 那一列是采集期
本地原图，不随迁，资产搬走后必然指空。）

这道门**不证明你真看了图**——那件事没有纸面办法验，写一道「我读了」的自述门只会把纪律变成咒语。
它验声称与实物对不对得上：随手写个路径、指错一列、指一坨读不开的字节，三类当场红。

门只在你**声称**时才要求兑现。所以在一份没有采集运行、一张图都没有的资产上，正确做法是如实写
`imageConfirmed: false` 并把「未读图确认」留在字段备注里，而不是编一个路径去满足门。

## 缺口二分

先判是值缺口还是形态缺口，动作互斥。

| 缺口 | 判据 | 动作 |
| --- | --- | --- |
| 值缺口 | 资产里该角色 / 状态 / 语义没有观测值 | omit，或用资产已有的最近语义拼并并标记精度损失。**不得编造** |
| 形态缺口 | 原站不存在这类板块（原站无定价页却要定价表） | 允许发挥，但只能用资产已有的 token 与节奏 |

不得为「通过对比度检查」或「看起来完整」造盘、补档、补状态色。缺映射按值缺口处理，**不得**引进
「设计文件是真相源」式的自动回退——那个方向与本包相反。只有形态缺口才可以调 `frontend-design` /
`responsive-design` 当质量下限，资产口径始终优先；值缺口禁止调它们补色、补字、补间距。

## 产物落哪

产物（HTML / CSS）落用户要的地方。**trace 与门的报告不得写进资产目录**，也不得并进
`run-meta.json`：资产是采集侧的产物，本包只读不写。默认落
`.page-theme-work/<style-set-id>/<generate-run-id>/`，`<generate-run-id>` 用 UTC
`YYYYMMDDTHHMMSSZ`。消费仓库另有约定时听消费仓库的。

## 不阻塞

单页资产是**合格产物**（`coverage.pages` 只有一条不构成拒绝）；资产带 `blockers` 时照常生成，
受阻范围只影响可用观测的多少；扩覆盖面走对 `page-theme-extract` 的二次调用，不在生成段内自行加
采页面；需要人拍板的事一律降级成产出物里的待办，不新开清单文件。唯一会停下的是准入不过。

**拍板不是停下。** 大纲是这一趟 run 的产物——出完就回话结束，带着拍板结果回来是下一次调用。所以
「全程不阻塞」与「候选序列必须拍板才出页」说的是两件事：一个说 run 中途不卡在等输入上，一个说这
件事分两次 run。
