/**
 * 两道扫源码的形状门。它们守的不是「有人存心绕」，而是「下一个人顺手写了」。
 *
 * 射程必须写清楚，否则会误伤正当重构（这类门被复核点过名）：
 *
 * - 本模块只钉**两个具体动作**：从 core 引入变量名派生函数、以及用字符串拼 `--` 开头的
 *   名字。除此之外不管调用形态、不管形参怎么起名、不管函数拆几层。
 * - 一个存心要绕的人当然能拆开写：`String.fromCharCode(45, 45)`、`'-' + '-' + name`。
 *   两种都抓不住，也不打算抓。这道门的价值在于：**改动发生的那一刻就红**，而不是等到
 *   生成页白底了才发现。
 *
 * 扫描射程只到 `.mjs`：`SKILL.md` 与 `references/` 不进射程。那里写的是判据本身，举反例是
 * 它的职责，扫它等于禁止把纪律讲清楚。所以「文档里出现派生写法」这道门管不着，也不该管。
 * 同理排除 `vendor/`（core 的副本，派生函数本来就住在那里）与 `tests/`（测试必须把被禁的
 * 写法作为输入写进断言）。
 */

import fs from 'node:fs'
import path from 'node:path'

const EXCLUDED_DIRS = new Set(['node_modules', 'vendor', 'tests'])

/** 收一个目录下的 `.mjs`，跳过 `EXCLUDED_DIRS`。 */
export function collectSourceFiles(dir) {
	const out = []
	let entries
	try {
		entries = fs.readdirSync(dir, { withFileTypes: true })
	} catch {
		return out
	}
	for (const e of entries) {
		const full = path.join(dir, e.name)
		if (e.isDirectory()) {
			if (EXCLUDED_DIRS.has(e.name)) continue
			out.push(...collectSourceFiles(full))
		} else if (e.name.endsWith('.mjs')) out.push(full)
	}
	return out
}

/**
 * `/` 是不是正则字面量的开头，按前一个有意义的字符猜。
 *
 * 只能猜：`a / b` 和 `/ab/` 在字符流层面同形，分清它们要一个真词法器。这套「前一个字符是
 * 运算符或开括号就当正则」是 JS 高亮器的通用启发，误判方向也安全——把除法当正则最多多留
 * 几个字符在代码行里，而反过来（把正则当除法）会让正则里的 `//` 触发截断，那是假阴性。
 */
const REGEX_PRECEDERS = new Set([null, '(', ',', '=', ':', '[', '!', '&', '|', '?', '{', '}', ';', '+', '-', '*', '%', '~', '^', '<', '>'])
const startsRegex = (prev, code) => REGEX_PRECEDERS.has(prev) || /\b(?:return|typeof|case|in|of|new|delete|void|do|else|yield|await)\s*$/.test(code)

/**
 * 逐行抠出代码部分，注释一律清空，行号保持不变。
 *
 * 门守的是代码，不是散文。而讲清楚「为什么不许派生变量名」这件事，必然要在注释里写出
 * 被禁的那个函数名——扫注释会让「解释这条纪律」本身变成违反它，于是下一个人的选择就成了
 * 「删掉解释」而不是「遵守纪律」。这是形状门最典型的自伤方式。
 *
 * 所以三种注释形态都得抠掉，包括行尾的和跨行的（块注释状态因此要跨行携带）。另一头也得
 * 守住：见到第一个 `//` 就截断，会把「字符串里的 URL」「正则里的 `\/\/`」后面真正的违规连带
 * 抹掉，那是静默的假阴性，比误伤更坏。所以引号内与正则字面量内的内容原样留着——两道门的
 * 判据本来就要在字符串里匹配。
 *
 * 剩一处已知盲区：**跨行**模板串。引号状态不跨行携带，于是跨行模板里以 `//` 打头的那一行会
 * 被当成注释清空。本包没有这种写法，为它引一个 JS 词法器不值得；写进这里，是为了让下一个
 * 人知道盲区在哪，而不是让他以为这函数是个完整的词法器。
 */
