/**
 * 优化模式的九道迁移门。另起一套，不塞进 `runAllGates`。
 *
 * | 门 | 判什么 | 抓不住什么 |
 * | --- | --- | --- |
 * | `accept-fulfillment` | 色值 accept 行每一处 occurrence 都不再含源值，已写成 `var(<acceptedCssVar>)`，且该变量在变量层声明过、值对得上；源值带 alpha 时那一处还得有承载体 | 兑现率分母只数 accept 行的 occurrence；`defer` / `reject` 一处不数（那是 `verdict-hold-lock` 的射程） |
 * | `literal-verdict-backing` | 改造后剩下的每一处色值字面量，都能在裁决记录里找到一行 `defer` 或 `reject` | 自定义属性声明右侧不进射程，否则变量层自己会把整片报成未背书 |
 * | `type-accept-fulfillment` | **非色** accept 行同上，值比对走闭集的类目归一值（`12px` / 字体栈）而不是 hex | 与色门同一套盲区；`omit` / `defer` / `reject` 都不进分母 |
 * | `type-literal-backing` | 改造后剩下的每一处非色字面量，都能在非色裁决记录里找到一行 `defer` / `reject` / `omit` | 射程只到 `type-rows.mjs` 的 prop 白名单，见那份模块头 |
 * | `verdict-hold-lock` | 裁成 `defer` / `reject` / `omit` 的行，**每一处** occurrence 在改造后仍原样带着源值 | 只按 `file + selector + prop` 认那一组；行本身没裁（`verdict` 为 null）不进射程 |
 * | `content-lock` | 可见文本、`href`、`src`、`alt`、`srcset`、`poster` 六条标签序列 + CSS 声明里的 `url()` 序列，改造前后逐位相同 | JS 运行时拼出来的字；`sizes`；`form[action]`；`data:` URI 与 `url(#fragment)`（前者归色门，后者不是外链） |
 * | `structure-lock` | **开标签名**的有序序列改造前后逐位相同（小写归一） | 只改 class / `id` / `data-*` / 属性顺序；JS 里的路由与接口——见 `structure-lock.mjs` 模块头，那半句在纯 HTML+CSS 上不可机检，本门不占那个编号 |
 * | `breakpoint-lock` | `--after` 不含 `--before` 里没有的 `@media` 宽度条件（**判增量**） | `--before` 里就有的采样宽 `@media`——那是资产 / 采集侧的事；不含 `width` 的媒体条件；`@container` |
 * | `theme-api-lock` | `--after` 新引入的 `var()` 引用（after 引用集减 before 引用集）都在 `closed-set.json` 内 | `--before` 里就有的源站私有变量引用（渐进迁移必须绿）；变量层右侧写错值（那是两道兑现门的射程） |
 *
 * 后两道都**判增量、不判绝对集合**，判据里没有任何写死的断点数字或变量名前缀：判绝对集合会让
 * 老页每页必红（源站 CSS 本来就有资产 §5 之外的弱档、本来就在引源站私有变量），而优化模式的合法
 * 改动（换色值为 `var()`、建变量层、换 class）压根不碰 `@media` 条件、也不新引闭集外的变量名。
 *
 * 色与非色是**两张表两份裁决记录**（`vm-` / `tm-`），门也各判各的：一张表的行永远不会
 * 成为另一张表的背书。`omit` 在门上与 `defer` 等价（都算已背书、都不进兑现分母），它多
 * 守的那一条（只许零候选行用）在回灌那侧，外加准入的 `type-verdicts-omit-with-candidate`。
 *
 * `verdict-hold-lock`（2026-09-03 加，第九道）与 `literal-verdict-backing` 是**相反方向的两问**，
 * 不许合并、不许互相吞：残余背书问「还留着的字面量有没有裁决背书」，本门问「说了不动的动了没有」。
 * 一次真实迁移里 88 行色值有 75 行裁 `defer`，执行侧照样把那 123 处全换成了 `var()`，八道门一道
 * 没响——`accept-fulfillment` 的分母只数 accept 行，而残余背书只查**还在的**字面量，那些字面量
 * 已经没了。「不该动的动了」在原来那八道门里没有任何一道能表达，这就是本门的编号来由。
 *
 * 射程边界（不许让门看起来比射程大）：
 *
 * - 没有行号。css-scan 的声明只有 `{file, selector, prop, value, widget}`，定位只能按
 *   `file + selector + prop` 重扫改造后的产物。
 * - 同一选择器同一属性有多条规则（级联、重复声明）时，对不上是哪一条。判据因此保守：
 *   那一组声明里一条都不许再含源值，且至少一条含选中的 `var()`。误报方向是「把同 prop
 *   上该保留的另一个值报成漏做」，那时的出路是把该行裁 `defer`，不是放宽判据。
 * - `border: 1px solid #123456` 这类复合值，occurrence 的 `value` 只是抽出来的那个 hex、不是整串。
 * - 选择器被改写（加一层、换类名）会让整行对不上，报 `accept-occurrence-lost`。优化模式
 *   本来就不该改选择器，但门抓不住「改了选择器」这件事本身——它只知道那一处找不到了。
 * - `verdict-hold-lock` 继承上面三条**全部**盲区，因为它用的是同一个 `groupAfter`：没有行号；
 *   同 selector 同 prop 多条规则时对不上是哪一条（判据因此保守成「那一组里**一条都不带**源值
 *   才算被改」，同 prop 上有另一条带着源值就算原样保留，误报方向偏放行）；选择器被改写时它
 *   报 `held-occurrence-lost`，同样不知道「改了选择器」这件事本身。它**不**继承兑现门那条
 *   「分母只数 accept 行」——那正好是它的射程。它也不看变量层：held 行本来就不该有选中 token。
 * - `verdict-hold-lock` 只认「源值还在不在」，不认「有没有被换成别的东西」：把 `#efefef`
 *   删成空声明、换成 `var(--x)`、换成另一个 hex，报的都是同一条 `held-literal-removed`。
 *   反过来，把 `color: #efefef` 改成 `color: #efefef !important`、或挪进同选择器的另一条声明，
 *   源值还在、本门放行——它守的是「那个值还在那一组里」，不是「那一行一个字节没动」。
 * - `verdict-hold-lock` 与 `theme-api-lock` 在「held 行的字面量被换成 `var(--por-x)`」这一处
 *   **必然同时响**，是有意重叠：后者只在换成的名字**不在闭集**时才响，换成闭集内的名字
 *   （`var(--color-primary)`）它按定义放行，那时只有本门能报。两道各自还有对方够不到的地方。
 * - 内容锁抓不住 JS 运行时拼出来的字。HTML 实体按解码后比。
 * - 内容锁的 CSS `url()` 那半边**按声明走**，所以它同时覆盖 `.css` 文件与 HTML 内联
 *   `style=`；`--before` 侧一条 url 都没有时那半边不开口，但只要另一半（HTML）有输入，
 *   整门仍写 `ran`。两半都没输入才写 `no-input`。
 * - 结构锁与内容锁**分开两道门**，卸任一处接线只让那一道哑。结构锁不报
 *   `content-file-missing`：那件事内容锁已经报了。
 * - 变量层里把闭集已有的名字覆写成别的值（`--color-primary: #f00`、
 *   `--shape-radius-container: 20px`），`color-literal` 按定义不扫，八道门里只有两道兑现门
 *   （`accept-fulfillment` / `type-accept-fulfillment`）的值比对能撞上它，而那只覆盖被
 *   accept 选中的那些名字。别的名字写错了，机器无人接管。非色进来之后洞的形状没变，
 *   只是撞得上的名字多了一类。
 */

