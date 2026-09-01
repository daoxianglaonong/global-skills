/**
 * 浏览器上下文里执行的视觉侧采集函数。每个导出函数必须自足（page.evaluate 会序列化函数体），
 * 不得引用模块作用域。颜色只出 CSS 字符串，hex / oklch 换算在 Node 侧（lib/color.mjs）。
 */

/** E-103：第三方 widget 根打 `data-pt-widget`，必须在面积统计与截图之前写入源 DOM。 */
export function markThirdPartyWidgetsInPage(opts) {
	const firstParty = (opts && opts.firstPartyEtld1) || ''
	const excludeSelectors = (opts && opts.excludeSelectors) || []
	const overlaySelectors = (opts && opts.overlaySelectors) || []
	const marked = []

	function hostOf(src) {
		try {
			return new URL(src, location.href).hostname.toLowerCase()
		} catch {
			return ''
		}
	}
	function isThirdPartyHost(host) {
		if (!host || !firstParty) return false
		return host !== firstParty && !host.endsWith(`.${firstParty}`)
	}
	function mark(el, kind) {
		if (!el || el.hasAttribute('data-pt-widget')) return
		el.setAttribute('data-pt-widget', 'third-party')
		if (kind) el.setAttribute('data-pt-widget-kind', kind)
		marked.push({
			tag: el.tagName.toLowerCase(),
			kind: kind || 'other',
			id: el.id || '',
			className: String(el.className || '').slice(0, 80)
		})
	}
	function kindOf(host) {
		// 功能类闭集，按 URL 路径线索保守推断；认不出一律 other，不得按厂商名单匹配
		if (/\/(maps?|tiles?)\b/.test(host)) return 'map'
		return 'other'
	}

	// 1. 跨源 iframe
	for (const frame of document.querySelectorAll('iframe[src]')) {
		const host = hostOf(frame.getAttribute('src'))
		if (isThirdPartyHost(host)) mark(frame, kindOf(host))
	}
	// 2. 自定义元素且定义它的 script host 非第一方
	const thirdPartyScriptHosts = new Set()
	for (const s of document.querySelectorAll('script[src]')) {
		const host = hostOf(s.getAttribute('src'))
		if (isThirdPartyHost(host)) thirdPartyScriptHosts.add(host)
	}
	if (thirdPartyScriptHosts.size) {
		for (const el of document.querySelectorAll('*')) {
			if (!el.localName || !el.localName.includes('-')) continue
			if (!customElements || !customElements.get(el.localName)) continue
			mark(el, 'other')
		}
	}
	// 3. 命中已生效的 noise 选择器且盒子由已标节点构成
	for (const sel of [...excludeSelectors, ...overlaySelectors]) {
		let nodes = []
		try {
			nodes = [...document.querySelectorAll(sel)]
		} catch {
			nodes = []
		}
		for (const el of nodes) {
			if (el.querySelector('[data-pt-widget="third-party"]')) mark(el, 'other')
		}
	}
	// 4. fixed / sticky 且唯一实质子树是已标节点 → 上标到浮层根
	for (const el of document.body ? document.body.querySelectorAll('*') : []) {
		const cs = getComputedStyle(el)
		if (cs.position !== 'fixed' && cs.position !== 'sticky') continue
		const kids = [...el.children].filter((c) => c.getBoundingClientRect().height > 4)
		if (kids.length === 1 && kids[0].hasAttribute('data-pt-widget')) mark(el, kids[0].getAttribute('data-pt-widget-kind') || 'other')
	}
	return marked
}

/**
 * E-05 / E-86：自写 computed 遍历，按 CSS 像素累计 paintedPx。属性分表（T-114 / E-102）。
 * N1/N2/N3/N4 打掉的条目进 noise（T-127 五字段的采集侧部分）。
 */
