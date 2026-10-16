// Static scanning of product files: which CSS exists where, and its declarations with line numbers.
// Regex-level on purpose: enough for lint / inventory, no cascade or selector semantics.
import fs from 'node:fs'
import path from 'node:path'

export const SCANNED_EXT = ['.html', '.htm', '.css', '.vue', '.svelte', '.jsx', '.tsx']
const SCANNED = new RegExp(`(${SCANNED_EXT.map((e) => e.replace('.', '\\.')).join('|')})$`, 'i')

/** An input problem the CLI reports as a usage error (exit 2) rather than a stack trace. */
export const inputError = (message) => Object.assign(new Error(message), { input: true })

/** Expand files / directories into a sorted list of scannable files (see SCANNED_EXT). */
export function listFiles(inputs) {
	const out = new Set()
	const walk = (p) => {
		if (!fs.existsSync(p)) throw inputError(`no such file or directory: ${p}`)
		const st = fs.statSync(p)
		if (st.isDirectory()) {
			for (const name of fs.readdirSync(p)) {
				if (name === 'node_modules' || name.startsWith('.')) continue
				walk(path.join(p, name))
			}
		} else if (SCANNED.test(p)) out.add(path.resolve(p))
	}
	for (const input of inputs) walk(input)
	return [...out].sort()
}

const lineAt = (text, index) => text.slice(0, index).split('\n').length

function blankComments(text, open, close) {
	let out = text
	let i = out.indexOf(open)
	while (i !== -1) {
		const end = out.indexOf(close, i + open.length)
		const stop = end === -1 ? out.length : end + close.length
		out = out.slice(0, i) + out.slice(i, stop).replace(/[^\n]/g, ' ') + out.slice(stop)
		i = out.indexOf(open, stop)
	}
	return out
}

const kebab = (k) => k.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)

/** JSX `style={{ fontSize: '14px', color: "#333" }}` objects as CSS text; only string-literal values. */
function jsxStyles(text) {
	const out = []
	for (const m of text.matchAll(/\bstyle\s*=\s*\{\{([\s\S]*?)\}\}/g)) {
		const decls = [...m[1].matchAll(/([A-Za-z]+)\s*:\s*(?:"([^"]*)"|'([^']*)'|`([^`$]*)`)/g)].map((d) => `${kebab(d[1])}:${d[2] ?? d[3] ?? d[4]}`)
		if (decls.length) out.push({ css: `x{${decls.join(';')}}`, index: m.index })
	}
	return out
}

/**
 * CSS chunks reachable from the given inputs: .css files, <style> blocks, style="" attributes
 * (also in .vue / .svelte / .jsx / .tsx), JSX style objects, and local stylesheets linked from HTML.
 * Each chunk: { file, css, line, inline }.
 */
export function collectCss(inputs) {
	const files = listFiles(inputs)
	const seen = new Set(files)
	const chunks = []
	const queue = [...files]
	while (queue.length) {
		const file = queue.shift()
		const text = fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n')
		if (/\.css$/i.test(file)) {
			chunks.push({ file, css: text, line: 1, inline: false })
			continue
		}
		const html = blankComments(text, '<!--', '-->')
		for (const m of html.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/gi)) {
			chunks.push({ file, css: m[1], line: lineAt(html, m.index + m[0].indexOf('>') + 1), inline: false })
		}
		for (const m of html.matchAll(/\sstyle\s*=\s*("([^"]*)"|'([^']*)')/gi)) {
			chunks.push({ file, css: `x{${m[2] ?? m[3]}}`, line: lineAt(html, m.index + 1), inline: true })
		}
		if (/\.[jt]sx$/i.test(file)) {
			for (const s of jsxStyles(html)) chunks.push({ file, css: s.css, line: lineAt(html, s.index), inline: true })
		}
		for (const m of html.matchAll(/<link\b[^>]*>/gi)) {
			if (!/rel\s*=\s*["']?stylesheet/i.test(m[0])) continue
			const href = m[0].match(/href\s*=\s*["']?([^"'\s>]+)/i)?.[1]
			if (!href || /^([a-z]+:)?\/\//i.test(href) || href.startsWith('/')) continue
			const target = path.resolve(path.dirname(file), href.split(/[?#]/)[0])
			if (!seen.has(target) && fs.existsSync(target)) {
				seen.add(target)
				queue.push(target)
			}
		}
	}
	return chunks
}

/** Blank out comments and url() payloads, keeping offsets and line numbers intact. */
export function cleanCss(css) {
	return blankComments(css, '/*', '*/').replace(/url\((?:"[^"]*"|'[^']*'|[^)]*)\)/gi, (m) => 'url(' + ' '.repeat(m.length - 5) + ')')
}

/**
 * Declarations in a CSS chunk: { prop, value, line, media, selector } where `media` is the
 * enclosing @media prelude (innermost) or null and `selector` the raw prelude of the enclosing
 * rule. Comments and url() payloads are neutralised.
 */
export function declarations(chunk) {
	const css = cleanCss(chunk.css)
	const media = mediaRanges(css)
	const out = []
	for (const m of css.matchAll(/([-\w]+)\s*:\s*([^;{}]+?)\s*(?=;|})/g)) {
		const ctx = media.filter((r) => m.index > r.start && m.index < r.end).pop()
		const open = css.lastIndexOf('{', m.index)
		const start = Math.max(css.lastIndexOf('}', open), css.lastIndexOf('{', open - 1), css.lastIndexOf(';', open)) + 1
		out.push({
			prop: m[1].startsWith('--') ? m[1] : m[1].toLowerCase(),
			value: m[2].replace(/\s*!important$/i, '').trim(),
			line: chunk.line + lineAt(css, m.index) - 1,
			media: ctx ? ctx.query : null,
			selector: open === -1 ? '' : css.slice(start, open).trim()
		})
	}
	return out
}

/** @media blocks: { query, start, end, line } with brace-matched extents. */
export function mediaRanges(css) {
	const out = []
	for (const m of css.matchAll(/@media\s*([^{]+)\{/gi)) {
		let depth = 1
		let i = m.index + m[0].length
		while (i < css.length && depth) {
			if (css[i] === '{') depth++
			else if (css[i] === '}') depth--
			i++
		}
		out.push({ query: m[1].trim().replace(/\s+/g, ' '), start: m.index, end: i, line: lineAt(css, m.index) })
	}
	return out
}

/** Split a font-family list into lowercase family names without quotes. */
export function fontFamilies(value) {
	return String(value)
		.split(',')
		.map((f) => f.trim().replace(/^["']|["']$/g, '').trim().toLowerCase())
		.filter(Boolean)
}

/** The family part of a `font` shorthand, or null for keyword-only / var() values. */
export function shorthandFamily(value) {
	const m = String(value).match(/(?:^|\s)[\d.]+(?:px|rem|em|%|pt|vw|vh|ex|ch)(?:\s*\/\s*\S+)?\s+(.+)$/)
	return m ? m[1] : null
}

/** Property group used by inventory and lint. */
export function usageOf(prop) {
	if (prop.startsWith('--')) return 'custom-property'
	if (/^(color|-webkit-text-fill-color|caret-color|text-decoration-color)$/.test(prop)) return 'text'
	if (prop.startsWith('background')) return 'background'
	if (/^(border|outline)/.test(prop) && !prop.includes('radius')) return 'border'
	if (/shadow$/.test(prop)) return 'shadow'
	if (prop === 'fill' || prop === 'stroke') return 'icon'
	return 'other'
}
