// Browser evidence: screenshots at fixed widths plus objective facts (custom properties, @media,
// computed colours / fonts / sizes, short copy). No layout inference, no role guessing.
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL, fileURLToPath } from 'node:url'
import { colorHex, colorKey } from './color.mjs'
import { collectCss, declarations, mediaRanges, cleanCss } from './css-scan.mjs'
import { guardOutputs, protectedPaths, writeAtomic } from './write.mjs'

export const DEFAULT_WIDTHS = [1440, 768, 375]
export const DEFAULT_TIMEOUT_MS = 30000
const SETTLE_MS = 800
const TOP_N = 40

/** Playwright's chromium, resolved from scripts/node_modules. */
export async function loadChromium() {
	return (await import('playwright')).chromium
}

/** Accept bare domains, markdown links, quoted / angle-bracketed URLs and local paths. */
export function normalizeTarget(input) {
	let s = String(input).trim()
	const md = s.match(/^\[[^\]]*\]\(([^)\s]+)[^)]*\)$/)
	if (md) s = md[1]
	s = s.replace(/^["'<`]+|["'>`]+$/g, '').trim()
	if (s && fs.existsSync(s)) return { input, url: pathToFileURL(path.resolve(s)).href }
	if (!/^[a-z][a-z0-9+.-]*:/i.test(s)) {
		if (!/^[\w-]+(\.[\w-]+)+(:\d+)?([/?#]|$)/.test(s)) return { input, error: 'not a URL or existing file' }
		s = `https://${s}`
	}
	let url
	try {
		url = new URL(s)
	} catch {
		return { input, error: 'unparseable URL' }
	}
	if (!['http:', 'https:', 'file:'].includes(url.protocol)) return { input, error: `unsupported scheme ${url.protocol}` }
	return { input, url: url.href }
}

function slug(url, i) {
	const u = new URL(url)
	const base = u.protocol === 'file:' ? path.basename(u.pathname).replace(/\.\w+$/, '') : `${u.hostname}${u.pathname}`
	return `${String(i + 1).padStart(2, '0')}-${base.replace(/[^\w.-]+/g, '-').replace(/^-+|-+$/g, '') || 'page'}`
}

function top(map) {
	return [...map.entries()].sort((a, b) => b[1] - a[1]).slice(0, TOP_N).map(([k, count]) => ({ ...JSON.parse(k), count }))
}

async function settle(page) {
	await page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => {})
	await page.evaluate(async () => {
		const step = window.innerHeight
		for (let y = 0; y < document.documentElement.scrollHeight; y += step) {
			window.scrollTo(0, y)
			await new Promise((r) => setTimeout(r, 120))
		}
		window.scrollTo(0, 0)
	})
	await page.waitForTimeout(SETTLE_MS)
}

function inPageFacts() {
	const out = { styles: [], samples: [], copy: [] }
	for (const el of document.querySelectorAll('style')) out.styles.push(el.textContent || '')
	const els = [...document.querySelectorAll('body *')].slice(0, 4000)
	const rgba = (s) => (s.match(/[\d.]+/g) || []).map(Number)
	const lum = ([r, g, b]) => [r, g, b].map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4 })
		.reduce((acc, v, i) => acc + v * [0.2126, 0.7152, 0.0722][i], 0)
	// Nearest opaque-ish solid background; null when an image / gradient is in the way (not judged).
	const backdrop = (el) => {
		for (let n = el; n; n = n.parentElement) {
			const cs = getComputedStyle(n)
			if (cs.backgroundImage !== 'none') return null
			const c = rgba(cs.backgroundColor)
			if (c.length >= 3 && (c[3] ?? 1) >= 0.99) return c
		}
		return [255, 255, 255]
	}
	out.lowContrast = []
	for (const el of els) {
		const r = el.getBoundingClientRect()
		if (!r.width || !r.height) continue
		const cs = getComputedStyle(el)
		if (cs.visibility === 'hidden' || cs.display === 'none') continue
		const hasText = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim())
		const bg = hasText ? backdrop(el) : null
		if (bg && out.lowContrast.length < 20) {
			const [l1, l2] = [lum(rgba(cs.color)), lum(bg)].sort((a, b) => b - a)
			const ratio = (l1 + 0.05) / (l2 + 0.05)
			const size = parseFloat(cs.fontSize)
			const large = size >= 24 || (size >= 18.66 && Number(cs.fontWeight) >= 700)
			if (ratio < (large ? 3 : 4.5)) out.lowContrast.push({ text: el.textContent.trim().slice(0, 40), color: cs.color, background: `rgb(${bg.slice(0, 3).join(', ')})`, ratio: Number(ratio.toFixed(2)) })
		}
		out.samples.push({
			hasText,
			color: cs.color,
			background: cs.backgroundColor,
			border: parseFloat(cs.borderTopWidth) > 0 ? cs.borderTopColor : null,
			fontFamily: cs.fontFamily,
			fontSize: cs.fontSize,
			fontWeight: cs.fontWeight,
			lineHeight: cs.lineHeight,
			radius: cs.borderTopLeftRadius
		})
	}
	const seen = new Set()
	for (const el of document.querySelectorAll('h1, h2, h3, button, [role=button], a[class*=btn], a[class*=button]')) {
		const t = (el.innerText || '').replace(/\s+/g, ' ').trim()
		if (t && t.length <= 120 && !seen.has(t)) {
			seen.add(t)
			out.copy.push(t)
		}
		if (out.copy.length >= 60) break
	}
	return out
}

