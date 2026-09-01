/**
 * Node 侧派生：painted-area 组装、角色候选、噪声报告、density 三档候选。
 * 全部服从 E-01 的分界线——只产 raw 与带 `confidence` 的候选，不写 tokens / patterns / voice / coverage。
 * 权限两把尺子见 E-63–E-65：语义类永不给最高档；几何类两测一致才可 `high`。
 */
import fs from 'node:fs/promises'
import path from 'node:path'
import { describeColor, parseCssColor, toHex } from './color.mjs'

/** 语义类候选的封顶档（E-65）。脚本永远不给 `high`。 */
const SEMANTIC_MAX = 'medium'

function declCountOf(normalized, hex, property) {
	const byProp = normalized.colorsByProperty || {}
	const propKey = property === 'background-color' ? 'background' : property === 'color' ? 'color' : null
	if (propKey && byProp[propKey]) {
		const hit = byProp[propKey].find((c) => c.hex.toLowerCase() === hex.toLowerCase())
		if (hit) return hit.declCount
	}
	const global = (normalized.colors || []).find((c) => c.hex.toLowerCase() === hex.toLowerCase())
	return global ? global.declCount : 0
}

/** E-86：按 slot 分块；颜色齐 hex / alpha / oklch / declCount / paintedPx / paintedRatio / paintedByContext / property。 */
export function buildPaintedArea({ pageId, pageUrl, perSlot, normalized }) {
	const slots = {}
	for (const [slot, raw] of Object.entries(perSlot)) {
		if (!raw) continue
		const docArea = Math.max(1, raw.docArea)
		const colors = raw.colors
			.map((c) => {
				const desc = describeColor(c.css)
				if (!desc) return null
				return {
					hex: desc.hex,
					alpha: desc.alpha,
					oklch: desc.oklch,
					css: desc.css,
					property: c.property,
					declCount: declCountOf(normalized, desc.hex, c.property),
					paintedPx: c.paintedPx,
					paintedRatio: Number((c.paintedPx / docArea).toFixed(6)),
					paintedByContext: {
						chrome: Number((c.paintedByContext.chrome / docArea).toFixed(6)),
						content: Number((c.paintedByContext.content / docArea).toFixed(6)),
						overlay: Number((c.paintedByContext.overlay / docArea).toFixed(6))
					},
					elementCount: c.count,
					samples: c.samples
				}
			})
			.filter(Boolean)

		const table = (rows, key = 'value') =>
			rows.map((r) => ({
				[key]: r.key,
				paintedPx: r.paintedPx,
				paintedRatio: Number((r.paintedPx / docArea).toFixed(6)),
				count: r.count,
				...(r.scope ? { scope: r.scope } : {}),
				...(r.axis ? { axis: r.axis } : {})
			}))

		slots[slot] = {
			viewportDocSize: raw.docSize,
			docArea,
			scanned: raw.scanned,
			skipped: raw.skipped,
			colors,
			backgroundImages: raw.backgroundImages,
			fonts: table(raw.fonts, 'fontFamily'),
			fontSizes: table(raw.fontSizes, 'fontSize'),
			fontWeights: table(raw.fontWeights, 'fontWeight'),
			lineHeights: table(raw.lineHeights, 'lineHeight'),
			letterSpacings: table(raw.letterSpacings, 'letterSpacing'),
			space: {
				padding: table(raw.space.padding, 'px'),
				margin: table(raw.space.margin, 'px'),
				gap: table(raw.space.gap, 'px')
			},
			radii: table(raw.radii, 'borderRadius'),
			shadows: table(raw.shadows, 'boxShadow'),
			borders: table(raw.borders, 'border')
		}
	}
	return { schemaVersion: 1, pageId, pageUrl, slots }
}

