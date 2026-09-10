/**
 * 把一份楼层产物（HTML 片段 + 可选 CSS）摊平成「声明」列表，供门逐条判。
 *
 * 门要判的是「这一处用了什么值」，而 HTML/CSS 有四种藏值的地方：外部 CSS 规则块、
 * HTML 里的 `<style>` 块、内联 `style=`、以及嵌套 at-rule 里的规则块。任何一处漏扫，
 * 门就出现一个静默盲区——产物照样绿，但那一处的字面量活着。单文件楼层（样式全写在
 * `<style>` 里、不传 `--css`）是最容易踩的那一种：漏扫它等于 0 声明过门。
 * 所以这里不做正则一把梭，而是括号配平地走一遍。
 *
 * 本模块零依赖，且**不判任何对错**：它只负责「摊平」，判据一律在 gates.mjs。
 * 两件事分开是为了让门的失败用例能直接喂声明数组，不必每次现造一份 HTML。
 */

/** at-rule 里的声明不是用色点：字体描述符不是用字，关键帧是动画位移。 */
const SKIPPED_AT_RULES = new Set(['font-face', 'keyframes', '-webkit-keyframes', 'property'])

const VOID_TAGS = new Set(['img', 'br', 'hr', 'input', 'meta', 'link', 'source', 'area', 'base', 'col', 'embed', 'track', 'wbr'])

/**
 * 按顶层 `;` 切声明。不能直接 `split(';')`：`rgba(0,0,0,.2)` 里没有分号，但
 * `background-image: url("a;b")` 里有，引号与括号内的分号必须留在原声明里。
 */
export function splitDeclarations(block) {
	const parts = []
	let depth = 0
	let quote = null
	let cur = ''
	for (let i = 0; i < block.length; i++) {
		const c = block[i]
		if (quote) {
			cur += c
			if (c === quote && block[i - 1] !== '\\') quote = null
			continue
		}
		if (c === '"' || c === "'") quote = c
		else if (c === '(') depth++
		else if (c === ')') depth--
		if (c === ';' && depth === 0) {
			parts.push(cur)
			cur = ''
			continue
		}
		cur += c
	}
	if (cur.trim()) parts.push(cur)
	return parts.map((s) => s.trim()).filter(Boolean)
}

function parseDeclaration(raw, base) {
	const k = raw.indexOf(':')
	if (k < 0) return null
	const prop = raw.slice(0, k).trim().toLowerCase()
	const value = raw.slice(k + 1).trim()
	if (!prop || !value) return null
	return { ...base, prop, value }
}

/**
 * 扫一份 CSS 文本。返回 `{ file, selector, prop, value, widget, floorContainer }[]`。
 *
 * `widget` 标记跟采集侧同一个属性名（`data-pt-widget="third-party"`）：第三方嵌入
 * 控件的内部色与字体不归本站主题管，但**读不到该标记就不豁免**——否则「说自己是
 * widget」会变成一句免检咒语。
 */
export function scanCss(text, file = '<css>') {
	const out = []
	const src = String(text).replace(/\/\*[\s\S]*?\*\//g, '')
	let i = 0

	const readBlock = (selector, skip) => {
		let depth = 1
		let buf = ''
		let quote = null
		while (i < src.length && depth > 0) {
			const c = src[i++]
			// 引号里的括号不算括号：`content: "}"` 不该把块提前收尾。
			if (quote) {
				if (c === quote && src[i - 2] !== '\\') quote = null
			} else if (c === '"' || c === "'") quote = c
			else if (c === '{') depth++
			else if (c === '}') {
				depth--
				if (!depth) break
			}
			buf += c
		}
		if (skip) return
		// 块里还有 `{` 说明这是 @media / @supports 之类的容器，递归进去并把选择器接起来。
		if (buf.includes('{')) {
			out.push(...scanCss(buf, file).map((d) => ({ ...d, selector: `${selector} ${d.selector}`.trim() })))
			return
		}
		const base = {
			file,
			selector,
			widget: /\[data-pt-widget[~^|*$]?=["']?third-party/i.test(selector),
		}
		for (const raw of splitDeclarations(buf)) {
			const d = parseDeclaration(raw, base)
			if (d) out.push(d)
		}
	}

	while (i < src.length) {
		const brace = src.indexOf('{', i)
		if (brace < 0) break
		const selector = src.slice(i, brace).trim().replace(/\s+/g, ' ')
		i = brace + 1
		const at = /^@([a-z-]+)/i.exec(selector)
		readBlock(selector, !!at && SKIPPED_AT_RULES.has(at[1].toLowerCase()))
	}
	return out
}

/**
 * 扫一份 HTML 片段：取内联 `style=` 的声明，以及 `<style>` 块里的整份 CSS。
 *
 * `<style>` 必须扫。楼层完全可以是一个自带样式的单文件 HTML，那时 `--css` 一份都不传；
 * 只扫内联 `style=` 会让这种产物以「零声明」全绿通过——门看起来在，其实一条都没判。
 *
 * widget 豁免按**祖先链**传递：第三方控件根节点带标记，其整棵子树都不计。用一个栈
 * 跟标签开合，遇到未闭合的标签也不会把后面整页都算进去——`VOID_TAGS` 与自闭合都不入栈。
 */
export function scanHtml(text, file = '<html>') {
	const src = String(text)
	const declarations = []
	const stack = []
	const re = /<(\/?)([a-zA-Z][\w-]*)([^>]*?)(\/?)>/g
	let m
	while ((m = re.exec(src))) {
		const tag = m[2].toLowerCase()
		if (m[1] === '/') {
			for (let i = stack.length - 1; i >= 0; i--) {
				if (stack[i].tag === tag) {
					stack.length = i
					break
				}
			}
			continue
		}
		const attrs = m[3] || ''
		const widget = /data-pt-widget\s*=\s*["']?third-party/i.test(attrs) || stack.some((s) => s.widget)
		const style = /style\s*=\s*"([^"]*)"|style\s*=\s*'([^']*)'/i.exec(attrs)
		if (style) {
			const base = { file, selector: `<${tag} inline>`, widget }
			for (const raw of splitDeclarations(style[1] ?? style[2] ?? '')) {
				const d = parseDeclaration(raw, base)
				if (d) declarations.push(d)
			}
		}
		if ((tag === 'style' || tag === 'script') && m[4] !== '/') {
			const end = src.toLowerCase().indexOf(`</${tag}`, re.lastIndex)
			const body = src.slice(re.lastIndex, end < 0 ? src.length : end)
			// 整块交给 scanCss，好让 @media 递归、注释剥离这些都只有一套实现。
			// script 体只是跳过：里面的 `a<b` 会被标签正则读成开标签，不跳会污染 widget 栈。
			if (tag === 'style') declarations.push(...scanCss(body, file).map((d) => ({ ...d, widget: d.widget || widget })))
			re.lastIndex = end < 0 ? src.length : end
			continue
		}
		if (m[4] !== '/' && !VOID_TAGS.has(tag)) stack.push({ tag, widget })
	}
	return { declarations }
}

/** 一份产物（HTML + 0..N 份 CSS）的全部声明。`css` 是 `{ file, text }[]`。 */
export function scanArtifact({ html = '', htmlFile = '<html>', css = [] }) {
	const declarations = [...scanHtml(html, htmlFile).declarations]
	for (const sheet of css) declarations.push(...scanCss(sheet.text, sheet.file))
	return { declarations }
}
