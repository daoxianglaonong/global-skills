/**
 * 第十道门「缺观测继承」的判据源：资产说哪几档没有实测几何，trace 说这几档怎么办。
 *
 * 缺测是**多数情况**不是边角（现役华为云资产 153 档里 80 档 `grid.observed: false`），
 * 所以「trace 点名哪几档无实测、继承自哪一档」这条规程不能只是纸面纪律：没有必填字段、
 * 没有会挂的门，产物给一个从没实测过的窄档臆造断点值时，别的门一道都不会红。
 *
 * **本门不判继承得对不对。** 「窄档继承宽档读起来对不对」「该继承还是该 omit」「有没有
 * 往宽找」都是语义判断，机器不接。本门只判三件事：声明了没有、声明的来源档存不存在、
 * 声明与产物对不对得上。
 *
 * 射程由**产物侧层根**界定（`data-pattern`，与 `paint-consistency` 同一条口径），不由
 * trace 自报——让被检的一方定射程，漏写一层就免检。
 *
 * 断点数值那一半（T6 起）判据源是资产 `tokens.json` 的 `breakpoints` 组（合同 §3.8）——
 * 从前「哪个声明值对应哪一档」只在 `DESIGN.md` §5 里是散文，机器读不了，于是**臆造的断点
 * 数字本身一道门都不挡**。有了机读副本，本门多守三件事：查得出表吗（`breakpoint-map-unreadable`）、
 * 产物写的这个数站点真声明过吗（`breakpoint-value-unmapped`）、说了「本档不出任何断点相关的值」
 * 却又给这一档写了 `@media` 吗（`inherit-null-media-written`）。
 *
 * 抓不住什么：
 * - **不判 `@media` 里的规则内容**：某一档该不该有断点样式、写了几条、写得对不对，一律不判。
 *   本门只查那个**数**在不在资产的断点闭集里。
 * - **档映射有歧义时不判**：`inherit-null-media-written` 只在某个值的 `slots` **恰好只有一档**
 *   时开口。同时划两档的值（华为云 768 既是 mobile 上沿又是 tablet 下沿）判不出这条 `@media`
 *   写给谁，判不出就不判——不猜，也不两档都报。
 * - 方向不判：`pc` 声明继承自 `mobile` 本门放行（往宽找那一条靠人）。
 * - 同一档登两条时逐条验、按「有没有登过这一档」算覆盖，两条源档互相矛盾不判。
 * - `trace` 或 `assetDir` 缺席时整门不开口，与 `sequence-approval` / `variant-lock` 同一个
 *   已知洞：本门挡的是过门，不是动笔。
 */

import fs from 'node:fs'
import path from 'node:path'
import { parseYaml } from '../vendor/page-theme-core/index.mjs'
import { extractMediaWidthConditions } from './breakpoint-lock.mjs'
import { parseFloorRoots } from './paint-floors.mjs'
import { isInheritFromSource, isSynthPattern, synthUnobservedBreakpoints } from './synth-identity.mjs'

const GATE = 'responsive-inheritance'

/** 断点闭集。三档之外的名字在资产里压根没有对应记录，登它一律算登错。 */
export const BREAKPOINTS = ['pc', 'tablet', 'mobile']

const finding = (detail) => ({ gate: GATE, level: 'block', ...detail })

const readYaml = (file) => {
	try {
		return parseYaml(fs.readFileSync(file, 'utf8'))
	} catch {
		return null
	}
}

/**
 * 取某型的 `responsive` 记录。内容楼层在 `patterns/<id>.yaml`，页壳在 `patterns/chrome.yaml`
 * 的同名键下，两处断点形状同构，所以只有「从哪取」这一步分叉。
 *
 * 两处都取不到（型不在资产里、yaml 解不开）返回 `null`：判不出缺不缺测就不放行。
 */
export function readPatternResponsive(assetDir, id) {
	const own = readYaml(path.join(assetDir, 'patterns', `${id}.yaml`))
	if (own && typeof own === 'object') return own.responsive ?? {}
	const chrome = readYaml(path.join(assetDir, 'patterns', 'chrome.yaml'))
	const entry = chrome && typeof chrome === 'object' ? chrome[id] : null
	if (entry && typeof entry === 'object') return entry.responsive ?? {}
	return null
}

