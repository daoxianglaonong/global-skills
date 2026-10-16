// Source-value inventory: every colour / font / scalar / var() in a product, grouped by value x usage,
// with candidate tokens when an asset is given. Mapping decisions are made by the model and the user.
import path from 'node:path'
import { colorLiterals, colorHex, deltaE00, NEUTRAL_KEYWORDS } from './color.mjs'
import { collectCss, declarations, usageOf, fontFamilies, shorthandFamily } from './css-scan.mjs'
import { normalizeScalar, CSS_HEADER } from './tokens.mjs'
import { loadVocabulary, requireFiles } from './lint.mjs'

const SCALAR_KIND = [
	[/^(font-size|line-height|font-weight|letter-spacing)$/, 'typography'],
	[/^(margin|padding)(-[a-z-]+)?$|^(gap|row-gap|column-gap)$/, 'spacing'],
	[/^border(-[a-z]+)*-radius$/, 'radius'],
	[/^(border(-(top|right|bottom|left|block|inline)(-(start|end))?)?(-width)?|outline(-width)?)$/, 'border-width']
]
const MAX_LOCATIONS = 5
const MAX_CANDIDATES = 3
// Keyword hints, not semantics: a token whose usage / id / cssVar names the selector's role (button, link…)
// ranks first at any distance; naming only the property usage (text / background / border) counts within SAME_HUE.
const SAME_HUE = 10
const USAGE_WORDS = {
	text: /文字|字色|文本|正文|标题|text|fg|foreground|ink/,
	background: /底|背景|background|bg|surface|fill/,
	border: /边框|描边|分隔|线|border|outline|stroke|divider/
}
const ROLES = [
	['button', /btn|button/, /按钮|button|btn|cta/],
	['link', /(^|[\s>+~,])a\b|link/, /链接|link/],
	['input', /input|field|select|textarea/, /输入|表单|input|field|select/],
	['tag', /tag|badge/, /标签|tag|badge/],
	['card', /card/, /卡片|card/],
	['alert', /alert|toast|notice|message/, /提示|告警|alert|toast|notice/]
]
const STATES = [
	['hover', /:hover|\.is-hover/, /hover|悬/],
	['disabled', /:disabled|\.is-disabled|\[disabled\]/, /disabled|禁用/]
]
const stateOf = (selector = '') => STATES.find(([, sel]) => sel.test(selector))?.[0] ?? null
const statesMatch = (text, state) => STATES.every(([name, , words]) => words.test(text) === (name === state))
const roleOf = (selector = '') => ROLES.find(([, sel]) => sel.test(selector.toLowerCase()))?.[0] ?? null