/** E-95 / T-127：被打掉的色必须齐五字段，否则第 02 章 `[1]` 拒绝消费。 */
export function buildNoiseReport({ pageId, pageUrl, perSlot, origins, iframes, overrides }) {
	const colors = []
	for (const [slot, raw] of Object.entries(perSlot)) {
		if (!raw) continue
		const docArea = Math.max(1, raw.docArea)
		for (const n of raw.noise) {
			const desc = describeColor(n.css)
			if (!desc) continue
			colors.push({
				hex: desc.hex,
				property: n.property,
				paintedRatio: Number((n.paintedPx / docArea).toFixed(6)),
				rule: n.rule,
				pageUrl,
				slot,
				selector: n.selector,
				scopeOfRatio: 'single-page'
			})
		}
	}
	const stylesheets = origins
		.filter((o) => !o.firstParty || o.blocked)
		.map((o) => ({
			href: o.href,
			type: o.type,
			bytes: o.bytes,
			rule: o.blocked ? 'cors-blocked' : 'N2',
			reason: o.blocked ? 'cssRules 不可读且未恢复' : 'host 不属第一方集合'
		}))
	return {
		schemaVersion: 1,
		pageId,
		pageUrl,
		colors,
		stylesheets,
		iframes,
		// 首跑 overrides 为 proposed 时包不生效：以下只是草稿候选，由 agent 填进 site-overrides.noise（E-101）
		proposedNoiseDraft: {
			effective: overrides.effective,
			thirdPartyHosts: [...new Set(iframes.map((f) => f.host).filter(Boolean))],
			excludeSelectors: overrides.consentCandidates || []
		}
	}
}

/** E-95 / T-96：角色候选。judge 恒为 `script`，语义类封顶 medium（E-65 / E-67）。 */
export function buildRoleCandidates({ pageId, pageUrl, painted, roleEvidence, defaultScheme, logoRaster }) {
	const pc = painted.slots.pc || painted.slots.tablet || painted.slots.mobile
	if (!pc) return { schemaVersion: 1, pageId, pageUrl, judge: 'script', candidates: [] }
	const bg = pc.colors.filter((c) => c.property === 'background-color').sort((a, b) => b.paintedPx - a.paintedPx)
	const fg = pc.colors.filter((c) => c.property === 'color').sort((a, b) => b.paintedPx - a.paintedPx)
	const candidates = []

	function add(hex, roles, evidence, confidence = SEMANTIC_MAX) {
		if (!hex) return
		candidates.push({
			hex,
			proposedRoles: roles,
			confidence,
			judge: 'script',
			evidence
		})
	}

	if (bg[0]) add(bg[0].hex, ['surface.default'], { paintedRatio: bg[0].paintedRatio, declCount: bg[0].declCount, context: 'content' })
	const muted = bg.find((c) => bg[0] && c.hex !== bg[0].hex)
	if (muted) add(muted.hex, ['surface.muted'], { paintedRatio: muted.paintedRatio, declCount: muted.declCount, context: 'content' })
	if (fg[0]) add(fg[0].hex, ['text.default'], { paintedRatio: fg[0].paintedRatio, declCount: fg[0].declCount, context: 'content' })

	const links = (roleEvidence.linkColors || []).sort((a, b) => b.paintedPx - a.paintedPx)
	if (links[0]) {
		const hex = toHex(parseCssColor(links[0].css))
		if (hex && (!fg[0] || hex !== fg[0].hex)) {
			add(hex, ['text.link'], { paintedPx: links[0].paintedPx, elementCount: links[0].count, context: 'content' })
		}
	}

	// T-59 / T-63 的采集侧输入：CTA 填充按面积加权取众数。脚本不独断，只给候选。
	const ctaTotal = (roleEvidence.ctaFills || []).reduce((s, c) => s + c.paintedPx, 0)
	const ctaSorted = (roleEvidence.ctaFills || [])
		.map((c) => ({ ...c, hex: toHex(parseCssColor(c.css)), alpha: (parseCssColor(c.css) || { a: 1 }).a }))
		.filter((c) => c.hex && c.alpha >= 0.08)
		.sort((a, b) => b.paintedPx - a.paintedPx)
	if (ctaSorted[0]) {
		add(ctaSorted[0].hex, ['color.primary'], {
			ctaFillRatio: ctaTotal ? Number((ctaSorted[0].paintedPx / ctaTotal).toFixed(4)) : 0,
			paintedPx: ctaSorted[0].paintedPx,
			elementCount: ctaSorted[0].count,
			context: 'content'
		})
	}
	const logos = (roleEvidence.logoColors || []).sort((a, b) => b.paintedPx - a.paintedPx)
	if (logos[0]) {
		const hex = toHex(parseCssColor(logos[0].css))
		// 中性 logo 照收但必须低置信（T-48 由 agent 落实，脚本只给证据）
		if (hex) add(hex, ['color.identity'], { paintedPx: logos[0].paintedPx, probe: 'logo-element', context: 'chrome' }, 'low')
	}
	if (logoRaster && logoRaster.hex && logoRaster.hex !== (bg[0] && bg[0].hex)) {
		// 位图 logo 的主色是弱旁证（T-60）：必须 low，且与 CSS 侧候选并列交 agent 裁
		add(logoRaster.hex, ['color.identity'], {
			probe: 'logo-raster',
			selector: logoRaster.selector,
			tag: logoRaster.tag,
			share: logoRaster.share,
			context: 'chrome'
		}, 'low')
	}

	return {
		schemaVersion: 1,
		pageId,
		pageUrl,
		judge: 'script',
		defaultScheme,
		note: '候选，非权威。语义角色词表见第 02 章；脚本永不给语义类最高档 confidence（E-65 / E-67）。',
		candidates
	}
}

