/**
 * 浏览器上下文里执行的语义侧采集函数：语料、同意条探测、暗色与默认主题、候选代表页、
 * 交互态代表元、动效差分。每个导出函数必须自足（page.evaluate 会序列化函数体）。
 * 脚本只出候选与原始事实，taxonomy / variant / 角色词表一律不写（E-01 / E-66）。
 */

/** E-77：同意条只探测不点击。启发式必须覆盖中日韩语义词，不得只写欧美 CMP。 */
export function probeConsentInPage() {
	const words = /cookie|consent|privacy|gdpr|同意|隐私|隱私|个人信息|個人情報|プライバシー|쿠키|개인정보/i
	const hits = []
	for (const el of document.body ? document.body.querySelectorAll('*') : []) {
		const cs = getComputedStyle(el)
		if (cs.position !== 'fixed' && cs.position !== 'sticky') continue
		const r = el.getBoundingClientRect()
		if (r.width < window.innerWidth * 0.4 || r.height < 40) continue
		const edge = r.top <= 8 || Math.abs(window.innerHeight - r.bottom) <= 8
		if (!edge) continue
		const text = (el.innerText || '').replace(/\s+/g, ' ').trim()
		const attrs = `${el.id || ''} ${el.getAttribute('class') || ''}`
		if (!words.test(text) && !words.test(attrs)) continue
		let selector = el.id ? `#${CSS.escape(el.id)}` : ''
		if (!selector) {
			const cls = String(el.getAttribute('class') || '').split(/\s+/).filter(Boolean)[0]
			selector = cls ? `${el.tagName.toLowerCase()}.${CSS.escape(cls)}` : el.tagName.toLowerCase()
		}
		hits.push({ selector, textPreview: text.slice(0, 120), bbox: { y: Math.round(r.y), height: Math.round(r.height) } })
		if (hits.length >= 6) break
	}
	// 同意条是否遮挡主 CTA（E-76）
	let ctaOccluded = false
	if (hits.length) {
		const cta = document.querySelector('main button, main a[class*=btn], button, a[class*=btn]')
		if (cta) {
			const cr = cta.getBoundingClientRect()
			ctaOccluded = hits.some((h) => cr.top < h.bbox.y + h.bbox.height && cr.bottom > h.bbox.y)
		}
	}
	return { hits, ctaOccluded }
}

/** E-100：默认主题深浅，与 E-28 的 darkMode 正交。相对判定，不用绝对 L 门槛。 */
export function probeDefaultSchemeInPage() {
	function parse(css) {
		const m = String(css).match(/rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:[,\s/]+([\d.]+))?/)
		if (!m) return null
		const a = m[4] === undefined ? 1 : Number(m[4])
		return { r: Number(m[1]), g: Number(m[2]), b: Number(m[3]), a }
	}
	function lum(c) {
		const f = (v) => {
			const x = v / 255
			return x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4
		}
		return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b)
	}
	// 候选表面只许：documentElement、body、以及宽 ≥ 视口 50% 的不透明填充（非 chrome / overlay / widget）
	const candidates = []
	for (const el of [document.documentElement, document.body]) {
		if (!el) continue
		const c = parse(getComputedStyle(el).backgroundColor)
		if (c && c.a >= 0.08) candidates.push({ css: getComputedStyle(el).backgroundColor, color: c, area: window.innerWidth * window.innerHeight, who: el.tagName.toLowerCase() })
	}
	let scanned = 0
	for (const el of document.body ? document.body.querySelectorAll('*') : []) {
		if (++scanned > 6000) break
		if (el.closest('header, nav, footer, [role=banner], [role=contentinfo], [role=navigation], [data-pt-widget]')) continue
		const cs = getComputedStyle(el)
		if (cs.position === 'fixed' || cs.position === 'sticky') continue
		if (cs.display === 'none' || cs.visibility === 'hidden') continue
		if (cs.backgroundImage !== 'none') continue
		const r = el.getBoundingClientRect()
		if (r.width < window.innerWidth * 0.5 || r.height < 40) continue
		const c = parse(cs.backgroundColor)
		if (!c || c.a < 0.08) continue
		candidates.push({ css: cs.backgroundColor, color: c, area: r.width * r.height, who: el.tagName.toLowerCase() })
	}
	if (!candidates.length) {
		const textColor = document.body ? parse(getComputedStyle(document.body).color) : null
		return {
			defaultSchemeObserved: false,
			skippedReason: 'no-opaque-surface',
			candidate: textColor ? (lum(textColor) > 0.5 ? 'dark' : 'light') : 'light',
			surface: null,
			textSample: textColor ? getComputedStyle(document.body).color : null
		}
	}
	// 按同一 hex 合并面积，取面积最大的一档当默认表面（不是 DOM 序第一块）
	const byCss = new Map()
	for (const c of candidates) {
		const rec = byCss.get(c.css) || { css: c.css, color: c.color, area: 0 }
		rec.area += c.area
		byCss.set(c.css, rec)
	}
	const surface = [...byCss.values()].sort((a, b) => b.area - a.area)[0]

	const texts = new Map()
	let tscan = 0
	for (const el of document.body ? document.body.querySelectorAll('p, h1, h2, h3, span, li, a, div') : []) {
		if (++tscan > 4000) break
		let own = ''
		for (const n of el.childNodes) if (n.nodeType === 3) own += n.textContent
		own = own.trim()
		if (!own) continue
		const cs = getComputedStyle(el)
		const c = parse(cs.color)
		if (!c || c.a < 0.08) continue
		const rec = texts.get(cs.color) || { css: cs.color, color: c, weight: 0 }
		rec.weight += own.length
		texts.set(cs.color, rec)
	}
	const dominantText = [...texts.values()].sort((a, b) => b.weight - a.weight)[0] || null

	const Ls = lum(surface.color)
	let scheme
	if (!dominantText) scheme = Ls < 0.5 ? 'dark' : 'light'
	else {
		const Lt = lum(dominantText.color)
		if (Math.abs(Ls - Lt) < 0.08) scheme = Ls < 0.5 ? 'dark' : 'light'
		else scheme = Ls < Lt ? 'dark' : 'light'
	}
	return {
		defaultSchemeObserved: true,
		scheme,
		surface: { css: surface.css, paintedPx: Math.round(surface.area), luminance: Number(Ls.toFixed(4)) },
		textSample: dominantText ? dominantText.css : null
	}
}

