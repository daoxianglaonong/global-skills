/**
 * 后三道资产侧门：产物与资产文档之间的对账。
 *
 * 从 `gates.mjs` 外置到这里——那边留下语法门、读图门、白名单与排序。
 * 本模块解析 `DESIGN.md` / `voice.md`，不碰色值字面量或 gitignore。
 *
 * | 门 | 判什么 |
 * | --- | --- |
 * | `design-dont-section-missing` | 资产有未上屏项，`DESIGN.md` 却没有 §8 Don't 节 |
 * | `primitive-dont-id` | `observed: false` 的 primitive 色阶缺 `dontId`，或其 `dontId` 在 `DESIGN.md` 里对不上 |
 * | `voice-forbidden-term` | 产物文案命中 `voice.md` §V3 的 `avoid` / `forbidden_topics` |
 */

import { walkTokens, parseYaml } from '../vendor/page-theme-core/index.mjs'

const finding = (gate, detail) => ({ gate, level: 'block', ...detail })

export function collectUnobserved(tokens) {
	const { list } = walkTokens(tokens)
	const out = []
	for (const entry of list) {
		if (!entry.isToken) continue
		const ext = entry.node.$extensions?.['page-theme']
		if (ext?.observed === false) out.push(entry)
	}
	return out
}

/**
 * §8 节定位（只供 `design-dont-section-missing`）：标题行文本小写化后同时含 `8` 与 `don`，
 * 射程到下一个同级或更高级标题为止。本门只问节在不在，不读节里的字。
 */
