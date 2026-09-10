/**
 * `artifact-kind-mismatch` 的判据源：声明与产物打架（`R5-B1`）。
 *
 * `R4-15` 把产物粒度从「按层根数猜」换成「读 `trace.artifact.kind`」。误伤没了，谎报空间是新开
 * 的：`kind: "floor"` 写在一个 5 层整页上，页级两维（`page-sequence-missing` 与包络门的
 * `page-shell-ends-missing` / `body-start-out-of-envelope`）整块闭嘴，门一声不响。本文件只补这一
 * 个口子，一维都不多判。
 *
 * ## 这不是把启发式请回来
 *
 * **声明仍是唯一信源。** 本文件一次都不推断 kind，也不回答「这份产物到底是什么粒度」——它只
 * 回答一个可证伪的是非题：**声明说「不是页」，而产物首个层根是 `navbar` 型、末个层根是
 * `footer` 型吗？** 两者同时成立才报。判不出、读不到、只对上一头，一律不开口。
 *
 * 「按层根数猜粒度」与「拿形态做一致性交叉检查」的差别就在这里：前者要在没有声明时**替**产物
 * 定粒度，所以必须挑一个阈值（`PAGE_LEVEL_MIN_ROOTS`），而阈值两头都错——多层片段挨误伤、
 * 1 层的页漏网；后者只在**已有声明**时问「这个声明与眼前这份产物能不能同时为真」，没有阈值可挑。
 *
 * ## 阈值为什么不会误伤合法产物
 *
 * 判据里唯一那个数字是 `roots.length >= 2`，它**不是粒度阈值**，是「一个层根不能既当首又当末」
 * 的退化保护：把它降到 1，一条结论都不变——一个层根不可能同时是 navbar 型与 footer 型；把它升
 * 上去只会**少**判，不会多判。`roots.length` 一次都没有拿去和「页该有几层」比，报不报只看页壳
 * 两端在不在（`tests/artifact-kind-mismatch.test.mjs` 里「不按层根数猜」两条钉着：4 层的片段照样
 * 放行，而 2 层的页壳照样报）。
 *
 * 真正的判据是页壳两端同时在场，理由是资产包络的阻断层规律 `page-sequence-navbar-first-footer-last`
 * ——它是本资产里反例为零的硬约束：**页**首层是 navbar、末层是 footer。反过来说，一份首层挂着
 * 站级顶栏、末层挂着站级页脚的产物，中间那些层就是页正文；这样的东西不存在「它其实只是个楼层
 * 片段」的读法。所以本码不判程度，判的是自我矛盾。
 *
 * 合法产物为什么撞不上，逐类点名：
 * - 单做一个 navbar / 单做一个 footer 的楼层片段：只对上一头，不报。
 * - 「顶栏 + 首屏」「正文 + 页脚」这类带一头页壳的片段：同上，不报。
 * - 多层楼层片段（cta + feature、feature×3）：一头都对不上，不报。
 * - 页壳排错位（navbar 排在第二位）：首末不是它们，本码不报；那件事归包络门的
 *   `page-shell-out-of-order`，修法是重排，与本码的修法（改声明）不是一件事。
 *
 * ## 反向不判（声明 `page` 而产物只有一层 / 没有页壳）
 *
 * 三条理由，逐条可查：
 * ① `R4-15` 已钉死「只有一层的页」是合法形状（案 ⑤：1 层的页照报 `page-sequence-missing`），
 *    所以层根数证伪不了 `page` 声明——没有可用的判据。
 * ② 声明 `page` 却缺页壳，已由包络门 `page-shell-ends-missing` 接管，它的修法是**补层**；本码的
 *    修法是**改声明**。同一份缺陷发两个修法相反的码，下游分不开该做哪个（`R4-07`：两种缺陷才
 *    配两个码）。
 * ③ `kind: "page"` 写在 0 层根上：有 `sequence` 时 `floor-pattern-attr-missing` 逐步报，无 `sequence`
 *    时 `page-sequence-missing` 报。已有码覆盖，本码不重复开口。
 *
 * ## 抓不住什么
 *
 * - **只丢一件页壳就溜过去**：`kind: "floor"` 写在「navbar + 4 层、没有页脚」的产物上，本码放行。
 *   这是有意付的代价——判它红就得回到层根数。
 * - **合成型（`synth:` 前缀）层根**在 `floors[]` 里查不到型记录，taxonomy 取不到，本码不开口。
 *   误报方向偏放行，与包络门型级四维那条「取不到就不判本维」同向。
 * - **`floor-index.json` 读不出 `floors[]`** 时不开口：那件事同一趟由包络门的
 *   `floor-index-unreadable` 阻断，本码不发第二条。
 * - 不看 CSS、不看 `sequence`、不看 DOM 层级——只看层根序列的两端与那两个型的 taxonomy。
 */

