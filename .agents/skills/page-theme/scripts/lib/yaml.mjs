/**
 * YAML 子集解析器——**全仓唯一实现**〔B-21 / B-27〕。
 *
 * 合并来源：S3 `validate-asset.mjs#parseYamlLite`（取其语法覆盖面：嵌套流式集合、块标量
 * chomp 与显式缩进指示、引号键、流式续行）＋ S4 `accept/lib/mini-yaml.mjs#parseYaml`
 * （取其报错口径：带文件名与行号、制表符缩进拒收、文档尾部有残余即报错）。
 * S2 `lib/overrides.mjs#parseYamlSubset` 的行为一律不取——它对无冒号行、锚点、缩进错乱
 * 都静默跳过，会把解析故障伪装成「字段缺失」。
 *
 * 底线：**不支持项一律抛 `YamlError`，不静默降级**〔B-27〕。静默解析出半个对象再去做形状
 * 校验，会把解析故障伪装成 schema 违规；而 `chrome.yaml` 几何对账拿到假事实比读不到更坏。
 *
 * 无第三方依赖：`scripts/package.json` 锁死五个依赖（合同 §3），不得为 YAML 加第六个。
 *
 * ## 支持
 *
 * | 语法 | 说明 |
 * | --- | --- |
 * | 块映射 / 块序列 | 任意缩进宽度；序列项可与父键同缩进；`- key: value` 起头的块映射项按内容列递归 |
 * | 流式集合 | `[a, b]`、`{ k: v }`，可嵌套；单行括号不平衡时自动续行直到平衡 |
 * | 引号标量 | 双引号（`\` 转义）与单引号（`''` 转义）；引号键同样支持 |
 * | 注释 | 行首 `#`，或前面是空白的 `#`；引号内不当注释 |
 * | 块标量 | `>` 折叠与 `|` 字面，支持 chomp 修饰 `-` / `+` 与显式缩进指示数字 |
 * | 标量归一 | `null` / `~` / 空 → `null`；`true` / `false` 不分大小写；十进制整数与小数 → number；其余 → string |
 * | 文档标记 | 前导 `---`、尾部 `...` |
 *
 * ## 不支持——命中即抛错
 *
 * | 语法 | 报错 |
 * | --- | --- |
 * | 锚点 `&` / 别名 `*` / 标签 `!` | 「不支持锚点 / 别名 / 标签」 |
 * | 多文档（正文之后再出现 `---`） | 「解析未消费完」 |
 * | 复杂键 `? ` / 合并键 `<<:` | 「不是合法的 key: value」 |
 * | 多行 plain 标量 | 「缩进比同级键更深」——要多行必须用 `>` 或 `|` |
 * | 制表符缩进 | 「缩进不得用制表符」（YAML 规范本就禁止；折算成空格是静默降级） |
 *
 * ## 三条与真 YAML 一致、但容易咬人的行为——**故意保留，不得「修好」**〔B-27〕
 *
 * 1. plain 标量里 ` #` 起注释：`- 不要用 #FAFAFA 底` 截断成 `不要用`。要留 `#` 必须加引号。
 * 2. 重复键**后写覆盖先写**，不报错。
 * 3. 数字只认十进制整数与小数：`0x1F` / `1e3` / `+5` / `.inf` / `.nan` 一律留作字符串。
 */

import path from 'node:path'

export class YamlError extends Error {
	constructor(file, line, msg) {
		super(`${file}:${line} ${msg}`)
		this.name = 'YamlError'
		this.file = file
		this.line = line
	}
}

const IGNORABLE = (l) => l.text === '' || l.text.startsWith('#')
const isSeqLine = (l) => l.text === '-' || l.text.startsWith('- ')

/**
 * @param {string} text YAML 原文
 * @param {string} file 报错用的来源标识（文件路径，或 `README.md#覆盖度` 这类节内标识）
 */