/** 该型哪几档没有实测几何。只认 schema 上那一处显式的 `grid.observed: false`。 */
export const unobservedBreakpointsOf = (responsive) => new Set(BREAKPOINTS.filter((bp) => responsive?.[bp]?.grid?.observed === false))

/**
 * 校验合成型继承源：真实型存在、档名合法、该档 `grid.observed === true`。
 * @returns {{ ok: true, pattern: string, breakpoint: string } | { ok: false, reason: string }}
 */
export function validateInheritSource(assetDir, source, { floorIds = null } = {}) {
	if (!isInheritFromSource(source)) return { ok: false, reason: 'missing' }
	const pattern = source.pattern.trim()
	const breakpoint = source.breakpoint.trim()
	if (!pattern || isSynthPattern(pattern)) return { ok: false, reason: 'invalid-pattern' }
	if (!BREAKPOINTS.includes(breakpoint)) return { ok: false, reason: 'invalid-breakpoint' }
	if (floorIds && !floorIds.has(pattern)) return { ok: false, reason: 'pattern-not-in-index' }
	const responsive = readPatternResponsive(assetDir, pattern)
	if (!responsive) return { ok: false, reason: 'pattern-unreadable' }
	const grid = responsive[breakpoint]?.grid
	if (!grid || grid.observed === false) return { ok: false, reason: 'not-observed' }
	return { ok: true, pattern, breakpoint }
}

/** 从 trace 取某合成型优先 pc 的继承源对象。 */
export function primaryInheritSource(trace, synthId) {
	const floor = (trace?.floors ?? []).find((f) => String(f?.id ?? '') === synthId)
	const entries = Array.isArray(floor?.unobservedBreakpoints) ? floor.unobservedBreakpoints : []
	const byBp = new Map(entries.map((e) => [String(e?.breakpoint ?? ''), e]))
	for (const bp of BREAKPOINTS) {
		const e = byBp.get(bp)
		if (e && isInheritFromSource(e.inheritFrom)) return e.inheritFrom
	}
	for (const e of entries) {
		if (isInheritFromSource(e.inheritFrom)) return e.inheritFrom
	}
	return null
}

/** 合成型 → 继承源在 floor-index 里的型记录。 */
export function resolveSynthFloorRecord({ trace, synthId, assetDir, floorsById }) {
	const source = primaryInheritSource(trace, synthId)
	if (!source) return null
	const validated = validateInheritSource(assetDir, source, { floorIds: floorsById })
	if (!validated.ok) return null
	return floorsById.get(validated.pattern) ?? null
}

function checkSynthInheritance({ id, entries, assetDir, floorIds, out }) {
	const unobserved = synthUnobservedBreakpoints()
	for (const bp of BREAKPOINTS) {
		if (entries.some((e) => String(e?.breakpoint ?? '') === bp)) continue
		out.push(
			finding({
				code: 'inherit-synth-undeclared',
				pattern: id,
				breakpoint: bp,
				reason: `合成型 \`${id}\` 三档全无实测，trace 该层的 unobservedBreakpoints 里没有 ${bp} 档：无实测的档必须指名继承自哪个真实型的哪一档（\`inheritFrom: { pattern, breakpoint }\`），留空即阻断`,
			}),
		)
	}
	for (const e of entries) {
		const bp = String(e?.breakpoint ?? '')
		if (!unobserved.has(bp)) {
			out.push(
				finding({
					code: 'inherit-breakpoint-observed',
					pattern: id,
					breakpoint: bp || null,
					reason: `trace 给合成型 \`${id}\` 登了 ${bp || '<空>'} 档无实测，但合成型只认三档全无实测的声明：多登 observed 档或三档外的名字都不对`,
				}),
			)
			continue
		}
		if (!isInheritFromSource(e.inheritFrom)) {
			out.push(
				finding({
					code: 'inherit-synth-source-missing',
					pattern: id,
					breakpoint: bp,
					reason: `合成型 \`${id}\` 的 ${bp} 档没有 \`inheritFrom: { pattern, breakpoint }\` 对象（键缺席、null、或仍是常规模型的档名字符串）：它与「凭感觉编一个新楼层」之间唯一的区别就是必须指名继承源，留空即阻断`,
				}),
			)
			continue
		}
		const validated = validateInheritSource(assetDir, e.inheritFrom, { floorIds })
		if (!validated.ok) {
			out.push(
				finding({
					code: 'inherit-synth-source-invalid',
					pattern: id,
					breakpoint: bp,
					inheritFrom: e.inheritFrom,
					reason: synthSourceInvalidReason(validated.reason, e.inheritFrom),
				}),
			)
		}
	}
}

