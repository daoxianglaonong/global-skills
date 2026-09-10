---
name: page-theme-audit
description: >
  柔性收待验证的产物与资产，刚性出机检结论。输入什么形状都收——一份既有页面、一个楼层
  文件、一整个目录、附带或不附带生成侧的 trace；产出只有两种形状：十道门的
  `lint-artifact.json`（退 `0` 全绿 / 退 `1` 有阻断），以及把产物里每个越界色值按
  「源值 × 用途」归行的值映射双份报告（机读 JSON + 人读 Markdown，人填完选中 token 与
  accept / reject / defer 能读回）。只读产物与资产，不读生成侧的任何自由文本；本包只出
  结论，一个字都不改产物。
  Use when the user wants to verify, check, or judge whether an existing page, floor, or
  component conforms to an extracted page-theme asset; when they want machine-checked gate
  results or a diffable JSON verdict instead of trusting a self-report from whoever
  generated the page; when they ask 拿某份主题资产验一下这个页面、跟目标主题差在哪、
  有没有用出资产之外的色盘、按「源值 × 用途」把越界值逐条列出来、值映射我填完了读回去
  核一遍、这页塞进我们站里会不会一眼被看出来是外来的; or say "i need a verdict, not a page".
  Not for turning URLs into an asset (that is page-theme-extract). Not for building,
  restyling, or re-theming anything (that is page-theme-generate)——分界线是**谁改产物**，不是
  谁出方案：值映射报告本身始终是本包的产出，但用户要「把这个页面主题刷成某套资产」时整件事归
  生成侧，哪怕他先要一份值映射方案逐条拍板；那时由生成侧回头调本包出映射，本包一个字都不改
  产物。Not for comparing a design mockup against an implementation for pixel fidelity,
  spacing, radius, or breakpoint 还原度 (that is fidelity-audit)——那一侧基线是设计稿，本包
  基线只能是风格资产目录。
compatibility: >
  人读提示，不是安装或依赖解析契约：Node ≥ 20 · 零运行时依赖（不需要 npm install）。
---

# 按资产验证产物（page-theme-audit）

**柔性收待验证的产物与资产，刚性出机检结论。** 待验的东西怎么给都收：一份 HTML、一份 HTML
加几份 CSS、一个目录、带不带 trace。产出只认一种形状——十道门逐门写行数的
`lint-artifact.json`，加一份可被人在编辑器里直接填、填完能读回的值映射报告。

**不自己生产、自己验证。** 本包不产页、不改页，也不接收生成侧的任何过程叙述。这不是纪律描述，是
可执行断言证明的事，见下节。分界线是**谁改产物**而不是谁出方案：值映射报告是本包的产出，照它建
变量层、把字面量换成 `var()` 是生成侧的活，本包一个字都不改产物。

| 项 | 归属 |
| --- | --- |
| 判一份既有产物合不合某份资产（十道门 + 退出码） | 本包，`scripts/lint-artifact.mjs` |
| 越界色值的「源值 × 用途」值映射与裁决回灌 | 本包，`scripts/value-map.mjs` |
| 越界非色值（字体栈 / 字号 / 圆角 / 描边宽 / 间距）的「源值 × 类目」映射与裁决回灌 | 本包，`scripts/type-map.mjs`（另一张表，不是色表加一列） |
| 从 URL 采出资产 | `page-theme-extract` |
| 资产自身合不合格（必交件有无、`dontId` 字段有无与对不对上） | `page-theme-extract`，`scripts/validate-asset.mjs` |
| 产页 / 改主题 / 楼层大纲拍板（`sequence-approval`）/ 照裁决改产物与迁移那九道门 | `page-theme-generate` |
| 设计稿与实现之间的像素还原走查 | `fidelity-audit` |
| CSS 变量分层判据 · 颜色判档 · 四份 schema · voice 八节标题 | `page-theme-core`，本包只用 `scripts/vendor/` 副本 |