/** E-28 / E-29：暗色信号探测（不注入 html.dark，不只看第一个 section）。 */
export function probeDarkSignalsInPage() {
	const html = document.documentElement
	const rootToggle = !!document.querySelector(
		'html[data-theme], html[data-bs-theme], html[data-mode], body[data-theme], body[data-bs-theme], body[data-mode]'
	)
	const switcher = !!document.querySelector(
		'[aria-label*="dark" i], [aria-label*="暗" ], [class*="theme-toggle"], [class*="dark-mode"], [data-toggle-theme]'
	)
	function bg(el) {
		return el ? getComputedStyle(el).backgroundColor : null
	}
	return {
		htmlBackground: bg(html),
		bodyBackground: bg(document.body),
		htmlColorScheme: getComputedStyle(html).colorScheme || '',
		rootThemeAttr: rootToggle,
		hasSwitcher: switcher,
		htmlClass: String(html.className || '').slice(0, 120)
	}
}

/** E-79：顺手抓导航链接打分，交人挑，不得自动开跑。 */
export function collectNavCandidatesInPage() {
	const out = []
	const seen = new Set()
	const docH = Math.max(document.body ? document.body.scrollHeight : 0, document.documentElement.scrollHeight, 1)
	// 语义标签缺失的站（div 化页壳）同样要能抓到导航：改按文档位置打分，不依赖标签名
	for (const a of document.querySelectorAll('a[href]')) {
		const href = a.href
		if (!href || seen.has(href) || !/^https?:/.test(href)) continue
		if (href.replace(/#.*$/, '') === location.href.replace(/#.*$/, '')) continue
		const text = (a.innerText || '').replace(/\s+/g, ' ').trim()
		if (!text) continue
		const r = a.getBoundingClientRect()
		if (r.width < 8 || r.height < 8) continue
		seen.add(href)
		const y = r.top + window.scrollY
		const semantic = !!a.closest('header, nav, footer, [role=banner], [role=navigation], [role=contentinfo]')
		const edge = y < docH * 0.15 || y > docH * 0.85
		out.push({
			url: href,
			text: text.slice(0, 40),
			source: 'nav',
			score: Number(((semantic ? 1 : 0) + (edge ? 0.8 : 0) + (text.length <= 20 ? 0.5 : 0) + Math.min(1, r.width / 200)).toFixed(3))
		})
		if (out.length >= 400) break
	}
	return out.sort((a, b) => b.score - a.score).slice(0, 40)
}

/** E-25：代表元最多 5 个，按闭集槽位启发式挑；缺槽 omitted，不拿 logo / 社交图标凑数。 */
export function pickInteractionTargetsInPage() {
	for (const el of document.querySelectorAll('[data-pt-tgt]')) el.removeAttribute('data-pt-tgt')
	const vh = window.innerHeight
	function visible(el) {
		const cs = getComputedStyle(el)
		if (cs.display === 'none' || cs.visibility === 'hidden') return null
		const r = el.getBoundingClientRect()
		if (r.width < 24 || r.height < 16) return null
		return r
	}
	function textOf(el) {
		return (el.innerText || '').replace(/\s+/g, ' ').trim()
	}
	function opaque(css) {
		return !/rgba\(\s*0,\s*0,\s*0,\s*0\s*\)|transparent/.test(css)
	}
	function tag(el, slot) {
		if (!el) return null
		el.setAttribute('data-pt-tgt', slot)
		return {
			selector: `[data-pt-tgt="${slot}"]`,
			text: textOf(el).slice(0, 48),
			tagName: el.tagName.toLowerCase(),
			className: String(el.getAttribute('class') || '').slice(0, 80),
			inChrome: !!el.closest('header, nav, [role=banner], [role=navigation]')
		}
	}

	const buttons = []
	for (const el of document.querySelectorAll(
		'button, [role=button], a[class*=btn], a[class*=Btn], a[class*=button], input[type=submit], input[type=button]'
	)) {
		const r = visible(el)
		if (!r) continue
		if (el.closest('[data-pt-widget="third-party"]')) continue
		if (!textOf(el)) continue
		const cs = getComputedStyle(el)
		buttons.push({
			el,
			area: r.width * r.height,
			opaque: opaque(cs.backgroundColor),
			inHero: r.top + window.scrollY < vh * 1.2,
			inChrome: !!el.closest('header, nav, [role=banner], [role=navigation]')
		})
	}
	buttons.sort((a, b) => {
		if (a.inHero !== b.inHero) return a.inHero ? -1 : 1
		if (a.opaque !== b.opaque) return a.opaque ? -1 : 1
		return b.area - a.area
	})
	const primary = buttons[0] || null
	const secondary = buttons.find((b) => b !== primary && (!primary || b.opaque !== primary.opaque || b.inHero)) || null

	const docH = Math.max(document.body ? document.body.scrollHeight : 0, document.documentElement.scrollHeight, 1)
	const links = [...document.querySelectorAll('a[href]')].filter((a) => visible(a) && textOf(a))
	// 语义标签缺失的站按文档位置退化：顶部 15% 内的短文本链接当导航链接
	const navLink =
		links.find((a) => a.closest('header, nav, [role=navigation], [role=banner]')) ||
		links.find((a) => a.getBoundingClientRect().top + window.scrollY < docH * 0.15 && textOf(a).length <= 20)
	const bodyLink =
		links.find(
			(a) =>
				a.closest('main, article, p') &&
				a !== navLink &&
				!/btn|button/i.test(String(a.getAttribute('class') || ''))
		) ||
		links.find((a) => {
			const y = a.getBoundingClientRect().top + window.scrollY
			return a !== navLink && y > docH * 0.2 && y < docH * 0.85 && !/btn|button/i.test(String(a.getAttribute('class') || ''))
		})
	const input = [...document.querySelectorAll('input[type=text], input[type=search], input[type=email], textarea, select')].find(
		(el) => visible(el)
	)

	// hero 内「最大实心色块 + cursor:pointer」但没落进上面槽位的 → 交 agent（E-25）
	const unmapped = []
	for (const el of document.querySelectorAll('div, span, li')) {
		const r = visible(el)
		if (!r) continue
		if (r.top + window.scrollY > vh * 1.2) continue
		const cs = getComputedStyle(el)
		if (cs.cursor !== 'pointer' || !opaque(cs.backgroundColor)) continue
		if (el.closest('button, a, [role=button], [data-pt-tgt]')) continue
		unmapped.push({
			selector: el.id ? `#${CSS.escape(el.id)}` : el.tagName.toLowerCase(),
			text: textOf(el).slice(0, 40),
			backgroundColor: cs.backgroundColor,
			area: Math.round(r.width * r.height)
		})
		if (unmapped.length >= 5) break
	}

	return {
		slots: {
			primary_cta: tag(primary && primary.el, 'primary_cta'),
			secondary_cta: tag(secondary && secondary.el, 'secondary_cta'),
			nav_link: tag(navLink, 'nav_link'),
			body_link: tag(bodyLink, 'body_link'),
			input_outline: tag(input, 'input_outline')
		},
		unmapped: unmapped.sort((a, b) => b.area - a.area)
	}
}

/** E-27：`prefers-reduced-motion` 只做 duration 差分。对象=代表元 + html/body + 有动画的可见节点。 */
export function collectMotionSnapshotInPage() {
	const out = []
	const roots = [document.documentElement, document.body, ...document.querySelectorAll('[data-pt-tgt]')]
	for (const el of roots) {
		if (!el) continue
		const cs = getComputedStyle(el)
		out.push({
			ref: el.getAttribute && el.getAttribute('data-pt-tgt') ? `tgt:${el.getAttribute('data-pt-tgt')}` : el.tagName.toLowerCase(),
			transitionDuration: cs.transitionDuration,
			transitionTimingFunction: cs.transitionTimingFunction,
			animationName: cs.animationName,
			animationDuration: cs.animationDuration
		})
	}
	let scanned = 0
	for (const el of document.body ? document.body.querySelectorAll('*') : []) {
		if (++scanned > 4000 || out.length > 60) break
		const cs = getComputedStyle(el)
		if (cs.animationName === 'none') continue
		if (cs.display === 'none' || cs.visibility === 'hidden') continue
		const r = el.getBoundingClientRect()
		if (r.width < 8 || r.height < 8) continue
		out.push({
			ref: `${el.tagName.toLowerCase()}${el.id ? `#${el.id}` : ''}`,
			transitionDuration: cs.transitionDuration,
			transitionTimingFunction: cs.transitionTimingFunction,
			animationName: cs.animationName,
			animationDuration: cs.animationDuration
		})
	}
	return out
}

/**
 * E-58–E-62 / E-92 / E-104 语料。`slotHint` 只准落 P-31 闭集，拿不准 omit 该键。
 * 公告条 `inCorpus: false` + `fromChrome: "announcement"`；浮动 CTA 标 ctaUnmapped + geometry。
 */
export function collectCopyInPage(opts) {
	const cfg = Object.assign({ maxItems: 800, excerpt: 240 }, opts || {})
	const CJK = /[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]/
	const LAT = /[A-Za-z0-9]/
	const ANNOUNCE = /announce|promo|banner-?bar|notice-?bar|top-?bar|公告|通知|活动条/i

	function cjkLatin(text) {
		let withSpace = 0
		let withoutSpace = 0
		for (let i = 0; i < text.length - 1; i++) {
			const a = text[i]
			const b = text[i + 1]
			if ((CJK.test(a) && LAT.test(b)) || (LAT.test(a) && CJK.test(b))) withoutSpace++
			if (a === ' ' && i > 0) {
				const p = text[i - 1]
				if ((CJK.test(p) && LAT.test(b)) || (LAT.test(p) && CJK.test(b))) withSpace++
			}
		}
		const total = withSpace + withoutSpace
		return {
			withSpace,
			withoutSpace,
			ratioWithSpace: total ? Number((withSpace / total).toFixed(4)) : 0
		}
	}
	function shown(el) {
		const cs = getComputedStyle(el)
		if (cs.display === 'none' || cs.visibility === 'hidden' || Number(cs.opacity) < 0.05) return false
		const r = el.getBoundingClientRect()
		return r.width > 0 && r.height > 0
	}
	function ownText(el) {
		let t = ''
		for (const n of el.childNodes) if (n.nodeType === 3) t += n.textContent
		return t.replace(/\s+/g, ' ').trim()
	}
	function floorOf(el) {
		const f = el.closest('[data-pt-floor]')
		return f ? f.getAttribute('data-pt-floor') : null
	}
	function isFloating(el) {
		let n = el
		for (let i = 0; i < 6 && n; i++) {
			const cs = getComputedStyle(n)
			if (cs.position === 'fixed') return true
			n = n.parentElement
		}
		return false
	}

	const items = []
	const seen = new Set()
	let seq = 0
	function push(el, text, slotHint, priority) {
		if (!text || items.length >= cfg.maxItems * 2) return
		const key = `${slotHint || ''}|${text}`
		if (seen.has(key)) return
		seen.add(key)
		const chromeRoot = el.closest('header, nav, footer, [role=banner], [role=contentinfo], [role=navigation]')
		const announceRoot = el.closest('[class],[id]')
		const isAnnounce =
			!!announceRoot &&
			ANNOUNCE.test(`${announceRoot.getAttribute('class') || ''} ${announceRoot.id || ''}`) &&
			(getComputedStyle(announceRoot).position === 'fixed' || announceRoot.getBoundingClientRect().top + window.scrollY < 200)
		const floating = isFloating(el)
		const rec = {
			id: `c-${String(++seq).padStart(4, '0')}`,
			text: text.slice(0, 400),
			inCorpus: !isAnnounce,
			fromChrome: isAnnounce ? 'announcement' : chromeRoot ? chromeRoot.tagName.toLowerCase() : '',
			ephemeral: false,
			ctaUnmapped: false,
			geometry: floating ? 'floating' : null,
			floorId: floorOf(el),
			cjkLatin: cjkLatin(text),
			_priority: priority
		}
		if (slotHint) rec.slotHint = slotHint
		items.push(rec)
	}

	// 导航 IA → nav_item（E-104 近邻映射）
	for (const a of document.querySelectorAll('header a, nav a, [role=navigation] a')) {
		if (!shown(a)) continue
		const t = (a.innerText || '').replace(/\s+/g, ' ').trim()
		if (t && t.length <= 24) push(a, t, 'nav_item', 2)
	}
	// 标题
	for (const h of document.querySelectorAll('h1, h2, h3, h4, [role=heading]')) {
		if (!shown(h)) continue
		push(h, (h.innerText || '').replace(/\s+/g, ' ').trim(), 'heading', 0)
	}
	// 正文 / 副文案
	for (const p of document.querySelectorAll('p, li, dd, blockquote')) {
		if (!shown(p)) continue
		const t = ownText(p) || (p.innerText || '').replace(/\s+/g, ' ').trim()
		if (!t || t.length < 2) continue
		const isSub = !!p.closest('[class*=sub], [class*=desc], [class*=lead]')
		push(p, t, isSub ? 'subcopy' : 'body', isSub ? 1 : 3)
	}
	// CTA：首屏实心按钮拿得准才给 primary_cta，其余交 agent（拿不准 omit slotHint）
	const vh = window.innerHeight
	const ctaTerms = new Map()
	const ctaUnmappedList = []
	for (const b of document.querySelectorAll('button, [role=button], a[class*=btn], a[class*=button], input[type=submit]')) {
		if (!shown(b)) continue
		const t = (b.innerText || b.value || '').replace(/\s+/g, ' ').trim()
		if (!t || t.length > 32) continue
		const cs = getComputedStyle(b)
		const r = b.getBoundingClientRect()
		const solid = !/rgba\(\s*0,\s*0,\s*0,\s*0\s*\)|transparent/.test(cs.backgroundColor)
		const inHero = r.top + window.scrollY < vh * 1.2
		const floating = isFloating(b)
		let hint
		if (floating) hint = undefined
		else if (inHero && solid) hint = 'primary_cta'
		else if (inHero) hint = 'secondary_cta'
		push(b, t, hint, 0)
		const last = items[items.length - 1]
		if (last && last.text === t.slice(0, 400)) {
			if (floating) {
				last.ctaUnmapped = true
				last.geometry = 'floating'
				ctaUnmappedList.push({ text: t, geometry: 'floating' })
			}
		}
		const rec = ctaTerms.get(t) || { term: t, count: 0, roleHint: hint }
		rec.count++
		if (hint && !rec.roleHint) rec.roleHint = hint
		ctaTerms.set(t, rec)
	}
	// 统计类槽位
	for (const el of document.querySelectorAll('[class*=stat] , [class*=number], [class*=price]')) {
		if (!shown(el)) continue
		const t = ownText(el)
		if (t && /\d/.test(t)) push(el, t, /price|价|¥|\$/i.test(`${el.getAttribute('class') || ''}${t}`) ? 'price' : 'stat_value', 4)
	}
	// 备案 / 法务
	for (const el of document.querySelectorAll('footer a, footer p, footer span')) {
		if (!shown(el)) continue
		const t = ownText(el)
		if (!t) continue
		if (/ICP|备案|公安网备/i.test(t)) push(el, t, 'beian', 5)
		else if (/©|版权|Copyright|隐私|条款|Terms|Privacy/i.test(t)) push(el, t, 'legal', 5)
	}

	// E-58：单页上限 800，超出按优先级截断（先保住 heading 与 CTA 槽）
	items.sort((a, b) => a._priority - b._priority)
	const copyTruncated = items.length > cfg.maxItems
	const kept = items.slice(0, cfg.maxItems)
	for (const it of kept) delete it._priority

	// E-61：分槽 cjkLatin + text-autospace
	const bySlot = {}
	for (const slot of ['heading', 'subcopy', 'primary_cta', 'secondary_cta', 'body', 'nav_item']) {
		const group = kept.filter((i) => i.slotHint === slot)
		const lens = group.map((i) => i.text.length).sort((a, b) => a - b)
		const pct = (p) => (lens.length ? lens[Math.min(lens.length - 1, Math.floor((lens.length - 1) * p))] : 0)
		const merged = { withSpace: 0, withoutSpace: 0 }
		let punct = 0
		for (const i of group) {
			merged.withSpace += i.cjkLatin.withSpace
			merged.withoutSpace += i.cjkLatin.withoutSpace
			punct += (i.text.match(/[，。！？、；：,.!?;:]/g) || []).length
		}
		const total = merged.withSpace + merged.withoutSpace
		bySlot[slot] = {
			n: group.length,
			charsP50: pct(0.5),
			charsP90: pct(0.9),
			punct,
			cjkLatin: {
				withSpace: merged.withSpace,
				withoutSpace: merged.withoutSpace,
				ratioWithSpace: total ? Number((merged.withSpace / total).toFixed(4)) : 0
			}
		}
	}

	const rootCs = getComputedStyle(document.documentElement)
	const autospaceComputed = rootCs.getPropertyValue('text-autospace').trim() || 'no-autospace'
	const autospaceSamples = []
	for (const el of document.querySelectorAll('p, h1, h2, li')) {
		if (autospaceSamples.length >= 5) break
		if (!shown(el)) continue
		autospaceSamples.push({
			selector: el.tagName.toLowerCase(),
			computed: getComputedStyle(el).getPropertyValue('text-autospace').trim() || 'no-autospace'
		})
	}

	// person 词频（供 V-27）：语言层词表，不是站点数据
	const allText = kept.map((i) => i.text).join(' ')
	function countAll(patterns) {
		const out = {}
		for (const [k, re] of patterns) {
			const m = allText.match(re)
			if (m && m.length) out[k] = m.length
		}
		return out
	}
	const person = {
		reader: countAll([
			['你', /你/g],
			['您', /您/g],
			['you', /\byou\b/gi],
			['your', /\byour\b/gi]
		]),
		brand_self: countAll([
			['我们', /我们/g],
			['本公司', /本公司|本平台/g],
			['we', /\bwe\b/gi],
			['our', /\bour\b/gi]
		]),
		audience_noun: countAll([
			['企业', /企业/g],
			['开发者', /开发者/g],
			['客户', /客户/g],
			['用户', /用户/g],
			['团队', /团队/g],
			['developers', /\bdevelopers?\b/gi],
			['enterprises', /\benterprises?\b/gi]
		])
	}

	const numberSamples = {}
	for (const it of kept) {
		const hits = it.text.match(/\d+(?:\.\d+)?\s*(?:%|万|亿|元|折|GB|TB|MB|ms|s|x|倍|\+|core|vCPU)?/gi)
		if (!hits) continue
		const slot = it.slotHint || 'unslotted'
		numberSamples[slot] = numberSamples[slot] || []
		if (numberSamples[slot].length < 20) numberSamples[slot].push(...hits.slice(0, 3))
	}

	const nameCount = new Map()
	for (const it of kept) {
		for (const m of it.text.matchAll(/\b[A-Z][A-Za-z0-9]{2,}(?:\s[A-Z][A-Za-z0-9]{2,})?\b/g)) {
			nameCount.set(m[0], (nameCount.get(m[0]) || 0) + 1)
		}
	}
	const productNameCandidates = [...nameCount.entries()]
		.filter(([, n]) => n >= 2)
		.sort((a, b) => b[1] - a[1])
		.slice(0, 30)
		.map(([t]) => t)

	const chromeCopyPreview = kept
		.filter((i) => i.fromChrome)
		.slice(0, 40)
		.map((i) => i.text.slice(0, 60))

	return {
		items: kept,
		copyTruncated,
		bySlot,
		textAutospace: {
			computed: autospaceComputed,
			samples: autospaceSamples,
			autospaceActive: autospaceComputed !== 'no-autospace'
		},
		person,
		cta: [...ctaTerms.values()].sort((a, b) => b.count - a.count).slice(0, 40),
		ctaUnmapped: ctaUnmappedList,
		productNameCandidates,
		numberSamples,
		chromeCopyPreview
	}
}
