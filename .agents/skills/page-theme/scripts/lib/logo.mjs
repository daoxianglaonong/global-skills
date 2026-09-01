/**
 * 识别色探针的栅格侧（T-60 的采集输入）。站点 logo 常是位图，CSS 上读不到任何颜色；
 * 本模块对 logo 元素切一张小图，用 sharp 数出主色，作为**弱旁证候选**交 agent。
 * 判定与最终取值仍属第 02 章；脚本给的候选强制 `confidence: low`（E-65 语义类不得给最高档）。
 */
import sharp from 'sharp'

const NEAR_WHITE = 246
const NEAR_BLACK = 16
const MIN_SHARE = 0.02

/** 在页面里找 logo 元素：优先 class / id 含 logo 的可见元素，其次页壳左上角的第一张图。 */
export function findLogoInPage() {
	function visible(el) {
		const cs = getComputedStyle(el)
		if (cs.display === 'none' || cs.visibility === 'hidden' || Number(cs.opacity) < 0.05) return null
		const r = el.getBoundingClientRect()
		if (r.width < 16 || r.height < 8 || r.width > 600) return null
		return r
	}
	// 调用方保证已回顶（fixed 页壳的文档坐标会随 scrollY 漂走，只能在 scrollY=0 时按视口坐标判）
	for (const el of document.querySelectorAll('[class*="logo" i], [id*="logo" i], [aria-label*="logo" i]')) {
		const r = visible(el)
		if (!r) continue
		if (r.top > window.innerHeight) continue
		el.setAttribute('data-pt-logo', '1')
		return { selector: '[data-pt-logo="1"]', tag: el.tagName.toLowerCase(), width: Math.round(r.width), height: Math.round(r.height) }
	}
	// 语义标签缺失的站（div 化页壳）按**位置**退化：文档顶部 200px 内、视口左 40% 的第一张图形。
	// 图形不限 <img>：站点常把 logo 画成 background-image 或内联 SVG，两者都要收。
	const positional = []
	for (const el of document.querySelectorAll('img, svg, picture, i, span, div, a')) {
		const r = visible(el)
		if (!r) continue
		if (r.left > window.innerWidth * 0.4 || r.top > 200) continue
		const tag = el.tagName.toLowerCase()
		const graphic =
			tag === 'img' || tag === 'svg' || tag === 'picture' || getComputedStyle(el).backgroundImage !== 'none'
		if (!graphic) continue
		if (el.querySelector('img, svg, picture')) continue // 只取最内层图形盒，别把整条导航切进来
		positional.push({ el, r })
	}
	positional.sort((a, b) => a.r.top - b.r.top || a.r.left - b.r.left)
	if (positional.length) {
		const { el, r } = positional[0]
		el.setAttribute('data-pt-logo', '1')
		return { selector: '[data-pt-logo="1"]', tag: el.tagName.toLowerCase(), width: Math.round(r.width), height: Math.round(r.height) }
	}
	return null
}

/** 数出切片里占比最高的「既非近白也非近黑」的不透明色；数不出则返回 null，不猜。 */
async function dominantColor(buffer) {
	const { data, info } = await sharp(buffer)
		.resize({ width: 64, height: 64, fit: 'inside', withoutEnlargement: true })
		.ensureAlpha()
		.raw()
		.toBuffer({ resolveWithObject: true })
	const counts = new Map()
	let opaque = 0
	for (let i = 0; i < data.length; i += info.channels) {
		const a = data[i + 3]
		if (a < 200) continue
		opaque++
		const r = data[i]
		const g = data[i + 1]
		const b = data[i + 2]
		if (r > NEAR_WHITE && g > NEAR_WHITE && b > NEAR_WHITE) continue
		if (r < NEAR_BLACK && g < NEAR_BLACK && b < NEAR_BLACK) continue
		// 量化到 16 级，避免抗锯齿把同一色摊成上百条
		const key = `${r >> 4}|${g >> 4}|${b >> 4}`
		const rec = counts.get(key) || { r: 0, g: 0, b: 0, n: 0 }
		rec.r += r
		rec.g += g
		rec.b += b
		rec.n++
		counts.set(key, rec)
	}
	const top = [...counts.values()].sort((a, b) => b.n - a.n)[0]
	if (!top || !opaque || top.n / opaque < MIN_SHARE) return null
	const hex = (n) => Math.round(n).toString(16).padStart(2, '0')
	return {
		hex: `#${hex(top.r / top.n)}${hex(top.g / top.n)}${hex(top.b / top.n)}`,
		share: Number((top.n / opaque).toFixed(4))
	}
}

/**
 * @returns {{hex:string|null, share:number|null, selector:string|null, tag:string|null, skippedReason:string|null}}
 *          探不到不得假装测到：返回 `skippedReason`，由 agent 读图补（D3 / T-47）。
 */
export async function probeLogoColor(page) {
	await page
		.evaluate(() => {
			window.scrollTo(0, 0)
			return new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))
		})
		.catch(() => {})
	const found = await page.evaluate(findLogoInPage).catch((err) => ({ error: String(err.message || err) }))
	if (!found || found.error) {
		return { hex: null, share: null, selector: null, tag: null, skippedReason: found && found.error ? `probe-error:${found.error}` : 'no-logo-element' }
	}
	try {
		const buf = await page.locator(found.selector).first().screenshot({ animations: 'disabled', timeout: 8000 })
		const color = await dominantColor(buf)
		if (!color) {
			return { hex: null, share: null, selector: found.selector, tag: found.tag, skippedReason: 'no-dominant-color' }
		}
		return { ...color, selector: found.selector, tag: found.tag, skippedReason: null }
	} catch (err) {
		return { hex: null, share: null, selector: found.selector, tag: found.tag, skippedReason: `screenshot-failed:${String(err.message || err).slice(0, 120)}` }
	}
}
