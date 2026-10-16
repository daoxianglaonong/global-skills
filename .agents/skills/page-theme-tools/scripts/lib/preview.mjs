// Static review page for humans: colour swatches, font stacks, scalars and shadows rendered from tokens.json.
import { buildCss, resolveValue } from './tokens.mjs'
import { colorHex } from './color.mjs'

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c])

function row(id, t, value, sample) {
	const flag = t.source === 'draft' || t.source === 'site-provisional' ? ' class="pending"' : ''
	return `<tr${flag}><td>${sample}</td><td><code>${esc(id)}</code><br><code>${esc(t.cssVar)}</code>${t.public === false ? ' (private)' : ''}</td><td><code>${esc(value)}</code></td><td>${esc(t.usage)}</td><td>${esc(t.source)}</td></tr>`
}

function sampleFor(t, value) {
	const v = esc(value)
	if (t.type === 'color') return `<div class="sw" style="background:${v}"></div>${esc(colorHex(value) ?? '')}`
	if (t.type === 'fontFamily') return `<span style="font-family:${v};font-size:20px">Aa 永字 0123</span>`
	if (t.type === 'shadow') return `<div class="sw" style="box-shadow:${v};background:#fff"></div>`
	if (t.type === 'gradient') return `<div class="sw" style="background:${v}"></div>`
	if (t.type === 'dimension' && /px|rem|em$/.test(value)) return `<div class="bar" style="width:${v}"></div>`
	return ''
}

/**
 * Component gallery: each `## name` section of components.md with its ```html blocks rendered as-is.
 * ```html surface=--x paints that block on var(--x).
 */
function gallery(md) {
	const out = []
	for (const part of md.replace(/\r\n/g, '\n').split(/^## /m).slice(1)) {
		const blocks = [...part.matchAll(/```html(?:[ \t]+surface=(--[\w-]+))?[ \t]*\n([\s\S]*?)```/g)]
			.map(([, surface, html]) => `<div class="gallery"${surface ? ` style="background:var(${surface})"` : ''}>\n${html}</div>`)
		if (blocks.length) out.push(`<h3>${esc(part.split('\n')[0].trim())}</h3>\n${blocks.join('\n')}`)
	}
	return out.length ? `<h2>components (${out.length})</h2>\n${out.join('\n')}` : ''
}

/**
 * HTML string; open it next to the spec images to review a transcription. With the asset's
 * components.css / components.md it also renders the component gallery (for `capture`).
 */
export function previewHtml(json, { componentsCss = '', componentsMd = '', componentsOnly = false } = {}) {
	const groups = new Map()
	for (const [id, t] of Object.entries(json.tokens)) {
		const value = resolveValue(json.tokens, id)
		if (!groups.has(t.type)) groups.set(t.type, [])
		groups.get(t.type).push(row(id, t, value, sampleFor(t, value)))
	}
	const sections = [...groups.entries()].map(([type, rows]) =>
		`<h2>${esc(type)} (${rows.length})</h2>\n<table><tr><th></th><th>token / cssVar</th><th>value</th><th>usage</th><th>source</th></tr>\n${rows.join('\n')}\n</table>`)
	return `<!doctype html>
<html><head><meta charset="utf-8"><title>${esc(json.id)} tokens</title>
<style>${buildCss(json)}
body{font:14px/1.5 system-ui,sans-serif;margin:24px}table{border-collapse:collapse;width:100%;margin-bottom:24px}
td,th{border-bottom:1px solid #ddd;padding:6px 8px;text-align:left;vertical-align:middle}
.sw{width:56px;height:32px;border-radius:4px;border:1px solid #0001}.bar{height:8px;background:#888}
tr.pending{background:#fff7e0}.gallery{display:flex;flex-wrap:wrap;gap:12px;align-items:center;margin-bottom:24px;padding:12px}</style>
<style>${componentsCss}</style></head>
<body><h1>${esc(json.id)}${json.version ? ` ${esc(json.version)}` : ''}${componentsOnly ? ' components' : ''}</h1>${componentsOnly ? '' : '<p>Highlighted rows are draft / site-provisional and need confirmation.</p>'}
${componentsCss && componentsMd ? gallery(componentsMd) : ''}
${componentsOnly ? '' : sections.join('\n')}
</body></html>
`
}