文件地图：`references/audit.md`（验证规程，开工必读）·`scripts/lint-artifact.mjs`·`scripts/value-map.mjs`（色值 CLI）·`scripts/type-map.mjs`（非色 CLI）·`scripts/lib/value-rows.mjs` 与 `scripts/lib/type-rows.mjs`（两张表各自的行逻辑，都不与 CLI 同名）·`scripts/lib/gates.mjs`（语法门 + 读图 + 白名单）·`scripts/lib/gates-asset.mjs`（后三道资产侧门）·`tests/`·`evals/`。对其它 skill 一律软引用：装了可再读，不装也不失败。

## 硬序

不得调换，不得跳步。

| 步 | 动作 | 失败时 |
| --- | --- | --- |
| 1 | 资产前置：四份必读件读得开 | 退 1，**不在残件上出结论**；缺件本身归采集侧校验器判 |
| 2 | 收产物：`--artifact` 指文件或目录 | 一份 `.html` / `.css` 都收不到即退 1，不以「零声明」全绿交差 |
| 3 | 跑门：十道恒跑，逐门写行数 | 有阻断退 1，报告仍完整落盘 |
| 4 | 要值映射时另跑一趟 `value-map.mjs`（色值）／`type-map.mjs`（非色），两张表 `--out` 到**同一个目录** | 无候选如实写「无候选」，不编一个 token |
| 5 | 人填完 Markdown 后各自 `--read-back` 回灌，**回灌恒做两表交叉判定**（对表默认取本表读回件同目录的那一份） | 色表七种阻断五种报警；非色表十一种阻断三种报警；再加交叉那一条：任一表 blocked、或对表重算有行却取不到读回件，两张表都退 1（`maps-cross-blocked`） |

```text
node scripts/lint-artifact.mjs --asset <资产目录> --artifact <文件或目录>
     [--trace <generate-trace.json>] [--json <输出路径>]
node scripts/value-map.mjs --asset <资产目录> --artifact <文件或目录> --out <目录>
node scripts/value-map.mjs --asset <资产目录> --artifact <文件或目录>
     --read-back <value-map.md> [--peer-read-back <type-map.md>] [--json <输出路径>]
node scripts/type-map.mjs --asset <资产目录> --artifact <文件或目录> --out <目录>
node scripts/type-map.mjs --asset <资产目录> --artifact <文件或目录>
     --read-back <type-map.md> [--peer-read-back <value-map.md>] [--json <输出路径>]
```

参数只认上面列出的旗标，`--out` 与 `--read-back` 互斥（同时给即用法错误，退 1）；两者都不给也是
用法错误，退 1。`--peer-read-back` **不是开关**，只是对表不在同目录时的显式指路：交叉判定挂在
`--read-back` 本身上，给它一个指不到的路径是用法错误（退 1），不降级成「没有对表」。判据阈值不得
升为 CLI 参数——门一旦可调，它守的就不再是同一件事。

**`--asset` 是必给项，缺了硬失败。** 有意不给默认值、不许静默降级：生成侧的 `runAllGates` 只在
`assetDir` 为真值时才跑读图门，缺了就静默跳过，于是七道门在报告里看起来像六道，那是一处已知缺陷。
十道门恒跑，`gates[]` 十行恒在，某道门没有输入时写 `status: "no-input"` 而不是 `findings: 0`——
「没给 trace」和「给了 trace 全绿」必须在报告里分得开。

退出码只有 `0`（全绿）与 `1`（有阻断），**不用 `2`**。采集侧校验器的 `2` 是「仅报警、可交付」，
同一个数字在相邻包里表示相反的意思，误读一次的代价是把有阻断的产物当成过了。值映射的 pending
更不该用退出码表达：一份刚生成的报告整列都空，那是正常状态不是故障。

## 不读说辞

生成侧会写一大段理由说自己为什么合规。本包**一个字都不读**。trace 走**白名单**读取，白名单只有七
项：`artifact.kind`、`floors[].id`、`floors[].fields[].field`、`.image`、`.imageConfirmed`、
`.confidence`，以及 `floors[].unobservedBreakpoints[]` 的 `.breakpoint` 与
`.inheritFrom.{ pattern, breakpoint }`。白名单之外的键一律不读，包括 `notes` / `rationale` /
`reason` / `assumptions`、`sequence` 整块，以及 `artifact` 里的 `html` / `css` 文件名。

