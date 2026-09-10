/**
 * 闭集查表：生成侧认识 CSS 变量名的**唯一**途径。
 *
 * 资产契约那句「下游一律查本表，不得再自行派生变量名」不是风格偏好，是防一类静默事故：
 * 派生规则只有一两行，但它是**每次都可能算错一遍**的一两行，而算错不报错——生成侧写出
 * 的变量名与 page-theme-audit 查的对不上，两边都绿，页面直接白底。所以本包不 import core 的
 * `tokenPathToCssVar`，也不自己拼 `--` 前缀；要变量名就查 `closed-set.json` 的 `cssVar`。
 *
 * 这条纪律另有一道扫源码的形状门守着（`source-shape.mjs`），本模块是它唯一放行的出口。
 */

import fs from 'node:fs'
import path from 'node:path'

export class ClosedSetError extends Error {
	constructor(code, message) {
		super(message)
		this.name = 'ClosedSetError'
		this.code = code
	}
}

/**
 * 读一份资产的闭集快照，建两张索引。
 *
 * `byVar` 收 `cssVar` **与** `aliasVar` 两列：alias 行的生成写法是 `var(--aliasVar)`
 * （契约 §7.1——写的是别名的变量名，不是把链尾 hex 拍进去），所以 `aliasVar` 同样是
 * 产物里会真实出现的合法名字，漏收它会把正当引用判成违例。
 */
export function loadClosedSet(assetDir) {
	const file = path.join(assetDir, 'closed-set.json')
	let raw
	try {
		raw = fs.readFileSync(file, 'utf8')
	} catch {
		throw new ClosedSetError('closed-set-missing', `资产缺 closed-set.json：${file}`)
	}
	let doc
	try {
		doc = JSON.parse(raw)
	} catch (e) {
		throw new ClosedSetError('closed-set-unparseable', `closed-set.json 解不开：${e.message}`)
	}
	if (!doc || !Array.isArray(doc.entries)) {
		throw new ClosedSetError('closed-set-shape', 'closed-set.json 缺 entries 数组')
	}

	const byVar = new Map()
	for (const entry of doc.entries) {
		if (!entry || typeof entry.cssVar !== 'string' || typeof entry.path !== 'string') {
			throw new ClosedSetError('closed-set-shape', 'closed-set.json 存在缺 path / cssVar 的条目')
		}
		if (!byVar.has(entry.cssVar)) byVar.set(entry.cssVar, entry)
		// alias 目标的变量名也合法，但它指向的是**被别名的那一条**，不覆盖本名条目。
		if (typeof entry.aliasVar === 'string' && !byVar.has(entry.aliasVar)) byVar.set(entry.aliasVar, entry)
	}

	return {
		styleSetId: doc.styleSetId ?? path.basename(path.resolve(assetDir)),
		entries: doc.entries,
		byVar,
		/** 这份资产里到底有没有这个变量名。门只问这一句。 */
		has: (name) => byVar.has(name),
	}
}

/**
 * 从一个 CSS 值里抽出所有被引用的变量名。
 *
 * 必须自己抽而不能把整串丢给 core 的 `classifyCssVar`：那个函数只剥**一层**最外层
 * `var(`，遇到 fallback（`var(--a, #fff)`）或一值两引（`var(--a) var(--b)`）会把逗号
 * 后面的残串当成名字的一部分切，判出来的 layer 是假的。这里只认 `--` 开头到分隔符为止
 * 的那一段，fallback 里的嵌套 `var()` 会被同一条正则各自命中，正是想要的结果。
 */
export function varReferences(value) {
	return [...String(value).matchAll(/var\(\s*(--[A-Za-z0-9_-]+)/g)].map((m) => m[1])
}
