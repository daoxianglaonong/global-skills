/**
 * 采样矩阵与断点口径（E-07–E-17）。本文件是全流程视口像素的唯一计算方。
 * 主路径是站点 media query 聚类 + 带内中点；聚不出才回退 390 / 800 / 1280。
 */

export const SLOTS = ['pc', 'tablet', 'mobile']

/** E-11 回退像素与窗口高（高度本项目自定，只约束窗口、不进资产字段） */
export const FALLBACK = {
	mobile: { px: 390, height: 844 },
	tablet: { px: 800, height: 1024 },
	pc: { px: 1280, height: 900 }
}

const MIN_WIDTH_PX = 320
const MAX_WIDTH_PX = 1920
const CLUSTER_RADIUS_PX = 8 // E-08 第 4 步
const WIDEST_BAND_OFFSET_PX = 160 // E-09 本项目自定
const IGNORED_FEATURE = /orientation|hover|pointer|prefers-|print|resolution|aspect-ratio|display-mode/i
const LENGTH_RE = /\(\s*(min|max)-width\s*:\s*(-?[\d.]+)(px|em|rem)\s*\)/gi

/**
 * E-08 第 1–3 步：从 media query 原文抽宽度。
 * @param {string[]} rawUnique analyze().atrules.media.unique 的键，或 @media 前奏原文
 * @param {number} rootFontSizePx 已观测的 :root font-size；未观测传 16
 */
export function extractWidths(rawUnique, rootFontSizePx = 16) {
	const hits = []
	const features = new Set()
	for (const entry of rawUnique) {
		const text = String(entry.value ?? entry.key ?? entry)
		const count = Number(entry.count ?? 1)
		if (/container|@container/i.test(text)) continue
		if (/\bprint\b/i.test(text)) features.add('print') // E-16：只记 features，不开采样档
		LENGTH_RE.lastIndex = 0
		for (let m = LENGTH_RE.exec(text); m; m = LENGTH_RE.exec(text)) {
			// 忽略 orientation / hover / prefers-* / print / container query（E-08 第 3 步）
			if (IGNORED_FEATURE.test(text.replace(m[0], ''))) continue
			const unit = m[3].toLowerCase()
			const px = unit === 'px' ? Number(m[2]) : Number(m[2]) * rootFontSizePx
			if (!Number.isFinite(px)) continue
			if (px < MIN_WIDTH_PX || px > MAX_WIDTH_PX) continue
			hits.push({ px: Math.round(px), kind: m[1].toLowerCase(), count, source: text })
		}
		for (const f of text.matchAll(/\(\s*([a-z-]+)\s*:/gi)) features.add(f[1].toLowerCase())
	}
	return { hits, features: [...features].sort() }
}

/** E-08 第 4 步：8px 半径聚类，合并的原值记 aliases。 */
export function clusterBuckets(hits) {
	const sorted = [...hits].sort((a, b) => a.px - b.px)
	const buckets = []
	for (const hit of sorted) {
		const last = buckets[buckets.length - 1]
		if (last && hit.px - last.px <= CLUSTER_RADIUS_PX) {
			last.aliases.push(hit.px)
			last.count += hit.count
			last.px = Math.round(last.aliases.reduce((s, v) => s + v, 0) / last.aliases.length)
		} else {
			buckets.push({ px: hit.px, aliases: [hit.px], count: hit.count })
		}
	}
	for (const b of buckets) b.aliases = [...new Set(b.aliases)].sort((x, y) => x - y)
	return buckets
}

/** E-09：相邻桶之间构成带，取中点；最宽（开口）一带取下沿 + 160。 */
export function bandsOf(buckets) {
	if (!buckets.length) return []
	const bands = []
	if (buckets[0].px > MIN_WIDTH_PX + 16) {
		bands.push({
			lower: MIN_WIDTH_PX,
			upper: buckets[0].px,
			sample: Math.round((MIN_WIDTH_PX + buckets[0].px) / 2),
			strength: buckets[0].count,
			open: false
		})
	}
	for (let i = 0; i < buckets.length - 1; i++) {
		bands.push({
			lower: buckets[i].px,
			upper: buckets[i + 1].px,
			sample: Math.round((buckets[i].px + buckets[i + 1].px) / 2),
			strength: buckets[i].count + buckets[i + 1].count,
			open: false
		})
	}
	const top = buckets[buckets.length - 1]
	bands.push({
		lower: top.px,
		upper: null,
		sample: Math.min(MAX_WIDTH_PX, top.px + WIDEST_BAND_OFFSET_PX),
		strength: top.count,
		open: true
	})
	return bands.filter((b) => b.sample >= MIN_WIDTH_PX && b.sample <= MAX_WIDTH_PX)
}

/**
 * E-10：带由窄到宽分三档，超过三带时每档按声明次数取最强带。
 * 带数 < 3 时的分配是**本项目自定**（E-10 未规定）：1 带无法判断属哪档 → 三档全回退；
 * 2 带 → 窄给 mobile、宽给 pc，tablet 回退。
 */
export function pickSamples(bands) {
	const sorted = [...bands].sort((a, b) => a.sample - b.sample)
	const picked = { mobile: null, tablet: null, pc: null }
	if (sorted.length >= 3) {
		const third = sorted.length / 3
		const groups = [
			sorted.slice(0, Math.max(1, Math.floor(third))),
			sorted.slice(Math.max(1, Math.floor(third)), Math.max(2, Math.floor(third * 2))),
			sorted.slice(Math.max(2, Math.floor(third * 2)))
		]
		const strongest = (g) => g.slice().sort((a, b) => b.strength - a.strength || b.sample - a.sample)[0] || null
		picked.mobile = strongest(groups[0])
		picked.tablet = strongest(groups[1])
		picked.pc = strongest(groups[2])
	} else if (sorted.length === 2) {
		picked.mobile = sorted[0]
		picked.pc = sorted[1]
	}
	return picked
}

/**
 * 完整口径：产出三档的 `viewport_px` + `viewportSource`（E-13）与窗口高。
 * @returns {{viewports:{slot:string,viewport_px:number,viewportSource:'clustered'|'fallback',height:number,band:object|null}[], buckets:object[], bands:object[], features:string[]}}
 */
export function resolveViewports(rawUnique, rootFontSizePx = 16) {
	const { hits, features } = extractWidths(rawUnique, rootFontSizePx)
	const buckets = clusterBuckets(hits)
	const bands = bandsOf(buckets)
	const picked = pickSamples(bands)
	const viewports = SLOTS.map((slot) => {
		const band = picked[slot]
		const clustered = band && band.sample >= MIN_WIDTH_PX
		return {
			slot,
			viewport_px: clustered ? band.sample : FALLBACK[slot].px,
			viewportSource: clustered ? 'clustered' : 'fallback',
			height: FALLBACK[slot].height,
			band: clustered ? { lower: band.lower, upper: band.upper, strength: band.strength } : null
		}
	})
	// pc 不得比 tablet 窄、tablet 不得比 mobile 窄：聚类退化时回退该档（保持字段位语义）
	const order = { mobile: 0, tablet: 1, pc: 2 }
	const byOrder = [...viewports].sort((a, b) => order[a.slot] - order[b.slot])
	for (let i = 1; i < byOrder.length; i++) {
		if (byOrder[i].viewport_px <= byOrder[i - 1].viewport_px) {
			byOrder[i].viewport_px = FALLBACK[byOrder[i].slot].px
			byOrder[i].viewportSource = 'fallback'
			byOrder[i].band = null
		}
	}
	return { viewports, buckets, bands, features }
}