第一项是产物粒度声明，取值闭集 `page` / `floor` / `component`，第十道门靠它决定判不判页级两维
（`R4-15`）；末项是合成型（`synth:` 前缀）的继承源，同一道门靠它把编出来的型连回真实型记录
（`R4-08`）。两项都是机读结构不是说辞：逐字段重建、只留字符串，形状不对即当缺席，整条透传等于给
自由文本开一个新入口。**闭集校验在门里，不在白名单里**：抄成两份就又是一次分家。**不新增旗标**
——`--trace` 本来就收。这两项漏进门就是两侧判定分家：判据在两侧逐字节相同，入参少一个，同一份合成
型页在生成侧过门、在本包报 `synth-inherit-unreadable`（`R4-14` 修的正是这个），因此入参本身也上了
锁，见 `tests/copied-layout-envelope-wiring.test.mjs`。

这就是 prose-invariance 的实现方式，不是它的说明：**同一份产物配两份措辞不同的生成侧说辞，输出必须
字节相同**。它靠四条形状要求成立——只读机读字段（读取面是白名单而不是黑名单，自由文本进不了判据）；
输出不含时间戳、耗时、随机 id，`<run-id>` 也不许用日期；路径一律相对化（产物侧相对产物根，资产侧
相对资产根，分隔符恒 `/`）；findings 与值映射行**排序稳定**，排序键写死在 `references/audit.md`。

`tests/prose-invariance.test.mjs` 必须存在，且必须断言：同一份产物 + 同一份资产 + 两份仅在白名单
外字段上不同的 trace，两次运行的 `lint-artifact.json` 序列化后**字节相同**。报告收录白名单读面
`trace`（未给 `--trace` 时为 `null`）：白名单外的键若被原样传入，会进这份读面并改变字节。这条
断言是本包核心主张的唯一证据；它不在，本节就退回成一句自述。

`sequence-approval` 有意不承接：那道门判的是生成侧的流程闸（候选序列有没有拍板），与产物合不合
资产无关，且它必须读 `sequence` 整块——承接它等于把白名单捅开一个口子，它留在 `page-theme-generate`。

## 十道门

十道，各自独立，**全是阻断，无报警档**——判的都是可证伪的事实（这一处用了什么、这份文档里有没有那条
条目），不是程度问题。程度问题不在门里：值映射的裁决交人填，回灌的报警不进 findings。前六道门函数（及它们依赖的模块级常量 `COLOR_EXEMPT` / `FONT_EXEMPT` / `CSS_NAMED_COLORS`）从
`page-theme-generate` 的 `gates.mjs` **抠出逐字对照**，`gate` 名逐字相同、判据字节级同一套；
`gates.mjs` 整文件不能拷（那边还带着 `outline.mjs` 与 `sequence-approval`）。拷哪几份 helper、
为什么不能跨包 import，见 `references/audit.md` §2。

| 门 | 判什么 | 一条会挂的输入 | 抓不住什么 |
| --- | --- | --- | --- |
| `color-literal` | 写死了色值：hex、颜色函数、命名色，含复合值内嵌 | `border: 1px solid #fff` | 自定义属性声明右侧的字面量（`--x: #fff`）不进射程 |
| `font-stack-literal` | 字体族不在资产已声明的字体栈内 | `font-family: var(--fontFamily-sans), "Comic Sans MS"` | 不判字重、字号、行高对不对 |
| `var-not-in-closed-set` | 引用了本资产闭集里没有的变量 | `var(--color-brand-primary)` | 不求值、不判环引用（本包没有 `var()` 求值器） |
| `primitive-leak` | 颜色跳过 semantic 直引 primitive | `var(--color-neutral-1)` | 改名成 `--brand-bg` 就溜了，须与下一道同时关上 |
| `unresolved-var` | 变量名反解不出 token 路径 | `var(--foo-bar-baz)` | 规规矩矩引 `--color-neutral-1` 就溜了，须与上一道同时关上 |
| `image-evidence` | trace 声称读图确认，图却指不出或解不开 | 指名一张资产里不存在的图 | 不证明你真看了图，只验声称与实物对不对得上 |

