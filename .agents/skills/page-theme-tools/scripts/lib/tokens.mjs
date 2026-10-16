// tokens.json v2: a flat map of token id -> { type, value, cssVar, usage, source, public?, siteNames? }.
// Values are literals or `{other.id}` aliases. tokens.css is the only derived file.
import { parseColor, colorKey, colorLiterals } from './color.mjs'
import { fontFamilies } from './css-scan.mjs'

export const FORMAT = 'page-theme-asset/2'
export const TYPES = ['color', 'dimension', 'fontFamily', 'fontWeight', 'number', 'shadow', 'gradient', 'duration', 'breakpoint', 'other']
export const SOURCES = ['spec', 'user', 'site-provisional', 'draft']
export const UNCONFIRMED = new Set(['site-provisional', 'draft'])
export const CSS_HEADER = '/* Generated from tokens.json by page-theme-asset. Edit tokens.json, then run `theme.mjs css`. */'

const CSS_VAR = /^--[a-zA-Z_][\w-]*$/
const SEMVER = /^\d+\.\d+\.\d+(-[\w.-]+)?$/
const ALIAS = /^\{([^{}]+)\}$/

const aliasOf = (value) => (typeof value === 'string' ? value.match(ALIAS)?.[1] ?? null : null)
const isPublic = (t) => t.public !== false

/** Follow alias chains to a literal. Throws on unknown targets or cycles. */
export function resolveValue(tokens, id, seen = []) {
	const t = tokens[id]
	if (!t) throw Object.assign(new Error(`unknown token ${id}`), { code: 'unknown-alias' })
	if (seen.includes(id)) throw Object.assign(new Error(`alias cycle ${[...seen, id].join(' -> ')}`), { code: 'alias-cycle' })
	const target = aliasOf(t.value)
	return target ? resolveValue(tokens, target, [...seen, id]) : String(t.value)
}

/** Structural problems in a parsed tokens.json; [] when valid. */
export function validateTokens(json) {
	const errors = []
	const err = (code, where, message) => errors.push({ code, where, message })
	if (!json || typeof json !== 'object') return [{ code: 'bad-tokens', where: 'tokens.json', message: 'not an object' }]
	if (json.format !== FORMAT) err('bad-format', 'format', `format must be "${FORMAT}"${json.format ? '' : ' (pre-v2 tokens.json? see page-theme-tools/asset-format.md)'}`)
	const tokens = json.tokens
	if (Array.isArray(tokens)) {
		err('bad-format', 'tokens', 'tokens must be an id -> token map, not an array')
		return errors
	}
	if (!tokens || typeof tokens !== 'object' || !Object.keys(tokens).length) {
		err('no-tokens', 'tokens', 'tokens must be a non-empty object')
		return errors
	}
	if (json.version !== undefined && !SEMVER.test(String(json.version))) err('bad-version', 'version', `version "${json.version}" is not semver (e.g. 1.4.0)`)
	if (json.valuePolicy !== undefined && json.valuePolicy !== 'spec-only') err('bad-value-policy', 'valuePolicy', 'valuePolicy is "spec-only" or absent')
	const specOnly = json.valuePolicy === 'spec-only'
	const vars = new Map()
	for (const [id, t] of Object.entries(tokens)) {
		if (!t || typeof t !== 'object') { err('bad-token', id, 'token must be an object'); continue }
		if (!TYPES.includes(t.type)) err('bad-type', id, `type must be one of ${TYPES.join(', ')}`)
		if (typeof t.value !== 'string' && typeof t.value !== 'number') err('bad-value', id, 'value must be a string or number')
		if (!t.cssVar) err('missing-css-var', id, 'every token declares cssVar')
		else if (!CSS_VAR.test(t.cssVar)) err('bad-css-var', id, `cssVar "${t.cssVar}" is not a custom property name`)
		else if (vars.has(t.cssVar)) err('duplicate-css-var', id, `cssVar ${t.cssVar} also used by ${vars.get(t.cssVar)}`)
		else vars.set(t.cssVar, id)
		if (typeof t.usage !== 'string' || !t.usage.trim()) err('missing-usage', id, 'usage says where the token is used')
		if (!SOURCES.includes(t.source)) err('bad-source', id, `source must be one of ${SOURCES.join(', ')}`)
		else if (specOnly && UNCONFIRMED.has(t.source)) err('spec-only-source', id, `valuePolicy spec-only takes spec / user values; drop this ${t.source} token and list the gap for annotation`)
		if (t.public !== undefined && typeof t.public !== 'boolean') err('bad-public', id, 'public is a boolean')
		if (t.siteNames !== undefined && !Array.isArray(t.siteNames)) err('bad-site-names', id, 'siteNames is an array')
		if (t.specName !== undefined && typeof t.specName !== 'string') err('bad-spec-name', id, 'specName is a string')
		if (t.deprecated !== undefined && typeof t.deprecated !== 'boolean') err('bad-deprecated', id, 'deprecated is a boolean')
		if (t.deprecated) {
			const next = tokens[t.replacedBy]
			if (!next || !isPublic(next) || next.deprecated) err('bad-replaced-by', id, `replacedBy must name an existing public, non-deprecated token (got ${t.replacedBy})`)
		}
		if (id.startsWith('component.')) {
			const target = aliasOf(t.value)
			if (target && tokens[target] && !isPublic(tokens[target])) err('component-ref', id, `component tokens reference public tokens; ${target} is private`)
			if (!target && !(typeof t.note === 'string' && t.note.trim())) err('component-ref', id, 'component tokens reference a semantic token ({id}); a literal needs a note saying why')
		}
		let literal
		try {
			literal = resolveValue(tokens, id)
		} catch (e) {
			err(e.code, id, e.message)
			continue
		}
		if (t.type === 'color' && !parseColor(literal)) err('bad-color', id, `"${literal}" is not a parseable colour`)
	}
	return errors
}