/** 读取未被本次重抓的历史页 padBlock，使 E-98 的站内分布覆盖「当前资产全部已采页」。 */
export async function collectHistoricalPadBlocks(assetDir, skipPageIds) {
	const rawDir = path.join(assetDir, 'raw')
	const out = []
	let entries = []
	try {
		entries = await fs.readdir(rawDir, { withFileTypes: true })
	} catch {
		return out
	}
	for (const ent of entries) {
		if (!ent.isDirectory() || skipPageIds.has(ent.name)) continue
		try {
			const text = await fs.readFile(path.join(rawDir, ent.name, 'landmarks.pc.json'), 'utf8')
			const doc = JSON.parse(text)
			for (const item of doc.items || []) {
				if (item.roleHint !== 'section') continue
				const pad = item.densityCandidate ? item.densityCandidate.padBlockPx : item.padBlockPx
				if (Number.isFinite(pad)) out.push(pad)
			}
		} catch {
			/* 该页无 pc landmark 或读不出，跳过 */
		}
	}
	return out
}

/**
 * E-98 `density` 站内 33 / 67 百分位映射（本项目自定）。脚本只写 `densityCandidate`，
 * 无第二测法故 `confidence` 最高 `medium`；不得直填 patterns 的 `density`（P-50）。
 */
export function assignDensityCandidates(landmarksBySlotByPage, historicalPadBlocks = []) {
	const samples = [...historicalPadBlocks]
	const classifiedSlotByPage = new Map()
	for (const [pageId, bySlot] of landmarksBySlotByPage) {
		// 第 4 步：分类测档固定用 pc；pc 缺失时改用样本最多的一档并记 classifiedSlot
		let slot = 'pc'
		if (!bySlot.pc || !bySlot.pc.items.length) {
			slot = Object.entries(bySlot)
				.filter(([, v]) => v && v.items)
				.sort((a, b) => b[1].items.length - a[1].items.length)
				.map(([k]) => k)[0]
		}
		classifiedSlotByPage.set(pageId, slot)
		const doc = slot ? bySlot[slot] : null
		if (!doc) continue
		for (const item of doc.items) {
			if (item.roleHint !== 'section') continue
			if (!item.padBlockPx) continue // 折叠间距不入分布
			samples.push(item.padBlockPx)
		}
	}
	const distinct = new Set(samples)
	const enough = samples.length >= 3 && distinct.size > 1
	const sorted = [...samples].sort((a, b) => a - b)
	const pct = (p) => sorted[Math.min(sorted.length - 1, Math.max(0, Math.floor((sorted.length - 1) * p)))]
	const p33 = enough ? pct(0.33) : null
	const p67 = enough ? pct(0.67) : null

	for (const [pageId, bySlot] of landmarksBySlotByPage) {
		const classifiedSlot = classifiedSlotByPage.get(pageId)
		for (const [slot, doc] of Object.entries(bySlot)) {
			if (!doc) continue
			for (const item of doc.items) {
				if (item.roleHint !== 'section') {
					item.densityCandidate = null
					continue
				}
				const pad = item.padBlockPx
				if (!pad) {
					item.densityCandidate = {
						label: 'default',
						padBlockPx: 0,
						method: 'site-tercile',
						confidence: 'low',
						skippedReason: 'zero-padding'
					}
					continue
				}
				let label = 'default'
				if (enough) {
					// 切点上的并列值归入 default，避免同一实测值拆到两档
					if (pad < p33) label = 'compact'
					else if (pad > p67) label = 'spacious'
				}
				item.densityCandidate = {
					label,
					padBlockPx: pad,
					method: 'site-tercile',
					confidence: enough ? 'medium' : 'low',
					...(enough ? {} : { skippedReason: 'insufficient-samples' }),
					...(classifiedSlot && classifiedSlot !== 'pc' ? { classifiedSlot } : {})
				}
			}
		}
	}
	return { sampleCount: samples.length, distinct: distinct.size, p33, p67, enough }
}