const synthSourceInvalidReason = (reason, source) => {
	const pat = source?.pattern ?? '<缺席>'
	const bp = source?.breakpoint ?? '<缺席>'
	if (reason === 'not-observed') {
		return `合成型声称继承自 \`${pat}\` 的 ${bp} 档，但资产里这一档是 grid.observed: false（没有实测几何）：只能指名有实测的真实型档位，指一个同样没量过的档数字仍然是编的`
	}
	if (reason === 'pattern-not-in-index' || reason === 'pattern-unreadable') {
		return `合成型声称继承自 \`${pat}\`，但本资产 floor-index.json 的 floors[] / patterns/ 里取不到这个真实型`
	}
	if (reason === 'invalid-pattern' || reason === 'invalid-breakpoint') {
		return `合成型继承源 \`${pat}@${bp}\` 形状不对：pattern 须为真实型 id（不得带 synth: 前缀），breakpoint 须为 pc / tablet / mobile 之一`
	}
	return `合成型继承源 \`${pat}@${bp}\` 校验不通过（${reason}）`
}

/** 判据源读不开时抛这个，由门转成 `breakpoint-map-unreadable`——不静默当作「表是空的」。 */
export class BreakpointMapError extends Error {}

/**
 * 资产 `tokens.json` 的 `breakpoints` 组（合同 §3.8）读成「声明值 → 它划哪几档」。
 *
 * 代表值与 `aliases` 一起进表且同待遇：`767` / `768` / `769` 在站点 CSS 里是同一个断点，
 * 只收代表值会把 `@media (max-width: 767px)` 这种完全正当的写法判红。
 *
 * 组缺席、组是空的、组里一个整数都读不出来，三种都抛——**判不出不放行**。静默返回空表会让
 * 后面每一条 `@media` 都「查不到」，把「这份资产没交机读副本」报成「产物写错了数」。
 */
export function readBreakpointMap(assetDir) {
	let root
	try {
		root = JSON.parse(fs.readFileSync(path.join(assetDir, 'tokens.json'), 'utf8'))
	} catch (e) {
		throw new BreakpointMapError(`读不开资产的 tokens.json：${e.message}`)
	}
	const group = root?.breakpoints
	if (!group || typeof group !== 'object') {
		throw new BreakpointMapError('资产的 tokens.json 没有 `breakpoints` 组（合同 §3.8）：那一组是 DESIGN.md §5 断点表的机读副本，缺了就没有表可查')
	}
	const byValue = new Map()
	for (const [key, node] of Object.entries(group)) {
		if (key.startsWith('$') || !node || typeof node !== 'object') continue
		const rep = Number.isInteger(node?.$value?.value) ? node.$value.value : Number(key)
		const bp = node?.$extensions?.['page-theme']?.breakpoint
		const slots = (Array.isArray(bp?.slots) ? bp.slots : []).filter((s) => BREAKPOINTS.includes(s))
		const values = [rep, ...(Array.isArray(bp?.aliases) ? bp.aliases : [])]
		for (const v of values) {
			if (!Number.isInteger(v)) continue
			if (!byValue.has(v)) byValue.set(v, { rep, slots: new Set() })
			for (const s of slots) byValue.get(v).slots.add(s)
		}
	}
	if (!byValue.size) {
		throw new BreakpointMapError('资产的 `breakpoints` 组里读不出一个整数声明值：形状见合同 §3.8（键 = 代表 px，`$value` = `{ value, unit: "px" }`，`$extensions["page-theme"].breakpoint.aliases` 必填）')
	}
	return byValue
}

/**
 * 产物里每一条 `@media` 宽度条件的像素值。抽取器复用优化模式的
 * `extractMediaWidthConditions`（那份只抽不判，条件已归一成无空白小写串）。
 *
 * 读不成 px 的条件（`48em` / `0` / 区间语法里的非 px 写法）**照样进表**，`px` 记 `null`：
 * 由门报成「查不到」而不是悄悄跳过——`(max-width: 47.9375em)` 与 `(max-width: 767px)` 是同一
 * 处换档，允许换个单位免检等于给这道门留了一个一行就能走的后门。
 */