/** Fold in-page facts and stylesheet texts into the evidence record. `viewport` is { width, height } or null. */
export function summarize(facts, sheets, viewport) {
	const css = [...sheets, ...facts.styles]
	const customProperties = {}
	const media = new Map()
	for (const text of css) {
		for (const d of declarations({ css: text, line: 1 })) if (d.prop.startsWith('--') && !(d.prop in customProperties)) customProperties[d.prop] = d.value
		for (const r of mediaRanges(cleanCss(text))) media.set(r.query, (media.get(r.query) || 0) + 1)
	}
	const tally = () => new Map()
	const colors = tally()
	const fonts = tally()
	const scalars = tally()
	const bump = (m, obj) => m.set(JSON.stringify(obj), (m.get(JSON.stringify(obj)) || 0) + 1)
	for (const s of facts.samples) {
		const add = (value, usage) => {
			const key = colorKey(value)
			if (key && !key.endsWith('00')) bump(colors, { value: colorHex(key), usage })
		}
		if (s.hasText) add(s.color, 'text')
		add(s.background, 'background')
		if (s.border) add(s.border, 'border')
		if (s.hasText) {
			bump(fonts, { value: s.fontFamily })
			bump(scalars, { property: 'font-size', value: s.fontSize })
			bump(scalars, { property: 'font-weight', value: s.fontWeight })
			bump(scalars, { property: 'line-height', value: s.lineHeight })
		}
		if (s.radius !== '0px') bump(scalars, { property: 'border-radius', value: s.radius })
	}
	return {
		customProperties,
		mediaQueries: [...media.entries()].sort((a, b) => b[1] - a[1]).map(([query, count]) => ({ query, count })),
		colors: top(colors),
		fonts: top(fonts),
		scalars: top(scalars),
		fontSizeCount: new Set(facts.samples.filter((s) => s.hasText).map((s) => s.fontSize)).size,
		lowContrast: facts.lowContrast || [],
		copy: facts.copy,
		viewport
	}
}

/**
 * Capture targets (URLs or local files). Writes `<out>/<slug>/<width>.<jpg|png>` and `<out>/evidence.json`.
 * A failing target is recorded and skipped; the run fails only when every target fails.
 */
