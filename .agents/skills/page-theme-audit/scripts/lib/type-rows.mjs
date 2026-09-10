/**
 * 非色值映射：色表之外**另一张**表，决策单元是「源值 × 类目」。
 *
 * 为什么不扩色表的 schema（票面第 1 条勾的裁断，2026-09-01 用户拍板）：
 *
 * - 色表的 id 是 `vm-<色用途>-<色键 hash>`，`usage` 是从 prop 归并出来的**角色**
 *   （background / text / border…）；非色的「用途」其实是**类目**（字体栈 / 圆角 /
 *   描边宽 / 间距），prop 与类目近乎 1:1，硬塞进 `USAGE_ORDER` 只会让 `other` 爆炸。
 * - 反查形状不同：色按 hex 反查（精确档 + ΔE00 近邻档），同一 hex 的多个候选是「同一颜色的不同角色」；
 *   维度是**跨类目数字复用**——现役华为云资产里 `24px` 同时是 `dimension.lineHeight.2`
 *   和 `dimension.radius.2`，只按数字反查会把行高变量当成圆角候选递给人。所以本表按
 *   类目分索引：`radius` 行只查 radius 类目的条目，查不到就是无候选，不跨类目递。
 * - 值缺口的第三条路（`omit`）只有非色迫切——间距在闭集里常常一条 token 都没有。把它
 *   塞进色表会逼色值行也解释 omit，色表那 11 种回灌处置要整个重写。
 *
 * 因此：id 前缀 `tm-` 与色表 `vm-` 分家，`schemaVersion` 自己从 1 起，文档带
 * `mapKind: 'type'` 好让下游一眼分得清两张表（把色表喂给 `--type-verdicts` 会当场
 * 形状不合而阻断，反之亦然）。**那一趟**（2026-09-01 立这张表）`value-rows.mjs` 一个字节都没动；
 * 后来 2026-09-03 给色表加近邻档与 alpha 剥离时改的是那一份，与本表无关。
 *
 * ## 射程（写死，不许让表看起来比射程大）
 *
 * - **只收 `KIND_BY_PROP` 白名单里的 prop。** 白名单外的 prop 一律不收，不是「归 other」。
 *   已知不收：`line-height`、`font-weight`、`letter-spacing`、`width` / `height` /
 *   `max-width` 这类布局尺寸，以及 `border` / `font` / `background` 这类**复合简写**
 *   （`border: 1px solid #123456` 里的 `1px` 不进 stroke 类目——切开它会让 occurrence
 *   的 `value` 不再是声明里的那一串，色表那侧对同一条声明只抽 hex，两边会打架）。
 * - **零值不进表。** `padding: 0` / `margin: 0 auto` 里的 `0` 不是主题量，资产不会为它
 *   出 token，收进来只会逼人给每个 0 裁一次。
 * - **px 之外的长度、`var()` / `calc()` / `clamp()` 一律不进表**，但也不静默丢：落进
 *   `summary.outOfScopeValues` 并在 Markdown 里单列一节，好让人看得见门没管这些。
 * - **候选只有两种来源**：维度按「同类目 + px 数值相等」精确反查（`px-exact`）；字体栈
 *   按整栈归一相等（`stack-exact`），或去掉通用族名后仍有交集的近义栈（`stack-near`）。
 *   反查不到写「无候选」，不编一个。
 *
 * ## 裁决四值
 *
 * `accept` / `reject` / `defer` / `omit` 加 null（pending 用未填表达，不是第五个枚举值）。
 *
 * - `defer`：这次不迁，字面量留下，**以后还会再来**。
 * - `omit`：资产里根本没有这个值，承认缺口，**这一处到此为止**。因此 omit 只许用在
 *   零候选行；有候选还 omit 就是拿它当免检咒语，`omit-with-candidate` 阻断。
 * - 两者在**兑现率**上无差别（都不进分子分母）、在**残余背书**上也无差别（都算已背书）。
 *   差别只在回灌这一侧的合法性检查。这一句写在这里是为了不让人以为 omit 多守了什么门。
 *
 * `lossy` 是 accept 行上的旗标，不是第五个裁决值：选中的是近义栈（`stack-near`）时必须
 * 标，标了却选中精确候选则阻断。维度没有近义匹配，所以 lossy 目前只可能出现在字体栈行。
 */

import { createHash } from 'node:crypto'