function observe(d) {
	const out = []
	const usage = usageOf(d.prop)
	const role = roleOf(d.selector)
	const state = stateOf(d.selector)
	for (const lit of colorLiterals(d.value)) {
		if (NEUTRAL_KEYWORDS.has(lit.raw.toLowerCase())) continue
		out.push({ kind: 'color', value: colorHex(lit.raw) ?? lit.raw, usage, role, state })
	}
	for (const m of d.value.matchAll(/var\(\s*(--[\w-]+)/g)) out.push({ kind: 'var', value: m[1], usage })
	const family = d.prop === 'font-family' ? d.value : d.prop === 'font' ? shorthandFamily(d.value) : null
	if (family && !family.includes('var(')) out.push({ kind: 'font-family', value: fontFamilies(family).join(', '), usage: 'font' })
	if (!/var\(/.test(d.value)) {
		for (const [re, kind] of SCALAR_KIND) {
			if (!re.test(d.prop)) continue
			for (const part of kind === 'typography' ? [d.value] : d.value.split(/\s+/)) {
				if (/^-?[\d.]+(px|rem|em)?$/.test(part) && parseFloat(part) !== 0) out.push({ kind, value: normalizeScalar(part), usage: d.prop })
			}
		}
	}
	return out
}

function candidates(entry, vocab) {
	const tokens = vocab.tokens.filter((t) => t.public !== false)
	if (entry.kind === 'color') {
		const roleWords = ROLES.find(([name]) => name === entry.role)?.[2]
		const fit = (c) => {
			const text = `${c.usage} ${c.id} ${c.cssVar}`.toLowerCase()
			const usage = USAGE_WORDS[entry.usage]?.test(text) ? 1 : 0
			const state = statesMatch(text, entry.state)
			if (roleWords?.test(text)) return 3 + usage - (state ? 0 : 2)
			return c.deltaE00 <= SAME_HUE && state ? usage : 0
		}
		return tokens
			.filter((t) => t.type === 'color')
			.map((t) => ({ id: t.id, cssVar: t.cssVar, value: t.resolved, usage: t.usage, deltaE00: deltaE00(entry.value, t.resolved), exact: colorHex(t.resolved) === entry.value }))
			.filter((c) => c.deltaE00 !== null)
			.map((c) => ({ ...c, fit: fit(c) }))
			.sort((a, b) => b.fit - a.fit || Number(b.exact) - Number(a.exact) || a.deltaE00 - b.deltaE00)
			.slice(0, MAX_CANDIDATES)
	}
	if (entry.kind === 'var') {
		return tokens.filter((t) => t.cssVar === entry.value || (t.siteNames || []).includes(entry.value)).map((t) => ({ id: t.id, cssVar: t.cssVar, value: t.resolved, usage: t.usage, exact: t.cssVar === entry.value }))
	}
	if (entry.kind === 'font-family') {
		const fam = entry.value.split(', ')
		return tokens.filter((t) => t.type === 'fontFamily' && fam.some((f) => fontFamilies(t.resolved).includes(f))).map((t) => ({ id: t.id, cssVar: t.cssVar, value: t.resolved, usage: t.usage, exact: fontFamilies(t.resolved).join(', ') === entry.value }))
	}
	return tokens.filter((t) => normalizeScalar(t.resolved) === entry.value).map((t) => ({ id: t.id, cssVar: t.cssVar, value: t.resolved, usage: t.usage, exact: true }))
}

/** Inventory of product files. `options.assetDir` adds candidate tokens per entry. */
export function inventory(inputs, options = {}) {
	const vocab = options.assetDir ? loadVocabulary(options.assetDir).vocab : null
	requireFiles(inputs)
	const map = new Map()
	for (const chunk of collectCss(inputs).filter((c) => !c.css.startsWith(CSS_HEADER))) {
		for (const d of declarations(chunk)) {
			for (const o of observe(d)) {
				const key = `${o.kind}|${o.value}|${o.usage}|${o.role ?? ''}|${o.state ?? ''}`
				if (!map.has(key)) map.set(key, { ...o, count: 0, properties: [], locations: [] })
				const e = map.get(key)
				e.count++
				if (!e.properties.includes(d.prop)) e.properties.push(d.prop)
				if (e.locations.length < MAX_LOCATIONS) e.locations.push(`${path.relative(process.cwd(), chunk.file).replace(/\\/g, '/')}:${d.line}`)
			}
		}
	}
	const order = ['color', 'var', 'font-family', 'typography', 'spacing', 'radius', 'border-width']
	const entries = [...map.values()].sort((a, b) => order.indexOf(a.kind) - order.indexOf(b.kind) || b.count - a.count || a.value.localeCompare(b.value))
	if (vocab) for (const e of entries) e.candidates = candidates(e, vocab)
	return { asset: options.assetDir ?? null, entries }
}

/**
 * The 「源值 × 用途」 rows as Markdown: facts and candidates only. The model turns it into the single
 * 「源值 × 用途 → token」 table (token / 匹配 / 决定 columns) defined by page-theme-generate; no decision column here.
 */
export function inventoryMarkdown(result) {
	const cell = (s) => String(s).replace(/\|/g, '\\|')
	const lines = ['| # | 类 | 源值 | 用途 | 处数 | 例 | 候选 |', '| --- | --- | --- | --- | --- | --- | --- |']
	result.entries.forEach((e, i) => {
		const cands = (e.candidates || []).map((c) => `${c.cssVar}${c.exact ? ' (exact)' : c.deltaE00 !== undefined ? ` (ΔE ${c.deltaE00})` : ''}${c.usage ? `：${c.usage}` : ''}`).join('<br>')
		lines.push(`| ${i + 1} | ${e.kind} | ${cell(e.value)} | ${cell([e.usage, e.role, e.state && `:${e.state}`].filter(Boolean).join(' · '))} | ${e.count} | ${cell(e.locations[0] ?? '')} | ${cell(cands) || '—'} |`)
	})
	return lines.join('\n') + '\n'
}