export function collectPaintedAreaInPage(opts) {
	const cfg = Object.assign(
		{ slot: 'pc', maxNodes: 15000, excludeSelectors: [], noiseActive: false, maxSamples: 5 },
		opts || {}
	)
	const excludeSel = cfg.excludeSelectors.filter(Boolean).join(',')

	function selectorOf(el) {
		const parts = []
		let n = el
		for (let i = 0; i < 4 && n && n.nodeType === 1 && n !== document.documentElement; i++) {
			let s = n.tagName.toLowerCase()
			if (n.id) {
				parts.unshift(`${s}#${n.id.slice(0, 48)}`)
				break
			}
			const cls = String(n.getAttribute('class') || '')
				.split(/\s+/)
				.filter((c) => c && c.length < 40)
				.slice(0, 2)
				.join('.')
			if (cls) s += `.${cls}`
			parts.unshift(s)
			n = n.parentElement
		}
		return parts.join(' > ')
	}
	function ownText(el) {
		let t = ''
		for (const n of el.childNodes) if (n.nodeType === 3) t += n.textContent
		return t.replace(/\s+/g, ' ').trim()
	}
	/** 透明不得当颜色：`rgba(0,0,0,0)` 若计入面积会把整站判成黑底（同 E-29 条 1 的理由） */
	function opaque(css) {
		if (!css || css === 'transparent' || css === 'none') return false
		const m = String(css).match(/rgba?\([^)]*?[,/]\s*([\d.]+%?)\s*\)$/)
		if (!m) return true
		const a = m[1].endsWith('%') ? Number(m[1].slice(0, -1)) / 100 : Number(m[1])
		return Number.isFinite(a) ? a >= 0.08 : true
	}
	const docW = Math.max(document.documentElement.scrollWidth, window.innerWidth)
	const docH = Math.max(
		document.body ? document.body.scrollHeight : 0,
		document.documentElement.scrollHeight,
		window.innerHeight
	)
	const docArea = Math.max(1, docW * docH)
	function clipped(rect) {
		const left = rect.left + window.scrollX
		const top = rect.top + window.scrollY
		const w = Math.max(0, Math.min(docW, left + rect.width) - Math.max(0, left))
		const h = Math.max(0, Math.min(docH, top + rect.height) - Math.max(0, top))
		return { w, h, area: w * h }
	}

	const colors = new Map()
	const noise = []
	const bgImages = []
	const counters = {
		fonts: new Map(),
		fontSizes: new Map(),
		fontWeights: new Map(),
		lineHeights: new Map(),
		letterSpacings: new Map(),
		padding: new Map(),
		margin: new Map(),
		gap: new Map(),
		radii: new Map(),
		shadows: new Map(),
		borders: new Map()
	}
	const roleEvidence = { ctaFills: new Map(), logoColors: new Map(), linkColors: new Map(), headingColors: new Map() }
	const skipped = { hidden: 0, tiny: 0, excluded: 0, widget: 0, iframe: 0 }

	function bump(map, key, area, extra) {
		let rec = map.get(key)
		if (!rec) {
			rec = { key, paintedPx: 0, count: 0, samples: [], ...(extra || {}) }
			map.set(key, rec)
		}
		rec.paintedPx += area
		rec.count += 1
		return rec
	}
	function addColor(property, css, area, context, el) {
		if (!opaque(css)) return
		const key = `${property}|${css}`
		const rec = bump(colors, key, area, {
			property,
			css,
			paintedByContext: { chrome: 0, content: 0, overlay: 0 }
		})
		rec.paintedByContext[context] += area
		if (rec.samples.length < cfg.maxSamples) {
			rec.samples.push({ selector: selectorOf(el), text: ownText(el).slice(0, 40), tag: el.tagName.toLowerCase() })
		}
	}
	function addNoise(property, css, area, rule, el) {
		if (noise.length > 400 || !opaque(css)) return
		noise.push({ css, property, paintedPx: Math.round(area), rule, selector: selectorOf(el) })
	}

	// 上下文预标：fixed / sticky → overlay
	for (const el of document.body ? document.body.querySelectorAll('*') : []) {
		const pos = getComputedStyle(el).position
		if (pos === 'fixed' || pos === 'sticky') el.setAttribute('data-pt-overlay', '1')
	}

	let scanned = 0
	const nodes = document.body ? document.body.querySelectorAll('*') : []
	for (const el of nodes) {
		if (++scanned > cfg.maxNodes) break
		const tag = el.tagName
		if (tag === 'SCRIPT' || tag === 'STYLE' || tag === 'NOSCRIPT' || tag === 'TEMPLATE' || tag === 'LINK' || tag === 'META') continue

		const cs = getComputedStyle(el)
		if (cs.display === 'none' || cs.visibility === 'hidden' || Number(cs.opacity) < 0.05) {
			skipped.hidden++
			continue
		}
		const box = clipped(el.getBoundingClientRect())
		if (box.area < 4) {
			skipped.tiny++
			continue
		}

		let excludedRule = null
		if (tag === 'IFRAME') excludedRule = 'N1'
		else if (el.closest('[data-pt-widget="third-party"]')) excludedRule = cfg.noiseActive ? 'N3' : null
		if (!excludedRule && excludeSel) {
			let hit = null
			try {
				hit = el.closest(excludeSel)
			} catch {
				hit = null
			}
			if (hit) excludedRule = 'N4'
		}

		const context = el.closest('[data-pt-overlay]')
			? 'overlay'
			: el.closest('header, nav, footer, [role=banner], [role=contentinfo], [role=navigation]')
				? 'chrome'
				: 'content'

		const isButtonish =
			tag === 'BUTTON' ||
			el.getAttribute('role') === 'button' ||
			/\b(btn|button|cta)\b/i.test(String(el.getAttribute('class') || '')) ||
			(tag === 'INPUT' && /^(submit|button)$/i.test(el.getAttribute('type') || ''))
		const isLogoish = /\blogo\b/i.test(`${el.getAttribute('class') || ''} ${el.id || ''}`)
		const isLandmark = el.hasAttribute('data-pt-floor')
		const isCardish =
			!isButtonish &&
			parseFloat(cs.borderTopLeftRadius) > 0 &&
			(cs.boxShadow !== 'none' || parseFloat(cs.borderTopWidth) > 0) &&
			box.area > 5000

		// 背景色：有背景图时该图上屏、纯色不计（背景图单列，供 rhythm.surface=image）
		const hasBgImage = cs.backgroundImage && cs.backgroundImage !== 'none'
		if (hasBgImage) {
			if (bgImages.length < 60) {
				bgImages.push({
					selector: selectorOf(el),
					backgroundImage: cs.backgroundImage.slice(0, 200),
					paintedPx: Math.round(box.area),
					context
				})
			}
		} else if (excludedRule) {
			skipped[excludedRule === 'N1' ? 'iframe' : excludedRule === 'N3' ? 'widget' : 'excluded']++
			addNoise('background-color', cs.backgroundColor, box.area, excludedRule, el)
		} else {
			addColor('background-color', cs.backgroundColor, box.area, context, el)
			if (isButtonish && opaque(cs.backgroundColor)) {
				const rec = bump(roleEvidence.ctaFills, cs.backgroundColor, box.area, { css: cs.backgroundColor })
				if (rec.samples.length < 3) rec.samples.push({ selector: selectorOf(el), text: ownText(el).slice(0, 32) })
			}
		}

		// 文本色：按自有文本近似面积
		const text = ownText(el)
		if (text) {
			const fs = parseFloat(cs.fontSize) || 16
			const textArea = Math.min(box.area, text.length * fs * 0.55 * (parseFloat(cs.lineHeight) || fs * 1.4) / fs)
			if (excludedRule) addNoise('color', cs.color, textArea, excludedRule, el)
			else {
				addColor('color', cs.color, textArea, context, el)
				bump(counters.fonts, cs.fontFamily, textArea)
				bump(counters.fontSizes, cs.fontSize, textArea)
				bump(counters.fontWeights, cs.fontWeight, textArea)
				bump(counters.lineHeights, cs.lineHeight, textArea)
				bump(counters.letterSpacings, cs.letterSpacing, textArea)
				if (tag === 'A' && !isButtonish) bump(roleEvidence.linkColors, cs.color, textArea, { css: cs.color })
				if (/^H[1-6]$/.test(tag)) bump(roleEvidence.headingColors, cs.color, textArea, { css: cs.color })
				if (isLogoish) bump(roleEvidence.logoColors, cs.color, textArea, { css: cs.color })
			}
		}
		if (isLogoish && (tag === 'SVG' || el.querySelector('svg'))) {
			const fill = cs.fill && cs.fill !== 'none' ? cs.fill : null
			if (fill) bump(roleEvidence.logoColors, fill, box.area, { css: fill })
		}

		// 边框 / 描边：与填充类分表（T-114 / E-102），已上屏不得因面积小丢弃
		if (!excludedRule) {
			for (const side of ['Top', 'Right', 'Bottom', 'Left']) {
				const w = parseFloat(cs[`border${side}Width`])
				if (!w || cs[`border${side}Style`] === 'none') continue
				const len = side === 'Top' || side === 'Bottom' ? box.w : box.h
				addColor('border-color', cs[`border${side}Color`], w * len, context, el)
			}
			const ow = parseFloat(cs.outlineWidth)
			if (ow > 0 && cs.outlineStyle !== 'none') {
				addColor('outline-color', cs.outlineColor, ow * 2 * (box.w + box.h), context, el)
			}
			if (tag === 'SVG' || el.ownerSVGElement) {
				if (cs.fill && cs.fill !== 'none') addColor('fill', cs.fill, box.area, context, el)
			}
		}

		// 间距 / 圆角：paintedRatio 只在楼层根 + 卡片 + 按钮上累计（E-86）
		const spaceScope = isLandmark || isCardish || isButtonish
		for (const side of ['Top', 'Right', 'Bottom', 'Left']) {
			const p = Math.round(parseFloat(cs[`padding${side}`]) * 100) / 100
			if (p > 0) bump(counters.padding, String(p), spaceScope ? box.area : 0, { scope: spaceScope ? 'floor-card-button' : 'global' })
			const m = Math.round(parseFloat(cs[`margin${side}`]) * 100) / 100
			if (m > 0) bump(counters.margin, String(m), spaceScope ? box.area : 0, { scope: spaceScope ? 'floor-card-button' : 'global' })
		}
		for (const key of ['columnGap', 'rowGap']) {
			const g = Math.round(parseFloat(cs[key]) * 100) / 100
			if (g > 0) bump(counters.gap, String(g), spaceScope ? box.area : 0, { axis: key })
		}
		if (parseFloat(cs.borderTopLeftRadius) > 0) {
			bump(counters.radii, cs.borderRadius, spaceScope ? box.area : 0, { scope: spaceScope ? 'floor-card-button' : 'global' })
		}
		if (cs.boxShadow && cs.boxShadow !== 'none') bump(counters.shadows, cs.boxShadow, box.area)
		if (parseFloat(cs.borderTopWidth) > 0 && cs.borderTopStyle !== 'none') {
			bump(counters.borders, `${cs.borderTopWidth} ${cs.borderTopStyle} ${cs.borderTopColor}`, box.area)
		}
	}

	function dump(map, limit) {
		return [...map.values()]
			.sort((a, b) => b.paintedPx - a.paintedPx || b.count - a.count)
			.slice(0, limit)
			.map((r) => ({ ...r, paintedPx: Math.round(r.paintedPx) }))
	}

	return {
		slot: cfg.slot,
		docSize: { width: docW, height: docH },
		docArea,
		scanned,
		skipped,
		colors: dump(colors, 400),
		backgroundImages: bgImages,
		fonts: dump(counters.fonts, 30),
		fontSizes: dump(counters.fontSizes, 60),
		fontWeights: dump(counters.fontWeights, 30),
		lineHeights: dump(counters.lineHeights, 40),
		letterSpacings: dump(counters.letterSpacings, 20),
		space: {
			padding: dump(counters.padding, 60),
			margin: dump(counters.margin, 60),
			gap: dump(counters.gap, 40)
		},
		radii: dump(counters.radii, 30),
		shadows: dump(counters.shadows, 40),
		borders: dump(counters.borders, 40),
		roleEvidence: {
			ctaFills: dump(roleEvidence.ctaFills, 20),
			logoColors: dump(roleEvidence.logoColors, 12),
			linkColors: dump(roleEvidence.linkColors, 12),
			headingColors: dump(roleEvidence.headingColors, 12)
		},
		noise
	}
}

