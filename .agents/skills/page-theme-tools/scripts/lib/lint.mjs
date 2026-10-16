// Minimal product lint against an asset.
// Blocking: colour outside asset, unknown var(), font family outside asset stacks, baseline drift.
// Warning only: asset colours written as literals, typography / spacing / radius / border-width literals
// not in tokens, @media widths off breakpoints, deprecated variables.
import fs from 'node:fs'
import path from 'node:path'
import { colorLiterals, NEUTRAL_KEYWORDS } from './color.mjs'
import { collectCss, cleanCss, declarations, listFiles, mediaRanges, fontFamilies, shorthandFamily, inputError, SCANNED_EXT } from './css-scan.mjs'
import { buildCss, vocabulary, normalizeScalar, validateTokens } from './tokens.mjs'
import { readJson } from './check-asset.mjs'
import { snapshotHtml, compareSnapshots } from './baseline.mjs'

const NO_COLOR_PROPS = /^(font|font-family|animation(-name)?|transition(-property)?|will-change|grid-(area|template-areas)|counter-(reset|increment)|list-style-type|content|quotes)$/
const CSS_WIDE = new Set(['inherit', 'initial', 'unset', 'revert', 'revert-layer'])
const TYPO_PROPS = /^(font-size|line-height|font-weight|letter-spacing)$/
const SPACING_PROPS = /^(margin|padding)(-(top|right|bottom|left|block|inline)(-(start|end))?)?$|^(gap|row-gap|column-gap)$/
const RADIUS_PROPS = /^border(-[a-z]+)*-radius$/
const BORDER_PROPS = /^(border(-(top|right|bottom|left|block|inline)(-(start|end))?)?(-width)?|outline(-width)?)$/
const LENGTH = /^-?[\d.]+(px|rem|em)$/
const KEYWORD_SCALARS = new Set(['0', 'auto', 'normal', 'inherit', 'initial', 'unset', 'bold', 'bolder', 'lighter', 'none'])

/** Asset vocabulary; an unreadable or invalid asset is an input error (exit 2), not a lint result. */
export function loadVocabulary(assetDir) {
	const file = path.join(assetDir, 'tokens.json')
	if (!fs.existsSync(file)) throw inputError(`${file} not found; is ${assetDir} an asset directory?`)
	let json
	try {
		json = readJson(file)
	} catch (e) {
		throw inputError(`${file}: ${e.message}`)
	}
	const errors = validateTokens(json)
	if (errors.length) {
		const list = errors.slice(0, 3).map((e) => `${e.code} at ${e.where}: ${e.message}`).join('; ')
		throw inputError(`asset tokens.json is invalid (${list}${errors.length > 3 ? '; ...' : ''}); run \`theme.mjs check ${assetDir}\``)
	}
	return { json, vocab: vocabulary(json), generatedCss: buildCss(json) }
}

/** listFiles that refuses an empty result: scanning nothing must never look like a pass. */
export function requireFiles(inputs, filter = () => true) {
	const files = listFiles(inputs).filter(filter)
	if (!files.length) throw inputError(`no scannable files in ${inputs.join(', ')} (looked for ${SCANNED_EXT.join(' ')})`)
	return files
}

// A scalar kind is checked only when the asset has tokens of that kind (dimension / number tokens matched
// by id or cssVar; font-weight by fontWeight tokens); otherwise one summary warning per kind.
const KIND_TOKENS = {
	'typography': /font|text|line-height|letter/,
	'spacing': /space|spacing|gap|gutter|margin|padding|inset/,
	'radius': /radius|round|corner/,
	'border-width': /border|stroke|outline/
}
const scalarKinds = (vocab) => {
	const kinds = new Set(Object.keys(KIND_TOKENS).filter((kind) =>
		vocab.tokens.some((t) => ['dimension', 'number'].includes(t.type) && !/weight/.test(t.id) && KIND_TOKENS[kind].test(`${t.id} ${t.cssVar}`))))
	if (vocab.tokens.some((t) => t.type === 'fontWeight')) kinds.add('font-weight')
	return kinds
}

function scalarWarnings(d, vocab, push, kinds, skipped) {
	let code = null
	if (TYPO_PROPS.test(d.prop)) code = 'typography-literal'
	else if (SPACING_PROPS.test(d.prop)) code = 'spacing-literal'
	else if (RADIUS_PROPS.test(d.prop)) code = 'radius-literal'
	else if (BORDER_PROPS.test(d.prop)) code = 'border-width-literal'
	if (!code || (code === 'typography-literal' && d.value.includes('('))) return
	const kind = d.prop === 'font-weight' ? 'font-weight' : code.replace(/-literal$/, '')
	const parts = code === 'typography-literal' ? [d.value] : d.value.split(/\s+/)
	for (const part of parts) {
		const v = normalizeScalar(part)
		if (KEYWORD_SCALARS.has(v) || v.endsWith('%') || parseFloat(v) === 0) continue
		if (code !== 'typography-literal' && !LENGTH.test(part)) continue
		if (!kinds.has(kind)) skipped.set(kind, (skipped.get(kind) || 0) + 1)
		else if (!vocab.scalars.has(v)) push(code, d, part, `${d.prop}: ${part} is not a token value`)
	}
}