import { normalizeColorKey } from '../vendor/page-theme-core/index.mjs'
import { colorLiterals, COLOR_EXEMPT } from './gates.mjs'
import { varReferences } from './closed-set.mjs'
import { usageOf } from './value-rows.mjs'
import { typeLiteralsOf, closedSetTypeValue, normalizeFontStack, normalizeDimension } from './type-rows.mjs'
import { extractContentLock, extractCssUrlSequence } from './content-lock.mjs'
import { extractTagSequence } from './structure-lock.mjs'
import { extractMediaWidthConditions, collectMediaWidthConditions } from './breakpoint-lock.mjs'

export const MIGRATION_GATE_ORDER = [
	'accept-fulfillment',
	'literal-verdict-backing',
	'type-accept-fulfillment',
	'type-literal-backing',
	'verdict-hold-lock',
	'content-lock',
	'structure-lock',
	'breakpoint-lock',
	'theme-api-lock',
]

const FINDING_REASON = {
	'accept-occurrence-lost': '改造后按 file+selector+prop 对不上这一处：选择器被改写或声明被删，按漏做记',
	'accept-literal-remains': '该处仍含源值字面量：裁成 accept 的必须换成选中的 var()',
	'accept-var-missing': '源值没了但没写成该行选中的 var()',
	'accept-var-undeclared': '变量层找不到该 cssVar 的自定义属性声明',
	'accept-var-value-mismatch': '变量层右侧不等于闭集查表值',
	'accept-alpha-carrier-missing':
		'源值带 alpha 而这一处写成了裸 var()：候选是不透明 token，透明度必须由 color-mix() 之类的承载体带着，否则半透明当场变实心',
	'literal-unbacked': '改造后出现裁决记录里没有对应行的色值字面量',
	'literal-pending': '对上了但该行还没裁（verdict 是 null）',
	'literal-accept-residue': '对上了却仍是 accept：源值还留在产物里',
	'type-accept-occurrence-lost': '改造后按 file+selector+prop 对不上这一处：选择器被改写或声明被删，按漏做记',
	'type-accept-literal-remains': '该处仍含源值字面量：裁成 accept 的必须换成选中的 var()',
	'type-accept-var-missing': '源值没了但没写成该行选中的 var()',
	'type-accept-var-undeclared': '变量层找不到该 cssVar 的自定义属性声明',
	'type-accept-var-value-mismatch': '变量层右侧不等于闭集查表值（按类目归一后比，不比字面串）',
	'type-literal-unbacked': '改造后出现非色裁决记录里没有对应行的字面量',
	'type-literal-pending': '对上了但该行还没裁（verdict 是 null）',
	'type-literal-accept-residue': '对上了却仍是 accept：源值还留在产物里',
	'content-file-missing': '改造前有这份 HTML，改造后没有',
	'text-changed': '可见文本序列被改了',
	'href-changed': 'href 序列被改了',
	'src-changed': 'src 序列被改了',
	'alt-changed': 'alt 序列被改了',
	'srcset-changed': 'srcset 序列被改了（`<picture><source>` 并进这一条，原样比、不拆描述符）',
	'poster-changed': 'poster 序列被改了',
	'css-url-changed': 'CSS 声明里的 url() 序列被改了（剥一层引号后比，`data:` 与 `url(#…)` 不进射程）',
	'tag-changed': '开标签名序列被改了：包一层、换标签、抽一层、两段互换都算换骨架',
	'media-condition-added': '改造后长出了 --before 里没有的 @media 宽度条件：断点只能来自资产 DESIGN.md §5，不许把采样宽度当断点',
	'foreign-var-introduced': '改造后新引入了闭集之外的 var() 引用：主题 API 只能是 closed-set.json 里的名字',
	'held-literal-removed': '这一行裁的是暂缓 / 拒绝 / 无对应，那一组声明里却已经找不到源值了：越权执行',
	'held-occurrence-lost': '这一行裁的是暂缓 / 拒绝 / 无对应，改造后按 file+selector+prop 连那一组声明都对不上了',
}

