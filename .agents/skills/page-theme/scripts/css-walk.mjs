/**
 * extract-css-core v3 `document.styleSheets` 行走的移植版（E-03 / O-26 第 3 款）。
 * 官方包禁装：任意一张跨源表会让整段 evaluate 抛 SecurityError 而全丢（〔013〕P1）。
 * 本移植版补：CORS 降级为 blocked + pendingFetch、`adoptedStyleSheets`、开放 Shadow DOM、`[style]` 内联。
 *
 * `walkStyleSheetsInPage` 必须整体传给 page.evaluate，函数体内不得引用模块作用域。
 */

/** @returns {{origins:object[], pendingFetch:string[], extras:object}} */
export function walkStyleSheetsInPage() {
	const origins = []
	const pendingFetch = []
	const extras = { adopted: 0, shadow: 0, corsBlocked: 0, importDepth: 0 }
	const seen = new Set()

	function typeOf(sheet, hint, source) {
		if (hint) return hint
		const owner = sheet.ownerNode
		if (owner && owner.tagName) {
			const tag = owner.tagName.toLowerCase()
			if (tag === 'link' || tag === 'style') return tag
		}
		return source === 'adopted' || source === 'shadow-adopted' ? 'adopted' : 'import'
	}

	function push(entry) {
		origins.push({
			href: entry.href,
			type: entry.type,
			source: entry.source,
			media: entry.media || '',
			css: entry.css || '',
			bytes: (entry.css || '').length,
			blocked: !!entry.blocked,
			recovered: false,
			firstParty: false
		})
	}

	function walkSheet(sheet, hint, source, depth) {
		if (!sheet || seen.has(sheet) || depth > 8) return
		seen.add(sheet)
		const type = typeOf(sheet, hint, source)
		const href = sheet.href || document.location.href
		const media = sheet.media && sheet.media.mediaText ? sheet.media.mediaText : ''
		try {
			const rules = sheet.cssRules
			let css = ''
			for (const rule of rules) {
				if (rule instanceof CSSImportRule && rule.styleSheet) {
					extras.importDepth = Math.max(extras.importDepth, depth + 1)
					walkSheet(rule.styleSheet, 'import', 'import', depth + 1)
				}
				css += rule.cssText
			}
			push({ type, href, css, source, media })
		} catch {
			extras.corsBlocked += 1
			push({ type, href, css: '', blocked: true, source, media })
			if (sheet.href) pendingFetch.push(sheet.href)
		}
	}

	for (const sheet of document.styleSheets) walkSheet(sheet, null, 'document.styleSheets', 0)

	try {
		for (const sheet of document.adoptedStyleSheets || []) {
			extras.adopted += 1
			walkSheet(sheet, 'adopted', 'adopted', 0)
		}
	} catch {
		/* 不支持 adoptedStyleSheets 的环境 */
	}

	const walker = document.createTreeWalker(document, NodeFilter.SHOW_ELEMENT)
	for (let node = walker.currentNode; node; node = walker.nextNode()) {
		if (!node.shadowRoot) continue
		try {
			for (const sheet of node.shadowRoot.styleSheets || []) {
				extras.shadow += 1
				walkSheet(sheet, null, 'shadow', 0)
			}
			for (const sheet of node.shadowRoot.adoptedStyleSheets || []) {
				extras.shadow += 1
				extras.adopted += 1
				walkSheet(sheet, 'adopted', 'shadow-adopted', 0)
			}
		} catch {
			/* closed shadow root 读不到，按漏标处理 */
		}
	}

	const inline = []
	for (const el of document.querySelectorAll('[style]')) {
		const decl = el.getAttribute('style')
		if (decl) inline.push(`[x-extract-css-inline-style] { ${decl} }`)
	}
	if (inline.length) {
		push({
			type: 'inline',
			href: document.location.href,
			css: inline.join('\n'),
			source: 'inline'
		})
	}

	return { origins, pendingFetch: [...new Set(pendingFetch)], extras }
}