/** 类目在报告里的固定序。表的排序只认这个顺序，不认字典序。 */
export const TYPE_KIND_ORDER = ['font-stack', 'font-size', 'radius', 'stroke', 'space']

const VERDICTS = new Set(['accept', 'reject', 'defer', 'omit'])

/** prop 白名单。射程边界就是这张表，改它等于改射程，改了必须同步模块头。 */
const KIND_BY_PROP = new Map([
	['font-family', 'font-stack'],
	['font-size', 'font-size'],
	['border-radius', 'radius'],
	['border-top-left-radius', 'radius'],
	['border-top-right-radius', 'radius'],
	['border-bottom-right-radius', 'radius'],
	['border-bottom-left-radius', 'radius'],
	['border-width', 'stroke'],
	['border-top-width', 'stroke'],
	['border-right-width', 'stroke'],
	['border-bottom-width', 'stroke'],
	['border-left-width', 'stroke'],
	['outline-width', 'stroke'],
	['padding', 'space'],
	['padding-top', 'space'],
	['padding-right', 'space'],
	['padding-bottom', 'space'],
	['padding-left', 'space'],
	['padding-block', 'space'],
	['padding-inline', 'space'],
	['margin', 'space'],
	['margin-top', 'space'],
	['margin-right', 'space'],
	['margin-bottom', 'space'],
	['margin-left', 'space'],
	['margin-block', 'space'],
	['margin-inline', 'space'],
	['gap', 'space'],
	['row-gap', 'space'],
	['column-gap', 'space'],
])

/**
 * 通用族名。判「近义栈」时先把它们去掉——几乎每个栈都以 `sans-serif` 收尾，不去掉的话
 * 任意两个栈都算近义，`stack-near` 当场退化成「永远命中」。
 */
const GENERIC_FAMILIES = new Set([
	'serif',
	'sans-serif',
	'monospace',
	'cursive',
	'fantasy',
	'system-ui',
	'ui-serif',
	'ui-sans-serif',
	'ui-monospace',
	'ui-rounded',
	'emoji',
	'math',
	'fangsong',
	'inherit',
	'initial',
	'unset',
	'revert',
])