`primitive-leak` 与 `unresolved-var` 是**双闸门，必须同时关上**，两门在「顶层是 `color` 却既非
色相族也不在角色词表内」这一类上有意重叠，那是判据定义使然。射程与豁免三条与生成侧逐字同一套：
只有 `currentColor` 与 `transparent` 免检；`data-pt-widget="third-party"` 子树内部色与字体不归本
站主题管，**读不到那个标记就不豁免**；不扫自定义属性声明。样式藏哪都扫得到——外部 CSS、
`<style>`、内联 `style=`、`@media` 嵌套。余下四道里，前三道是本包新立的，判产物与资产**文档**之间的对账：

| 门 | 判什么 | 一条会挂的输入 | 抓不住什么 |
| --- | --- | --- | --- |
| `design-dont-section-missing` | 资产有未上屏项，`DESIGN.md` 却没有 §8 Don't 节 | 一份删掉 `## 8. Do's and Don'ts` 整节的资产；或只剩 `### Don't`、标题里没有 `8` | 不判缺 `DESIGN.md`（归采集侧），不判节里写得对不对。标题定位只看「含 `8` 与 `don`」：`## 8 Do's`（无点）与 `## §8` 都算有节；`## 18. … don't` 也会命中——这是这把尺的已知宽度 |
| `primitive-dont-id` | `observed: false` 的 primitive 色阶缺 `dontId`，或其 `dontId` 在 `DESIGN.md` 里对不上 | 删掉 fixture 里 `color.orange.1` 的 `dontId`；或把它改成 `DESIGN.md` 里没有的 id | 不判 `DESIGN.md` 那一行的**文字**是否真点到这条色阶；non-primitive 那一半归采集侧 |
| `voice-forbidden-term` | 产物文案命中 `voice.md` §V3 的 `avoid` / `forbidden_topics` | 正文里写「一站式」，而 §V3 的 `avoid` 表里有它 | 只按字面匹配，不判语义；图里的字、JS 拼出的文案抓不住 |

第十道 `layout-envelope` 与生成侧**判据逐字节同源**（`scripts/lib/layout-envelope-gate.mjs`，两侧
SHA256 相同，`copied-helpers.test.mjs` 锁字节、生成侧 `copied-layout-envelope.test.mjs` 再锁行为、
本包 `copied-layout-envelope-wiring.test.mjs` 锁两侧喂进去的入参）：

| 门 | 判什么 | 一条会挂的输入 | 抓不住什么 |
| --- | --- | --- | --- |
| `layout-envelope` | 产物的型身份、序列位置、容器声明越出资产 `layout-envelope.json` 的**阻断层**七维 | cta 打头的整页；`artifact` 只写了 html / css 文件名的 trace；把 `float-widget` 型排进层根序列 | **只吃 `blocking`**——`advisory`（报警层）与 `demoted` 一个字不读，它们是观测投影不是阈值，读它就是越界；单层内部几何（列数 / 排列 / 间距大小）一概不判；**粒度只信 `trace.artifact.kind`**，开场与首末两维只在声明 `page` 时判，缺席或写闭集外的值报 `artifact-kind-missing`，**不给 `--trace` 时这两维整块不判**——代价是不带 trace 的整页忘了写页脚本门抓不到；**声明与产物打架不判**（`kind: "floor"` 的 5 层整页、`kind: "page"` 的 0 层根）；包络缺席时整门写 `no-input`，但那不是「缺席也算合规」——包络自 `R4-10` 起是生成侧准入必交件，本包不跑准入，缺包络在本包由布局表 `layout-map.mjs` 退 1（`layout-envelope-missing`，`nextAction` 指着采集侧 `build-envelope.mjs`） |

## 两道 Don't 支门