export async function capture(inputs, options = {}) {
	const out = path.resolve(options.out || '.page-theme-work/capture')
	const widths = options.widths || DEFAULT_WIDTHS
	const ext = options.format === 'png' ? 'png' : 'jpg'
	const timeout = options.timeout || DEFAULT_TIMEOUT_MS
	const planned = [out, path.join(out, 'evidence.json')]
	const localInputs = []
	inputs.forEach((input, i) => {
		const t = normalizeTarget(input)
		if (t.error) return
		if (t.url.startsWith('file:')) localInputs.push(fileURLToPath(t.url))
		for (const w of widths) planned.push(path.join(out, slug(t.url, i)), path.join(out, slug(t.url, i), `${w}.${ext}`))
	})
	guardOutputs(planned, { protect: protectedPaths(localInputs) })
	const chromium = await loadChromium()
	const browser = await chromium.launch()
	const targets = []
	try {
		for (const [i, input] of inputs.entries()) {
			const t = normalizeTarget(input)
			if (t.error) {
				targets.push({ ...t, ok: false })
				continue
			}
			const context = await browser.newContext({ viewport: { width: widths[0], height: 900 }, deviceScaleFactor: 1 })
			const page = await context.newPage()
			const sheets = []
			const pendingSheets = []
			page.on('response', (res) => {
				if (res.request().resourceType() === 'stylesheet' && res.ok()) pendingSheets.push(res.text().catch(() => ''))
			})
			if (t.url.startsWith('file:')) {
				sheets.push(...collectCss([fileURLToPath(t.url)]).filter((c) => /\.css$/i.test(c.file)).map((c) => c.css))
			}
			const record = { input, url: t.url, ok: false, screenshots: [], failures: [] }
			try {
				const res = await page.goto(t.url, { waitUntil: 'load', timeout })
				if (res && res.status() >= 400) record.failures.push({ code: 'http-status', status: res.status() })
				await settle(page)
				record.finalUrl = page.url()
				record.title = await page.title()
				const textLength = await page.evaluate(() => (document.body?.innerText || '').trim().length)
				if (textLength < 40) record.failures.push({ code: 'little-text', textLength })
				sheets.push(...(await Promise.all(pendingSheets)))
				Object.assign(record, summarize(await page.evaluate(inPageFacts), sheets, page.viewportSize()))
				const aliased = Object.keys(record.customProperties).filter((k) => record.customProperties[k].includes('var('))
				record.resolvedProperties = await page.evaluate((names) => {
					const rules = []
					const walk = (list) => { for (const r of list) { if (r.style) rules.push(r); if (r.cssRules) walk(r.cssRules) } }
					for (const s of document.styleSheets) try { walk(s.cssRules) } catch {}
					const at = (el, n) => (el ? getComputedStyle(el).getPropertyValue(n).trim() : '')
					const resolve = (n) => {
						const own = at(document.documentElement, n)
						if (own) return own
						const rule = rules.find((r) => r.selectorText && r.style.getPropertyValue(n))
						let el = null
						try { el = rule && document.querySelector(rule.selectorText) } catch {}
						return at(el, n) || at(document.body, n)
					}
					return Object.fromEntries(names.map((n) => [n, resolve(n)]).filter(([, v]) => v))
				}, aliased)
				record.overflow = []
				const dir = slug(t.url, i)
				for (const w of widths) {
					await page.setViewportSize({ width: w, height: 900 })
					await page.waitForTimeout(300)
					const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth)
					if (scrollWidth > w + 1) record.overflow.push({ width: w, scrollWidth })
					const rel = `${dir}/${w}.${ext}`
					const shot = { type: ext === 'png' ? 'png' : 'jpeg', timeout, ...(ext === 'jpg' ? { quality: 80 } : {}) }
					let image
					try {
						image = await page.screenshot({ ...shot, fullPage: options.fullPage !== false })
					} catch (e) {
						if (options.fullPage === false) throw e
						record.failures.push({ code: 'fullpage-fallback', width: w, message: String(e.message || e).split('\n')[0] })
						image = await page.screenshot(shot)
					}
					writeAtomic(path.join(out, rel), image)
					record.screenshots.push(rel)
				}
				record.ok = true
			} catch (e) {
				record.failures.push({ code: 'navigation', message: String(e.message || e).split('\n')[0] })
			}
			targets.push(record)
			await context.close()
		}
	} finally {
		await browser.close()
	}
	const result = { out, capturedAt: new Date().toISOString(), widths, targets }
	writeAtomic(path.join(out, 'evidence.json'), JSON.stringify(result, null, 2))
	return result
}

/** Read pixel colours from an image at given points (spec swatch cross-check). */
export async function sampleImage(file, points) {
	const chromium = await loadChromium()
	const mime = /\.png$/i.test(file) ? 'image/png' : /\.webp$/i.test(file) ? 'image/webp' : 'image/jpeg'
	const dataUrl = `data:${mime};base64,${fs.readFileSync(file).toString('base64')}`
	const browser = await chromium.launch()
	try {
		const page = await browser.newPage()
		return await page.evaluate(async ({ dataUrl, points }) => {
			const img = new Image()
			img.src = dataUrl
			await img.decode()
			const canvas = document.createElement('canvas')
			canvas.width = img.naturalWidth
			canvas.height = img.naturalHeight
			const ctx = canvas.getContext('2d')
			ctx.drawImage(img, 0, 0)
			const hex = (n) => n.toString(16).padStart(2, '0')
			return points.map(({ x, y }) => {
				const [r, g, b] = ctx.getImageData(x, y, 1, 1).data
				return { x, y, hex: `#${hex(r)}${hex(g)}${hex(b)}` }
			})
		}, { dataUrl, points })
	} finally {
		await browser.close()
	}
}