export function parseYaml(text, file = '<yaml>') {
	const ctx = makeCtx(text, file)
	// 跳过前导注释与文档起始标记
	while (ctx.pos < ctx.lines.length && (IGNORABLE(ctx.lines[ctx.pos]) || ctx.lines[ctx.pos].text === '---')) ctx.pos++
	if (ctx.pos >= ctx.lines.length) return {}
	const value = parseNode(ctx, guard(ctx, ctx.lines[ctx.pos]).indent)
	for (;;) {
		skipIgnorable(ctx)
		if (ctx.pos >= ctx.lines.length) break
		if (ctx.lines[ctx.pos].text === '...') {
			ctx.pos++
			continue
		}
		throw new YamlError(file, ctx.lines[ctx.pos].n, '解析未消费完（缩进不一致，或使用了多文档 / 不支持的语法）')
	}
	return value
}

function makeCtx(text, file) {
	const lines = String(text)
		.replace(/\r\n?/g, '\n')
		.split('\n')
		.map((raw, i) => {
			const lead = /^[ \t]*/.exec(raw)[0]
			return {
				n: i + 1,
				raw,
				indent: lead.length,
				tabIndent: lead.includes('\t'),
				text: raw.slice(lead.length).replace(/\s+$/, '')
			}
		})
	return { lines, pos: 0, file }
}

/** 制表符缩进在 YAML 里非法。折算成空格属静默降级，一律拒收。 */
function guard(ctx, line) {
	if (line.tabIndent) throw new YamlError(ctx.file, line.n, '缩进不得用制表符')
	return line
}

/** `...` 终止文档；正文之后再出现 `---` 是多文档，不支持。 */
function isDocEnd(ctx, line) {
	if (line.text === '---') throw new YamlError(ctx.file, line.n, '不支持多文档（正文之后再出现 ---）')
	return line.text === '...'
}

function peek(ctx) {
	let i = ctx.pos
	while (i < ctx.lines.length && IGNORABLE(ctx.lines[i])) i++
	return i < ctx.lines.length ? guard(ctx, ctx.lines[i]) : null
}

function skipIgnorable(ctx) {
	while (ctx.pos < ctx.lines.length && IGNORABLE(ctx.lines[ctx.pos])) ctx.pos++
}

function parseNode(ctx, indent) {
	skipIgnorable(ctx)
	if (ctx.pos >= ctx.lines.length) return null
	return isSeqLine(guard(ctx, ctx.lines[ctx.pos])) ? parseSequence(ctx, indent) : parseMapping(ctx, indent)
}

function parseMapping(ctx, indent) {
	const obj = {}
	for (;;) {
		skipIgnorable(ctx)
		if (ctx.pos >= ctx.lines.length) break
		const line = guard(ctx, ctx.lines[ctx.pos])
		if (isDocEnd(ctx, line)) break
		if (line.indent < indent) break
		if (line.indent > indent) throw new YamlError(ctx.file, line.n, '缩进比同级键更深')
		if (isSeqLine(line)) break
		const kv = splitKey(line.text)
		if (!kv) throw new YamlError(ctx.file, line.n, `不是合法的 "key: value"：${line.text.slice(0, 40)}`)
		ctx.pos++
		const restRaw = stripComment(kv.rest).trim()
		if (/^[>|][-+]?\d*$/.test(restRaw)) {
			obj[kv.key] = parseBlockScalar(ctx, indent, restRaw)
			continue
		}
		if (restRaw === '') {
			const nxt = peek(ctx)
			obj[kv.key] = nxt && (nxt.indent > indent || (nxt.indent === indent && isSeqLine(nxt))) ? parseNode(ctx, nxt.indent) : null
			continue
		}
		obj[kv.key] = readFlowOrScalar(ctx, restRaw, line)
	}
	return obj
}

