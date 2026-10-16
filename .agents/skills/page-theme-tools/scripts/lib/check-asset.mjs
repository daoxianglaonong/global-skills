// Objective asset check: required files, tokens.json structure, tokens.css rebuild, Markdown refs.
import fs from 'node:fs'
import path from 'node:path'
import { validateTokens, buildCss, UNCONFIRMED } from './tokens.mjs'
import { lintArtifacts } from './lint.mjs'

export const REQUIRED = ['DESIGN.md', 'tokens.json', 'tokens.css']

function markdownFiles(dir) {
	const out = []
	const walk = (d) => {
		for (const e of fs.readdirSync(d, { withFileTypes: true })) {
			if (e.name.startsWith('.') || e.name === 'node_modules') continue
			const p = path.join(d, e.name)
			if (e.isDirectory()) walk(p)
			else if (e.name.endsWith('.md')) out.push(p)
		}
	}
	walk(dir)
	return out.sort()
}

/** Relative link / image targets in Markdown, with line numbers. External and anchor-only links are skipped. */
export function markdownRefs(text) {
	const refs = []
	const lines = text.replace(/\r\n/g, '\n').replace(/```[\s\S]*?```/g, (m) => m.replace(/[^\n]/g, ' ')).split('\n')
	lines.forEach((line, i) => {
		for (const m of line.matchAll(/!?\[[^\]]*\]\(\s*<?([^)\s>]+)>?(?:\s+"[^"]*")?\s*\)/g)) {
			const target = m[1]
			if (/^([a-z][a-z0-9+.-]*:|#|\/\/)/i.test(target)) continue
			refs.push({ target: decodeURI(target.split(/[?#]/)[0]), line: i + 1 })
		}
	})
	return refs
}

export function readJson(file) {
	return JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, ''))
}

export function checkAsset(dir) {
	const errors = []
	const warnings = []
	const summary = { tokens: 0, publicVars: 0, markdownFiles: 0, modules: [] }
	for (const f of REQUIRED) {
		if (!fs.existsSync(path.join(dir, f))) errors.push({ code: 'missing-file', where: f, message: `${f} is required` })
	}
	let json = null
	if (fs.existsSync(path.join(dir, 'tokens.json'))) {
		try {
			json = readJson(path.join(dir, 'tokens.json'))
		} catch (e) {
			errors.push({ code: 'bad-json', where: 'tokens.json', message: e.message })
		}
	}
	if (json) {
		const tokenErrors = validateTokens(json)
		errors.push(...tokenErrors.map((e) => ({ ...e, where: `tokens.json#${e.where}` })))
		const entries = Object.entries(json.tokens || {})
		summary.tokens = entries.length
		summary.publicVars = entries.filter(([, t]) => t && t.public !== false).length
		const pending = entries.filter(([, t]) => t && UNCONFIRMED.has(t.source)).map(([id]) => id)
		if (pending.length) {
			warnings.push({
				code: 'needs-confirmation',
				where: 'tokens.json',
				message: `${pending.length} token(s) are draft / site-provisional and need human confirmation (see ids)`,
				count: pending.length,
				ids: pending
			})
		}
		const cssPath = path.join(dir, 'tokens.css')
		if (!tokenErrors.length && fs.existsSync(cssPath)) {
			const onDisk = fs.readFileSync(cssPath, 'utf8').replace(/\r\n/g, '\n')
			if (onDisk !== buildCss(json)) {
				errors.push({ code: 'tokens-css-stale', where: 'tokens.css', message: 'tokens.css differs from tokens.json; run `theme.mjs css <asset>`' })
			}
		}
		const componentsCss = path.join(dir, 'components.css')
		if (!tokenErrors.length && fs.existsSync(componentsCss)) {
			const r = lintArtifacts(dir, [componentsCss])
			const where = (f) => ({ ...f, where: `components.css:${f.line}` })
			errors.push(...r.errors.map(where))
			warnings.push(...r.warnings.map(where))
		}
		const changelog = path.join(dir, 'CHANGELOG.md')
		if (json.version && (!fs.existsSync(changelog) || !fs.readFileSync(changelog, 'utf8').includes(String(json.version)))) {
			warnings.push({ code: 'changelog-missing', where: 'CHANGELOG.md', message: `version ${json.version} has no CHANGELOG.md entry` })
		}
	}
	for (const file of fs.existsSync(dir) ? markdownFiles(dir) : []) {
		summary.markdownFiles++
		const rel = path.relative(dir, file).replace(/\\/g, '/')
		for (const ref of markdownRefs(fs.readFileSync(file, 'utf8'))) {
			if (!fs.existsSync(path.resolve(path.dirname(file), ref.target))) {
				errors.push({ code: 'broken-ref', where: `${rel}:${ref.line}`, message: `${ref.target} does not exist` })
			}
		}
	}
	for (const m of ['layouts', 'recipes', 'evidence', 'illustrations', 'spec', 'voice.md', 'components.md', 'components.css', 'CHANGELOG.md']) {
		if (fs.existsSync(path.join(dir, m))) summary.modules.push(m)
	}
	return { ok: errors.length === 0, asset: dir, errors, warnings, summary }
}