契约把「未上屏项必须带 `dontId`，且必须等于 `DESIGN.md` 某行的 `id`」定成阻断（`asset-contract.md`
的 `dontId` 字段行 · 未上屏第一方具名色那条 · §3.7 硬门表），**对 primitive 没有任何豁免**。采集侧
`validate-asset.mjs` 只判 non-primitive；本包补上 primitive 那一半，另补一支它压根不看的 §8 节缺失。
判据逐字同源、按 token 类切开、**不重叠**——划界表在 `references/audit.md` §3。

**(b) `design-dont-section-missing`。** `DESIGN.md` 在、且资产至少有一条 `observed: false` 项，却找
不到 §8 Don't 节时报一条。采集侧校验器**从不找 §8 标题**，它只对 `dontId` 做全文子串匹配——这就是这
一支此前没人判的原因：一份把 §8 整节删掉、字段却填得齐齐整整的资产，在采集侧是绿的。

**(e) `primitive-dont-id`。** 判据 = 把契约原文应用到采集侧跳过的那一类：`observed: false` 的
primitive 色阶必须带 `dontId`，且该 `dontId` 必须在 `DESIGN.md` 里对得上。缺字段出 code
`primitive-dont-id-missing`，对不上出 `primitive-dont-id-orphan`，与采集侧的 `dont-id-missing` /
`dont-id-orphan` 一一对应。两支互斥（一个 token 要么没这个字段，要么有但对不上），故归一道门用
`code` 分列，写法与 `image-evidence` 一致；双闸门那两道之所以各占一道，是因为它们**重叠**。

primitive 的豁免曾是采集侧实现擅自加的：`needsDontId()` 曾对 primitive 直接返回 `false`（T1 前）。
自 T1 起 `dimension.*` / `fontFamily.*` 也纳入 `needsDontId()`，采集侧同样要求带 `dontId`；
本包 `(e) primitive-dont-id` 仍只判 **primitive 色阶**（`layer=primitive` ∧ `type=color`），非色 primitive 归 extract。

**已知后果：** 冻结 fixture **过门**——它两条 `observed: false`（`color.orange.1` 与
`color.accent.$root`）带的是**同一个** `dontId`，指向 §8 那一行 `design-dont-declared-accent-amber`。
这是**跨两包共指同一条 §8 行**：`orange.1` 是 primitive，归本包门 (e)；`accent.$root` 是 semantic，
归 extract 的 `dont-id-*`。不是「多个 primitive 共指」。两个 primitive 共指同一 `dontId` 的用例见
`tests/primitive-dont-id.test.mjs`。
现役 `workspace/page-theme/huaweicloud-com/` 报 **1 条**：`color.neutral.3` 是 `observed: false` 且无
`dontId`；同资产另外三条 `color.red.2` / `color.blue.1` / `color.blue.2` 都自带 `dontId` 且在
`DESIGN.md` 对得上，不报。四条里三条带了，而采集侧根本没要求 primitive 带——那三条是资产作者自愿写的，恰好证明契约意图是全都要带，漏掉的那条是真漏。

## 禁词门

`voice-forbidden-term` 按契约重写，**不沿用旧实现**。旧实现按 `/禁词|禁用词|forbidden|banned/i` 匹配
节标题，而契约把 `voice.md` 八节标题定死（`§V0` 一句话本质 / `§V1` 气质对 / `§V2` 槽位句式 / `§V3`
词汇 / `§V4` Don't / `§V5` 金句 / `§V6` 情境变调 / `§V7` 中文专章），禁词写在**§V3 词汇**里。那条正
则对冻结 fixture 与华为云两份 `voice.md` **零命中**，两份都开不了口。

- 节按契约标题定位，不按「禁词」这类词猜。
- 词表只取 `avoid` 与 `forbidden_topics`；**`prefer` 不是禁词表**。
- 两种落盘形状都要吃到词：markdown 列表加中文冒号的一行，以及 yaml 围栏里的对象数组（切法见 §4）。
- **绝不能把字段名 `avoid` 本身当成禁词**——旧切词就会犯这个错。
- 保住旧实现唯一正确的那条行为：空 `voice.md`、无 §V3 节、§V3 里没有这两个字段，**一律不触发，
  不是报错**。词表为空时这道门不开口。