/**
 * E-35–E-42 楼层切分与几何测量。只给边界与几何候选，禁止写 taxonomy（E-66）。
 * 同时给每个 landmark 写 `data-pt-floor`，供当帧切图（E-41）。
 */
export function collectLandmarksInPage(opts) {
	const cfg = Object.assign(
		{ slot: 'pc', minWidthRatio: 0.8, minHeightPx: 120, wrapperSelectors: [], splitHints: [], colorScheme: 'light' },
		opts || {}
	)
	const vw = window.innerWidth
	const vh = window.innerHeight

	function shown(el) {
		if (!el || el.nodeType !== 1) return false
		const cs = getComputedStyle(el)
		if (cs.display === 'none' || cs.visibility === 'hidden' || Number(cs.opacity) < 0.05) return false
		const r = el.getBoundingClientRect()
		return r.width > 0 && r.height > 0
	}
	function selectorOf(el) {
		if (el.id) return `${el.tagName.toLowerCase()}#${CSS.escape(el.id)}`
		const parts = []
		let n = el
		for (let i = 0; i < 5 && n && n.nodeType === 1 && n !== document.documentElement; i++) {
			let s = n.tagName.toLowerCase()
			if (n.id) {
				parts.unshift(`${s}#${CSS.escape(n.id)}`)
				break
			}
			const parent = n.parentElement
			if (parent) {
				const same = [...parent.children].filter((c) => c.tagName === n.tagName)
				if (same.length > 1) s += `:nth-of-type(${same.indexOf(n) + 1})`
			}
			parts.unshift(s)
			n = parent
		}
		return parts.join(' > ')
	}
	function docBox(el) {
		const r = el.getBoundingClientRect()
		return {
			x: Math.round(r.x + window.scrollX),
			y: Math.round(r.y + window.scrollY),
			width: Math.round(r.width),
			height: Math.round(r.height)
		}
	}
	function isBlockish(cs) {
		return !['inline', 'none', 'contents'].includes(cs.display)
	}

	const candidates = []
	const seen = new Set()
	function consider(el, roleHint) {
		if (!el || seen.has(el)) return
		if (!shown(el)) return
		const cs = getComputedStyle(el)
		if (cs.display === 'contents') return // E-36：不生成盒，必须跳过
		seen.add(el)
		candidates.push({ el, roleHint })
	}

	// 1. 语义地标
	for (const el of document.querySelectorAll(
		'header, [role=banner], nav, [role=navigation], footer, [role=contentinfo], aside, [role=complementary]'
	)) {
		if (!shown(el)) continue
		const r = el.getBoundingClientRect()
		const cs = getComputedStyle(el)
		const sticky = cs.position === 'fixed' || cs.position === 'sticky'
		// 4. 固定 / 粘性且高度 < 30vh 的顶 / 底条同样归 chrome；超高的浮层归 overlay
		consider(el, sticky && r.height >= vh * 0.3 ? 'overlay' : 'chrome')
	}
	// 2. main 下的块级区域
	const main = document.querySelector('main, [role=main]')
	const pool = main
		? [...main.querySelectorAll(':scope > section, :scope > article, :scope > div'), ...document.querySelectorAll('[role=region]')]
		: []
	// 3. 无 main（Almanac 2025：约 47% 页面才有）时改扫 body 可见块级子元素
	const bodyKids = [...(document.body ? document.body.children : [])].filter((el) => shown(el) && isBlockish(getComputedStyle(el)))

	// div 化的页壳（非语义标签）按**结构**认，不按类名，不引入任何站点选择器（E-68 / E-36）：
	// body 层首子元素高度 < 30vh 且含 ≥3 链接 → 顶栏；末子元素高度 < 1 视口且含 ≥3 链接 → 页脚。
	// 高度上限不同：顶栏天生矮，页脚常有多列链接区（两数**本项目自定**）。必须先于 section 池，
	// 否则页脚会先被尺寸门当成 section 收走。
	for (const probe of [
		{ el: bodyKids[0], maxH: vh * 0.3 },
		{ el: bodyKids[bodyKids.length - 1], maxH: vh }
	]) {
		const el = probe.el
		if (!el || seen.has(el)) continue
		const r = el.getBoundingClientRect()
		if (r.height >= probe.maxH || r.height < 24) continue
		if (el.querySelectorAll('a[href]').length < 3) continue
		consider(el, 'chrome')
	}

	const fallbackPool = main ? [] : bodyKids
	for (const el of [...pool, ...fallbackPool]) {
		if (!shown(el)) continue
		const cs = getComputedStyle(el)
		if (!isBlockish(cs)) continue
		const r = el.getBoundingClientRect()
		if (r.width < vw * cfg.minWidthRatio || r.height < cfg.minHeightPx) continue
		const sticky = cs.position === 'fixed' || cs.position === 'sticky'
		consider(el, sticky && r.height < vh * 0.3 ? 'overlay' : 'section')
	}
	// E-36 几何 unwrap：全宽、贡献绝大部分高度的独子 + 自身透明无边框 → 下降一层
	const wrapperSel = cfg.wrapperSelectors.filter(Boolean).join(',')
	function unwrap(el) {
		let cur = el
		let did = false
		for (let i = 0; i < 4; i++) {
			const cs = getComputedStyle(cur)
			const transparent = /rgba\(0,\s*0,\s*0,\s*0\)|transparent/.test(cs.backgroundColor) && cs.backgroundImage === 'none'
			const noBorder = ['Top', 'Right', 'Bottom', 'Left'].every(
				(s) => !parseFloat(cs[`border${s}Width`]) || cs[`border${s}Style`] === 'none'
			)
			const forced = wrapperSel && (() => {
				try {
					return cur.matches(wrapperSel)
				} catch {
					return false
				}
			})()
			const kids = [...cur.children].filter(shown)
			if (!kids.length) break
			const r = cur.getBoundingClientRect()
			const dominant = kids.find((k) => {
				const kr = k.getBoundingClientRect()
				return kr.width >= r.width * 0.98 && kr.height >= r.height * 0.9
			})
			if (dominant && (forced || (transparent && noBorder))) {
				cur = dominant
				did = true
				continue
			}
			break
		}
		return { el: cur, unwrapped: did }
	}

	/**
	 * 无 main 的站上，body 子元素往往是整段内容壳；只 unwrap 一次会把整页压成一层楼。
	 * 对「高度 ≥ 2.5 视口且有 ≥2 个实质全宽子块」的候选递归下降，直到不再满足（**本项目自定**）。
	 */
	function expand(el, depth, out) {
		const r = el.getBoundingClientRect()
		const tall = r.height >= vh * 2.5
		const kids = tall
			? [...el.children].filter((k) => {
					if (!shown(k)) return false
					const cs = getComputedStyle(k)
					if (!isBlockish(cs)) return false
					const kr = k.getBoundingClientRect()
					return kr.width >= r.width * 0.6 && kr.height >= cfg.minHeightPx
				})
			: []
		if (depth < 5 && kids.length >= 2) {
			for (const k of kids) expand(unwrap(k).el, depth + 1, out)
			return out
		}
		out.push(el)
		return out
	}

	const splitSel = cfg.splitHints.filter(Boolean).join(',')
	const resolved = []
	for (const c of candidates) {
		const u = unwrap(c.el)
		const leaves = c.roleHint === 'section' ? expand(u.el, 0, []) : [u.el]
		for (const leaf of leaves) {
			if (resolved.some((r) => r.el === leaf)) continue
			resolved.push({ el: leaf, roleHint: c.roleHint, unwrapped: u.unwrapped || leaf !== c.el })
		}
	}
	// 去嵌套：保留最外层，丢被包含者
	const flat = resolved.filter((a) => !resolved.some((b) => b !== a && b.el.contains(a.el)))
	flat.sort((a, b) => docBox(a.el).y - docBox(b.el).y)

	for (const el of document.querySelectorAll('[data-pt-floor]')) el.removeAttribute('data-pt-floor')

	const items = flat.slice(0, 60).map((entry, idx) => {
		const el = entry.el
		const id = `sec-${String(idx).padStart(2, '0')}`
		el.setAttribute('data-pt-floor', id)
		const cs = getComputedStyle(el)
		const bbox = docBox(el)

		// E-37 粘层：多个实质子节点、中间无视觉分隔 → maybeMerged
		const kids = [...el.children].filter(shown)
		const substantial = kids.filter((k) => {
			const r = k.getBoundingClientRect()
			return r.height > vh * 0.4 && r.width >= bbox.width * 0.8
		})
		let maybeMerged = substantial.length >= 2 && bbox.height > vh * 1.8
		if (splitSel) {
			try {
				if (el.matches(splitSel)) maybeMerged = true
			} catch {
				/* 选择器无效则忽略 */
			}
		}

		// E-38 / E-39：栅格容器 = 楼层内最先出现的 grid/flex 且 ≥2 可见子项
		let container = el
		let gridCs = cs
		const queue = [el]
		for (let i = 0; i < queue.length && i < 200; i++) {
			const node = queue[i]
			const ncs = getComputedStyle(node)
			const nkids = [...node.children].filter(shown)
			if (/grid|flex/.test(ncs.display) && nkids.length >= 2) {
				container = node
				gridCs = ncs
				break
			}
			for (const k of nkids) queue.push(k)
		}
		const gridKids = [...container.children].filter(shown)
		const contentWidthPx = Math.round(
			container.clientWidth - parseFloat(gridCs.paddingLeft || 0) - parseFloat(gridCs.paddingRight || 0)
		)
		const maxW = parseFloat(gridCs.maxWidth)
		const tracks = String(gridCs.gridTemplateColumns || 'none')
		let columnsCssom = null
		if (tracks !== 'none' && !/subgrid|masonry/.test(tracks)) {
			const parts = tracks.trim().split(/\s+(?![^(]*\))/).filter((t) => t && t !== '0px')
			if (parts.length) columnsCssom = parts.length
		}
		const rows = new Map()
		for (const k of gridKids) {
			const r = k.getBoundingClientRect()
			if (r.width < 24 || r.height < 16) continue
			const band = Math.round((r.y + window.scrollY) / 24)
			rows.set(band, (rows.get(band) || 0) + 1)
		}
		const columnsBbox = rows.size ? Math.max(...rows.values()) : null
		const conflict = columnsCssom !== null && columnsBbox !== null && columnsCssom !== columnsBbox

		const columnGapPx = Math.round(parseFloat(gridCs.columnGap) || 0)
		let gutter = null
		let distribution = null
		if (/space-between/.test(gridCs.justifyContent)) distribution = 'space-between'
		if (columnGapPx > 0) gutter = { px: columnGapPx, source: 'column-gap' }
		else if (distribution !== 'space-between') {
			// E-40：columnGap 为 0 才从相邻 bbox 中位缝推断
			const sameRow = gridKids
				.map((k) => k.getBoundingClientRect())
				.filter((r) => r.width > 24)
				.sort((a, b) => a.x - b.x)
			const gaps = []
			for (let i = 1; i < sameRow.length; i++) {
				if (Math.abs(sameRow[i].y - sameRow[i - 1].y) > 8) continue
				const g = sameRow[i].x - (sameRow[i - 1].x + sameRow[i - 1].width)
				if (g > 0) gaps.push(Math.round(g))
			}
			if (gaps.length) {
				gaps.sort((a, b) => a - b)
				gutter = { px: gaps[Math.floor(gaps.length / 2)], source: 'bbox-inferred' }
			}
		}

		// E-65：几何类两测一致才可 high
		const twoWayOk = columnsCssom !== null && columnsBbox !== null && !conflict
		const gridConfidence = twoWayOk ? 'high' : 'medium'

		let heading = ''
		for (const h of el.querySelectorAll('h1, h2, h3, h4, [role=heading]')) {
			if (!shown(h)) continue
			const t = (h.innerText || '').replace(/\s+/g, ' ').trim()
			if (t) {
				heading = t.slice(0, 120)
				break
			}
		}
		const fullText = (el.innerText || '').replace(/\s+/g, ' ').trim()

		return {
			id,
			tag: el.tagName.toLowerCase(),
			roleHint: entry.roleHint,
			selector: selectorOf(el),
			unwrapped: entry.unwrapped,
			maybeMerged,
			widget: el.hasAttribute('data-pt-widget') || !!el.querySelector('[data-pt-widget]'),
			bboxDoc: bbox,
			heading,
			textExcerpt: fullText.slice(0, 240),
			textChars: fullText.length,
			computed: {
				backgroundColor: cs.backgroundColor,
				backgroundImage: cs.backgroundImage === 'none' ? null : cs.backgroundImage.slice(0, 200),
				color: cs.color,
				paddingTop: Math.round(parseFloat(cs.paddingTop) || 0),
				paddingBottom: Math.round(parseFloat(cs.paddingBottom) || 0),
				paddingLeft: Math.round(parseFloat(cs.paddingLeft) || 0),
				paddingRight: Math.round(parseFloat(cs.paddingRight) || 0),
				position: cs.position
			},
			grid: {
				contentWidthPx: Number.isFinite(contentWidthPx) ? contentWidthPx : null,
				containerMaxWidthPx: Number.isFinite(maxW) ? Math.round(maxW) : null,
				gridTemplateColumns: tracks === 'none' ? null : tracks,
				columnGapPx,
				columnsCssom,
				columnsBbox,
				conflict,
				gutter,
				distribution,
				items: gridKids.slice(0, 24).map((k) => {
					const r = k.getBoundingClientRect()
					return {
						x: Math.round(r.x + window.scrollX),
						y: Math.round(r.y + window.scrollY),
						width: Math.round(r.width),
						height: Math.round(r.height)
					}
				}),
				confidence: gridConfidence
			},
			padBlockPx: Math.round((parseFloat(cs.paddingTop) || 0) + (parseFloat(cs.paddingBottom) || 0))
		}
	})

	return {
		slot: cfg.slot,
		colorScheme: cfg.colorScheme,
		documentSize: {
			width: Math.max(document.documentElement.scrollWidth, vw),
			height: Math.max(document.body ? document.body.scrollHeight : 0, document.documentElement.scrollHeight)
		},
		items
	}
}