import { readArtifactKind, readFloorRecords } from './layout-envelope-gate.mjs'

/**
 * 声明「不是页」的那两个粒度。`page` 不在此列——反向不判，理由见文件头。
 * 与 `ARTIFACT_KINDS`（三值闭集）不是同一张表：那张管「声明合不合法」，这张管「谁进本码射程」。
 */
export const NON_PAGE_KINDS = ['floor', 'component']

/**
 * 页壳两端的 taxonomy。取值与 `layout-envelope-gate.mjs` 里那两个同名常量相同，都出自资产合同
 * §4.1 的 taxonomy 闭集，**不从观测集合现取**（现取会让判据退化成「等于观测到的那些」）。
 *
 * 这里另存一份而不是 import 那两个：`layout-envelope-gate.mjs` 与 page-theme-audit 那份逐字节
 * 相同（`copied-layout-envelope.test.mjs` 锁着），给它加一个 export 就得同步改 audit 包。代价是
 * 两处词条要一起改，写在这里让下一个人看得见。
 */
const SHELL_FIRST_TAXONOMY = 'navbar'
const SHELL_LAST_TAXONOMY = 'footer'

/**
 * 判「声明不是页，产物却两端挂着页壳」。
 *
 * 返回的是 finding 的**明细**（不带 `gate`）：调用方是 `paint-check.mjs`，由它套上门名，与那边
 * 别的 code 走同一个 `finding()`。判据源不知道自己挂在哪道门上，才能被单独喂输入。
 *
 * @param {{ roots?: Array<{pattern: string}>, trace?: object|null, assetDir?: string|null }} input
 * @returns {Array<object>} 0 条或 1 条。本码不逐层报——打架的是那一个声明，不是某一层。
 */
export function checkArtifactKindMismatch({ roots = [], trace = null, assetDir = null } = {}) {
	if (!assetDir) return []
	const kind = readArtifactKind(trace)
	if (!NON_PAGE_KINDS.includes(kind)) return []
	if (roots.length < 2) return []

	const floors = readFloorRecords(assetDir)
	if (!floors) return []

	const first = roots[0]
	const last = roots[roots.length - 1]
	if (taxonomyOf(floors, first.pattern) !== SHELL_FIRST_TAXONOMY) return []
	if (taxonomyOf(floors, last.pattern) !== SHELL_LAST_TAXONOMY) return []

	return [
		{
			code: 'artifact-kind-mismatch',
			at: 'trace.artifact.kind',
			kind,
			shell: { first: first.pattern, last: last.pattern },
			reason: `trace 声明 artifact.kind: "${kind}"，产物却首层挂着 ${SHELL_FIRST_TAXONOMY} 型 \`${first.pattern}\`、末层挂着 ${SHELL_LAST_TAXONOMY} 型 \`${last.pattern}\`：两端页壳齐全的东西是整页，不是楼层片段。粒度以声明为准，所以这里要改的是声明——写成 "page" 之后页级两维（page-sequence-missing、page-shell-ends-missing / body-start-out-of-envelope）才判得到这份产物。本码不数层根：只差一件页壳的多层片段照样放行`,
		},
	]
}

const taxonomyOf = (floors, id) => {
	const floor = floors.get(id)
	return floor && typeof floor.taxonomy === 'string' ? floor.taxonomy : null
}
