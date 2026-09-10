#!/usr/bin/env node
/**
 * 准入校验：拿不出一份合格资产，就不许开工。
 *
 *   node scripts/admit-asset.mjs <资产目录> [--json]
 *
 * 这是防跳步的**物理手段**，不是一条纪律。生成侧最容易出的事故不是写错色值，而是压根
 * 没有资产就开始「凭感觉照着做」——产物看着像那么回事，但没有任何一处能追溯到观测。
 * 所以把「有没有资产」变成一次退出码，而不是一句自述。
 *
 * 三种结论，动作互斥：
 *
 * | verdict | 什么情况 | nextAction |
 * | --- | --- | --- |
 * | `ok` | 必交件齐全且闭集读得开 | 可以开工 |
 * | `absent` | 目录不存在，或存在但没有 `README.md` | `chain-extract`：自动串采集，开跑前一句话告知，不等确认 |
 * | `incomplete` | 有 `README.md` 但缺别的必交件 | `reject`：这是一份坏资产，不是没资产，重采会盖掉人拥有的输入 |
 *
 * `absent` 与 `incomplete` 的区别很重要：前者是空手，补齐的办法是去采；后者是残件，
 * 直接重采可能盖掉 `holdout.yaml` / `site-overrides.yaml` 这类人拥有的输入。
 *
 * 退出码只有 0 / 1。不给 `absent` 单开一个 `2`：`2` 在采集侧校验器里是「仅报警、可交付」，
 * 同一个数字在相邻的包里表示相反的意思，被误读一次的代价是「没有资产也开工了」。
 * 凡非 0 一律不许直接生成，误读的方向因此永远是安全的那一侧。
 */

import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { loadClosedSet, ClosedSetError } from './lib/closed-set.mjs'

/**
 * 必交件清单。取自资产契约 §1 的「必交 = 是」那几行。
 *
 * 有意**不含** `screenshots/index.json` 与 `screenshots/.gitignore`：契约把它们标成
 * 「有采集运行才有」。一份手写或冻结的资产没有采集运行，照样是合格资产。
 *
 * 也有意**不查 `README.md` 的内容**——契约要求采集产出的 README 带「无脚本时人工核
 * 哪几条」一节，但那是对采集侧的要求。准入只问「入口在不在」，把它升级成查节，会让
 * 一切非采集产出的合格资产（包括本包行为 eval 用的冻结 fixture）当场被拒。
 *
 * `layout-envelope.json`（契约 §7.3）自 `R4-10` 起在列。它的三个消费方全部就位——门
 * `layout-envelope`（§4.3）、验证侧布局表、合成型身份的型级四维——**缺它就有三处判据集合
 * 静默变空**，而「少判一维」在报告里与「判过了没事」长得一样。
 *
 * 不是死锁：缺席的修法是在采集侧补投影一次（`node scripts/build-envelope.mjs --asset-dir
 * <资产目录>`，从 `patterns/` 直算、不起浏览器、不碰人拥有的输入），**不是重采**。所以
 * `incomplete` → `reject`「不许自动串采集」这条依然对，且不构成「修法被同一条规则拦住」。
 */
export const REQUIRED_FILES = [
	'README.md',
	'DESIGN.md',
	'tokens.json',
	'voice.md',
	'patterns/index.yaml',
	'patterns/chrome.yaml',
	'closed-set.json',
	'floor-index.json',
	'layout-envelope.json',
]

/** `README.md` 是「这里有一份资产」的路标；没有它，目录里有什么都不算资产。 */
const ENTRY_FILE = 'README.md'

export function admitAsset(assetDir) {
	const root = path.resolve(assetDir)
	const exists = fs.existsSync(root) && fs.statSync(root).isDirectory()
	if (!exists) {
		return { verdict: 'absent', nextAction: 'chain-extract', assetDir: root, missing: [...REQUIRED_FILES], reason: '资产目录不存在' }
	}
	if (!fs.existsSync(path.join(root, ENTRY_FILE))) {
		const missing = REQUIRED_FILES.filter((f) => !fs.existsSync(path.join(root, f)))
		return { verdict: 'absent', nextAction: 'chain-extract', assetDir: root, missing, reason: `目录存在但没有 ${ENTRY_FILE}，一律视为无资产` }
	}

	const missing = REQUIRED_FILES.filter((f) => !fs.existsSync(path.join(root, f)))
	if (missing.length) {
		return { verdict: 'incomplete', nextAction: 'reject', assetDir: root, missing, reason: `资产残缺，缺 ${missing.length} 份必交件` }
	}

	// 闭集是生成侧认识变量名的唯一途径，读不开就等于没有资产可用。
	try {
		const closedSet = loadClosedSet(root)
		return {
			verdict: 'ok',
			nextAction: 'generate',
			assetDir: root,
			missing: [],
			styleSetId: closedSet.styleSetId,
			tokenCount: closedSet.entries.length,
			reason: '必交件齐全，闭集可读',
		}
	} catch (e) {
		if (!(e instanceof ClosedSetError)) throw e
		return { verdict: 'incomplete', nextAction: 'reject', assetDir: root, missing: [], code: e.code, reason: e.message }
	}
}

function main(argv) {
	const json = argv.includes('--json')
	const positional = argv.filter((a) => !a.startsWith('--'))
	if (positional.length !== 1) {
		console.error('用法：node scripts/admit-asset.mjs <资产目录> [--json]')
		process.exit(1)
	}
	const result = admitAsset(positional[0])
	if (json) {
		console.log(JSON.stringify(result, null, 2))
	} else {
		console.log(`准入结论：${result.verdict}（下一步：${result.nextAction}）`)
		console.log(`理由：${result.reason}`)
		if (result.missing?.length) console.log(`缺件：\n${result.missing.map((f) => `  - ${f}`).join('\n')}`)
		if (result.verdict === 'ok') console.log(`style-set-id：${result.styleSetId} · 闭集 ${result.tokenCount} 条`)
	}
	process.exit(result.verdict === 'ok' ? 0 : 1)
}

// 被 import 时不跑 main：测试要直接调 `admitAsset()` 拿结构化结论，而不是去解析 stdout。
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
	main(process.argv.slice(2))
}