const finding = (gate, code, detail = {}) => {
	const reason = String(detail.reason ?? FINDING_REASON[code] ?? '').trim()
	return { gate, level: 'block', code, ...detail, reason }
}

export function closedSetHex(closedSet, cssVar) {
	const entry = closedSet.byVar.get(cssVar)
	if (!entry) return null
	if (entry.alias) return typeof entry.resolved?.hex === 'string' ? entry.resolved.hex : null
	return entry.value && typeof entry.value === 'object' && typeof entry.value.hex === 'string' ? entry.value.hex : null
}

function posixFile(file) {
	return String(file ?? '').split('\\').join('/')
}

function valueHasSource(value, prop, normalized) {
	for (const lit of colorLiterals(value, { named: !String(prop).startsWith('font') })) {
		if (COLOR_EXEMPT.has(lit.toLowerCase())) continue
		if (normalizeColorKey(lit) === normalized) return true
	}
	return false
}

function valueHasAcceptedVar(value, cssVar) {
	return varReferences(value).includes(cssVar)
}

/**
 * 归一色键末两位就是 alpha。**从 `normalizedValue` 现算，不读裁决记录里的 `alpha` 字段**：
 * 信封是手写得出来的，行 id 与归一值有准入的 `verdicts-stale` 兜着，多出来的字段没有。
 */
function alphaOfNormalized(normalized) {
	const m = /^#[0-9a-f]{6}([0-9a-f]{2})$/i.exec(String(normalized ?? ''))
	return m ? parseInt(m[1], 16) / 255 : 1
}

/**
 * 透明度承载体。`color-mix(in srgb, var(--t) 70%, transparent)` 是审计侧值映射备注里点名的
 * 写法，相对色语法 `rgb(from var(--t) r g b / 0.7)` 同样算。两种都只是「这一处确实还在调
 * 透明度」的证据，本门**不比对百分数**：归一把 alpha 量化成一个 hex 字节（`0.7` → `b3` →
 * `70.2%`），比数字会把合法写法判成不合法。
 */