- **已知盲区：** §V3 里的 yaml 围栏若 `parseYaml` 抛错，本门整块跳过该围栏，不报错、不阻断。围栏
  是唯一词源且写坏时，本门与「§V3 没有 avoid」不可分，会以 `no-input` 报绿。不在本门补资产校验。
- 射程边界明写：`forbidden_topics` 的条目是**主题**（「竞品点名贬低」），本门当字面词处理。真在
  贬低竞品却没写那几个字，本门抓不住——那是人读的事，不许让门看起来比射程大。

## 读图 trace

`image-evidence` 判据整份拷自生成侧：非 `high` 档字段**若**声称读图确认过，trace 必须指名具体字段加
具体图像文件；那张图必须是 `screenshots/index.json` 里 `thumb` 那一列所指的一份、随资产进 git、且结
构完整（探针走到 PNG 的 `IEND` / JPEG 的 `EOI`，像素流内容坏不坏不验）。本包与生成侧只差一处，且是
有意的：**资产目录是必给项，缺了硬失败**，不静默跳过这道门。

不给 `--trace` 时本门不开口，报告里那一行写 `status: "no-input"`。一份没有采集运行、一张图都没有
的资产上，正确做法是 trace 如实写 `imageConfirmed: false`，而不是编一个路径去满足门——冻结 fixture
就没有 `screenshots/`，它的正例产物不带任何 `imageConfirmed: true` 的字段。

## 值映射与回灌

**决策单元是「源值 × 用途」，不是逐处出现。** 同一个 (源值, 用途) 的多处出现归成一行，各处挂在该行
的 `occurrences[]` 里。一处一行会把「三十处同一个 `#0f7a6c` 换成 `--color-primary`」这一个必然同进
同退的决定拆成三十次裁决。

- **用途**是 CSS 属性归并后的用途类，由一张**显式映射表**从 `prop` 得出。未归并的 prop 归
  `other` 并**在报告里点名**，不许默默吐掉。表与点名形状在 `references/audit.md` §5。
- **行 id 稳定可复现**，从源值与用途派生，不用序号——否则删一行、加一行，回灌就整份对不上。
- **裁决枚举只有三个值**：`accept` / `reject` / `defer`。**`pending` 不是第四个枚举值**，它用
  「未填」表达（JSON 里 `null`，Markdown 里空单元格），schema 里不许写成四值枚举。
- **候选来自资产 closed-set 的 hex 反查**（给出 `path` 与 `cssVar`），**两档**：`hex-exact` 是剥掉
  alpha 后 RGB 逐位相等，`hex-near` 是 CIEDE2000 距离 `deltaE00 ≤ 2` 的近邻，每个候选都带实算的
  `deltaE00`。精确档恒排在最前。`closed-set.json` 不存源站变量名，按名反查这条路不存在；两档都反查
  不到就如实写「无候选」，**不编一个**，也不给「最接近的 token」——越过 `2` 一律仍是无候选，因为
  `near` 与 `different` 之间仍然没有机器判据，一个没有判据的排序不能冒充候选。近邻档不是那个判据的
  替代品：它出的是**递给人的选项**（`deltaE00` 只决定先给人看哪一个），不是「这两个色相同」的结论。
- **alpha 从检索键里剥出来，不从行键里剥。** `rgba(255,255,255,0.7)` 与 `#ffffff` 仍是两行（行 id 与
  `normalizedValue` 一个字节不动），但拿到同一批候选——闭集那一侧本来就是 alpha 盲的。`alpha < 1` 的
  行在 `note` 里写明「候选是不透明 token，执行侧写 `color-mix(in srgb, var(选中 token) p%, transparent)`」；
  alpha 恰为 `0` 不给候选。阈值 `2` 与这条剥离的理由写在 `references/audit.md` §6，**不接 CLI 旗标**。