const PX_TOKEN = /^-?(?:\d+\.?\d*|\.\d+)px$/i
const ZERO_TOKEN = /^-?0(?:\.0+)?(?:px)?$/i
const OTHER_LENGTH = /^-?(?:\d+\.?\d*|\.\d+)(?:%|r?em|v(?:w|h|min|max)|pt|pc|cm|mm|in|ch|ex|q)$/i
const FUNCTIONAL = /(?:^|[^\w-])(?:var|calc|clamp|min|max|env|attr)\(/i

/** 这个 prop 属于哪个类目；白名单外返回 `null`。 */
export function kindOf(prop) {
	return KIND_BY_PROP.get(String(prop).trim().toLowerCase()) ?? null
}

/** 字体栈归一：去引号、压空白、小写、逗号后统一一个空格。 */
export function normalizeFontStack(value) {
	return String(value)
		.split(',')
		.map((s) => s.trim().replace(/^["']|["']$/g, '').replace(/\s+/g, ' ').trim().toLowerCase())
		.filter(Boolean)
		.join(', ')
}

/** px 维度归一：`24.0px` / `24px` 都归到 `24px`。非 px 返回 `null`。 */
export function normalizeDimension(value) {
	const raw = String(value).trim()
	if (!PX_TOKEN.test(raw)) return null
	const n = Number.parseFloat(raw)
	if (!Number.isFinite(n)) return null
	return `${n}px`
}

/**
 * 从一条声明的值里抽本类目的字面量。
 *
 * 返回 `{ literals, outOfScope }`：`outOfScope` 是「看得出是个长度、但本表判不了」的那些，
 * 它们不进表但要在报告里露面。关键字（`auto` / `solid` / `inherit`）既不进表也不算越界。
 */
export function typeLiterals(kind, value) {
	const raw = String(value).trim()
	if (!kind || !raw) return { literals: [], outOfScope: [] }
	if (FUNCTIONAL.test(raw)) return { literals: [], outOfScope: [raw] }
	if (kind === 'font-stack') return { literals: [raw], outOfScope: [] }

	const literals = []
	const outOfScope = []
	for (const token of raw.split(/[\s/,]+/)) {
		if (!token) continue
		if (ZERO_TOKEN.test(token)) continue
		if (PX_TOKEN.test(token)) literals.push(token)
		else if (OTHER_LENGTH.test(token)) outOfScope.push(token)
	}
	return { literals, outOfScope }
}

/**
 * 一条声明摊平成 `{ kind, items[], outOfScope[] }`。抽取器只此一份：出表那侧与
 * generate 的残余背书门共用它，分家会让「表里没有的字面量」与「门看得见的字面量」不是同一批。
 */
export function typeLiteralsOf(prop, value) {
	const kind = kindOf(prop)
	if (!kind) return { kind: null, items: [], outOfScope: [] }
	const picked = typeLiterals(kind, value)
	const items = []
	for (const literal of picked.literals) {
		const normalizedValue = kind === 'font-stack' ? normalizeFontStack(literal) : normalizeDimension(literal)
		if (normalizedValue) items.push({ kind, literal, normalizedValue })
	}
	return { kind, items, outOfScope: picked.outOfScope }
}

/**
 * 闭集条目属于哪个类目。**按 token path 判，不按数值判**——这正是「24px 既是行高又是
 * 圆角」那类碰撞的解法：行高条目根本不进任何类目索引，所以它不会成为圆角行的候选。
 */
export function entryKind(entry) {
	if (!entry || typeof entry.path !== 'string') return null
	if (entry.type === 'fontFamily') return 'font-stack'
	const segs = entry.path.split('.')
	if (segs.includes('radius') || segs.includes('rounded')) return 'radius'
	if (segs.includes('borderWidth') || segs.includes('strokeWidth')) return 'stroke'
	if (segs.includes('fontSize')) return 'font-size'
	if (segs.includes('space') || segs.includes('spacing') || segs.includes('gap')) return 'space'
	return null
}

/** `lineHeight` 刻意不进任何类目索引；`breakpoints` 走别一套门，也不进非色反查。 */
const KIND_EXEMPT_PATH_RE = /\.lineHeight(\.|$)|^breakpoints\./

/**
 * 闭集里应有类目却认不出的 primitive 维度（path 段名不含 radius/spacing 等）。
 * 资产整类改名后会在这里阻断，不许退化成 space 行「无候选」静默绿。
 */
export function closedSetKindFindings(closedSet) {
	const findings = []
	for (const entry of closedSet?.entries ?? []) {
		if (!entry?.path || entry.type !== 'dimension') continue
		if (KIND_EXEMPT_PATH_RE.test(entry.path)) continue
		if (entryKind(entry) != null) continue
		findings.push({
			code: 'token-kind-unmapped',
			path: entry.path,
			level: 'block',
			reason: '闭集维度 token 的 path 认不出非色类目（radius / spacing / fontSize / stroke 等），反查索引进不了任何桶',
		})
	}
	return findings
}

/** 把类目认不出的 findings 并进读回结果；有则 verdict 改 blocked。 */
export function applyClosedSetKindGate(back, closedSet) {
	const kindFindings = closedSetKindFindings(closedSet)
	if (!kindFindings.length) return back
	const findings = [...(back.findings ?? []), ...kindFindings]
	return { ...back, findings, verdict: 'blocked' }
}

/** 闭集条目归一后的值；本表判不了的形状（复合 border、无单位、非 px）返回 `null`。 */
export function entryTypeValue(entry) {
	const kind = entryKind(entry)
	if (!kind) return null
	if (kind === 'font-stack') {
		const v = entry.value
		if (Array.isArray(v)) return { kind, value: normalizeFontStack(v.join(', ')) }
		if (typeof v === 'string') return { kind, value: normalizeFontStack(v) }
		return null
	}
	const dim = entry.resolved ?? entry.value
	if (!dim || typeof dim !== 'object') return null
	if (String(dim.unit).toLowerCase() !== 'px' || typeof dim.value !== 'number') return null
	return { kind, value: `${dim.value}px` }
}

/** 生成侧兑现门用：某个 cssVar 在闭集里的类目与归一值。查表，不派生。 */
export function closedSetTypeValue(closedSet, cssVar) {
	const entry = closedSet?.byVar?.get(cssVar)
	return entry ? entryTypeValue(entry) : null
}

function rowId(kind, normalizedValue) {
	const hex8 = createHash('sha256')
		.update(kind + '\u0000' + normalizedValue)
		.digest('hex')
		.slice(0, 8)
	return `tm-${kind}-${hex8}`
}

/** 按类目分桶的反查索引。跨类目不串，串了就是把行高递给圆角。 */
function typeIndex(closedSet) {
	const byKind = new Map()
	for (const entry of closedSet?.entries ?? []) {
		const got = entryTypeValue(entry)
		if (!got) continue
		if (!byKind.has(got.kind)) byKind.set(got.kind, [])
		byKind.get(got.kind).push({ entry, value: got.value })
	}
	return byKind
}

function nonGenericFamilies(stack) {
	return new Set(String(stack).split(',').map((s) => s.trim()).filter((s) => s && !GENERIC_FAMILIES.has(s)))
}

function sharesFamily(a, b) {
	const left = nonGenericFamilies(a)
	for (const f of nonGenericFamilies(b)) if (left.has(f)) return true
	return false
}

function candidatesFor(index, kind, normalizedValue) {
	const bucket = index.get(kind) ?? []
	const out = []
	for (const { entry, value } of bucket) {
		if (value === normalizedValue) {
			out.push({ path: entry.path, cssVar: entry.cssVar, layer: entry.layer, matchedBy: kind === 'font-stack' ? 'stack-exact' : 'px-exact' })
		} else if (kind === 'font-stack' && sharesFamily(value, normalizedValue)) {
			out.push({ path: entry.path, cssVar: entry.cssVar, layer: entry.layer, matchedBy: 'stack-near' })
		}
	}
	// 精确在前、近义在后；同档按 path 定序，好让两次跑出来的表逐字节可比。
	return out.sort((a, b) => {
		const na = a.matchedBy === 'stack-near' ? 1 : 0
		const nb = b.matchedBy === 'stack-near' ? 1 : 0
		if (na !== nb) return na - nb
		return a.path < b.path ? -1 : a.path > b.path ? 1 : 0
	})
}

function cmpOcc(a, b) {
	for (const k of ['file', 'selector', 'prop', 'value']) {
		const va = String(a[k] ?? '')
		const vb = String(b[k] ?? '')
		if (va < vb) return -1
		if (va > vb) return 1
	}
	return 0
}

export function buildTypeMap({ declarations, closedSet, styleSetId, asset, artifactRoot }) {
	const index = typeIndex(closedSet)
	const groups = new Map()
	const outOfScope = new Map()

	for (const d of declarations ?? []) {
		if (d.widget || String(d.prop).startsWith('--')) continue
		const got = typeLiteralsOf(d.prop, d.value)
		if (!got.kind) continue
		for (const raw of got.outOfScope) outOfScope.set(`${d.prop}\u0000${raw}`, { prop: d.prop, value: raw })
		for (const item of got.items) {
			const key = `${item.kind}\u0000${item.normalizedValue}`
			if (!groups.has(key)) {
				groups.set(key, { kind: item.kind, normalizedValue: item.normalizedValue, sourceValue: item.literal, occurrences: [] })
			}
			groups.get(key).occurrences.push({ file: d.file, selector: d.selector, prop: d.prop, value: item.literal })
		}
	}

	const rows = [...groups.values()].map((g) => {
		const occurrences = [...g.occurrences].sort(cmpOcc)
		const candidates = candidatesFor(index, g.kind, g.normalizedValue)
		return {
			id: rowId(g.kind, g.normalizedValue),
			kind: g.kind,
			sourceValue: occurrences[0]?.value ?? g.sourceValue,
			normalizedValue: g.normalizedValue,
			occurrenceCount: occurrences.length,
			occurrences,
			candidates,
			verdict: null,
			acceptedCssVar: null,
			lossy: false,
			note: candidates.length ? '' : '无候选',
		}
	})
	rows.sort((a, b) => {
		const ka = TYPE_KIND_ORDER.indexOf(a.kind)
		const kb = TYPE_KIND_ORDER.indexOf(b.kind)
		if (ka !== kb) return ka - kb
		if (a.normalizedValue !== b.normalizedValue) return a.normalizedValue < b.normalizedValue ? -1 : 1
		return a.id < b.id ? -1 : a.id > b.id ? 1 : 0
	})

	const occurrences = rows.reduce((n, r) => n + r.occurrenceCount, 0)
	const outOfScopeValues = [...outOfScope.values()].sort((a, b) =>
		a.prop === b.prop ? (a.value < b.value ? -1 : a.value > b.value ? 1 : 0) : a.prop < b.prop ? -1 : 1,
	)
	return {
		schemaVersion: 1,
		mapKind: 'type',
		styleSetId,
		asset,
		artifactRoot,
		summary: { rows: rows.length, occurrences, pending: rows.length, outOfScopeValues },
		rows,
	}
}

export function renderTypeMapMarkdown(doc) {
	const lines = [
		'| id | 源值 | 类目 | 处数 | 候选 token | 选中 token | 裁决 | lossy | 备注 |',
		'| --- | --- | --- | ---: | --- | --- | --- | --- | --- |',
	]
	for (const r of doc.rows) {
		const cand = r.candidates
			.map((c) => `\`${c.path}\` → \`${c.cssVar}\`${c.matchedBy === 'stack-near' ? '（近义）' : ''}`)
			.join('；')
		const accepted = r.acceptedCssVar ? `\`${r.acceptedCssVar}\`` : ''
		const verdict = r.verdict ?? ''
		const lossy = r.lossy ? '是' : ''
		const note = r.note ?? ''
		lines.push(`| ${r.id} | \`${r.sourceValue}\` | ${r.kind} | ${r.occurrenceCount} | ${cand} | ${accepted} | ${verdict} | ${lossy} | ${note} |`)
	}
	if (doc.summary.outOfScopeValues.length) {
		lines.push('', '## 射程外的值（未进表）', '')
		for (const v of doc.summary.outOfScopeValues) lines.push(`- \`${v.prop}: ${v.value}\``)
	}
	return lines.join('\n') + '\n'
}

function parseTable(md) {
	const rows = []
	for (const line of String(md).split(/\r?\n/)) {
		if (!/^\|/.test(line)) continue
		const cells = line.split('|').slice(1, -1).map((s) => s.trim())
		if (!cells.length) continue
		if (cells[0] === 'id' || /^:?-+:?$/.test(cells[0])) continue
		rows.push({
			id: cells[0],
			tokenRaw: cells[5] ?? '',
			verdictRaw: cells[6] ?? '',
			lossyRaw: cells[7] ?? '',
			note: cells[8] ?? '',
		})
	}
	return rows
}

function stripAcceptedToken(raw) {
	return String(raw ?? '')
		.trim()
		.replace(/^`+|`+$/g, '')
		.trim()
}

const LOSSY_TRUE = /^(?:是|y|yes|true|lossy)$/i

/** lossy 那一格：空即否；读不懂不猜。 */
function parseLossy(raw) {
	const s = String(raw ?? '').trim()
	if (s === '') return { value: false }
	if (LOSSY_TRUE.test(s)) return { value: true }
	return { unknown: s }
}

function applyAcceptedToken(row, token, lossy, findings, warnings) {
	const filled = token !== ''
	if (row.verdict === 'omit' && row.candidates.length > 0) {
		findings.push({
			code: 'omit-with-candidate',
			id: row.id,
			level: 'block',
			reason: 'omit 的意思是「资产里没有这个值」，而这一行有候选：要么 accept 换过去，要么 defer 留着，不许拿 omit 当免检',
		})
		row.acceptedCssVar = null
		return
	}
	if (row.verdict === 'accept' && row.candidates.length === 0) {
		findings.push({
			code: 'accept-without-candidate',
			id: row.id,
			level: 'block',
			reason: '该行按类目反查无候选：承诺一件没有落点的事，兑现率门只能整片报漏做。无候选行的出路是 omit 或 defer',
		})
		row.acceptedCssVar = null
		return
	}
	if (row.verdict !== 'accept' && filled) {
		findings.push({
			code: 'accepted-token-unexpected',
			id: row.id,
			level: 'block',
			reason: '非 accept 行不得填选中 token：那一列只给兑现率门当执行依据，想记「以后换成这个」写备注',
		})
		row.acceptedCssVar = null
		return
	}
	if (row.verdict === 'accept' && !filled) {
		findings.push({
			code: 'accepted-token-missing',
			id: row.id,
			level: 'block',
			reason: 'accept 必须绑定到具体候选：选中 token 空着，执行方只能猜，兑现率门没有可对账的依据',
		})
		row.acceptedCssVar = null
		return
	}
	const cand = row.candidates.find((c) => c.cssVar === token)
	if (row.verdict === 'accept' && !cand) {
		findings.push({
			code: 'accepted-token-unknown',
			id: row.id,
			level: 'block',
			reason: '选中 token 只认变量名本身，填 `→` 右边那一串；写成 path 或 `var(…)` 都算填错',
		})
		row.acceptedCssVar = null
		return
	}
	if (row.verdict === 'accept') {
		row.acceptedCssVar = token
		if (cand.layer === 'primitive') {
			warnings.push({
				code: 'accepted-token-primitive',
				id: row.id,
				reason: '选中的候选是 primitive 层：引用处会在 primitive-leak 亮；只有 primitive 候选时出路是 defer，这里只提醒',
			})
		}
	}

	const near = row.verdict === 'accept' && cand?.matchedBy === 'stack-near'
	if (near && !lossy) {
		findings.push({
			code: 'lossy-required',
			id: row.id,
			level: 'block',
			reason: '选中的是近义栈而不是同一栈：视觉不等价，必须在 lossy 那一格标「是」，否则这笔拼并在报告里看不出来',
		})
		row.acceptedCssVar = null
		return
	}
	if (lossy && !near) {
		findings.push({
			code: 'lossy-without-near',
			id: row.id,
			level: 'block',
			reason: 'lossy 只给「accept 了一个近义候选」用：这一行没有选中近义候选，标了 lossy 是在给一次等价替换扣帽子',
		})
		row.acceptedCssVar = null
		return
	}
	row.lossy = near && lossy
}

export function readBackTypeMap(doc, markdown) {
	const parsed = parseTable(markdown)
	const byId = new Map(
		doc.rows.map((r) => [
			r.id,
			{ ...r, occurrences: [...r.occurrences], candidates: [...r.candidates], acceptedCssVar: null, lossy: false },
		]),
	)
	const findings = []
	const warnings = []
	const seen = new Map()
	const tokens = new Map()
	const lossies = new Map()

	for (const row of parsed) {
		if (!byId.has(row.id)) {
			findings.push({
				code: 'row-id-unknown',
				id: row.id,
				level: 'block',
				reason: 'id 认不出：产物或资产已变，这份裁决对的不是眼前这份产物',
			})
			continue
		}
		const raw = String(row.verdictRaw ?? '').trim()
		const verdict = raw === '' ? null : raw
		if (verdict !== null && !VERDICTS.has(verdict)) {
			findings.push({
				code: 'verdict-unknown',
				id: row.id,
				level: 'block',
				reason: `读不懂裁决 \`${raw}\`：不猜，枚举只有 accept / reject / defer / omit`,
			})
			continue
		}
		const lossy = parseLossy(row.lossyRaw)
		if (lossy.unknown) {
			findings.push({
				code: 'lossy-unknown',
				id: row.id,
				level: 'block',
				reason: `读不懂 lossy 格 \`${lossy.unknown}\`：标就写「是」，不标就留空，不猜`,
			})
			continue
		}
		if (seen.has(row.id)) {
			if (seen.get(row.id) !== verdict) {
				findings.push({
					code: 'row-id-duplicate',
					id: row.id,
					level: 'block',
					reason: '同一 id 两行裁决不同：冲突没有合并规则，取任一条都是本包在裁',
				})
			} else {
				warnings.push({ code: 'row-id-repeated', id: row.id, reason: '同一 id 两行裁决逐字相同：复制粘贴一行没改内容不是分歧' })
			}
			continue
		}
		seen.set(row.id, verdict)
		tokens.set(row.id, stripAcceptedToken(row.tokenRaw))
		lossies.set(row.id, lossy.value)
		byId.get(row.id).verdict = verdict
		if (row.note) byId.get(row.id).note = row.note
	}

	for (const r of doc.rows) {
		if (!seen.has(r.id)) {
			warnings.push({ code: 'row-missing', id: r.id, reason: '表里缺行，按 pending 处理' })
		}
	}

	const rows = doc.rows.map((r) => byId.get(r.id))
	for (const r of rows) {
		if (!seen.has(r.id)) continue
		applyAcceptedToken(r, tokens.get(r.id) ?? '', lossies.get(r.id) ?? false, findings, warnings)
	}

	const pending = rows.filter((r) => r.verdict == null).length
	return {
		verdict: findings.length ? 'blocked' : 'pass',
		mapKind: 'type',
		summary: {
			rows: rows.length,
			occurrences: doc.summary.occurrences,
			pending,
			outOfScopeValues: doc.summary.outOfScopeValues,
		},
		rows,
		warnings,
		findings,
	}
}