export function codeLines(text) {
	const out = []
	let inBlock = false
	for (const line of text.split(/\r?\n/)) {
		let code = ''
		let quote = null
		let prev = null
		for (let i = 0; i < line.length; i++) {
			const c = line[i]
			if (inBlock) {
				if (c === '*' && line[i + 1] === '/') {
					inBlock = false
					i++
				}
				continue
			}
			if (quote) {
				code += c
				if (c === '\\') {
					code += line[i + 1] ?? ''
					i++
				} else if (c === quote) quote = null
				continue
			}
			if (c === '"' || c === "'" || c === '`') {
				quote = c
				code += c
				prev = c
				continue
			}
			if (c === '/' && line[i + 1] === '*') {
				inBlock = true
				i++
				continue
			}
			if (c === '/' && startsRegex(prev, code)) {
				const end = regexLiteralEnd(line, i)
				if (end > 0) {
					code += line.slice(i, end + 1)
					prev = '/'
					i = end
					continue
				}
			}
			if (c === '/' && line[i + 1] === '/') break
			code += c
			if (!/\s/.test(c)) prev = c
		}
		out.push(code)
	}
	return out
}

/** 正则字面量的收尾 `/` 下标；同一行内没闭合就返回 `-1`。字符类里的 `/` 不算收尾。 */
function regexLiteralEnd(line, start) {
	let inClass = false
	for (let j = start + 1; j < line.length; j++) {
		const c = line[j]
		if (c === '\\') {
			j++
			continue
		}
		if (inClass) {
			if (c === ']') inClass = false
			continue
		}
		if (c === '[') inClass = true
		else if (c === '/') return j
	}
	return -1
}

/**
 * 形状门一：生成侧不得自行派生 CSS 变量名。
 *
 * 派生规则只有一两行，但它是每次都可能算错一遍的一两行，而算错是静默的——生成侧写出的
 * 名字与 page-theme-audit 查的对不上，两边都不报错，页面白底。所以真相源只有 `closed-set.json`，
 * 派生函数属于采集侧（它负责**造**那张表），生成侧只许查。
 */
export function findVarDerivation(dir) {
	const violations = []
	for (const file of collectSourceFiles(dir)) {
		codeLines(fs.readFileSync(file, 'utf8')).forEach((line, i) => {
			const at = { file, line: i + 1, source: line.trim() }
			if (/\btokenPathToCssVar\b/.test(line)) {
				violations.push({ ...at, code: 'imports-derivation', reason: '引入了 core 的变量名派生函数：那是采集侧造表用的，生成侧只许查 closed-set.json' })
			}
			if (/`--\$\{/.test(line) || /['"]--['"]\s*\+/.test(line)) {
				violations.push({ ...at, code: 'builds-var-name', reason: '在用字符串拼 `--` 开头的变量名：变量名一律取 closed-set.json 的 cssVar / aliasVar 列' })
			}
		})
	}
	return violations
}

/**
 * 形状门二：无运行时依赖。
 *
 * 这条不是洁癖。风格资产的卖点是「可迁移到别的仓库」，而一份需要 npm install 才能跑门的
 * skill，搬过去的第一天门就是关的——最坏的失效方式，因为它看起来仍在。
 */
export function findRuntimeDependencies(dir) {
	const violations = []
	for (const file of collectSourceFiles(dir)) {
		codeLines(fs.readFileSync(file, 'utf8')).forEach((line, i) => {
			for (const m of line.matchAll(/(?:^\s*import\s[^'"]*from\s*|^\s*import\s*|\bimport\(\s*|\brequire\(\s*)['"]([^'"]+)['"]/g)) {
				const spec = m[1]
				if (spec.startsWith('.') || spec.startsWith('/') || spec.startsWith('node:')) continue
				violations.push({ file, line: i + 1, specifier: spec, source: line.trim(), code: 'runtime-dependency', reason: `引入了第三方包 \`${spec}\`：本包必须零运行时依赖，否则资产搬到未装依赖的仓库后门静默失效` })
			}
		})
	}
	return violations
}
