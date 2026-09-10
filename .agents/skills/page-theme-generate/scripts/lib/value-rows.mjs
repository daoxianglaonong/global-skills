/**
 * 值映射：决策单元是「源值 × 用途」，不是逐处出现。
 *
 * 用途只看 prop，不看值。未归并的 prop 归 `other` 并必须点名。
 * 射程只有色值字面量，抽取器与 `color-literal` 门同一份 `colorLiterals()`。
 * 豁免清单与色值门共用 `COLOR_EXEMPT`，不自备一份。
 * 候选两档：不透明 RGB 逐位相等的 `hex-exact`，与 ΔE00 ≤ `NEAR_DELTA_E00_MAX` 的 `hex-near`。
 * 两档都反查不到写「无候选」，不编一个。
 * `verdict` 只有 accept / reject / defer 加 null；pending 用未填表达，不是第四个枚举值。
 * `acceptedCssVar` 是 accept 行选中的那个候选的 cssVar，其余情况恒 null；`--out` 一律不预填。
 *
 * ## 候选两档与 alpha 剥离（2026-09-03 加，起因是一次真实迁移）
 *
 * 原来候选只有「归一后逐位相等」一档，而归一键**含 alpha**（`normalizeColorKey` 的成文理由：
 * alpha 是值的一个通道，不是写法）。两条合起来的后果是：`rgba(255,255,255,0.7)` 这类同色不同
 * 透明度、`#efefef` / `#1677ff` 这类肉眼分不出的近邻色，一律零候选，于是它们只能裁 `defer`。
 * 一份 88 行的真实值映射里 75 行是这么来的，而执行侧照样把那 123 处全换成了 `var()`——「无候选」
 * 本该表达「资产里没有这个颜色」，实际表达的是「本表的检索方式看不见它」。
 *
 * 拆成两件事各自解决：
 *
 * - **alpha 从检索键里剥出来。** 候选按**不透明 RGB** 反查（`opaqueKey`），行上另存 `alpha`。
 *   `normalizedValue` 与行 id **一个字节不动**（仍含 alpha），否则一切已填好的表当场 stale。
 *   闭集那一侧本来就是 alpha 盲的（`entryHex` 取的是 6 位 `hex`），剥离之后两侧口径才一致。
 *   alpha < 1 的行，候选是不透明 token，透明度只能由执行侧的 `color-mix()` 承载——生成侧的
 *   兑现门为此多守一条 `accept-alpha-carrier-missing`，判据见 `migration-gates.mjs`。
 * - **近邻是另一档，不是把 exact 放宽。** `hex-exact` 恒排在最前，`hex-near` 在后并按 ΔE 升序；
 *   每个候选都带实算的 `deltaE00`，让人裁决时看得见这一步的精度损失有多大。
 *
 * 这不是「随便就近」：越过 `NEAR_DELTA_E00_MAX` 一律仍是无候选。也**不是**在 `gradeColorMatch`
 * 之外新造判档——那个函数仍只回答「是不是同一个色」，`near` 与 `different` 之间仍然没有机器
 * 判据。本模块出的是**候选**（递给人裁的选项）而不是结论：ΔE 只决定「先给人看哪一个」，换不换、
 * 换成哪一个仍由人在「裁决」那一格拍板。
 */

import { createHash } from 'node:crypto'
import { normalizeColorKey, parseCssColor, deltaE00 } from '../vendor/page-theme-core/index.mjs'
import { colorLiterals, COLOR_EXEMPT } from './gates.mjs'

export const USAGE_ORDER = ['background', 'text', 'border', 'shadow', 'fill', 'accent', 'other']

const VERDICTS = new Set(['accept', 'reject', 'defer'])

