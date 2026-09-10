/**
 * 混搭一致性门：产物侧底色反查。
 *
 * 从声明数组与层根内联 style 抽出 `--color-surface-*` 候选。内联切分必须走
 * `splitDeclarations`（引号与括号配平），不得再用 `style.split(';')`。
 * 本模块不判 mismatch / unreadable / ambiguous，只回答「读到了哪些 surface 名」。
 */

import { varReferences } from './closed-set.mjs'
import { splitDeclarations } from './css-scan.mjs'

const selectorHitsRoot = (selector, root) => {
	if (selector === `[data-pattern="${root.pattern}"]`) return true
	for (const c of root.classes) {
		if (selector === `.${c}`) return true
	}
	return false
}

const stripAtPrefixes = (selector) => {
	let s = selector.trim()
	while (/^@[a-z-]+/i.test(s)) {
		const rest = s.replace(/^@[a-z-]+/i, '').trimStart()
		let i = 0
		while (i < rest.length) {
			if (/\s/.test(rest[i])) {
				i++
				continue
			}
			if (rest[i] === '(') {
				let depth = 1
				i++
				while (i < rest.length && depth) {
					if (rest[i] === '(') depth++
					else if (rest[i] === ')') depth--
					i++
				}
				continue
			}
			if (rest[i] === '@') break
			if (/[.#\[*:]/.test(rest[i]) || /[a-zA-Z]/.test(rest[i])) {
				const word = /^[a-zA-Z][\w-]*/.exec(rest.slice(i))
				if (word && /^(and|or|not|only|screen|print|all|speech)$/i.test(word[0])) {
					i += word[0].length
					continue
				}
				break
			}
			i++
		}
		s = rest.slice(i).trim()
	}
	return s
}

const splitCommaSelectors = (selector) => {
	const parts = []
	let depth = 0
	let cur = ''
	for (const c of selector) {
		if (c === '(' || c === '[') depth++
		else if (c === ')' || c === ']') depth--
		if (c === ',' && depth === 0) {
			if (cur.trim()) parts.push(cur.trim())
			cur = ''
			continue
		}
		cur += c
	}
	if (cur.trim()) parts.push(cur.trim())
	return parts
}

const lastCompound = (simpleSelector) => {
	let depth = 0
	let lastStart = 0
	for (let i = 0; i < simpleSelector.length; i++) {
		const c = simpleSelector[i]
		if (c === '(' || c === '[') depth++
		else if (c === ')' || c === ']') depth--
		else if (depth === 0 && /[\s>+~]/.test(c)) {
			let j = i
			while (j < simpleSelector.length && /[\s>+~]/.test(simpleSelector[j])) j++
			lastStart = j
			i = j - 1
		}
	}
	return simpleSelector.slice(lastStart).trim()
}

const compoundHitsRoot = (compound, root) => {
	if (!compound || /^<[\w-]+ inline>$/.test(compound)) return false
	if (compound === `[data-pattern="${root.pattern}"]`) return true
	if (new RegExp(`\\[data-pattern\\s*=\\s*["']${root.pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}["']\\]`, 'i').test(compound)) return true
	const stripped = compound.replace(/\([^)]*\)/g, '')
	const classes = [...stripped.matchAll(/\.(-?[_a-zA-Z]+[_a-zA-Z0-9-]*)/g)].map((x) => x[1])
	return classes.some((c) => root.classes.includes(c))
}

const selectorHitsRootLoose = (selector, root) => {
	if (/^<[\w-]+ inline>$/.test(selector)) return false
	const stripped = stripAtPrefixes(selector)
	if (!stripped || stripped.startsWith('@')) return false
	return splitCommaSelectors(stripped).some((part) => compoundHitsRoot(lastCompound(part), root))
}

const surfaceNameFromVar = (name, closedSet) => {
	const entry = closedSet?.byVar?.get(name)
	if (!entry || entry.cssVar !== name) return null
	const m = /^color\.surface\.([^.]+)\.\$root$/.exec(entry.path)
	return m ? m[1] : null
}

const pushSurfaceVars = (value, closedSet, out) => {
	for (const name of varReferences(value)) {
		const x = surfaceNameFromVar(name, closedSet)
		if (x) out.push(x)
	}
}

export function readInlineSurfaces(root, closedSet) {
	const out = []
	const style = root.style || ''
	if (!style) return out
	for (const raw of splitDeclarations(style)) {
		const k = raw.indexOf(':')
		if (k < 0) continue
		const prop = raw.slice(0, k).trim().toLowerCase()
		const value = raw.slice(k + 1).trim()
		if (prop !== 'background-color' && prop !== 'background') continue
		pushSurfaceVars(value, closedSet, out)
	}
	return out
}

export function readSurfaces(declarations, root, closedSet) {
	const out = []
	for (const d of declarations) {
		if (d.prop !== 'background-color' && d.prop !== 'background') continue
		if (!selectorHitsRoot(d.selector, root)) continue
		pushSurfaceVars(d.value, closedSet, out)
	}
	return out
}

export function readSurfaceCandidates(declarations, root, closedSet) {
	const out = []
	for (const d of declarations) {
		if (d.prop !== 'background-color' && d.prop !== 'background') continue
		if (!selectorHitsRootLoose(d.selector, root)) continue
		pushSurfaceVars(d.value, closedSet, out)
	}
	out.push(...readInlineSurfaces(root, closedSet))
	return out
}