/** E-88 前半：`custom-properties.json` 的亮色侧（documentElement 上全部 `--*`）。 */
export function collectCustomPropertiesInPage() {
	const cs = getComputedStyle(document.documentElement)
	const out = []
	for (let i = 0; i < cs.length; i++) {
		const name = cs.item(i)
		if (!name.startsWith('--')) continue
		out.push({ name, value: cs.getPropertyValue(name).trim() })
	}
	return {
		rootFontSizePx: parseFloat(cs.fontSize) || 16,
		colorScheme: cs.colorScheme || '',
		properties: out.sort((a, b) => (a.name < b.name ? -1 : 1))
	}
}

/** E-90 `fonts.json`：@font-face + stylesheets + computed 栈 + document.fonts。 */
export function collectFontsInPage() {
	const faces = []
	for (const sheet of document.styleSheets) {
		let rules = null
		try {
			rules = sheet.cssRules
		} catch {
			continue
		}
		for (const rule of rules) {
			if (rule.constructor && rule.constructor.name === 'CSSFontFaceRule') {
				faces.push({
					family: rule.style.getPropertyValue('font-family').trim(),
					weight: rule.style.getPropertyValue('font-weight').trim(),
					style: rule.style.getPropertyValue('font-style').trim(),
					display: rule.style.getPropertyValue('font-display').trim(),
					unicodeRange: rule.style.getPropertyValue('unicode-range').trim(),
					src: rule.style.getPropertyValue('src').slice(0, 400),
					stylesheet: sheet.href || document.location.href
				})
			}
		}
	}
	const stacks = new Map()
	const probes = document.querySelectorAll('h1, h2, h3, p, body, button, a, li, code, pre, input')
	for (const el of probes) {
		const cs = getComputedStyle(el)
		const key = `${el.tagName.toLowerCase()}|${cs.fontFamily}`
		if (!stacks.has(key)) {
			stacks.set(key, {
				scope: el.tagName.toLowerCase(),
				fontFamily: cs.fontFamily,
				fontWeight: cs.fontWeight,
				fontSize: cs.fontSize,
				lineHeight: cs.lineHeight,
				count: 0
			})
		}
		stacks.get(key).count++
	}
	const documentFonts = []
	try {
		for (const f of document.fonts) {
			documentFonts.push({ family: f.family, weight: f.weight, style: f.style, status: f.status })
			if (documentFonts.length >= 60) break
		}
	} catch {
		/* document.fonts 不可枚举 */
	}
	return {
		fontFace: faces,
		stylesheets: [...new Set(faces.map((f) => f.stylesheet))],
		computedStacks: [...stacks.values()],
		documentFonts
	}
}
