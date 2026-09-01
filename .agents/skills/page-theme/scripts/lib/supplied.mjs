/**
 * 供给受理（E-51–E-57、E-93、E-94）。v1 只收两种形态：
 * ① DTCG tokens.json（含 Tokens Studio 的 DTCG 模式，剥 set / $themes 信封）；
 * ④ CSS 自定义属性表（含 Tailwind v4 `@theme`）。
 * 不受理格式必须显式回话并跳过（O-34 / E-54），不得静默忽略；采集侧不得用供给覆盖实测（E-57）。
 */
import fs from 'node:fs/promises'
import path from 'node:path'
import { parseCssColor, toHex, deltaE00 } from './color.mjs'
import { sha256, exists } from './fsutil.mjs'

const REJECTED = [
	{ test: /tailwind\.config\.(js|cjs|mjs|ts)$/i, why: 'Tailwind v3 tailwind.config.js' },
	{ test: /\.(scss|sass|less|styl)$/i, why: 'Sass / Less / Stylus' },
	{ test: /\.(pdf|png|jpe?g|webp|ai|sketch|fig)$/i, why: 'PDF / 图片 / 设计稿品牌手册' },
	{ test: /\.(ts|tsx|js|cjs|mjs)$/i, why: '脚本 / 配置文件' },
	{ test: /storybook|\/docs?\//i, why: 'Storybook / 文档站' }
]

function isDtcg(json) {
	if (!json || typeof json !== 'object') return false
	const stack = [json]
	let depth = 0
	while (stack.length && depth < 4000) {
		const node = stack.pop()
		depth++
		if (node && typeof node === 'object') {
			if ('$value' in node) return true
			for (const v of Object.values(node)) if (v && typeof v === 'object') stack.push(v)
		}
	}
	return false
}

/** E-53：Tokens Studio 只收 DTCG 模式，必须剥掉 set / `$themes` 信封。 */
function stripTokensStudioEnvelope(json) {
	if (!json || typeof json !== 'object') return { doc: json, stripped: false }
	if (!('$themes' in json) && !('$metadata' in json)) return { doc: json, stripped: false }
	const merged = {}
	for (const [key, value] of Object.entries(json)) {
		if (key.startsWith('$')) continue
		if (value && typeof value === 'object') Object.assign(merged, value)
	}
	return { doc: merged, stripped: true }
}

function flattenDtcg(node, prefix, out, warnings) {
	for (const [key, value] of Object.entries(node || {})) {
		if (key.startsWith('$')) continue
		if (!value || typeof value !== 'object') continue
		const p = prefix ? `${prefix}.${key}` : key
		if ('$value' in value) {
			const raw = value.$value
			if (typeof raw === 'string' && /^\{.+\}$/.test(raw)) warnings.push({ code: 'unresolved', path: p, value: raw })
			out.push({ path: p, type: value.$type || null, value: raw })
		} else {
			flattenDtcg(value, p, out, warnings)
		}
	}
}

/**
 * E-52 形态 ④ 反向解析：吃混杂大文件（token + 组件 CSS + reset），
 * 按 (选择器特异性, 源序) 折叠取后声明，断链记 `unresolved`，不得编造值。
 */
export function parseCssVarTable(cssText) {
	const decls = []
	const blockRe = /([^{}]+)\{([^{}]*)\}/g
	let order = 0
	for (let m = blockRe.exec(cssText); m; m = blockRe.exec(cssText)) {
		const selector = m[1].trim().split('\n').pop().trim()
		if (/^@(media|supports|layer|container)/i.test(selector)) continue
		const specificity = selector === ':root' || selector === 'html' || /^@theme/i.test(selector) ? 1 : selector.includes('#') ? 3 : 2
		for (const d of m[2].split(';')) {
			const idx = d.indexOf(':')
			if (idx < 0) continue
			const name = d.slice(0, idx).trim()
			if (!name.startsWith('--')) continue
			decls.push({ name, value: d.slice(idx + 1).trim(), selector, specificity, order: order++ })
		}
	}
	const folded = new Map()
	for (const d of decls) {
		const prev = folded.get(d.name)
		if (!prev || d.specificity > prev.specificity || (d.specificity === prev.specificity && d.order > prev.order)) {
			folded.set(d.name, d)
		}
	}
	const warnings = []
	const entries = []
	for (const d of folded.values()) {
		const ref = d.value.match(/var\(\s*(--[A-Za-z0-9_-]+)/)
		if (ref && !folded.has(ref[1])) warnings.push({ code: 'unresolved', path: d.name, value: d.value })
		if (decls.filter((x) => x.name === d.name).length > 1) warnings.push({ code: 'redeclared', path: d.name })
		entries.push({ path: d.name, type: null, value: d.value, selector: d.selector })
	}
	return { entries, warnings }
}

async function readSource(spec, inputDir) {
	if (/^https?:\/\//i.test(spec)) {
		// 必须带浏览器 UA：无 UA 的请求会被 WAF 拦成异常码（试点实测华为云对无 UA 请求回 567）
		const res = await fetch(spec, {
			headers: {
				'user-agent':
					'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36',
				accept: 'text/css,application/json,text/plain,*/*'
			}
		})
		if (!res.ok) throw new Error(`HTTP ${res.status}`)
		const text = await res.text()
		const name = path.basename(new URL(spec).pathname) || 'supplied'
		// URL 抓取后落 input/design-system/（O-32）
		const dest = path.join(inputDir, name)
		await fs.mkdir(inputDir, { recursive: true })
		await fs.writeFile(dest, text, 'utf8')
		return { text, url: spec, filePath: dest, name }
	}
	const text = await fs.readFile(spec, 'utf8')
	return { text, url: null, filePath: spec, name: path.basename(spec) }
}

/**
 * @param {string[]} supplied CLI 的 --supplied（路径或 URL）
 * @param {string} inputDir page-theme/<style-set-id>/input/design-system/
 * @returns {{snapshot:object|null, rejects:{name:string,why:string}[]}}
 */
export async function acceptSupplied(supplied, inputDir) {
	const specs = [...supplied]
	// O-32：目录存在即自动收编
	if (await exists(inputDir)) {
		for (const name of await fs.readdir(inputDir)) {
			const p = path.join(inputDir, name)
			if (!specs.includes(p)) specs.push(p)
		}
	}
	if (!specs.length) return { snapshot: null, rejects: [] }

	const files = []
	const entries = []
	const warnings = []
	const rejects = []
	let kind = null

	for (const spec of specs) {
		let src
		try {
			src = await readSource(spec, inputDir)
		} catch (err) {
			rejects.push({ name: spec, why: `读取失败：${String(err.message || err)}` })
			continue
		}
		const hardReject = REJECTED.find((r) => r.test.test(src.name) || r.test.test(spec))
		if (hardReject) {
			rejects.push({ name: spec, why: hardReject.why })
			continue
		}
		const fileRec = {
			path: src.filePath,
			url: src.url,
			fetchedAt: new Date().toISOString(),
			bytes: src.text.length,
			versionHint: `sha256:${sha256(src.text)}`
		}

		if (/\.json$/i.test(src.name)) {
			let json
			try {
				json = JSON.parse(src.text)
			} catch {
				rejects.push({ name: spec, why: 'JSON 解析失败' })
				continue
			}
			const { doc, stripped } = stripTokensStudioEnvelope(json)
			if (!isDtcg(doc)) {
				rejects.push({ name: spec, why: '非 DTCG（Figma variables REST / Tokens Studio legacy 等不受理）' })
				continue
			}
			if (stripped) warnings.push({ code: 'mixed-file', path: src.name, note: '已剥 Tokens Studio set / $themes 信封' })
			const local = []
			flattenDtcg(doc, '', local, warnings)
			entries.push(...local.map((e) => ({ ...e, from: src.name })))
			kind = kind === 'css-vars' ? 'mixed' : 'dtcg'
			files.push(fileRec)
			continue
		}
		if (/\.css$/i.test(src.name) || /@theme|--[A-Za-z0-9_-]+\s*:/.test(src.text)) {
			const parsed = parseCssVarTable(src.text)
			if (!parsed.entries.length) {
				rejects.push({ name: spec, why: '未发现 CSS 自定义属性表' })
				continue
			}
			entries.push(...parsed.entries.map((e) => ({ ...e, from: src.name })))
			warnings.push(...parsed.warnings.map((w) => ({ ...w, from: src.name })))
			kind = kind === 'dtcg' ? 'mixed' : 'css-vars'
			files.push(fileRec)
			continue
		}
		rejects.push({ name: spec, why: '既不是 DTCG tokens.json，也不是 CSS 自定义属性表' })
	}

	if (!files.length) return { snapshot: null, rejects }
	return {
		snapshot: { schemaVersion: 1, kind: kind || 'css-vars', files, entries, warnings },
		rejects
	}
}

/** E-94 `supply-match.json`：三档判据的唯一定义权在 T-90，脚本只落对照行、ΔE00 只记录。 */
export function buildSupplyMatch(snapshot, measuredColors, measuredLengths) {
	if (!snapshot) return null
	const measured = measuredColors
		.map((c) => ({ hex: c.hex.toLowerCase(), paintedRatio: c.paintedRatio, property: c.property }))
		.filter((c) => c.hex)
	const pairs = []
	for (const entry of snapshot.entries) {
		const raw = typeof entry.value === 'string' ? entry.value.trim() : null
		if (!raw) continue
		const color = parseCssColor(raw)
		if (color) {
			const hex = toHex(color).toLowerCase()
			let best = null
			for (const m of measured) {
				const d = deltaE00(color, parseCssColor(m.hex))
				if (d === null) continue
				if (!best || d < best.deltaE00) best = { ...m, deltaE00: d }
			}
			pairs.push({
				suppliedPath: entry.path,
				suppliedHex: hex,
				measuredHex: best ? best.hex : null,
				match: !best ? 'different' : best.hex === hex ? 'exact' : best.deltaE00 <= 10 ? 'near' : 'different',
				deltaE00: best ? best.deltaE00 : null,
				measuredPaintedRatio: best ? best.paintedRatio : null
			})
			continue
		}
		const px = raw.match(/^(-?[\d.]+)px$/)
		if (px) {
			const value = Number(px[1])
			const hit = measuredLengths.find((m) => Math.abs(m.px - value) < 0.51)
			pairs.push({
				suppliedPath: entry.path,
				suppliedPx: value,
				measuredPx: hit ? hit.px : null,
				match: hit ? (hit.px === value ? 'exact' : 'near') : 'different',
				deltaE00: null
			})
		}
	}
	return { schemaVersion: 1, pairs }
}

/** O-34 / E-54 显式回话文本。 */
export function rejectionNotices(rejects, styleSetId) {
	return rejects.map(
		(r) =>
			`供给「${r.name}」格式不受理（${r.why}），已跳过。v1 只收 DTCG tokens.json 与 CSS 自定义属性表。\n` +
			`请转换后放入 page-theme/${styleSetId}/input/design-system/ 或再次传入 --supplied。本次分析继续。`
	)
}