/**
 * 近邻档的 ΔE00 上限。
 *
 * `2` 取的是 CIEDE2000 的通行解读边界：`≤1` 肉眼不可分辨，`1–2` 要凑近细看才看得出，`>2`
 * 一眼就是两个颜色。候选是递给人的选项，越过「一眼看得出」那条线的东西不该出现在选项里
 * ——那已经是在替人做设计判断，而不是在检索资产。
 *
 * 拿真实数据核过：一次华为云页迁移的 88 行值映射里，越界色到闭集最近色的距离在 `2.45` 与
 * `5.21` 之间有一段空档，所以在 `2` 与 `2.5` 之间选哪个只差 4 行；选 `2` 是因为它是标准边界，
 * 不是这份数据的拟合值。同一份数据里 `#3FB950`（绿）到最近色是 `32.8`、`#000` 到 `#191919`
 * 是 `5.2`，两者在任何解读下都仍是无候选——**近邻不等于就近**。
 *
 * **不得升为 CLI 旗标。** 门一旦可调，它守的就不再是同一件事；要改这个数就改这里，并把上面
 * 这段一起改。
 */
export const NEAR_DELTA_E00_MAX = 2

export function usageOf(prop) {
	const p = String(prop).toLowerCase()
	if (p === 'background' || p === 'background-color' || p === 'background-image') return 'background'
	if (p === 'color' || p === '-webkit-text-fill-color' || p === 'caret-color' || p === 'text-decoration-color' || p === 'text-emphasis-color') return 'text'
	if (p === 'accent-color') return 'accent'
	if (p === 'box-shadow' || p === 'text-shadow' || p === 'filter' || p === 'backdrop-filter') return 'shadow'
	if (p === 'fill' || p === 'stroke' || p === 'stop-color' || p === 'flood-color' || p === 'lighting-color') return 'fill'
	if (p.startsWith('border') || p === 'outline' || p.startsWith('outline-') || p === 'column-rule' || p === 'column-rule-color') return 'border'
	return 'other'
}

function rowId(usage, normalizedValue) {
	const hex8 = createHash('sha256')
		.update(usage + '\u0000' + normalizedValue)
		.digest('hex')
		.slice(0, 8)
	return `vm-${usage}-${hex8}`
}

function entryHex(entry) {
	const hex = entry.resolved?.hex ?? (entry.value && typeof entry.value === 'object' ? entry.value.hex : null)
	return typeof hex === 'string' ? normalizeColorKey(hex) : null
}

/** 剥掉 alpha 的比对键：`rgba(255,255,255,.7)` 与 `#ffffff` 在这一列上相等。 */
function opaqueKey(color) {
	if (!color) return null
	return normalizeColorKey({ r: color.r, g: color.g, b: color.b, a: 1 })
}

/**
 * 闭集里的色条目摊平成「不透明键 + 可算距离的 rgb」两列。精确与近邻都从这一份出，
 * 不分两套索引：分两套就会出现「exact 认得、near 不认得」这类只在某一档上漂的偏差。
 */
function colorIndex(closedSet) {
	const out = []
	for (const entry of closedSet.entries ?? []) {
		if (entry.type !== 'color') continue
		const key = entryHex(entry)
		if (!key) continue
		const rgb = parseCssColor(key.slice(0, 7))
		if (!rgb) continue
		out.push({ entry, key: opaqueKey(rgb), rgb })
	}
	return out
}

const MATCH_RANK = { 'hex-exact': 0, 'hex-near': 1 }

const alphaPercent = (alpha) => Math.round(alpha * 10000) / 100

/**
 * 一行的候选列。`source` 是从 `normalizedValue` 解析出来的 `{r,g,b,a}`。
 *
 * 全透明（alpha 0）不给候选：那是「不涂」，任何 token 在 0% 上都是同一个结果，递过去只会
 * 让人以为该换成它。`transparent` 走 `COLOR_EXEMPT` 压根不进表，这里挡的是 `rgba(0,0,0,0)`。
 */
