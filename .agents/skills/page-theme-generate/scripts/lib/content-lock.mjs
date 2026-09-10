/**
 * 内容锁的抽取器。只抽不判——比对与 code 在 `migration-gates.mjs`。
 *
 * 抓得住：可见文本、`href`、`src`、`alt`、`srcset`、`poster` 六条有序标签序列，
 * 外加 CSS 声明里的 `url()` 参数序列（按文件分组）。
 * 抓不住：JS 运行时拼出来的字；`sizes`；`form[action]`；JS 里的端点与路由。
 *
 * `srcset` 按**所有开标签**收，`<picture><source srcset>` 因此并进同一条序列，
 * **不另占一个 code**：`<source>` 上没有 `src`，改它只动 srcset 序列，造不出与
 * `srcset-changed` 不同的独占失败输入。占一个编号就是空门。
 *
 * `srcset` 原样比：不拆 `1x` / `2x` 描述符、不排序、不折空白（`1x, 2x` 与 `1x,2x` 会红），
 * 与 `href` / `src` 同一合同。解析 srcset 语法会变成第五套口径，且本仓库没有一条真
 * srcset 能证伪那个解析器。
 *
 * CSS `url()` 收窄三处，否则会和「只改色值」打架：
 *
 * - `data:` 开头的不收——data-URI SVG 里常含填色，那半边归色门管。
 * - `url(#fragment)` 不收：那是 SVG filter / clip-path 的引用，不是外链资源。
 * - `--` 自定义属性声明右侧不收，与 `literal-verdict-backing` 同族：变量层自己会把整片报出来。
 * - `widget` 子树不收（第三方播放器 CSS 里全是自带图标 url）。
 *
 * 后两条各带一个洞，如实记：`--before` 侧本来就把图写在自定义属性里（`--hero: url(a.png)`）
 * 或写在 widget 子树里，那处 url 从头到尾不进序列，改它不红。反方向（改造中把 url **搬进**
 * 自定义属性）仍红——before 侧那条 url 消失了，序列逐位比会报出来。
 * - 剥一层引号后比：`url(a)` / `url("a")` / `url('a')` 在 CSS 里是同一件事，原样比会让
 *   跑一遍 formatter 就把这道门先关掉。相对路径**不 resolve**（产物没有 base URL），
 *   query 串**不剥**——`./a.png` 与 `a.png`、`a.png?v=1` 与 `a.png` 都红，与 `src` 同族。
 *
 * 实体解码表只有六条：`&amp;` `&lt;` `&gt;` `&quot;` `&#39;` `&nbsp;`
 * （末条解成 U+00A0，随后被空白归一吃掉，所以「把空格换成 `&nbsp;`」抓不住）。
 * 表外的实体原样留着。
 */

const NAMED_ENTITIES = {
	'&amp;': '&',
	'&lt;': '<',
	'&gt;': '>',
	'&quot;': '"',
	'&#39;': "'",
	'&nbsp;': '\u00A0',
}

export function decodeEntities(text) {
	return String(text).replace(/&amp;|&lt;|&gt;|&quot;|&#39;|&nbsp;/g, (m) => NAMED_ENTITIES[m])
}

export function normalizeWhitespace(text) {
	return String(text).replace(/\s+/g, ' ').trim()
}

function stripComments(html) {
	return String(html).replace(/<!--[\s\S]*?-->/g, '')
}

function stripScriptAndStyle(html) {
	return String(html)
		.replace(/<script\b[\s\S]*?<\/script>/gi, '')
		.replace(/<style\b[\s\S]*?<\/style>/gi, '')
}

export function extractTextSequence(html) {
	const body = stripScriptAndStyle(stripComments(html))
	const nodes = body.split(/<[^>]+>/g)
	const out = []
	for (const node of nodes) {
		const t = normalizeWhitespace(decodeEntities(node))
		if (t) out.push(t)
	}
	return out
}

function attrValue(attrs, name) {
	const re = new RegExp(`(?:^|\\s)${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i')
	const m = re.exec(attrs)
	if (!m) return null
	return m[1] ?? m[2] ?? m[3]
}

export function extractAttrSequence(html, attr) {
	const src = stripComments(html)
	const out = []
	const re = /<\s*(\/?)\s*[a-zA-Z][\w-]*([^>]*?)\/?\s*>/g
	let m
	while ((m = re.exec(src))) {
		if (m[1] === '/') continue
		const val = attrValue(m[2] || '', attr)
		if (val !== null) out.push(val)
	}
	return out
}

export function extractContentLock(html) {
	return {
		text: extractTextSequence(html),
		href: extractAttrSequence(html, 'href'),
		src: extractAttrSequence(html, 'src'),
		alt: extractAttrSequence(html, 'alt'),
		srcset: extractAttrSequence(html, 'srcset'),
		poster: extractAttrSequence(html, 'poster'),
	}
}

function unquote(raw) {
	const s = String(raw).trim()
	if (s.length >= 2 && (s[0] === '"' || s[0] === "'") && s[s.length - 1] === s[0]) return s.slice(1, -1).trim()
	return s
}

/**
 * 一条声明值里全部 `url(...)` 的参数，按出现序。
 *
 * 括号配平而不是 `/url\([^)]*\)/`：`url(data:image/svg+xml;utf8,<svg ...>)` 里可以有嵌套
 * 括号与分号，正则一把梭会在第一个 `)` 上截断，抽出半截串——那种半截串比不抽更坏，因为
 * 它会在无人改动 url 时也逐位不同。引号里的括号不算括号。
 */
export function urlArgs(value) {
	const s = String(value)
	const out = []
	const re = /url\(/gi
	let m
	while ((m = re.exec(s))) {
		let i = m.index + m[0].length
		let depth = 1
		let quote = null
		let buf = ''
		while (i < s.length) {
			const c = s[i++]
			if (quote) {
				if (c === quote && s[i - 2] !== '\\') quote = null
				buf += c
				continue
			}
			if (c === '"' || c === "'") {
				quote = c
				buf += c
				continue
			}
			if (c === '(') depth++
			else if (c === ')') {
				depth--
				if (!depth) break
			}
			buf += c
		}
		out.push(unquote(buf))
		re.lastIndex = i
	}
	return out
}

/** 声明数组 → `Map<file, string[]>`。收窄规则见模块头。 */
export function extractCssUrlSequence(declarations) {
	const byFile = new Map()
	for (const d of declarations ?? []) {
		if (d.widget) continue
		if (String(d.prop).startsWith('--')) continue
		for (const raw of urlArgs(d.value)) {
			if (!raw) continue
			if (/^data:/i.test(raw) || raw.startsWith('#')) continue
			const file = String(d.file ?? '').split('\\').join('/')
			if (!byFile.has(file)) byFile.set(file, [])
			byFile.get(file).push(raw)
		}
	}
	return byFile
}
