// Output safety: tools never write into the asset they were given or over the files they read
// (inputs plus every local resource an input HTML / CSS references), and every write is atomic.
import fs from 'node:fs'
import path from 'node:path'
import { inputError, listFiles } from './css-scan.mjs'

/** Comparable path: realpath of the nearest existing ancestor + the rest; case-folded on Windows. */
export function realKey(p) {
	let cur = path.resolve(p)
	const rest = []
	while (!fs.existsSync(cur)) {
		const up = path.dirname(cur)
		if (up === cur) break
		rest.unshift(path.basename(cur))
		cur = up
	}
	const full = path.join(fs.existsSync(cur) ? fs.realpathSync.native(cur) : cur, ...rest)
	return process.platform === 'win32' ? full.toLowerCase() : full
}

const within = (child, parent) => child === parent || child.startsWith(parent.endsWith(path.sep) ? parent : parent + path.sep)

const LOCAL_REF = /^(?![a-z][a-z0-9+.-]*:|\/\/|\/|#)/i

/** Local files referenced from HTML (any href / src / srcset) or CSS (url(), @import), any extension. */
function localRefs(file, text) {
	const raw = []
	if (/\.css$/i.test(file)) {
		for (const m of text.matchAll(/url\(\s*["']?([^"')]+)["']?\s*\)|@import\s+["']([^"']+)["']/gi)) raw.push(m[1] ?? m[2])
	} else {
		for (const m of text.matchAll(/\s(?:href|src)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))/gi)) raw.push(m[1] ?? m[2] ?? m[3])
		for (const m of text.matchAll(/\ssrcset\s*=\s*(?:"([^"]*)"|'([^']*)')/gi)) raw.push(...(m[1] ?? m[2]).split(',').map((s) => s.trim().split(/\s+/)[0]))
	}
	return raw
		.map((r) => r.trim().split(/[?#]/)[0])
		.filter((r) => r && LOCAL_REF.test(r))
		.map((r) => path.resolve(path.dirname(file), safeDecode(r)))
}

function safeDecode(s) {
	try {
		return decodeURI(s)
	} catch {
		return s
	}
}

/** Protected paths for a run: the inputs, scannable files under input dirs, and what they reference, transitively. */
export function protectedPaths(inputs) {
	const files = new Set()
	const queue = []
	const add = (f) => {
		const k = realKey(f)
		if (files.has(k)) return
		files.add(k)
		if (/\.(html?|css|vue|svelte|[jt]sx)$/i.test(f) && fs.existsSync(f) && fs.statSync(f).isFile()) queue.push(f)
	}
	for (const input of inputs) {
		add(input)
		if (fs.existsSync(input) && fs.statSync(input).isDirectory()) listFiles([input]).forEach(add)
	}
	while (queue.length) {
		const f = queue.shift()
		localRefs(f, fs.readFileSync(f, 'utf8')).forEach(add)
	}
	return files
}

/**
 * Refuse (input error, CLI exit 2) before anything is written when an output lies inside one of
 * `assets` or is one of the `protect` paths (a Set from protectedPaths).
 */
export function guardOutputs(outs, { assets = [], protect = new Set() } = {}) {
	const assetKeys = assets.map(realKey)
	for (const out of outs) {
		const o = realKey(out)
		const a = assets[assetKeys.findIndex((k) => within(o, k))]
		if (a !== undefined) throw inputError(`refusing to write ${out}: it is inside the input asset ${a}`)
		if (protect.has(o)) throw inputError(`refusing to write ${out}: it would overwrite an input file`)
	}
}

/** Atomic write (temp file in the same directory, then rename); any failure is a one-line input error. */
export function writeAtomic(file, data) {
	const dir = path.dirname(path.resolve(file))
	const tmp = path.join(dir, `.${path.basename(file)}.${process.pid}.${Date.now()}.tmp`)
	try {
		fs.mkdirSync(dir, { recursive: true })
		fs.writeFileSync(tmp, data)
		fs.renameSync(tmp, file)
	} catch (e) {
		throw inputError(`cannot write ${file}: ${e.code || e.message}`)
	} finally {
		fs.rmSync(tmp, { force: true })
	}
}