export function mediaWidthPixels(sources) {
	const out = []
	for (const src of sources ?? []) {
		const where = src?.file ?? null
		for (const cond of extractMediaWidthConditions(src?.text ?? '')) {
			const hits = [...cond.matchAll(/(\d+(?:\.\d+)?)px/g)].map((m) => Number(m[1]))
			if (!hits.length) out.push({ file: where, cond, px: null })
			for (const px of hits) out.push({ file: where, cond, px })
		}
	}
	return out
}

export function checkResponsiveInheritance({ html, css = [], trace = null, assetDir = null } = {}) {
	if (!trace || !assetDir) return []
	if (html === undefined || html === null) {
		return [finding({ code: 'no-input', reason: '调用方没传 html：本门的射程由产物侧层根界定，没有产物就没有「用到了哪几个型」这件事。这条不是「没声明」——没声明是传了产物却查不到那一条' })]
	}

	const usedIds = [...new Set(parseFloorRoots(html).map((r) => r.pattern))]
	const declared = new Map()
	for (const floor of trace.floors ?? []) {
		const list = Array.isArray(floor?.unobservedBreakpoints) ? floor.unobservedBreakpoints : []
		if (list.length) declared.set(String(floor?.id ?? ''), list)
	}

	let floorIds = null
	try {
		const idx = JSON.parse(fs.readFileSync(path.join(assetDir, 'floor-index.json'), 'utf8'))
		floorIds = new Set((idx.floors ?? []).map((f) => f.id))
	} catch {
		floorIds = null
	}

	const out = []
	for (const id of usedIds) {
		if (isSynthPattern(id)) {
			const entries = declared.get(id) ?? []
			checkSynthInheritance({ id, entries, assetDir, floorIds, out })
			continue
		}
		const responsive = readPatternResponsive(assetDir, id)
		if (!responsive) {
			out.push(
				finding({
					code: 'inherit-pattern-unreadable',
					pattern: id,
					reason: `产物用了 data-pattern="${id}"，但 patterns/${id}.yaml 与 patterns/chrome.yaml 里都取不到它的 responsive 记录：判不出这个型有没有缺测档，就判不出这份 trace 该声明什么。判不出不放行`,
				}),
			)
			continue
		}
		const unobserved = unobservedBreakpointsOf(responsive)
		const entries = declared.get(id) ?? []
		for (const bp of BREAKPOINTS) {
			if (!unobserved.has(bp) || entries.some((e) => String(e?.breakpoint ?? '') === bp)) continue
			out.push(
				finding({
					code: 'inherit-undeclared',
					pattern: id,
					breakpoint: bp,
					reason: `资产里 \`${id}\` 的 ${bp} 档 grid.observed 是 false（没有实测几何），trace 该层的 unobservedBreakpoints 里没有这一条：无实测的档要么点名继承自哪一档，要么声明不继承（inheritFrom: null），不声明就等于给一个没量过的档随手出值`,
				}),
			)
		}
		for (const e of entries) {
			const bp = String(e?.breakpoint ?? '')
			if (!unobserved.has(bp)) {
				out.push(
					finding({
						code: 'inherit-breakpoint-observed',
						pattern: id,
						breakpoint: bp || null,
						reason: `trace 给 \`${id}\` 登了 ${bp || '<空>'} 档无实测，但资产里这一档不是 grid.observed: false（三档之外的名字同判——那种档资产里压根没有）：只登缺测档，整页三档全登一遍不是出路`,
					}),
				)
				continue
			}
			// 键缺席、非三档名、指向自己、指向同样缺测的档，四种同判：`null` 是「不继承」的
			// 唯一正当写法，键缺席什么都不表示——选填字段等于没有字段。
			const given = Object.prototype.hasOwnProperty.call(e, 'inheritFrom')
			if (given && e.inheritFrom === null) continue
			const name = given ? String(e.inheritFrom) : '<缺席>'
			if (!given || !BREAKPOINTS.includes(name) || name === bp || unobserved.has(name)) {
				out.push(
					finding({
						code: 'inherit-source-invalid',
						pattern: id,
						breakpoint: bp,
						inheritFrom: given ? e.inheritFrom : null,
						reason: `\`${id}\` 的 ${bp} 档声称继承自 \`${name}\`，那不是本型另一个有实测的档（inheritFrom 键缺席 / 非三档名 / 指向自己 / 那一档同样 grid.observed: false）：继承自一个同样没量过的档，数字仍然是编的`,
					}),
				)
			}
		}
	}

	for (const id of declared.keys()) {
		if (usedIds.includes(id)) continue
		out.push(
			finding({
				code: 'inherit-floor-absent',
				pattern: id,
				reason: `trace 给型 \`${id}\` 登了缺测档声明，产物里一个 data-pattern="${id}" 层根都没有：声明与产物对不上，这份声明管的不是这份产物`,
			}),
		)
	}

	out.push(...checkMediaValues({ html, css, assetDir, declared }))
	return out
}