export function hasDesignDontSection(designText) {
	for (const line of String(designText).split(/\r?\n/)) {
		const m = /^(#{1,6})\s+(.*)/.exec(line)
		if (!m) continue
		const title = m[2].toLowerCase()
		if (title.includes('8') && title.includes('don')) return true
	}
	return false
}

export function gateDesignDontSectionMissing(unobserved, designText) {
	if (!unobserved.length) return { status: 'no-input', findings: [] }
	if (hasDesignDontSection(designText)) return { status: 'pass', findings: [] }
	return {
		status: 'blocked',
		findings: [
			finding('design-dont-section-missing', {
				assetFile: 'DESIGN.md',
				unobservedCount: unobserved.length,
				reason: '资产有未上屏项，DESIGN.md 却没有 §8 Don\'t 节：采集侧从不找这个标题，只对 dontId 做全文子串匹配',
			}),
		],
	}
}

export function gatePrimitiveDontId(unobserved, closedSet, designText) {
	if (!unobserved.length) return { status: 'no-input', findings: [] }
	const byPath = new Map((closedSet.entries ?? []).map((e) => [e.path, e]))
	const out = []
	for (const token of unobserved) {
		const entry = byPath.get(token.path)
		if (!entry || entry.layer !== 'primitive' || entry.type !== 'color') continue
		const dontId = token.node.$extensions?.['page-theme']?.dontId
		if (typeof dontId !== 'string') {
			out.push(
				finding('primitive-dont-id', {
					assetFile: 'DESIGN.md',
					tokenPath: token.path,
					code: 'primitive-dont-id-missing',
					reason: '未上屏 primitive 色阶必须带 dontId，且必须等于 DESIGN.md 某行的 id',
				}),
			)
		} else if (!String(designText).includes(dontId)) {
			out.push(
				finding('primitive-dont-id', {
					assetFile: 'DESIGN.md',
					tokenPath: token.path,
					code: 'primitive-dont-id-orphan',
					dontId,
					reason: `dontId \`${dontId}\` 在 DESIGN.md 中找不到对应条目`,
				}),
			)
		}
	}
	return { status: out.length ? 'blocked' : 'pass', findings: out }
}

function extractMarkdownSection(md, isTarget) {
	const lines = String(md).split(/\r?\n/)
	let start = -1
	let level = 0
	for (let i = 0; i < lines.length; i++) {
		const m = /^(#{1,6})\s+(.*)/.exec(lines[i])
		if (!m) continue
		if (start < 0 && isTarget(m[2])) {
			start = i + 1
			level = m[1].length
			continue
		}
		if (start >= 0 && m[1].length <= level) return lines.slice(start, i).join('\n')
	}
	return start >= 0 ? lines.slice(start).join('\n') : null
}

const isV3Title = (title) => title.includes('§V3') || (title.includes('V3') && title.includes('词汇'))

function cleanTerm(s) {
	return String(s)
		.replace(/[`*]/g, '')
		.replace(/^["']|["']$/g, '')
		.trim()
}

function splitTerms(right) {
	return String(right)
		.split(/[·、/,，]/)
		.map(cleanTerm)
		.filter(Boolean)
}

export function extractVoiceTerms(voiceText) {
	if (!voiceText || !String(voiceText).trim()) return []
	const section = extractMarkdownSection(voiceText, isV3Title)
	if (section == null) return []
	const terms = []
	const seen = new Set()
	const add = (term, source) => {
		if (!term) return
		const key = `${source}\0${term}`
		if (seen.has(key)) return
		seen.add(key)
		terms.push({ term, source })
	}

	for (const line of section.split(/\r?\n/)) {
		const m = /^\s*[-*+]\s+(.+?)\s*[：:]\s*(.*)$/.exec(line)
		if (!m) continue
		const key = m[1].trim().toLowerCase().replace(/[`*]/g, '')
		if (key !== 'avoid' && key !== 'forbidden_topics') continue
		const source = key === 'avoid' ? 'avoid' : 'forbidden_topics'
		for (const t of splitTerms(m[2])) add(t, source)
	}

	const fenceRe = /```yaml\s*\n([\s\S]*?)```/gi
	let fm
	while ((fm = fenceRe.exec(section))) {
		let doc
		try {
			doc = parseYaml(fm[1], 'voice.md')
		} catch {
			continue
		}
		if (!doc || typeof doc !== 'object') continue
		if (Array.isArray(doc.avoid)) {
			for (const item of doc.avoid) {
				if (item && typeof item.term === 'string') add(cleanTerm(item.term), 'avoid')
			}
		}
		if (Array.isArray(doc.forbidden_topics)) {
			for (const item of doc.forbidden_topics) {
				if (item && typeof item.topic === 'string') add(cleanTerm(item.topic), 'forbidden_topics')
			}
		}
	}
	return terms
}

/**
 * 匹配面是产物的人读文案：HTML 文本节点，加 alt / title / aria-label / placeholder。
 * `<script>` / `<style>` 体、CSS 文件、`class` / `id` / `data-*` 都不扫。
 */
export function extractCopySurfaces(html, file) {
	const surfaces = []
	const src = String(html)
		.replace(/<!--[\s\S]*?-->/g, '')
		.replace(/<script\b[\s\S]*?<\/script>/gi, '')
		.replace(/<style\b[\s\S]*?<\/style>/gi, '')

	const attrRe = /(alt|title|aria-label|placeholder)\s*=\s*(?:"([^"]*)"|'([^']*)')/gi
	let m
	while ((m = attrRe.exec(src))) {
		const text = m[2] ?? m[3] ?? ''
		if (text) surfaces.push({ file, text })
	}
	const text = src
		.replace(/<[^>]+>/g, ' ')
		.replace(/\s+/g, ' ')
		.trim()
	if (text) surfaces.push({ file, text })
	return surfaces
}

function allTermHits(haystack, term) {
	const hits = []
	const hasCjk = /[\u3000-\u9fff]/.test(term)
	if (hasCjk) {
		let from = 0
		while (from <= haystack.length) {
			const i = haystack.indexOf(term, from)
			if (i < 0) break
			hits.push(i)
			from = i + Math.max(term.length, 1)
		}
		return hits
	}
	const re = new RegExp(term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi')
	let m
	while ((m = re.exec(haystack))) hits.push(m.index)
	return hits
}

export function gateVoiceForbiddenTerm(terms, htmlFiles) {
	if (!terms.length) return { status: 'no-input', findings: [] }
	const out = []
	for (const file of htmlFiles ?? []) {
		for (const surface of extractCopySurfaces(file.text, file.file)) {
			for (const { term, source } of terms) {
				for (const i of allTermHits(surface.text, term)) {
					const context = surface.text.slice(Math.max(0, i - 12), i + term.length + 12).trim()
					out.push(
						finding('voice-forbidden-term', {
							file: file.file,
							assetFile: 'voice.md',
							term,
							source,
							context,
							reason: `产物文案命中 voice.md §V3 的 ${source}：「${term}」。只按字面匹配，不判语义；图里的字、JS 拼出的文案抓不住`,
						}),
					)
				}
			}
		}
	}
	return { status: out.length ? 'blocked' : 'pass', findings: out }
}