function parseSequence(ctx, indent) {
	const arr = []
	for (;;) {
		skipIgnorable(ctx)
		if (ctx.pos >= ctx.lines.length) break
		const line = guard(ctx, ctx.lines[ctx.pos])
		if (isDocEnd(ctx, line)) break
		if (line.indent < indent || !isSeqLine(line)) break
		if (line.indent > indent) throw new YamlError(ctx.file, line.n, '序列项缩进比同级更深')
		const dash = line.text.match(/^-\s*/)[0]
		const content = line.text.slice(dash.length)
		const contentCol = line.indent + dash.length
		if (content === '') {
			ctx.pos++
			const nxt = peek(ctx)
			arr.push(nxt && nxt.indent > indent ? parseNode(ctx, nxt.indent) : null)
			continue
		}
		const head = content[0]
		if (head !== '{' && head !== '[' && head !== '"' && head !== "'" && splitKey(content)) {
			// 序列项是块映射：把当前行改写成一条起始于内容列的虚拟行，后续同缩进兄弟键按普通映射解析
			ctx.lines[ctx.pos] = { ...line, indent: contentCol, text: content }
			arr.push(parseMapping(ctx, contentCol))
			continue
		}
		ctx.pos++
		arr.push(readFlowOrScalar(ctx, stripComment(content).trim(), line))
	}
	return arr
}

function parseBlockScalar(ctx, parentIndent, header) {
	const style = header[0]
	const chomp = (header.match(/[-+]/) || [''])[0]
	const explicit = (header.match(/\d/) || [null])[0]
	let contentIndent = explicit ? parentIndent + Number(explicit) : null
	const buf = []
	while (ctx.pos < ctx.lines.length) {
		const l = ctx.lines[ctx.pos]
		const blank = l.raw.trim() === ''
		if (!blank) {
			guard(ctx, l)
			if (l.indent <= parentIndent) break
			if (contentIndent === null) contentIndent = l.indent
		}
		buf.push(blank ? '' : l.raw.slice(contentIndent))
		ctx.pos++
	}
	while (buf.length && buf[buf.length - 1] === '') buf.pop()
	let out
	if (style === '|') {
		out = buf.join('\n')
	} else {
		out = ''
		for (const l of buf) {
			if (l === '') out += '\n'
			else out += (out === '' || out.endsWith('\n') ? '' : ' ') + l
		}
	}
	if (chomp !== '-' && out !== '') out += '\n'
	return out
}

/** 把 `key: value` 拆开；引号键与含 `:` 的值（URL）均可正确处理。 */
function splitKey(text) {
	let i = 0
	let key
	if (text[0] === '"' || text[0] === "'") {
		const q = text[0]
		i = 1
		let buf = ''
		while (i < text.length) {
			if (text[i] === '\\' && q === '"') {
				buf += text[i + 1] ?? ''
				i += 2
				continue
			}
			if (text[i] === q) {
				i++
				break
			}
			buf += text[i++]
		}
		key = buf
		while (text[i] === ' ') i++
	} else {
		let depth = 0
		let at = -1
		for (let k = 0; k < text.length; k++) {
			const c = text[k]
			if (c === '[' || c === '{') depth++
			else if (c === ']' || c === '}') depth--
			else if (c === '"' || c === "'") {
				const q = c
				k++
				while (k < text.length && text[k] !== q) k++
			} else if (c === ':' && depth === 0 && (k + 1 === text.length || text[k + 1] === ' ')) {
				at = k
				break
			}
		}
		if (at < 0) return null
		key = text.slice(0, at).trim()
		i = at
	}
	if (text[i] !== ':') return null
	if (key === '') return null
	return { key, rest: text.slice(i + 1) }
}

/**
 * 引号只在**能起一个节点的位置**才算引号——行首，或前一个字符是空白 / `,` / `[` / `{` / `:`。
 * 词中间的撇号（`DESIGN.md §8 Don't`、`it's`）在 YAML 里是普通字符；若把它当引号起点，
 * 后面整行都会被误判成「引号未闭合」，流式集合的 `]` 随之被吞。
 */