/** 体检的分歧轴闭集。轴名与 M-42a 的 `axis` 举例一致，脚本不得自行增轴。 */
export const COHESION_AXES = ['color.identity', 'color.primary', 'typography.fontFamily']

/**
 * 形式归一：只统一写法，不引入任何容差。
 * 色值走小写 hex；字体栈去引号、压空白、小写族名（`"PingFang SC"` 与 `PingFang SC` 是同一族）。
 * 归一之后仍不相等，不得据此直接断言分歧——见 `cohesionAxes`。〔T-90 · Q-73 · D2〕
 */
export function normalizeAxisValue(value) {
	const s = String(value == null ? '' : value).trim()
	if (!s) return ''
	if (/^#[0-9a-f]{3,8}$/i.test(s)) return s.toLowerCase()
	const parsed = parseCssColor(s)
	if (parsed) return toHex(parsed).toLowerCase()
	return s
		.replace(/["']/g, '')
		.split(',')
		.map((part) => part.trim().replace(/\s+/g, ' ').toLowerCase())
		.filter(Boolean)
		.join(', ')
}

/**
 * `@font-face` 声明里的族名（归一后）。这是「站点自己带的字型资源」的证据面〔B-35〕：
 * 只取**声明**，不取用法——字体栈里出现但无 `@font-face` 的族由 OS / 浏览器解析，是环境产物。
 */
export function fontFaceFamilies(cssText) {
	const out = []
	for (const block of String(cssText || '').matchAll(/@font-face\s*\{([^}]*)\}/gi)) {
		const m = block[1].match(/font-family\s*:\s*([^;]+)/i)
		if (m) out.push(normalizeAxisValue(m[1]))
	}
	return out.filter(Boolean)
}

/**
 * 主题一致性体检的分歧判定〔M-42a · O-39 第 2 条 · B-34 · B-35〕。
 *
 * 输入：`[{ sourceId, axes: { <轴名>: { value, confidence, designedValue? } | null } }]`。
 * 输出：`{ divergences[], pending[] }`。`pending` 是「记下来但不构成分歧断言」的弱观测，
 * 不进资产——`coverage.cohesion` 的形状由 M-42a 冻结为三键，本项只上 O-27 短摘要与报告。
 *
 * 判定纪律（三条都是硬的）：
 *   1. **`different` 不得由字符串不等推出。** 先走 T-90：归一后相等即 `exact`，`exact` / `near`
 *      按 M-42a 明文不构成分歧、不得入列。
 *   2. **`near` 与 `different` 之间没有机器判据**——T-90 的 ΔE 硬线已按 Q-73 / D2 删除。本函数
 *      因此**不得**新造阈值或分歧百分比；它只判「是否 `exact`」，其余交下面第 3 条的描述性门。
 *   3. **两侧观测的 `confidence` 都是 `low` 时不得入列**〔B-34〕。`confidence` 是 D3 的既有字段，
 *      「低置信观测不足以支撑分歧断言」是描述性判据，不是新阈值。
 *   4. **分歧必须由设计意图的证据支撑，不是由测到的字符串不同支撑**〔B-35〕。带 `designedValue`
 *      的轴按它分组：字体轴的 `designedValue` 是该来源**第一方 `@font-face` 声明**的族名集合，
 *      即这个站真正设计过、自己带的字型资源。字体栈里其余族名是由 OS / 浏览器解析出的系统回退，
 *      是环境产物不是设计选择。`designedValue` 相等即判 `exact`，差异只落在系统回退字体上时
 *      一律不入列。**不得**反向硬编码系统字体名单——那是凭无证据造闭集（D1 / D3）。
 *
 * 第 3 / 4 条命中的观测落 `pending`，待人核；`pending` 不进资产（M-42a 的形状冻结为三键）。
 */
export function cohesionAxes(observations, axes = COHESION_AXES) {
	const divergences = []
	const pending = []
	for (const axis of axes) {
		const seen = []
		for (const o of observations) {
			const obs = o.axes ? o.axes[axis] : null
			if (!obs || obs.value == null || obs.value === '') continue
			seen.push({
				sourceId: o.sourceId,
				value: obs.value,
				confidence: obs.confidence ?? null,
				designedValue: obs.designedValue === undefined ? null : obs.designedValue
			})
		}
		if (seen.length < 2) continue
		// 分组键：有 designedValue 的轴按它分组（B-35），否则按实测值本身
		const groups = new Map()
		const observedGroups = new Map()
		for (const s of seen) {
			const key = normalizeAxisValue(s.designedValue === null ? s.value : s.designedValue)
			if (!groups.has(key)) groups.set(key, { value: s.value, sourceIds: [] })
			groups.get(key).sourceIds.push(s.sourceId)
			const raw = normalizeAxisValue(s.value)
			if (!observedGroups.has(raw)) observedGroups.set(raw, { value: s.value, sourceIds: [] })
			observedGroups.get(raw).sourceIds.push(s.sourceId)
		}
		const sourceIds = [...new Set(seen.map((s) => s.sourceId))]
		if (groups.size <= 1) {
			// designedValue 相等而实测串不等：差异只在系统回退字体上，记下但不断言（B-35）
			if (observedGroups.size > 1) {
				pending.push({ axis, sourceIds, groups: [...observedGroups.values()], reason: 'system-fallback-only' })
			}
			continue // T-90 `exact`：不构成分歧（M-42a）
		}
		if (seen.every((s) => s.confidence === 'low')) {
			pending.push({ axis, sourceIds, groups: [...groups.values()], reason: 'all-observations-low-confidence' })
			continue
		}
		divergences.push({ axis, match: 'different', sourceIds, groups: [...groups.values()] })
	}
	return { divergences, pending }
}

/** M-42a 硬约束 3：只是建议，本次 run 不得据此自动拆分资产。少数派各自成组。 */
export function suggestedSplitOf(divergences, allSourceIds) {
	const minority = new Set()
	for (const d of divergences) {
		const sorted = [...(d.groups || [])].sort((a, b) => b.sourceIds.length - a.sourceIds.length)
		for (const g of sorted.slice(1)) for (const id of g.sourceIds) minority.add(id)
	}
	if (!minority.size) return []
	const rest = allSourceIds.filter((id) => !minority.has(id))
	return rest.length ? [[...minority], rest] : [[...minority]]
}

/**
 * O-27 短摘要要报的「主题一致性体检是否报警」。判据复用 T-90 三档的定性结果（O-39 第 2 条），
 * 不写入资产——`coverage.cohesion` 的落盘属第 06 章、由 agent 写（E-01）。
 * `coverage` 组装侧必须复用 `cohesionAxes`，不得另写一套判定（D9）。
 */
export function cohesionHint(pages) {
	if (pages.length <= 1) return { verdict: 'cohesive', divergences: [], pending: [] }
	const { divergences, pending } = cohesionAxes(pages.map((p) => ({ sourceId: p.sourceId, axes: p.cohesionAxes })))
	return { verdict: divergences.length ? 'mixed-suspected' : 'cohesive', divergences, pending }
}

// ------------------------------------- 自测（B-34 的三条判定纪律 + B-35 的字体轴判据）
//   node lib/derive.mjs --selftest

const COHESION_VECTORS = [
	{
		name: '归一后相等（大小写 / rgb 写法）→ T-90 exact，不构成分歧',
		obs: [
			{ sourceId: 's1', axes: { 'color.identity': { value: '#E30006', confidence: 'medium' } } },
			{ sourceId: 's2', axes: { 'color.identity': { value: 'rgb(227, 0, 6)', confidence: 'medium' } } }
		],
		divergences: 0,
		pending: 0
	},
	{
		name: '两侧 confidence 均为 low → 不入 divergences，只记待人核（C1 的识别色那条）',
		obs: [
			{ sourceId: 's1', axes: { 'color.identity': { value: '#e30006', confidence: 'low' } } },
			{ sourceId: 's2', axes: { 'color.identity': { value: '#e30007', confidence: 'low' } } }
		],
		divergences: 0,
		pending: 1
	},
	{
		name: '有一侧 confidence 高于 low → 才准判 different',
		obs: [
			{ sourceId: 's1', axes: { 'color.primary': { value: '#191919', confidence: 'medium' } } },
			{ sourceId: 's2', axes: { 'color.primary': { value: '#c7000b', confidence: 'low' } } }
		],
		divergences: 1,
		pending: 0
	},
	{
		name: '字体栈只在引号 / 空白 / 大小写上不同 → exact，不构成分歧',
		obs: [
			{ sourceId: 's1', axes: { 'typography.fontFamily': { value: 'Helvetica, "PingFang SC", Arial', confidence: null } } },
			{ sourceId: 's2', axes: { 'typography.fontFamily': { value: 'helvetica,  PingFang SC ,Arial', confidence: null } } }
		],
		divergences: 0,
		pending: 0
	},
	{
		name: '字体栈实质不同、但两页第一方 @font-face 相同 → 差异只在系统回退字体上，不入列〔B-35〕',
		obs: [
			{
				sourceId: 's1',
				axes: { 'typography.fontFamily': { value: '-apple-system, HuaweiSans, Arial', confidence: null, designedValue: 'huaweisans, por-icon' } }
			},
			{
				sourceId: 's2',
				axes: { 'typography.fontFamily': { value: 'Helvetica, Arial, Microsoft YaHei', confidence: null, designedValue: 'huaweisans, por-icon' } }
			}
		],
		divergences: 0,
		pending: 1
	},
	{
		name: '两页第一方 @font-face 不同 → 有设计意图证据支撑，判 different〔B-35〕',
		obs: [
			{
				sourceId: 's1',
				axes: { 'typography.fontFamily': { value: 'HuaweiSans, Arial', confidence: null, designedValue: 'huaweisans' } }
			},
			{
				sourceId: 's2',
				axes: { 'typography.fontFamily': { value: 'Inter, Arial', confidence: null, designedValue: 'inter' } }
			}
		],
		divergences: 1,
		pending: 0
	},
	{
		name: '两页都没有第一方 @font-face → 全是系统回退字体，一律不入列〔B-35〕',
		obs: [
			{ sourceId: 's1', axes: { 'typography.fontFamily': { value: 'Helvetica, Arial', confidence: null, designedValue: '' } } },
			{ sourceId: 's2', axes: { 'typography.fontFamily': { value: 'Segoe UI, Tahoma', confidence: null, designedValue: '' } } }
		],
		divergences: 0,
		pending: 1
	},
	{
		name: '只有一页有该轴观测 → 无从比较，既不分歧也不待核',
		obs: [
			{ sourceId: 's1', axes: { 'color.identity': { value: '#e30006', confidence: 'medium' } } },
			{ sourceId: 's2', axes: { 'color.identity': null } }
		],
		divergences: 0,
		pending: 0
	}
]

function runSelfTest() {
	let failed = 0
	for (const v of COHESION_VECTORS) {
		const got = cohesionAxes(v.obs)
		const ok = got.divergences.length === v.divergences && got.pending.length === v.pending
		if (!ok) failed++
		process.stdout.write(
			`${ok ? 'PASS' : 'FAIL'} ${v.name}${ok ? '' : `（实得 divergences=${got.divergences.length} pending=${got.pending.length}，期望 ${v.divergences} / ${v.pending}）`}\n`
		)
	}
	// 单来源：M-42a 硬约束 2
	const single = cohesionHint([{ sourceId: 's1', cohesionAxes: {} }])
	const singleOk = single.verdict === 'cohesive' && single.divergences.length === 0
	if (!singleOk) failed++
	process.stdout.write(`${singleOk ? 'PASS' : 'FAIL'} 单来源 verdict 必须是 cohesive 且两数组为空〔M-42a 硬约束 2〕\n`)

	// suggestedSplit：少数派成组，只是建议
	const split = suggestedSplitOf(
		[{ axis: 'typography.fontFamily', groups: [{ sourceIds: ['s1', 's3', 's4'] }, { sourceIds: ['s2'] }] }],
		['s1', 's2', 's3', 's4']
	)
	const splitOk = JSON.stringify(split) === JSON.stringify([['s2'], ['s1', 's3', 's4']])
	if (!splitOk) failed++
	process.stdout.write(`${splitOk ? 'PASS' : 'FAIL'} suggestedSplit 把少数派单独成组：${JSON.stringify(split)}\n`)

	// 反向护栏：实现里不得出现 ΔE 阈值或百分比分歧线（Q-73 / D2）
	const src = String(cohesionAxes) + String(normalizeAxisValue) + String(suggestedSplitOf)
	const smell = /deltaE|ΔE|0\.\d+\s*\*|<=\s*\d+(\.\d+)?\s*\?/.test(src)
	if (smell) failed++
	process.stdout.write(`${smell ? 'FAIL' : 'PASS'} 判定实现里没有 ΔE 阈值 / 百分比分歧线〔Q-73 · D2〕\n`)

	const total = COHESION_VECTORS.length + 3
	process.stdout.write(`cohesion 自测：${total - failed}/${total} 通过\n`)
	process.exit(failed ? 1 : 0)
}

const invokedDirectly = process.argv[1] && import.meta.filename === path.resolve(process.argv[1])
if (invokedDirectly && process.argv.includes('--selftest')) runSelfTest()