/**
 * 产物里的 `@media` 数值那一半。产物一条 `@media` 宽度条件都没有时整段不开口——没有数就没有
 * 「这个数从哪来」可判，此时去报「资产缺机读副本」是在拿产物的门报资产的缺陷（那一侧由
 * `validate-asset.mjs` 的 `breakpoint-group-missing` 守着）。
 *
 * 逐条查表用**声明值闭集**，与色值那一族同一个思路：生成侧不派生断点，一律查表；查不到就是
 * 这站没在那个宽度上换过布局，拿它写 `@media` 在原站一次都不触发。
 */
function checkMediaValues({ html, css, assetDir, declared }) {
	const sources = [{ file: '<html>', text: html }, ...(Array.isArray(css) ? css : [])]
	const hits = mediaWidthPixels(sources)
	if (!hits.length) return []

	let byValue
	try {
		byValue = readBreakpointMap(assetDir)
	} catch (e) {
		if (!(e instanceof BreakpointMapError)) throw e
		return [
			finding({
				code: 'breakpoint-map-unreadable',
				reason: `产物写了 ${hits.length} 条 \`@media\` 宽度条件，却查不出这份资产的断点声明值：${e.message}。判不出就不放行——静默当作全绿，等于这道门只在资产完好时存在`,
			}),
		]
	}

	const out = []
	const slotsWritten = new Map()
	for (const hit of hits) {
		const entry = hit.px === null ? null : byValue.get(hit.px)
		if (!entry) {
			out.push(
				finding({
					code: 'breakpoint-value-unmapped',
					file: hit.file,
					condition: hit.cond,
					px: hit.px,
					reason:
						hit.px === null
							? `\`@media (${hit.cond})\` 读不出像素值：断点闭集是按 px 记的（合同 §3.8），换个单位写同一处换档等于绕过查表。改成资产 breakpoints 组里的 px 写法`
							: `\`@media\` 用了 ${hit.px}px，本资产的 breakpoints 组（合同 §3.8）里没有这个声明值（可用 ${[...byValue.keys()].sort((a, b) => a - b).join(' / ')}）：断点不是生成侧能拍的数，站点没在这个宽度上换过布局，这一处 \`@media\` 在原站一次都不触发`,
				}),
			)
			continue
		}
		if (entry.slots.size === 1) {
			const slot = [...entry.slots][0]
			if (!slotsWritten.has(slot)) slotsWritten.set(slot, hit)
		}
	}

	for (const [id, entries] of declared) {
		for (const e of entries) {
			const bp = String(e?.breakpoint ?? '')
			const givenNull = Object.prototype.hasOwnProperty.call(e, 'inheritFrom') && e.inheritFrom === null
			const hit = slotsWritten.get(bp)
			if (!givenNull || !hit) continue
			out.push(
				finding({
					code: 'inherit-null-media-written',
					pattern: id,
					breakpoint: bp,
					file: hit.file,
					condition: hit.cond,
					reason: `trace 给 \`${id}\` 的 ${bp} 档写了 inheritFrom: null（不继承、本档不出任何断点相关的值），产物却有一条只划这一档的 \`@media (${hit.cond})\`：声明与产物自相矛盾，两者必有一个是编的`,
				}),
			)
		}
	}
	return out
}
