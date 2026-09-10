/**
 * 合成型身份（`synth:` 前缀）的共享识别与资产卫生扫描。
 *
 * 合成型不在 `floor-index.json` 的 `floors[]` 里，也不该写进 `patterns/`——写进去会被
 * 下一轮投影进包络，编出来的几何变成「观测证据」。继承源校验在 `responsive-inherit.mjs`；
 * 本文件只收识别、taxonomy 解析与 patterns/ 机检。
 */

import fs from 'node:fs'
import path from 'node:path'

export const SYNTH_PREFIX = 'synth:'
export const BREAKPOINTS = ['pc', 'tablet', 'mobile']

/** 型 id 是否带合成型前缀（大小写不敏感）。 */
export const isSynthPattern = (id) => typeof id === 'string' && /^synth:/i.test(id)

/** 剥掉前缀后的裸 id，如 `pricing.table-3`。 */
export const bareSynthId = (id) => String(id).replace(/^synth:/i, '')

/** 从型 id 取 taxonomy 段（合成型先剥前缀）。 */
export const taxonomyFromPatternId = (id) => {
	const bare = isSynthPattern(id) ? bareSynthId(id) : String(id)
	const dot = bare.indexOf('.')
	return dot < 0 ? bare : bare.slice(0, dot)
}

/** `inheritFrom` 是否是合成型要求的 `{ pattern, breakpoint }` 对象。 */
export const isInheritFromSource = (value) =>
	value !== null && typeof value === 'object' && !Array.isArray(value) && typeof value.pattern === 'string' && typeof value.breakpoint === 'string'

/** 合成型视为三档全无实测。 */
export const synthUnobservedBreakpoints = () => new Set(BREAKPOINTS)

/** 三档各指一条 `{ pattern, breakpoint }` 的合格声明（测试与夹具复用）。 */
export const synthInheritAllFrom = (pattern) =>
	BREAKPOINTS.map((breakpoint) => ({
		breakpoint,
		inheritFrom: { pattern, breakpoint },
	}))

/**
 * 扫描资产 `patterns/`：文件名或 yaml 内出现 `synth:` 即违规（合成型不得写回资产）。
 * 投影脚本不区分采来的与人写的，只能靠「不许出现在 patterns/」这一条机检落点。
 */
export function findSynthInPatterns(assetDir) {
	const dir = path.join(assetDir, 'patterns')
	const out = []
	let names
	try {
		names = fs.readdirSync(dir)
	} catch {
		return out
	}
	for (const name of names) {
		if (/synth:/i.test(name)) {
			out.push({ file: `patterns/${name}`, reason: '文件名含 synth: 前缀：合成型不得写进 patterns/' })
			continue
		}
		if (!name.endsWith('.yaml') && !name.endsWith('.yml')) continue
		const rel = `patterns/${name}`
		let text
		try {
			text = fs.readFileSync(path.join(dir, name), 'utf8')
		} catch {
			continue
		}
		if (/synth:[A-Za-z0-9_.-]+/i.test(text)) {
			out.push({ file: rel, reason: 'yaml 内容含 synth: 型 id：合成型不得写进 patterns/' })
		}
	}
	return out
}