function startsToken(s, i) {
	return i === 0 || /[\s,[{:]/.test(s[i - 1])
}

/** ` #` 起注释；引号内的 `#` 不算。这条会截断 `#FAFAFA` 这类未加引号的色值，是刻意保留的行为。 */
function stripComment(s) {
	let out = ''
	let q = null
	for (let i = 0; i < s.length; i++) {
		const c = s[i]
		if (q) {
			out += c
			if (c === '\\' && q === '"') {
				out += s[++i] ?? ''
				continue
			}
			if (c === q) q = null
			continue
		}
		if ((c === '"' || c === "'") && startsToken(s, i)) {
			q = c
			out += c
			continue
		}
		if (c === '#' && (i === 0 || /\s/.test(s[i - 1]))) break
		out += c
	}
	return out
}

function unbalanced(s) {
	let d = 0
	let q = null
	for (let i = 0; i < s.length; i++) {
		const c = s[i]
		if (q) {
			if (c === q) q = null
			continue
		}
		if ((c === '"' || c === "'") && startsToken(s, i)) {
			q = c
			continue
		}
		if (c === '[' || c === '{') d++
		else if (c === ']' || c === '}') d--
	}
	return d > 0
}

/** 单行不完整的流式集合允许续行。 */
function readFlowOrScalar(ctx, first, line) {
	let text = first
	while (unbalanced(text) && ctx.pos < ctx.lines.length) {
		text += ' ' + stripComment(guard(ctx, ctx.lines[ctx.pos]).text).trim()
		ctx.pos++
	}
	return parseFlowOrScalar(ctx, text, line)
}

function parseFlowOrScalar(ctx, text, line) {
	const t = text.trim()
	if (t.startsWith('&') || t.startsWith('*') || t.startsWith('!')) {
		throw new YamlError(ctx.file, line.n, '不支持锚点 / 别名 / 标签；资产 YAML 必须写成平铺形状')
	}
	if (t[0] === '[' || t[0] === '{') {
		const p = { s: t, i: 0, line, ctx }
		const v = flowNode(p)
		skipFlowWs(p)
		if (p.i < p.s.length) throw new YamlError(ctx.file, line.n, '流式集合后有多余内容')
		return v
	}
	return coerceScalar(ctx, t, line)
}

function skipFlowWs(p) {
	while (p.i < p.s.length && /\s/.test(p.s[p.i])) p.i++
}

function flowNode(p) {
	skipFlowWs(p)
	const c = p.s[p.i]
	if (c === '[') {
		p.i++
		const arr = []
		for (;;) {
			skipFlowWs(p)
			if (p.s[p.i] === ']') {
				p.i++
				break
			}
			arr.push(flowNode(p))
			skipFlowWs(p)
			if (p.s[p.i] === ',') {
				p.i++
				continue
			}
			if (p.s[p.i] === ']') {
				p.i++
				break
			}
			throw new YamlError(p.ctx.file, p.line.n, '流式序列缺少 , 或 ]')
		}
		return arr
	}
	if (c === '{') {
		p.i++
		const obj = {}
		for (;;) {
			skipFlowWs(p)
			if (p.s[p.i] === '}') {
				p.i++
				break
			}
			const key = readFlowToken(p, ':,}]')
			skipFlowWs(p)
			if (p.s[p.i] !== ':') throw new YamlError(p.ctx.file, p.line.n, '流式映射缺少 :')
			p.i++
			obj[String(key)] = flowNode(p)
			skipFlowWs(p)
			if (p.s[p.i] === ',') {
				p.i++
				continue
			}
			if (p.s[p.i] === '}') {
				p.i++
				break
			}
			throw new YamlError(p.ctx.file, p.line.n, '流式映射缺少 , 或 }')
		}
		return obj
	}
	return readFlowToken(p, ',}]')
}

function readFlowToken(p, stops) {
	skipFlowWs(p)
	const c = p.s[p.i]
	if (c === '"' || c === "'") {
		let buf = ''
		p.i++
		while (p.i < p.s.length) {
			if (p.s[p.i] === '\\' && c === '"') {
				buf += p.s[p.i + 1] ?? ''
				p.i += 2
				continue
			}
			if (p.s[p.i] === c) {
				p.i++
				break
			}
			buf += p.s[p.i++]
		}
		return buf
	}
	let buf = ''
	while (p.i < p.s.length && !stops.includes(p.s[p.i])) buf += p.s[p.i++]
	return coerceScalar(p.ctx, buf.trim(), p.line)
}

function coerceScalar(ctx, t, line) {
	if (t === '' || t === '~' || /^null$/i.test(t)) return null
	if (/^true$/i.test(t)) return true
	if (/^false$/i.test(t)) return false
	// 数字只认十进制整数与小数（B-27 条 3）：指数 / 十六进制 / `+5` / `.inf` / `.nan` 留作字符串
	if (/^-?\d+$/.test(t)) return Number(t)
	if (/^-?(\d+\.\d*|\.\d+)$/.test(t)) return Number(t)
	if ((t[0] === '"' && t.endsWith('"') && t.length > 1) || (t[0] === "'" && t.endsWith("'") && t.length > 1)) {
		const inner = t.slice(1, -1)
		return t[0] === '"' ? inner.replace(/\\(.)/g, '$1') : inner.replace(/''/g, "'")
	}
	if (t.startsWith('&') || t.startsWith('*') || t.startsWith('!')) {
		throw new YamlError(ctx.file, line.n, '不支持锚点 / 别名 / 标签')
	}
	return t
}

/* ------------------------------------------------------------------ */
/* 自测：`node lib/yaml.mjs --selftest`（并入 `npm run selftest`）      */
/* 覆盖三条「容易咬人」的保留行为 + 不支持项必须抛错 + 常用形状。        */
/* 实测样本集（patterns/ 全部 yaml、holdout.yaml、README 覆盖度节）在    */
/* 构建期物 `.wayfinder/build/s5-yaml-samples.mjs` 里跑，不随包分发。     */
/* ------------------------------------------------------------------ */

function selftest() {
	let pass = 0
	let fail = 0
	const eq = (name, actual, expected) => {
		const a = JSON.stringify(actual)
		const b = JSON.stringify(expected)
		if (a === b) {
			pass++
			process.stdout.write(`PASS ${name}\n`)
		} else {
			fail++
			process.stdout.write(`FAIL ${name}\n     实得 ${a}\n     期望 ${b}\n`)
		}
	}
	const throws = (name, text) => {
		try {
			parseYaml(text, 't.yaml')
			fail++
			process.stdout.write(`FAIL ${name}（应当抛错却解析成功）\n`)
		} catch (err) {
			if (err instanceof YamlError) {
				pass++
				process.stdout.write(`PASS ${name} → ${err.message}\n`)
			} else {
				fail++
				process.stdout.write(`FAIL ${name}（抛的不是 YamlError）：${err.message}\n`)
			}
		}
	}

	eq('块映射 + 嵌套', parseYaml('a: 1\nb:\n  c: x\n'), { a: 1, b: { c: 'x' } })
	eq('块序列（标量项）', parseYaml('xs:\n  - a\n  - b\n'), { xs: ['a', 'b'] })
	eq('块序列与父键同缩进', parseYaml('xs:\n- a\n- b\n'), { xs: ['a', 'b'] })
	eq('序列项是块映射', parseYaml('xs:\n  - name: logo\n    required: true\n  - name: cta\n'), {
		xs: [{ name: 'logo', required: true }, { name: 'cta' }]
	})
	eq('流式集合可嵌套', parseYaml('v: { a: [1, 2], b: { c: x } }\n'), { v: { a: [1, 2], b: { c: 'x' } } })
	eq('流式集合括号不平衡时续行', parseYaml('v: [1,\n  2, 3]\n'), { v: [1, 2, 3] })
	eq('块标量 | 保行', parseYaml('n: |\n  一\n  二\n'), { n: '一\n二\n' })
	eq('块标量 > 折行', parseYaml('n: >\n  一\n  二\n'), { n: '一 二\n' })
	eq('块标量 chomp -', parseYaml('n: |-\n  一\n'), { n: '一' })
	eq('引号标量：双引号反斜杠转义与单引号叠写', parseYaml('a: "x\\"y"\nb: \'it\'\'s\'\n'), { a: 'x"y', b: "it's" })
	eq('引号键', parseYaml('"a b": 1\n'), { 'a b': 1 })
	// 词中间的撇号不是引号起点：否则整行被判「引号未闭合」，流式集合的 `]` 会被吞掉
	eq('词中撇号（Don\'t / it\'s）不当引号', parseYaml("a: [x, DESIGN.md §8 Don't, y]\nb: it's fine\n"), {
		a: ['x', "DESIGN.md §8 Don't", 'y'],
		b: "it's fine"
	})
	eq('值里含 :（URL）', parseYaml('u: https://a.example.com/x?q=1\n'), { u: 'https://a.example.com/x?q=1' })
	eq('null / true / false 不分大小写', parseYaml('a: ~\nb: NULL\nc: True\nd: false\ne:\n'), {
		a: null,
		b: null,
		c: true,
		d: false,
		e: null
	})
	eq('空文档 → {}', parseYaml('# 只有注释\n'), {})
	eq('尾部 ... 可接受', parseYaml('a: 1\n...\n'), { a: 1 })

	// 咬人 1：plain 标量里 ` #` 起注释，会截断未加引号的色值；引号内的 `#` 保留
	eq('咬人 1 · plain 标量 ` #` 截断（故色值必须加引号）', parseYaml('a: 不要用 #FAFAFA 底\nb: "#FAFAFA"\nc: "a # b"\n'), {
		a: '不要用',
		b: '#FAFAFA',
		c: 'a # b'
	})
	eq('咬人 1 · 序列项同样截断', parseYaml('xs:\n  - 不要用 #FAFAFA\n'), { xs: ['不要用'] })
	// 咬人 2：重复键后写覆盖先写，不报错
	eq('咬人 2 · 重复键后写覆盖', parseYaml('a: 1\na: 2\n'), { a: 2 })
	// 咬人 3：数字只认十进制整数与小数
	eq('咬人 3 · 十进制整数与小数是 number', parseYaml('a: 12\nb: -3\nc: 2.5\nd: .5\n'), { a: 12, b: -3, c: 2.5, d: 0.5 })
	eq('咬人 3 · 其余数字形态留字符串', parseYaml('a: 0x1F\nb: 1e3\nc: +5\nd: .inf\ne: .nan\n'), {
		a: '0x1F',
		b: '1e3',
		c: '+5',
		d: '.inf',
		e: '.nan'
	})

	throws('抛错 · 锚点', 'a: &base 1\n')
	throws('抛错 · 别名', 'a: *base\n')
	throws('抛错 · 合并键（走进别名判定）', 'a:\n  <<: *base\n')
	throws('抛错 · 标签', 'a: !!str 1\n')
	throws('抛错 · 多文档', 'a: 1\n---\nb: 2\n')
	throws('抛错 · 制表符缩进', 'a:\n\tb: 1\n')
	throws('抛错 · 多行 plain 标量（要多行必须用 > 或 |）', 'a: 一\n  二\n')
	throws('抛错 · 不是 key: value', 'a: 1\n光秃秃一行\n')
	throws('抛错 · 流式集合后有多余内容', 'a: [1, 2] 尾巴\n')

	process.stdout.write(`yaml 自测：${pass}/${pass + fail} 通过\n`)
	return fail === 0
}

if (process.argv[1] && import.meta.filename === path.resolve(process.argv[1])) {
	if (process.argv.includes('--selftest')) process.exit(selftest() ? 0 : 1)
	process.stdout.write('用法：node lib/yaml.mjs --selftest\n')
	process.exit(2)
}