- **`accept` 必须绑定到具体候选。** Markdown 新增一列「选中 token」（八列里的第六列，插在「候选
  token」与「裁决」之间），`value-map.json` 的行上对应 `acceptedCssVar`。同一个 hex 常有多个候选：
  冻结 fixture 的 `#0F7A6C` 就有四个（`--color-primary` / `--color-teal-2` / `--color-text-link` /
  `--component-button-primary-backgroundColor`，分属 semantic / primitive / component），只记
  `verdict` 加一句自由文本 `note` 的话，执行方只能猜、对账也无从谈起，而选中 primitive 那一个还会在
  引用处亮 `primitive-leak`。这一列是**生成侧承诺兑现率门唯一的执行依据**，所以它自带四种阻断加一
  种报警。
- **`--out` 一律把它留空，哪怕该行只有一个候选。** 预填就是本包在裁；而「只有一个候选」不等于
  「该换成它」——那一处可能压根不该迁。
- 双份产出：机读 `value-map.json` + 人读 `value-map.md`。Markdown 八列固定、可在编辑器里直接填，
  填完走 `--read-back` 读回；回灌**不回写**这两份文件，人填的那份是输入。
- 回灌的报警落 `warnings[]`，**不进 findings、不影响退出码**：门无报警档这句话不能被回灌写破。
  十三种回灌情况（七种阻断、五种报警、一种 pending）的处置与各自理由逐条写在
  `references/audit.md` §6，实现照那张表，不得自行合并。

### 非色值映射（`type-map.mjs`）——另一张表，不是色表加一列

字体栈 / 字号 / 圆角 / 描边宽 / 间距走 `scripts/type-map.mjs`，产出 `type-map.json` +
`type-map.md`，行 id 前缀 `tm-`，与色表 `vm-` 分家。**不许两种形状挤进同一张表却仍叫同一个 id
体系**，理由是数据事实：闭集里同一个数字常常跨类目复用（现役华为云资产的 `24px` 同时是
`dimension.lineHeight.2` 与 `dimension.radius.2`），只按数值反查会把行高变量当圆角候选递给人。

- **决策单元是「源值 × 类目」**，类目五个：`font-stack` / `font-size` / `radius` / `stroke` /
  `space`，顺序固定。类目由 prop **白名单**得出；白名单外的 prop **一律不收，不是归 `other`**。
- **候选按类目分桶反查**：`radius` 行只查闭集里 radius 类目的条目（path 段含 `radius` 或叶子是
  `rounded`），查不到就是无候选。字体栈另有近义档 `stack-near`（去掉通用族名后仍有交集）。
- **裁决四值**：`accept` / `reject` / `defer` / **`omit`**。`omit` 是「资产里根本没有这个值，承认
  缺口」，**只许零候选行用**；有候选还 omit 报 `omit-with-candidate`。它与 `defer` 在生成侧的门上
  **等价**（都算已背书、都不进兑现分母），差别只在这一条合法性检查——别把它说成多守了别的。
- **`lossy` 是 accept 行上的旗标，不是第五个裁决值**：选中近义栈时必须标（`lossy-required`），标了
  却选中精确候选则阻断（`lossy-without-near`）。Markdown 九列，`lossy` 在「裁决」与「备注」之间。
- `omit` 与 `lossy` 这两件事，**生成侧准入还会拿改造前产物重算再判一次**。本包这一侧判过，不等于
  执行那一侧守住了：手写一份 `verdict: "pass"` 的信封能把回灌的结论整个绕过去。
- **零值、px 之外的长度、`var()` / `calc()` 不进表**，但落进 `summary.outOfScopeValues` 并在
  Markdown 里单列一节——不静默丢，好让人看得见表没管这些。
- 现役与冻结夹具的 `tokens.json` 已有 `dimension.spacing` 组（T7 从 raw/ 归纳），间距行可反查候选；零候选行的正路仍是 `omit`。
  这不是判据太松，是资产确实没有这个值。

### 两表交叉：一张绿了不算两张都绿