const ALPHA_CARRIER = /color-mix\s*\(|\b(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch|color)\s*\(\s*from\b/i

/**
 * 半透明源值被换成裸 `var()` 时报。这是 2026-09-03 值映射剥离 alpha（半透明行的候选改成不
 * 透明 token）之后必须同时补上的那一半：不补的话「accept 一个 alpha 0.7 的行、执行侧写成
 * 裸 `var()`」在机器眼里完全兑现，而页面上那块半透明玻璃当场变实心。
 *
 * 只在「那一组里确实有引用选中 token 的声明」时才判：一处都没引用是 `accept-var-missing`
 * 的事，两条同时报会让「差在哪」不可读。
 */
function alphaCarrierMissing(group, cssVar, normalizedValue) {
	if (alphaOfNormalized(normalizedValue) >= 1) return false
	const carrying = group.filter((d) => valueHasAcceptedVar(d.value, cssVar))
	return carrying.length > 0 && !carrying.some((d) => ALPHA_CARRIER.test(String(d.value)))
}

function groupAfter(declarations, occ) {
	const file = posixFile(occ.file)
	return declarations.filter((d) => posixFile(d.file) === file && d.selector === occ.selector && d.prop === occ.prop)
}

function customPropDecls(declarations, cssVar) {
	const name = String(cssVar).toLowerCase()
	return declarations.filter((d) => d.prop === name)
}

function occDetail(row, occ) {
	return {
		rowId: row.id,
		sourceValue: row.sourceValue,
		acceptedCssVar: row.acceptedCssVar,
		file: posixFile(occ.file),
		selector: occ.selector,
		prop: occ.prop,
	}
}

/** 变量层是否声明、值是否对得上。gate 与兑现率账共用，改一处两边一起变。 */
export function inspectVarLayer(afterDeclarations, closedSet, cssVar) {
	const expected = closedSetHex(closedSet, cssVar)
	const decls = customPropDecls(afterDeclarations, cssVar)
	const declaredOk =
		decls.length > 0 && decls.every((d) => String(d.value).trim().toLowerCase() === String(expected ?? '').toLowerCase())
	return {
		expected,
		decls,
		declaredOk,
		undeclared: decls.length === 0,
		mismatch: decls.length > 0 && !declaredOk,
	}
}

/** 单处 occurrence 在改造后那一组里的状态。gate 与兑现率账共用。 */
export function inspectOccurrence(afterDeclarations, row, occ, cssVar) {
	const group = groupAfter(afterDeclarations, occ)
	return {
		group,
		lost: group.length === 0,
		literalRemains: group.length > 0 && group.some((d) => valueHasSource(d.value, d.prop, row.normalizedValue)),
		varMissing: group.length > 0 && !group.some((d) => valueHasAcceptedVar(d.value, cssVar)),
	}
}

export function occurrenceFulfilled(occState, layer) {
	return !occState.lost && !occState.literalRemains && !occState.varMissing && layer.declaredOk
}

export function gateAcceptFulfillment({ afterDeclarations, rows, closedSet }) {
	const out = []
	const undeclaredByVar = new Map()
	for (const row of rows ?? []) {
		if (row.verdict !== 'accept') continue
		const cssVar = row.acceptedCssVar
		const layer = inspectVarLayer(afterDeclarations, closedSet, cssVar)
		for (const occ of row.occurrences ?? []) {
			const state = inspectOccurrence(afterDeclarations, row, occ, cssVar)
			const base = occDetail(row, occ)
			if (state.lost) {
				out.push(finding('accept-fulfillment', 'accept-occurrence-lost', base))
			} else {
				if (state.literalRemains) out.push(finding('accept-fulfillment', 'accept-literal-remains', base))
				if (state.varMissing) out.push(finding('accept-fulfillment', 'accept-var-missing', base))
				if (alphaCarrierMissing(state.group, cssVar, row.normalizedValue)) {
					out.push(finding('accept-fulfillment', 'accept-alpha-carrier-missing', base))
				}
			}
			if (layer.mismatch) out.push(finding('accept-fulfillment', 'accept-var-value-mismatch', base))
			if (layer.undeclared) {
				const prev = undeclaredByVar.get(cssVar) ?? {
					occurrenceCount: 0,
					rowId: row.id,
					sourceValue: row.sourceValue,
				}
				prev.occurrenceCount++
				undeclaredByVar.set(cssVar, prev)
			}
		}
	}
	for (const [cssVar, info] of undeclaredByVar) {
		out.push(
			finding('accept-fulfillment', 'accept-var-undeclared', {
				acceptedCssVar: cssVar,
				occurrenceCount: info.occurrenceCount,
				rowId: info.rowId,
				sourceValue: info.sourceValue,
				reason: `变量层找不到 ${cssVar} 的自定义属性声明，影响 ${info.occurrenceCount} 处`,
			}),
		)
	}
	return out
}

export function computeFulfillment({ afterDeclarations, rows, closedSet }) {
	const acceptRows = (rows ?? []).filter((r) => r.verdict === 'accept')
	let acceptOccurrences = 0
	let fulfilled = 0
	for (const row of acceptRows) {
		const cssVar = row.acceptedCssVar
		const layer = inspectVarLayer(afterDeclarations, closedSet, cssVar)
		for (const occ of row.occurrences ?? []) {
			acceptOccurrences++
			const state = inspectOccurrence(afterDeclarations, row, occ, cssVar)
			if (occurrenceFulfilled(state, layer)) fulfilled++
		}
	}
	const rate = acceptOccurrences === 0 ? null : fulfilled / acceptOccurrences
	return { acceptRows: acceptRows.length, acceptOccurrences, fulfilled, rate }
}

export function gateLiteralVerdictBacking({ afterDeclarations, rows }) {
	const byKey = new Map((rows ?? []).map((r) => [`${r.usage}\0${r.normalizedValue}`, r]))
	const out = []
	for (const d of afterDeclarations ?? []) {
		if (d.widget || String(d.prop).startsWith('--')) continue
		for (const literal of colorLiterals(d.value, { named: !String(d.prop).startsWith('font') })) {
			if (COLOR_EXEMPT.has(literal.toLowerCase())) continue
			const normalizedValue = normalizeColorKey(literal)
			if (!normalizedValue) continue
			const usage = usageOf(d.prop)
			const row = byKey.get(`${usage}\0${normalizedValue}`)
			const base = { file: posixFile(d.file), selector: d.selector, prop: d.prop, value: literal, usage }
			if (!row) {
				out.push(finding('literal-verdict-backing', 'literal-unbacked', base))
				continue
			}
			if (row.verdict == null) {
				out.push(finding('literal-verdict-backing', 'literal-pending', base))
				continue
			}
			if (row.verdict === 'accept') {
				out.push(finding('literal-verdict-backing', 'literal-accept-residue', base))
			}
		}
	}
	return out
}

/* ── 非色（type）侧。判据与色侧同构，差别只在「值怎么比」这一处。 ────────────────── */

/**
 * 变量层里这个 cssVar 声明得对不对。
 *
 * 与色侧的 `inspectVarLayer` 不同的是**比法**：闭集里非色条目的值是 `{value, unit}` 或
 * 字体栈数组，不是 hex 串，所以不能大小写不敏感地比字面。这里两边都过一遍类目归一
 * （`12px` / `system-ui, pingfang sc, …`）再比——否则 `12.0px` 或加了引号的族名会被
 * 判成不一致，而那两种写法在 CSS 里是同一个值。
 */
export function inspectTypeVarLayer(afterDeclarations, closedSet, cssVar) {
	const expected = closedSetTypeValue(closedSet, cssVar)
	const decls = customPropDecls(afterDeclarations, cssVar)
	const same = (raw) => {
		if (!expected) return false
		const got = expected.kind === 'font-stack' ? normalizeFontStack(raw) : normalizeDimension(String(raw).trim())
		return got != null && got === expected.value
	}
	const declaredOk = decls.length > 0 && decls.every((d) => same(d.value))
	return {
		expected: expected ? expected.value : null,
		decls,
		declaredOk,
		undeclared: decls.length === 0,
		mismatch: decls.length > 0 && !declaredOk,
	}
}

function valueHasTypeSource(prop, value, kind, normalized) {
	const got = typeLiteralsOf(prop, value)
	return got.kind === kind && got.items.some((it) => it.normalizedValue === normalized)
}

/** 单处 occurrence 在改造后那一组里的状态。gate 与兑现率账共用。 */
export function inspectTypeOccurrence(afterDeclarations, row, occ, cssVar) {
	const group = groupAfter(afterDeclarations, occ)
	return {
		group,
		lost: group.length === 0,
		literalRemains: group.length > 0 && group.some((d) => valueHasTypeSource(d.prop, d.value, row.kind, row.normalizedValue)),
		varMissing: group.length > 0 && !group.some((d) => valueHasAcceptedVar(d.value, cssVar)),
	}
}

export function gateTypeAcceptFulfillment({ afterDeclarations, rows, closedSet }) {
	const out = []
	const undeclaredByVar = new Map()
	for (const row of rows ?? []) {
		if (row.verdict !== 'accept') continue
		const cssVar = row.acceptedCssVar
		const layer = inspectTypeVarLayer(afterDeclarations, closedSet, cssVar)
		for (const occ of row.occurrences ?? []) {
			const state = inspectTypeOccurrence(afterDeclarations, row, occ, cssVar)
			const base = occDetail(row, occ)
			if (state.lost) {
				out.push(finding('type-accept-fulfillment', 'type-accept-occurrence-lost', base))
			} else {
				if (state.literalRemains) out.push(finding('type-accept-fulfillment', 'type-accept-literal-remains', base))
				if (state.varMissing) out.push(finding('type-accept-fulfillment', 'type-accept-var-missing', base))
			}
			if (layer.mismatch) out.push(finding('type-accept-fulfillment', 'type-accept-var-value-mismatch', base))
			if (layer.undeclared) {
				const prev = undeclaredByVar.get(cssVar) ?? { occurrenceCount: 0, rowId: row.id, sourceValue: row.sourceValue }
				prev.occurrenceCount++
				undeclaredByVar.set(cssVar, prev)
			}
		}
	}
	for (const [cssVar, info] of undeclaredByVar) {
		out.push(
			finding('type-accept-fulfillment', 'type-accept-var-undeclared', {
				acceptedCssVar: cssVar,
				occurrenceCount: info.occurrenceCount,
				rowId: info.rowId,
				sourceValue: info.sourceValue,
				reason: `变量层找不到 ${cssVar} 的自定义属性声明，影响 ${info.occurrenceCount} 处`,
			}),
		)
	}
	return out
}

/** 非色兑现率。`omit` 与 `defer` / `reject` 一样，分子分母都不进。 */
export function computeTypeFulfillment({ afterDeclarations, rows, closedSet }) {
	const acceptRows = (rows ?? []).filter((r) => r.verdict === 'accept')
	let acceptOccurrences = 0
	let fulfilled = 0
	for (const row of acceptRows) {
		const cssVar = row.acceptedCssVar
		const layer = inspectTypeVarLayer(afterDeclarations, closedSet, cssVar)
		for (const occ of row.occurrences ?? []) {
			acceptOccurrences++
			const state = inspectTypeOccurrence(afterDeclarations, row, occ, cssVar)
			if (occurrenceFulfilled(state, layer)) fulfilled++
		}
	}
	const rate = acceptOccurrences === 0 ? null : fulfilled / acceptOccurrences
	return { acceptRows: acceptRows.length, acceptOccurrences, fulfilled, rate }
}

export function gateTypeLiteralBacking({ afterDeclarations, rows }) {
	const byKey = new Map((rows ?? []).map((r) => [`${r.kind}\0${r.normalizedValue}`, r]))
	const out = []
	for (const d of afterDeclarations ?? []) {
		if (d.widget || String(d.prop).startsWith('--')) continue
		const got = typeLiteralsOf(d.prop, d.value)
		if (!got.kind) continue
		for (const item of got.items) {
			const row = byKey.get(`${item.kind}\0${item.normalizedValue}`)
			const base = { file: posixFile(d.file), selector: d.selector, prop: d.prop, value: item.literal, kind: item.kind }
			if (!row) {
				out.push(finding('type-literal-backing', 'type-literal-unbacked', base))
				continue
			}
			if (row.verdict == null) {
				out.push(finding('type-literal-backing', 'type-literal-pending', base))
				continue
			}
			if (row.verdict === 'accept') {
				out.push(finding('type-literal-backing', 'type-literal-accept-residue', base))
			}
		}
	}
	return out
}

/* ── 第九道：裁决保持锁 ──────────────────────────────────────────────────────── */

/** 已背书、且明确要求「别动」的三个裁决。`accept` 与未裁（null）都不在这里。 */
const HELD_VERDICTS = new Set(['defer', 'reject', 'omit'])

/**
 * 裁决保持锁。判据一句话：裁成 `defer` / `reject` / `omit` 的行，它的每一处 occurrence 在
 * 改造后那一组声明里**仍然带着源值**。
 *
 * 两张表一道门（色行按 hex 归一比、非色行按类目归一比），因为它守的是同一句承诺，而这句
 * 承诺与「值是什么类目」无关。findings 上带 `table: 'color' | 'type'` 分辨来路。
 *
 * 未裁的行不进射程：`verdict` 为 null 的行由两道残余背书门报 `*-literal-pending`，本门再报
 * 一次只会把同一件事说两遍。裁决记录整份没读回通过时准入那侧（`verdicts-blocked`）就退了。
 *
 * 判据方向**与兑现门相反**：兑现门要求「源值必须消失」，本门要求「源值必须还在」。同一处
 * occurrence 不可能既在 accept 行又在 held 行——行的键是「源值 × 用途」，一处 occurrence 只
 * 属于一行。所以两道门不会对同一处提出相反要求。
 */
export function gateVerdictHoldLock({ afterDeclarations, rows, typeRows = null }) {
	const out = []
	const scan = (list, table, hasSource) => {
		for (const row of list ?? []) {
			if (!HELD_VERDICTS.has(row.verdict)) continue
			for (const occ of row.occurrences ?? []) {
				const group = groupAfter(afterDeclarations, occ)
				const base = {
					rowId: row.id,
					sourceValue: row.sourceValue,
					verdict: row.verdict,
					table,
					file: posixFile(occ.file),
					selector: occ.selector,
					prop: occ.prop,
				}
				if (group.length === 0) {
					out.push(finding('verdict-hold-lock', 'held-occurrence-lost', base))
					continue
				}
				if (!group.some((d) => hasSource(d, row))) {
					out.push(finding('verdict-hold-lock', 'held-literal-removed', base))
				}
			}
		}
	}
	scan(rows, 'color', (d, row) => valueHasSource(d.value, d.prop, row.normalizedValue))
	scan(typeRows, 'type', (d, row) => valueHasTypeSource(d.prop, d.value, row.kind, row.normalizedValue))
	return out
}

function diffSequence(gate, file, code, beforeArr, afterArr, out) {
	const n = Math.max(beforeArr.length, afterArr.length)
	for (let i = 0; i < n; i++) {
		const before = beforeArr[i] ?? null
		const after = afterArr[i] ?? null
		if (before !== after) {
			out.push(finding(gate, code, { file: posixFile(file), index: i, before, after }))
		}
	}
}

/**
 * 内容锁。两半各自独立：
 *
 * - **标签属性那半边**吃 `beforeHtml` / `afterHtml`（`.html` 按相对路径配对）。
 * - **CSS `url()` 那半边**吃 `beforeDeclarations` / `afterDeclarations`，因此必须把
 *   `.css` 文件真的扫进来。只喂 HTML 会让 `css-url-changed` 变成空门：CSS 文件路径
 *   永远没人读，而那正是背景图住的地方。
 *
 * `--after` 里多出来的文件（HTML 或 CSS）一律不判，与「新增页不是内容改动」同一条。
 */
export function gateContentLock({ beforeHtml, afterHtml, beforeDeclarations = [], afterDeclarations = [] }) {
	const afterBy = new Map((afterHtml ?? []).map((f) => [posixFile(f.file ?? f.rel), f]))
	const out = []
	for (const b of beforeHtml ?? []) {
		const file = posixFile(b.file ?? b.rel)
		const a = afterBy.get(file)
		if (!a) {
			out.push(finding('content-lock', 'content-file-missing', { file, index: null, before: null, after: null }))
			continue
		}
		const left = extractContentLock(b.text)
		const right = extractContentLock(a.text)
		diffSequence('content-lock', file, 'text-changed', left.text, right.text, out)
		diffSequence('content-lock', file, 'href-changed', left.href, right.href, out)
		diffSequence('content-lock', file, 'src-changed', left.src, right.src, out)
		diffSequence('content-lock', file, 'alt-changed', left.alt, right.alt, out)
		diffSequence('content-lock', file, 'srcset-changed', left.srcset, right.srcset, out)
		diffSequence('content-lock', file, 'poster-changed', left.poster, right.poster, out)
	}
	const beforeUrls = extractCssUrlSequence(beforeDeclarations)
	const afterUrls = extractCssUrlSequence(afterDeclarations)
	for (const [file, seq] of beforeUrls) {
		diffSequence('content-lock', file, 'css-url-changed', seq, afterUrls.get(file) ?? [], out)
	}
	return out
}

/**
 * 结构锁。只比开标签名序列，`--before` 有而 `--after` 没有那份**不报**——那件事内容锁的
 * `content-file-missing` 已经报过一次，两门报同一件事会让「换骨架」的条数不可读。
 */
export function gateStructureLock({ beforeHtml, afterHtml }) {
	const afterBy = new Map((afterHtml ?? []).map((f) => [posixFile(f.file ?? f.rel), f]))
	const out = []
	for (const b of beforeHtml ?? []) {
		const file = posixFile(b.file ?? b.rel)
		const a = afterBy.get(file)
		if (!a) continue
		diffSequence('structure-lock', file, 'tag-changed', extractTagSequence(b.text), extractTagSequence(a.text), out)
	}
	return out
}

/**
 * 断点锁。判据只有一句：`--after` 不得引入 `--before` 里不存在的 `@media` 宽度条件。
 *
 * **判增量，不判「产物所有 `@media` ⊆ 资产 §5 白名单」**——后者会误伤：优化模式的产物是老页，
 * 源站 CSS 本来就有 §5 之外的弱档（现役华为云资产的 `DESIGN.md` 就记着 1440 / 1920 这类）。
 * 判增量后零误伤，因为优化模式的合法改动一处都不碰 `@media` 条件。
 *
 * 与采集侧的 `breakpoint-is-sample` **不是同一把尺，别合并**：那一道守的是资产 §5 表本身对不对
 * （表里的代表 px ∈ 各页 `clusteredBucketsPx`），本门守的是产物没有偷偷长出新断点。对象不同。
 *
 * 同一条件在同一份文件里出现多次只报一条：一条断点写在几个规则上是写法，不是几件事。
 */
export function gateBreakpointLock({ beforeSources = [], afterSources = [] }) {
	const before = collectMediaWidthConditions(beforeSources)
	const out = []
	const seen = new Set()
	for (const f of afterSources ?? []) {
		const file = posixFile(f?.file ?? f?.rel)
		for (const condition of extractMediaWidthConditions(f?.text)) {
			if (before.has(condition)) continue
			const key = `${file}\0${condition}`
			if (seen.has(key)) continue
			seen.add(key)
			out.push(finding('breakpoint-lock', 'media-condition-added', { file, condition }))
		}
	}
	return out
}

/**
 * 主题 API 闭集锁。判据：`--after` 新引入的 `var()` 引用（after 引用集减 before 引用集）
 * 必须在 `closed-set.json` 内。
 *
 * **前缀无关**：不写 `--por` / `--ti` / `--cf` 这类黑名单。那三个是华为云的例子、不是判据，
 * 写成黑名单等于新造一套站点特例，换个站就空转；判「不在闭集」即可，私有前缀自然落网。
 *
 * **判增量**：源站原有的 `var(--por-*)` 引用在 `--before` 里就有、不进差集，所以渐进迁移
 * （只把 accept 行换成闭集变量、其余字面量与私有变量原样留下）全绿。判绝对集合会让老页必红。
 *
 * **这道门堵的洞**：裁成 `defer` / `reject` / `omit` 的行，产物把字面量换成 `var(--por-x)` 之后，
 * 兑现率不管（那些行不进分子分母）、残余字面量门也不管（字面量已经没了），本门是唯一能报它的。
 *
 * 与创造模式的 `gateVarInClosedSet` 同族不同物：那个判**绝对集合**、只接在 `runAllGates`，
 * 本门判增量、只接在 `runMigrationGates`。两边的门名与 code 都不撞车。
 *
 * 抓不住：`widget` 子树里的引用（第三方控件不归本站主题管，两侧同待遇）；变量层右侧把闭集已有
 * 的名字覆写成别的值（名字在闭集里，本门按定义放行——那是两道兑现门的射程，见模块头最后一条）。
 */
export function gateThemeApiLock({ beforeDeclarations = [], afterDeclarations = [], closedSet }) {
	const before = new Set()
	for (const d of beforeDeclarations ?? []) {
		if (d.widget) continue
		for (const name of varReferences(d.value)) before.add(name)
	}
	const out = []
	for (const d of afterDeclarations ?? []) {
		if (d.widget) continue
		for (const name of varReferences(d.value)) {
			if (before.has(name) || closedSet.has(name)) continue
			out.push(
				finding('theme-api-lock', 'foreign-var-introduced', {
					file: posixFile(d.file),
					selector: d.selector,
					prop: d.prop,
					var: name,
					reason: `${name} 是改造中新引入的引用，既不在 --before 里，也不在本资产 closed-set.json 里（styleSetId=${closedSet?.styleSetId}）：主题 API 一律查表，查不到就是这份资产没有这个 token`,
				}),
			)
		}
	}
	return out
}

function sortFindings(findings) {
	return [...findings].sort((a, b) => {
		const ga = MIGRATION_GATE_ORDER.indexOf(a.gate)
		const gb = MIGRATION_GATE_ORDER.indexOf(b.gate)
		if (ga !== gb) return ga - gb
		for (const k of ['file', 'selector', 'prop', 'rowId', 'index']) {
			const va = a[k] == null ? '' : String(a[k])
			const vb = b[k] == null ? '' : String(b[k])
			if (va < vb) return -1
			if (va > vb) return 1
		}
		return 0
	})
}

/**
 * `typeRows` 是 `null` 时两道非色门写 `no-input`。这**不是**后门：准入那侧
 * （`lint-migration.mjs` 的 `type-verdicts-missing`）已经保证「改造前产物里但凡有一条
 * 非色字面量，就必须给 `--type-verdicts`」，所以能走到 `null` 的只有「本来就一条都没有」。
 */
export function runMigrationGates({
	afterDeclarations,
	beforeDeclarations = [],
	beforeHtml,
	afterHtml,
	beforeSources = [],
	afterSources = [],
	rows,
	typeRows = null,
	closedSet,
}) {
	const fulfillFindings = gateAcceptFulfillment({ afterDeclarations, rows, closedSet })
	const backingFindings = gateLiteralVerdictBacking({ afterDeclarations, rows })
	const hasType = Array.isArray(typeRows)
	const typeFulfillFindings = hasType ? gateTypeAcceptFulfillment({ afterDeclarations, rows: typeRows, closedSet }) : []
	const typeBackingFindings = hasType ? gateTypeLiteralBacking({ afterDeclarations, rows: typeRows }) : []
	// 两张表一道门：色行永远有（`rows` 是必填输入），所以整门恒 `ran`，非色那半边跟着
	// `typeRows` 有没有开。与内容锁那种「两半都没输入才 no-input」同一条规矩。
	const holdFindings = gateVerdictHoldLock({ afterDeclarations, rows, typeRows: hasType ? typeRows : null })
	const hasHtml = (beforeHtml ?? []).length > 0
	const hasCssUrl = extractCssUrlSequence(beforeDeclarations).size > 0
	const hasLockInput = hasHtml || hasCssUrl
	const lockFindings = hasLockInput
		? gateContentLock({ beforeHtml, afterHtml, beforeDeclarations, afterDeclarations })
		: []
	const structureFindings = hasHtml ? gateStructureLock({ beforeHtml, afterHtml }) : []
	const breakpointFindings = gateBreakpointLock({ beforeSources, afterSources })
	const themeApiFindings = gateThemeApiLock({ beforeDeclarations, afterDeclarations, closedSet })
	const fulfillment = computeFulfillment({ afterDeclarations, rows, closedSet })
	const typeFulfillment = hasType
		? computeTypeFulfillment({ afterDeclarations, rows: typeRows, closedSet })
		: { acceptRows: 0, acceptOccurrences: 0, fulfilled: 0, rate: null }
	const findings = sortFindings([
		...fulfillFindings,
		...backingFindings,
		...typeFulfillFindings,
		...typeBackingFindings,
		...holdFindings,
		...lockFindings,
		...structureFindings,
		...breakpointFindings,
		...themeApiFindings,
	])
	const count = (gate) => findings.filter((f) => f.gate === gate).length
	const gates = [
		{ gate: 'accept-fulfillment', status: 'ran', findings: count('accept-fulfillment') },
		{ gate: 'literal-verdict-backing', status: 'ran', findings: count('literal-verdict-backing') },
		{ gate: 'type-accept-fulfillment', status: hasType ? 'ran' : 'no-input', findings: count('type-accept-fulfillment') },
		{ gate: 'type-literal-backing', status: hasType ? 'ran' : 'no-input', findings: count('type-literal-backing') },
		{ gate: 'verdict-hold-lock', status: 'ran', findings: count('verdict-hold-lock') },
		{ gate: 'content-lock', status: hasLockInput ? 'ran' : 'no-input', findings: count('content-lock') },
		{ gate: 'structure-lock', status: hasHtml ? 'ran' : 'no-input', findings: count('structure-lock') },
		{ gate: 'breakpoint-lock', status: 'ran', findings: count('breakpoint-lock') },
		{ gate: 'theme-api-lock', status: 'ran', findings: count('theme-api-lock') },
	]
	return { gates, findings, fulfillment, typeFulfillment }
}
