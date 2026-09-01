/**
 * 分源 stylesheet 采集与频率表。E-03（移植行走）· E-04（Wallace 原表 + 归一表）·
 * E-46 / E-47（CORS 从网络层补齐，判定不写死域名）· E-85（origins 形状与 overflow）·
 * M-12 / M-13（跨页去重键与分裂）。
 */
import path from 'node:path'
import { getDomain } from 'tldts'
import { analyze } from '@projectwallace/css-analyzer'
import { walkStyleSheetsInPage } from '../css-walk.mjs'
import { parseCssColor, toHex, srgbToOklch } from './color.mjs'
import { sha256, writeText } from './fsutil.mjs'

const OVERFLOW_BYTES = 200 * 1024 // E-85 本项目自定
const TLDTS_OPTS = { allowPrivateDomains: true }

/** 导航期间监听 stylesheet 响应体，供 E-46 在 cssRules 不可读时补齐。 */
export function attachStylesheetSniffer(page) {
	const bodies = new Map()
	page.on('response', (res) => {
		const req = res.request()
		const type = res.headers()['content-type'] || ''
		if (req.resourceType() !== 'stylesheet' && !/text\/css/i.test(type)) return
		res
			.text()
			.then((text) => {
				if (text) bodies.set(res.url(), text)
			})
			.catch(() => {})
	})
	return bodies
}

function hostOf(href, base) {
	try {
		return new URL(href, base).hostname.toLowerCase()
	} catch {
		return ''
	}
}

/**
 * E-85 第一方集合：`location.hostname` + eTLD+1 + 本站 CSS CDN
 * （CDN 的认法：对 first-party `link` 的 host 计频，出现最多的非第一方 host 视为本站 CSS CDN）。
 */
function firstPartySet(pageUrl, origins) {
	const pageHost = hostOf(pageUrl, pageUrl)
	const etld1 = getDomain(pageHost, TLDTS_OPTS) || pageHost
	const set = new Set([pageHost, etld1])
	const counts = new Map()
	for (const o of origins) {
		if (o.type !== 'link') continue
		const h = hostOf(o.href, pageUrl)
		if (!h || h === pageHost || h.endsWith(`.${etld1}`)) continue
		counts.set(h, (counts.get(h) || 0) + o.bytes)
	}
	const top = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]
	if (top && top[1] > 0) set.add(top[0])
	return { set, etld1, pageHost, cdnHost: top ? top[0] : null }
}

function isFirstParty(href, pageUrl, fp) {
	const h = hostOf(href, pageUrl)
	if (!h) return true // 页面自身的 inline / adopted
	if (fp.set.has(h)) return true
	return h.endsWith(`.${fp.etld1}`)
}

/**
 * 走 CSS、补 CORS、判第一方、落 overflow。
 * @returns {{origins:object[], extras:object, recovered:object[], stillBlocked:object[], firstParty:object}}
 */
export async function collectCssOrigins(page, { sniffedBodies, overflowDir, pageId }) {
	const walked = await page.evaluate(walkStyleSheetsInPage)
	const pageUrl = page.url()
	const recovered = []
	const stillBlocked = []

	for (const href of walked.pendingFetch.slice(0, 60)) {
		const entry = walked.origins.find((o) => o.href === href && o.blocked)
		if (!entry) continue
		// 先用导航期间抓到的 response body（E-46 第一路径）
		const sniffed = sniffedBodies && sniffedBodies.get(href)
		if (sniffed) {
			entry.css = sniffed
			entry.bytes = sniffed.length
			entry.blocked = false
			entry.recovered = true
			recovered.push({ href, bytes: sniffed.length, via: 'response-body' })
			continue
		}
		try {
			const res = await page.request.get(href, { timeout: 10000 })
			const text = res.ok() ? await res.text() : ''
			if (text) {
				entry.css = text
				entry.bytes = text.length
				entry.blocked = false
				entry.recovered = true
				recovered.push({ href, bytes: text.length, via: 'page.request.get' })
			} else {
				stillBlocked.push({ href, reason: `HTTP ${res.status()}` })
			}
		} catch (err) {
			stillBlocked.push({ href, reason: String(err.message || err) })
		}
	}

	const fp = firstPartySet(pageUrl, walked.origins)
	for (const o of walked.origins) o.firstParty = isFirstParty(o.href, pageUrl, fp)

	return { origins: walked.origins, extras: walked.extras, recovered, stillBlocked, firstParty: fp, overflowDir, pageId }
}

/**
 * E-85：超 200KB 的表改存 `raw/{page-id}/css-origins/{hash}.css`，条目只留 `path`（overflow 不入库）。
 * **必须在频率并集与 alias 网扫描之后调用**——先清空 `css` 会让最大的两张第一方表整个退出统计。
 */