function mediaWarnings(chunk, vocab, push) {
	if (!vocab.breakpoints.length) return
	for (const r of mediaRanges(cleanCss(chunk.css))) {
		for (const m of r.query.matchAll(/(min|max)-width\s*:\s*([\d.]+)(px|em|rem)/g)) {
			const px = Number(m[2]) * (m[3] === 'px' ? 1 : 16)
			if (!vocab.breakpoints.some((b) => Math.abs(b - px) <= 1)) {
				push('breakpoint-literal', { line: chunk.line + r.line - 1, prop: '@media' }, `${m[2]}${m[3]}`, `@media ${r.query} is not an asset breakpoint (${vocab.breakpoints.join(', ')})`)
			}
		}
	}
}

/**
 * Lint product files / directories. `options.baseline` is a snapshot document from
 * `baseline snapshot`; when given, HTML inputs are compared to it in order.
 */
export function lintArtifacts(assetDir, inputs, options = {}) {
	const { vocab, generatedCss } = loadVocabulary(assetDir)
	requireFiles(inputs)
	const errors = []
	const warnings = []
	const files = new Set()
	const chunks = collectCss(inputs).filter((c) => c.inline || c.css.replace(/\r\n/g, '\n') !== generatedCss)
	const decls = chunks.flatMap((c) => declarations(c).map((d) => ({ ...d, file: c.file })))
	const localVars = new Set(decls.filter((d) => d.prop.startsWith('--')).map((d) => d.prop))
	const at = (file, d) => ({ file: path.relative(process.cwd(), file).replace(/\\/g, '/'), line: d.line, prop: d.prop })
	const mk = (list) => (file) => (code, d, value, message) => list.push({ code, ...at(file, d), value, message })

	const kinds = scalarKinds(vocab)
	const skipped = new Map()
	for (const c of chunks) files.add(c.file)
	for (const d of decls) {
		const block = mk(errors)(d.file)
		const warn = mk(warnings)(d.file)
		if (!NO_COLOR_PROPS.test(d.prop)) {
			for (const lit of colorLiterals(d.value)) {
				if (NEUTRAL_KEYWORDS.has(lit.raw.toLowerCase())) continue
				if (!lit.key || !vocab.colors.has(lit.key)) block('color-outside-asset', d, lit.raw, `${lit.raw} is not an asset colour`)
				else if (!d.prop.startsWith('--')) warn('color-literal', d, lit.raw, `${lit.raw} is an asset colour written as a literal; use its var()`)
			}
		}
		for (const m of d.value.matchAll(/var\(\s*(--[\w-]+)/g)) {
			if (!vocab.cssVars.has(m[1]) && !localVars.has(m[1])) block('unknown-var', d, m[1], `${m[1]} is neither an asset variable nor declared locally`)
			else if (vocab.deprecated.has(m[1])) warn('deprecated-var', d, m[1], `${m[1]} is deprecated; use ${vocab.deprecated.get(m[1])}`)
		}
		const familyValue = d.prop === 'font-family' ? d.value : d.prop === 'font' ? shorthandFamily(d.value) : null
		if (familyValue && !familyValue.includes('var(')) {
			if (!vocab.fontFamilies.size) {
				warnings.push({ code: 'font-check-skipped', ...at(d.file, d), value: familyValue, message: 'asset declares no fontFamily tokens' })
			} else {
				const outside = fontFamilies(familyValue).filter((f) => !CSS_WIDE.has(f) && !vocab.fontFamilies.has(f))
				if (outside.length) block('font-family-outside-asset', d, outside.join(', '), `font family ${outside.join(', ')} is not in an asset font stack`)
			}
		}
		scalarWarnings(d, vocab, warn, kinds, skipped)
	}
	for (const [kind, count] of skipped) {
		warnings.push({ code: 'scalar-check-skipped', file: null, line: null, prop: kind, value: count, message: `asset has no ${kind} tokens; ${count} ${kind} literal(s) not checked` })
	}
	for (const c of chunks) if (!c.inline) mediaWarnings(c, vocab, mk(warnings)(c.file))

	if (options.baseline) {
		const result = compareFiles(options.baseline, listFiles(inputs).filter((p) => /\.html?$/i.test(p)))
		for (const f of result.files) {
			for (const diff of f.diffs) errors.push({ code: 'baseline-drift', file: f.file, line: null, prop: diff.kind, value: diff.after ?? null, message: diff.message })
		}
	}
	return { ok: errors.length === 0, errors, warnings, files: [...files].map((f) => path.relative(process.cwd(), f).replace(/\\/g, '/')) }
}

/** Compare HTML files to a baseline document, pairing them by position. */
export function compareFiles(baseline, htmlFiles) {
	const before = baseline.files || []
	const files = []
	if (before.length !== htmlFiles.length) {
		files.push({ file: '*', diffs: [{ kind: 'files', message: `baseline has ${before.length} file(s), got ${htmlFiles.length}` }] })
	}
	htmlFiles.forEach((file, i) => {
		if (!before[i]) return
		const diffs = compareSnapshots(before[i], snapshotHtml(fs.readFileSync(file, 'utf8')))
		files.push({ file: path.relative(process.cwd(), file).replace(/\\/g, '/'), baseline: before[i].file, diffs })
	})
	return { ok: files.every((f) => !f.diffs.length), files }
}