**两张表必须一起 pass，这条判定挂在 `--read-back` 上，不挂在旗标上。** 回灌任一张表时，本包按
对表的默认文件名到**本表读回件同目录**取它（两张表由步 4 落在同一个目录），读回来一起判：任一表
blocked，两边都退 1 并记一条 `maps-cross-blocked`。挂在可选旗标上等于一道空门——按硬序跑、谁也
没提对表时，「色表 pass、非色表 blocked」照样退 0，而那正是这道门要堵的那一种静默绿。

- **该不该有对表，由产物重算得出，不看文件系统。** 对表按同一份产物重算有行、却取不到它的读回
  件，同样是 `maps-cross-blocked`（同一个 code，两种 `reason`），所以把对表 md 挪走绕不过去。
  对表重算零行时这道判定不开口、退 0——它的读回必然 pass，跳过与读回等价。这条判据与生成侧准入
  的 `type-verdicts-missing` 同一个形状（那边也是拿 `--before` 重算，有行就必须给）。
- 回灌 JSON 上多一个 `peerMap`（`{ mapKind, file, verdict }`，无对表时为 `null`）：对表到底被读回
  过没有，得在报告里看得出来，否则「没找到就放过」与「读了且是 pass」写出来一模一样。

## 产物落哪

在本仓库内落 `workspace/page-theme-audit/<run-id>/`：`lint-artifact.json`、`value-map.json`、
`value-map.md`、`type-map.json`、`type-map.md`。`<run-id>` 用稳定短 id（产物名加 styleSetId 那类），**不用时间戳**——用了时间戳，
prose-invariance 那条字节相同的断言会在路径这一层立刻失效。消费仓库另有约定时听消费仓库的。脚本中间
JSON 是过程件，不是交付。**报告一律不得写进资产目录**，也不得并进 `run-meta.json`：资产是采集侧的产
物，本包只读不写。同理不得改动被验的产物——本包只出结论。

## 不阻塞

会退 1 的只有四件事：门有阻断、资产前置读不开、产物一份文件都收不到、回灌读不懂（含「选中 token」
那一族四种阻断，以及对表那一条 `maps-cross-blocked`）。别的都不阻断——

- 资产是单页的、带 `blockers`、一堆字段 `observed: false`：照常出结论，受阻范围只影响可用判据的
  多少，不构成拒绝验证。
- 三种「门没有输入」一律不开口、退 0，不是报错：不给 `--trace` 时的 `image-evidence`；`voice.md`
  无 §V3 或 §V3 里没有 `avoid` / `forbidden_topics` 时的禁词门；资产里没有任何 `observed: false`
  项时的两道 Don't 支门。
- 值映射整列 pending：退 0。pending 是「尚未裁决」，不是「裁决失败」。
- 产物用了资产外的**排版**或**间距**字面量：不进**色值**映射（那里没有「源值 × 用途」这个决策
  单元），改进 `type-map.mjs` 那张「源值 × 类目」表；越界的字体族仍由 `font-stack-literal` 挡。
  两张表都不收的（`line-height` / `font-weight` / 复合简写里的分量 / 零值 / 非 px 长度）如实落在
  非色报告的「射程外的值」一节，不静默吐掉、也不假装挡住了。

**不为等人拍板而停下。** 值映射报告出完就回话结束，带着填好的 Markdown 回来是下一次调用。需要
人裁的事一律降级成报告里的 pending 行，不新开清单文件。

## 本包不做的一件事

**以线上源站为基线的像素 / 几何还原度对账，本包不做，十道门一道都不覆盖它。** 本包的基线是资产
（`tokens.json` / `patterns` / `voice.md` / 闭集），产物是静态 `.html` + `.css`，全程不开浏览器、
零运行时依赖——这三条决定了「这一页跟真站长得像不像」超出射程。基线换成 D2C 设计稿归
`fidelity-audit`；基线是**线上源站**的那一格今天**谁都不做**，是已知缺口不是别人的活。

旧单体包里曾有一份 `pixel-check.mjs` 干这件事，2026-09-02 随包删除并**正式判死、不回收**：它要
`sharp` / `pixelmatch` / `playwright`，喂本包 `source-shape` 那道零依赖门当场三条违规。真要补这一格，
从零设计、另开票，别从 git 里捞那份代码。