export async function spillOverflow({ origins, overflowDir, pageId }) {
	for (const o of origins) {
		if (o.bytes <= OVERFLOW_BYTES || !o.css) continue
		const hash = sha256(o.css).slice(0, 16)
		await writeText(path.join(overflowDir, `${hash}.css`), o.css)
		o.path = `raw/${pageId}/css-origins/${hash}.css`
		o.sha256 = `sha256:${sha256(o.css)}`
		o.css = ''
	}
	return origins
}

/** M-12 去重键：有 href 用绝对 URL（去 fragment、保 query），无 href 用文本 SHA-256。 */
export function dedupeKey(origin, pageUrl) {
	if (origin.href && origin.type !== 'inline' && origin.href !== pageUrl) {
		try {
			const u = new URL(origin.href, pageUrl)
			u.hash = ''
			return `url:${u.href}`
		} catch {
			/* 落到 inline 分支 */
		}
	}
	return `inline:${sha256(origin.css || origin.sha256 || '')}`
}

/** 第一方 CSS 并集文本（去重后），供 analyze 与 E-08 聚类使用。 */
export function firstPartyCssUnion(origins, pageUrl) {
	const byKey = new Map()
	for (const o of origins) {
		if (!o.firstParty || o.blocked) continue
		const text = o.css || ''
		if (!text) continue
		const key = dedupeKey(o, pageUrl)
		if (!byKey.has(key)) byKey.set(key, text)
	}
	return { text: [...byKey.values()].join('\n'), keys: [...byKey.keys()] }
}

/** E-04：Wallace 原表。缺 CSS 时返回空壳而不是崩，`analyze` 失败按 blocked 记。 */
export function analyzeCss(cssText) {
	if (!cssText) return { ok: false, reason: 'empty-first-party-css' }
	try {
		return { ok: true, result: analyze(cssText) }
	} catch (err) {
		return { ok: false, reason: String(err.message || err) }
	}
}

function uniqueEntries(node) {
	if (!node || !node.unique) return []
	return Object.entries(node.unique).map(([value, count]) => ({ value, count }))
}

/** E-04 归一表：同色不同写法必须合成一条；不得把 unique 原始字符串当色身份。 */
export function normalizeFrequency(analyzed) {
	if (!analyzed || !analyzed.ok) return { colors: [], fontFamilies: [], fontSizes: [], lineHeights: [], borderRadiuses: [] }
	const v = analyzed.result.values || {}

	const colors = new Map()
	for (const { value, count } of uniqueEntries(v.colors)) {
		const parsed = parseCssColor(value)
		if (!parsed) continue
		const hex = toHex(parsed)
		const alpha = Number(Number(parsed.a ?? 1).toFixed(4))
		const key = `${hex}|${alpha}`
		const rec = colors.get(key) || { hex, alpha, oklch: srgbToOklch(parsed), declCount: 0, rawForms: [] }
		rec.declCount += count
		if (!rec.rawForms.includes(value)) rec.rawForms.push(value)
		colors.set(key, rec)
	}
	const byContext = {}
	const ctx = v.colors && v.colors.itemsPerContext
	if (ctx) {
		for (const [prop, node] of Object.entries(ctx)) {
			byContext[prop] = uniqueEntries(node)
				.map(({ value, count }) => {
					const parsed = parseCssColor(value)
					return parsed ? { hex: toHex(parsed), declCount: count } : null
				})
				.filter(Boolean)
		}
	}

	const norm = (node, mapper) =>
		[...uniqueEntries(node).reduce((m, { value, count }) => {
			const key = mapper(value)
			if (key === null) return m
			const rec = m.get(key) || { value: key, declCount: 0, rawForms: [] }
			rec.declCount += count
			if (!rec.rawForms.includes(value)) rec.rawForms.push(value)
			m.set(key, rec)
			return m
		}, new Map()).values()].sort((a, b) => b.declCount - a.declCount)

	return {
		colors: [...colors.values()].sort((a, b) => b.declCount - a.declCount),
		colorsByProperty: byContext,
		fontFamilies: norm(v.fontFamilies, (s) => s.replace(/\s+/g, ' ').trim().toLowerCase()),
		fontSizes: norm(v.fontSizes, (s) => s.trim().toLowerCase()),
		lineHeights: norm(v.lineHeights, (s) => s.trim().toLowerCase()),
		borderRadiuses: norm(v.borderRadiuses, (s) => s.trim().toLowerCase())
	}
}

/** E-08 第 1 步的输入：`atrules.media.unique`（带次数）。 */
export function mediaUnique(analyzed) {
	if (!analyzed || !analyzed.ok) return []
	return uniqueEntries(analyzed.result.atrules && analyzed.result.atrules.media)
}

/** E-87 的 features 侧：含 print 在内的 media 特性清单，只记不采样。 */
export function mediaFeatures(analyzed) {
	if (!analyzed || !analyzed.ok) return []
	const f = analyzed.result.atrules && analyzed.result.atrules.media && analyzed.result.atrules.media.features
	return uniqueEntries(f)
}