function candidatesFor(index, source) {
	if (!source || !(source.a > 0)) return []
	const key = opaqueKey(source)
	const opaque = { r: source.r, g: source.g, b: source.b, a: 1 }
	const out = []
	for (const { entry, key: entryKey, rgb } of index) {
		const distance = deltaE00(opaque, rgb)
		const exact = entryKey === key
		if (!exact && !(distance != null && distance <= NEAR_DELTA_E00_MAX)) continue
		out.push({
			path: entry.path,
			cssVar: entry.cssVar,
			layer: entry.layer,
			matchedBy: exact ? 'hex-exact' : 'hex-near',
			deltaE00: exact ? 0 : distance,
		})
	}
	// 精确在前、近邻在后；近邻按 ΔE 升序；同档同距按 path 定序，好让两次跑出来的表逐字节可比。
	return out.sort((a, b) => {
		if (MATCH_RANK[a.matchedBy] !== MATCH_RANK[b.matchedBy]) return MATCH_RANK[a.matchedBy] - MATCH_RANK[b.matchedBy]
		if (a.deltaE00 !== b.deltaE00) return a.deltaE00 - b.deltaE00
		return a.path < b.path ? -1 : a.path > b.path ? 1 : 0
	})
}

/**
 * `--out` 预填的备注。只写机器算得出的事实（没有候选、源值带 alpha），不替人写结论；
 * 人可以整格改掉，没有任何门读这一格。
 */