/**
 * Deterministic tokens.css. Aliases to public tokens stay var() (component tokens therefore follow their
 * semantic token); aliases to private ones resolve; deprecated tokens become var(<replacement>).
 * `scope` (default :root) and `layer` are for consumer copies; the asset's own file uses the defaults.
 */
export function buildCss(json, { scope = ':root', layer } = {}) {
	const { tokens } = json
	const pad = layer ? '    ' : '  '
	const body = []
	for (const [id, t] of Object.entries(tokens)) {
		if (!isPublic(t)) continue
		const target = t.deprecated ? t.replacedBy : aliasOf(t.value)
		const value = target && isPublic(tokens[target]) ? `var(${tokens[target].cssVar})` : resolveValue(tokens, id)
		body.push(`${pad}${t.cssVar}: ${value};`)
	}
	const block = [`${layer ? '  ' : ''}${scope} {`, ...body, `${layer ? '  ' : ''}}`]
	const head = json.version ? [CSS_HEADER, `/* ${json.id} ${json.version} */`] : [CSS_HEADER]
	return [...head, ...(layer ? [`@layer ${layer} {`, ...block, '}'] : block), ''].join('\n')
}

const num = (v) => {
	const m = String(v).trim().match(/^(-?[\d.]+)(px|rem|em|%)?$/)
	return m ? `${Number(m[1])}${m[2] || ''}` : String(v).trim().toLowerCase()
}

/** What products may reference: public cssVars, colour keys, font families, scalar values, breakpoints. */
export function vocabulary(json) {
	const { tokens } = json
	const v = { cssVars: new Set(), deprecated: new Map(), colors: new Set(), fontFamilies: new Set(), scalars: new Set(), breakpoints: [], tokens: [] }
	for (const [id, t] of Object.entries(tokens)) {
		const value = resolveValue(tokens, id)
		v.tokens.push({ id, ...t, resolved: value })
		if (isPublic(t)) v.cssVars.add(t.cssVar)
		if (isPublic(t) && t.deprecated) v.deprecated.set(t.cssVar, tokens[t.replacedBy].cssVar)
		for (const c of colorLiterals(value)) if (c.key) v.colors.add(c.key)
		if (t.type === 'color') v.colors.add(colorKey(value))
		if (t.type === 'fontFamily') for (const f of fontFamilies(value)) v.fontFamilies.add(f)
		if (['dimension', 'number', 'fontWeight'].includes(t.type)) v.scalars.add(num(value))
		if (t.type === 'breakpoint') {
			const px = parseFloat(value)
			if (Number.isFinite(px)) v.breakpoints.push(String(value).endsWith('em') ? px * 16 : px)
		}
	}
	return v
}

export { num as normalizeScalar }
