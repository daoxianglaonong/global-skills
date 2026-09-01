/**
 * 渲染稳定门与滚动预热。E-18（load + fonts.ready + 双 rAF + layout-quiet）、
 * E-19（禁 networkidle，连辅助门都不许）、E-20（预热是强制步骤）。
 */

export const FONTS_TIMEOUT_MS = 10000 // E-18 / E-34 本项目自定
const QUIET_WINDOW_MS = 300 // E-18 本项目自定
const QUIET_SAMPLE_MS = 100
const QUIET_BUDGET_MS = 9000
const QUIET_RATIO = 0.01 // 连续 300ms 位移面积 < 视口 1%
const LAZY_EXTRA_VIEWPORTS = 4 // E-20 本项目自定

export async function doubleRaf(page) {
	await page
		.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))))
		.catch(() => {})
}

async function layoutQuiet(page, viewport, budgetMs = QUIET_BUDGET_MS) {
	const t0 = Date.now()
	let last = null
	let quietFrom = Date.now()
	const area = Math.max(1, viewport.width * viewport.height)
	while (Date.now() - t0 < budgetMs) {
		const snap = await page
			.evaluate(() => ({
				scrollHeight: document.body ? document.body.scrollHeight : 0,
				nodes: [
					...document.querySelectorAll(
						'header, nav, main, footer, aside, section, article, [role=main], [role=banner], [role=contentinfo], body > div'
					)
				]
					.slice(0, 32)
					.map((n) => {
						const r = n.getBoundingClientRect()
						return { w: Math.round(r.width), h: Math.round(r.height), y: Math.round(r.y) }
					})
			}))
			.catch(() => null)
		if (!snap) break
		if (last) {
			let drift = 0
			const n = Math.min(last.nodes.length, snap.nodes.length)
			for (let i = 0; i < n; i++) {
				drift += Math.abs(last.nodes[i].w * last.nodes[i].h - snap.nodes[i].w * snap.nodes[i].h)
				drift += Math.abs(last.nodes[i].y - snap.nodes[i].y) * viewport.width
			}
			const stable = drift / area < QUIET_RATIO && last.scrollHeight === snap.scrollHeight
			if (stable) {
				if (Date.now() - quietFrom >= QUIET_WINDOW_MS) {
					return { ok: true, ms: Date.now() - t0, scrollHeight: snap.scrollHeight }
				}
			} else {
				quietFrom = Date.now()
			}
		} else {
			quietFrom = Date.now()
		}
		last = snap
		await new Promise((r) => setTimeout(r, QUIET_SAMPLE_MS))
	}
	return { ok: false, ms: Date.now() - t0, scrollHeight: last ? last.scrollHeight : 0 }
}

/**
 * E-18 全套稳定门。不得用 page.waitForTimeout 冒充，不得引入 networkidle。
 * @returns {{used:string[], fontsTimeout:boolean, quietOk:boolean, ms:number, scrollHeight:number}}
 */
export async function stableGate(page, viewport) {
	const t0 = Date.now()
	const used = ['load']
	await page.locator('body').first().waitFor({ state: 'attached', timeout: 15000 }).catch(() => {})

	let fontsTimeout = false
	try {
		await Promise.race([
			page.evaluate(() => document.fonts.ready.then(() => true)),
			new Promise((_, rej) => setTimeout(() => rej(new Error('fonts-timeout')), FONTS_TIMEOUT_MS))
		])
	} catch {
		fontsTimeout = true
	}
	used.push('fonts')

	await doubleRaf(page)
	used.push('double-raf')

	const quiet = await layoutQuiet(page, viewport)
	used.push('layout-quiet')

	return {
		used,
		fontsTimeout,
		quietOk: quiet.ok,
		ms: Date.now() - t0,
		scrollHeight: quiet.scrollHeight
	}
}

/**
 * E-20 滚动预热：改 lazy 为 eager → 0.9 视口高阶梯滚动 → 等视口内图 decode →
 * scrollHeight 增长最多再吃 4 个视口高 → 回顶再跑一次 layout-quiet。
 */
export async function warmupScroll(page, viewport) {
	const result = await page
		.evaluate(async (maxExtraViewports) => {
			for (const img of document.querySelectorAll('img[loading="lazy"]')) img.loading = 'eager'
			const vh = window.innerHeight || 900
			const budget = vh * maxExtraViewports
			let baseline = document.body ? document.body.scrollHeight : 0
			let extra = 0
			let truncated = false
			let steps = 0
			for (let y = 0; y < (document.body ? document.body.scrollHeight : 0); y += vh * 0.9) {
				window.scrollTo(0, y)
				steps++
				await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))
				const inView = [...document.images].filter((img) => {
					const r = img.getBoundingClientRect()
					return r.bottom > 0 && r.top < window.innerHeight && r.width > 0
				})
				const t0 = Date.now()
				while (Date.now() - t0 < 1500) {
					if (inView.every((img) => img.complete && img.naturalWidth > 0)) break
					await new Promise((r) => setTimeout(r, 50))
				}
				const h = document.body ? document.body.scrollHeight : 0
				if (h > baseline + 40) {
					extra += h - baseline
					baseline = h
					if (extra > budget) {
						truncated = true
						break
					}
				}
				if (steps > 400) {
					truncated = true
					break
				}
			}
			window.scrollTo(0, 0)
			return { lazyTruncated: truncated, steps, scrollHeight: document.body ? document.body.scrollHeight : 0 }
		}, LAZY_EXTRA_VIEWPORTS)
		.catch(() => ({ lazyTruncated: false, steps: 0, scrollHeight: 0 }))

	await doubleRaf(page)
	const quiet = await layoutQuiet(page, viewport, 3000)
	return { ...result, quietOk: quiet.ok }
}

/** E-41 当帧重标：交互之后 landmark 属性作废，切图前必须重写。 */
export async function retagLandmarks(page, selectors) {
	return page.evaluate((list) => {
		for (const el of document.querySelectorAll('[data-pt-floor]')) el.removeAttribute('data-pt-floor')
		const ok = []
		list.forEach(({ id, selector }) => {
			let el = null
			try {
				el = document.querySelector(selector)
			} catch {
				el = null
			}
			if (el) {
				el.setAttribute('data-pt-floor', id)
				ok.push(id)
			}
		})
		return ok
	}, selectors)
}