function noteFor(candidates, alpha) {
	if (!candidates.length) return alpha === 0 ? '全透明，无候选' : '无候选'
	if (alpha < 1) {
		return `alpha ${alpha}，候选是不透明 token：执行侧写 color-mix(in srgb, var(选中 token) ${alphaPercent(alpha)}%, transparent)`
	}
	return ''
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

export function buildValueMap({ declarations, closedSet, styleSetId, asset, artifactRoot }) {
	const index = colorIndex(closedSet)
	const groups = new Map()
	const otherProps = new Set()

	for (const d of declarations) {
		if (d.widget || String(d.prop).startsWith('--')) continue
		for (const literal of colorLiterals(d.value, { named: !String(d.prop).startsWith('font') })) {
			if (COLOR_EXEMPT.has(literal.toLowerCase())) continue
			const normalizedValue = normalizeColorKey(literal)
			if (!normalizedValue) continue
			const usage = usageOf(d.prop)
			if (usage === 'other') otherProps.add(d.prop)
			const key = `${usage}\0${normalizedValue}`
			if (!groups.has(key)) groups.set(key, { usage, normalizedValue, sourceValue: literal, occurrences: [] })
			groups.get(key).occurrences.push({ file: d.file, selector: d.selector, prop: d.prop, value: literal })
		}
	}

	const rows = [...groups.values()].map((g) => {
		const occurrences = [...g.occurrences].sort(cmpOcc)
		// 从归一值解析而不是从字面串：`#0000000D` 与 `rgba(0,0,0,.05)` 写法不同、alpha 同。
		const source = parseCssColor(g.normalizedValue)
		const alpha = Number((source?.a ?? 1).toFixed(4))
		const candidates = candidatesFor(index, source)
		return {
			id: rowId(g.usage, g.normalizedValue),
			sourceValue: occurrences[0]?.value ?? g.sourceValue,
			normalizedValue: g.normalizedValue,
			usage: g.usage,
			alpha,
			occurrenceCount: occurrences.length,
			occurrences,
			candidates,
			verdict: null,
			acceptedCssVar: null,
			note: noteFor(candidates, alpha),
		}
	})

	rows.sort((a, b) => {
		const ua = USAGE_ORDER.indexOf(a.usage)
		const ub = USAGE_ORDER.indexOf(b.usage)
		if (ua !== ub) return ua - ub
		if (a.normalizedValue !== b.normalizedValue) return a.normalizedValue < b.normalizedValue ? -1 : 1
		return a.id < b.id ? -1 : a.id > b.id ? 1 : 0
	})

	const unmappedProps = [...otherProps].sort()
	const occurrences = rows.reduce((n, r) => n + r.occurrenceCount, 0)
	return {
		schemaVersion: 1,
		styleSetId,
		asset,
		artifactRoot,
		summary: { rows: rows.length, occurrences, pending: rows.length, unmappedProps },
		rows,
	}
}

export function renderValueMapMarkdown(doc) {
	const lines = ['| id | 源值 | 用途 | 处数 | 候选 token | 选中 token | 裁决 | 备注 |', '| --- | --- | --- | ---: | --- | --- | --- | --- |']
	for (const r of doc.rows) {
		const cand = r.candidates
			.map((c) => `\`${c.path}\` → \`${c.cssVar}\`${c.matchedBy === 'hex-near' ? `（近邻 ΔE ${c.deltaE00}）` : ''}`)
			.join('；')
		const accepted = r.acceptedCssVar ? `\`${r.acceptedCssVar}\`` : ''
		const verdict = r.verdict ?? ''
		const note = r.note ?? ''
		lines.push(`| ${r.id} | \`${r.sourceValue}\` | ${r.usage} | ${r.occurrenceCount} | ${cand} | ${accepted} | ${verdict} | ${note} |`)
	}
	if (doc.summary.unmappedProps.length) {
		lines.push('', '## 未归并的 prop', '')
		for (const p of doc.summary.unmappedProps) lines.push(`- \`${p}\``)
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
			note: cells[7] ?? '',
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

function applyAcceptedToken(row, token, findings, warnings) {
	const filled = token !== ''
	if (row.verdict === 'accept' && row.candidates.length === 0) {
		findings.push({
			code: 'accept-without-candidate',
			id: row.id,
			level: 'block',
			reason: '该行闭集反查无候选：承诺一件没有落点的事，兑现率门只能整片报漏做',
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
	if (row.verdict === 'accept' && !row.candidates.some((c) => c.cssVar === token)) {
		findings.push({
			code: 'accepted-token-unknown',
			id: row.id,
			level: 'block',
			reason: '选中 token 只认变量名本身，填 `→` 右边那一串（如 `--color-primary`）；写成 path 或 `var(--color-primary)` 都算填错',
		})
		row.acceptedCssVar = null
		return
	}
	if (row.verdict === 'accept') {
		row.acceptedCssVar = token
		const cand = row.candidates.find((c) => c.cssVar === token)
		if (cand?.layer === 'primitive') {
			warnings.push({
				code: 'accepted-token-primitive',
				id: row.id,
				reason: '选中的候选是 primitive 层：引用处会在 primitive-leak 亮；只有 primitive 候选时出路是 defer，这里只提醒',
			})
		}
		// 近邻与 alpha 两条都只报警：色表八列固定、已填好的表要能原样读回，加不了第九列（排印表
		// 那边有一列标损失，色表这边没有，也不许现在长出来）。精度损失因此走 warnings[] 留痕
		// （随 `--read-back --json` 落盘），阻断的位置在生成侧兑现门。判「近邻 accept 一律阻断」
		// 会让这一档白开——那正是本次要修的洞。
		if (cand?.matchedBy === 'hex-near') {
			warnings.push({
				code: 'accepted-token-near',
				id: row.id,
				reason: `选中的是近邻候选而不是同一个色（ΔE00 ${cand.deltaE00}）：这一步有精度损失，报表里记下来；不接受这笔损失就改判 defer`,
			})
		}
		if (row.alpha != null && row.alpha < 1) {
			warnings.push({
				code: 'accepted-token-alpha-carrier',
				id: row.id,
				reason: `源值带 alpha ${row.alpha} 而候选是不透明 token：执行侧必须用 color-mix(in srgb, var(${token}) ${alphaPercent(row.alpha)}%, transparent) 承载透明度，写成裸 var() 会在兑现门报 accept-alpha-carrier-missing`,
			})
		}
	}
}

export function readBackValueMap(doc, markdown) {
	const parsed = parseTable(markdown)
	const byId = new Map(
		doc.rows.map((r) => [r.id, { ...r, occurrences: [...r.occurrences], candidates: [...r.candidates], acceptedCssVar: null }]),
	)
	const findings = []
	const warnings = []
	const seen = new Map()
	const tokens = new Map()

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
				reason: `读不懂裁决 \`${raw}\`：不猜，枚举只有 accept / reject / defer`,
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
		applyAcceptedToken(r, tokens.get(r.id) ?? '', findings, warnings)
	}

	const pending = rows.filter((r) => r.verdict == null).length
	return {
		verdict: findings.length ? 'blocked' : 'pass',
		summary: {
			rows: rows.length,
			occurrences: doc.summary.occurrences,
			pending,
			unmappedProps: doc.summary.unmappedProps,
		},
		rows,
		warnings,
		findings,
	}
}
