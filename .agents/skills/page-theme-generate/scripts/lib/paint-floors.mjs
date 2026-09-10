/**
 * 混搭一致性门：解析层根、按 data-pattern 对位。
 *
 * 与「按闭集反查底色」拆开，是因为两件事改动理由不同，也本来就能各自单测。
 * 本模块不判对错，只回答「产物里有哪些层根、序列第 i 步对上第 k 次出现」。
 */

export function parseFloorRoots(html) {
	const roots = []
	const re = /<([a-zA-Z][\w-]*)([^>]*?)(\/?)>/g
	let m
	while ((m = re.exec(html))) {
		const attrs = m[2] || ''
		const pat = /data-pattern\s*=\s*(?:"([^"]*)"|'([^']*)')/i.exec(attrs)
		if (!pat) continue
		const cls = /class\s*=\s*(?:"([^"]*)"|'([^']*)')/i.exec(attrs)
		const classes = (cls ? (cls[1] ?? cls[2] ?? '') : '').trim().split(/\s+/).filter(Boolean)
		const style = /style\s*=\s*(?:"([^"]*)"|'([^']*)')/i.exec(attrs)
		roots.push({ pattern: pat[1] ?? pat[2], classes, style: style ? (style[1] ?? style[2] ?? '') : '' })
	}
	return roots
}

export function countBy(ids) {
	const map = new Map()
	for (const id of ids) map.set(id, (map.get(id) ?? 0) + 1)
	return map
}

export function kthOf(steps, i) {
	const id = steps[i].pattern
	let k = 0
	for (let j = 0; j < i; j++) if (steps[j].pattern === id) k++
	return k
}

export function nthRoot(roots, id, k) {
	let n = 0
	for (const r of roots) {
		if (r.pattern === id) {
			if (n === k) return r
			n++
		}
	}
	return null
}
