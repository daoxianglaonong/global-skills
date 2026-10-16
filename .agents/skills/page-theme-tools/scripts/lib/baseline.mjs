// Before/after lock for re-theming: text, links, images and DOM shape must not change.
// Presentation-only markup (class, style, <style>, <link>, <meta>) is ignored; <title> is its own aspect, not body text.

const VOID = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'source', 'track', 'wbr'])
const IGNORED = new Set(['style', 'link', 'meta'])
const RAW_TEXT = new Set(['script', 'style', 'template', 'textarea', 'title'])
const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', '#39': "'" }
export const MAX_DIFFS_PER_KIND = 20

const decode = (s) => s.replace(/&(#x?[0-9a-f]+|[a-z]+|#39);/gi, (m, e) => {
	if (ENTITIES[e.toLowerCase()] !== undefined) return ENTITIES[e.toLowerCase()]
	if (e[0] === '#') return String.fromCodePoint(e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10))
	return m
})

function attrs(source) {
	const out = {}
	for (const m of source.matchAll(/([^\s=/"']+)(?:\s*=\s*("([^"]*)"|'([^']*)'|[^\s>]+))?/g)) {
		out[m[1].toLowerCase()] = decode(m[3] ?? m[4] ?? m[2] ?? '')
	}
	return out
}

/**
 * { title[], text[], links[], images[], structure[] } for an HTML string. `text` is body text plus form
 * text (textarea content, input value / placeholder); `structure` entries are `depth:tag`.
 */
export function snapshotHtml(html) {
	const s = { title: [], text: [], links: [], images: [], structure: [] }
	const src = html.replace(/<!--[\s\S]*?-->/g, '').replace(/<!doctype[^>]*>/i, '')
	const tag = /<(\/?)([a-zA-Z][\w:-]*)((?:[^>"']|"[^"]*"|'[^']*')*)>/g
	const stack = []
	let last = 0
	let raw = null
	const pushText = (t) => {
		const v = decode(t).replace(/\s+/g, ' ').trim()
		if (v) s.text.push(v)
	}
	for (let m = tag.exec(src); m; m = tag.exec(src)) {
		const [whole, closing, rawName, rest] = m
		const name = rawName.toLowerCase()
		if (raw && !(closing && name === raw)) continue
		const between = src.slice(last, m.index)
		if (!raw || raw === 'textarea') pushText(between)
		else if (raw === 'title') s.title.push(decode(between).replace(/\s+/g, ' ').trim())
		last = m.index + whole.length
		if (closing) {
			raw = null
			const at = stack.lastIndexOf(name)
			if (at !== -1) stack.length = at
			continue
		}
		const a = attrs(rest)
		if (name === 'a' && a.href !== undefined) s.links.push(a.href)
		if (name === 'img') s.images.push({ src: a.src ?? '', alt: a.alt ?? '' })
		if (name === 'input' || name === 'textarea') for (const k of ['value', 'placeholder']) if (a[k]) pushText(a[k])
		if (!IGNORED.has(name)) s.structure.push(`${stack.length}:${name}`)
		if (VOID.has(name) || rest.trim().endsWith('/')) continue
		if (!IGNORED.has(name)) stack.push(name)
		if (RAW_TEXT.has(name)) raw = name
	}
	pushText(src.slice(last))
	return s
}

function positionalDiffs(a, b) {
	const out = []
	const n = Math.max(a.length, b.length)
	for (let i = 0; i < n; i++) {
		if (JSON.stringify(a[i]) !== JSON.stringify(b[i])) out.push({ index: i, before: a[i] ?? null, after: b[i] ?? null })
	}
	return out
}

/** Drift between two snapshots: every differing position per aspect, capped at MAX_DIFFS_PER_KIND. */
export function compareSnapshots(before, after) {
	const diffs = []
	for (const kind of ['title', 'text', 'links', 'images', 'structure']) {
		const all = positionalDiffs(before[kind] || [], after[kind] || [])
		for (const d of all.slice(0, MAX_DIFFS_PER_KIND)) {
			diffs.push({ kind, ...d, message: `${kind} changed at #${d.index}: ${JSON.stringify(d.before)} -> ${JSON.stringify(d.after)}` })
		}
		if (all.length > MAX_DIFFS_PER_KIND) diffs.push({ kind, more: all.length - MAX_DIFFS_PER_KIND, message: `${all.length - MAX_DIFFS_PER_KIND} more ${kind} difference(s) not listed` })
	}
	return diffs
}
