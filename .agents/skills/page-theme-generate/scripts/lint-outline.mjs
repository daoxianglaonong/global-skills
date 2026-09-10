#!/usr/bin/env node
/**
 * 把一条序列摊成可拍板的三列大纲，并当场过大纲阶段的门。
 *
 *   node scripts/lint-outline.mjs --asset <资产目录> --steps <序列.json> [--json]
 *
 * 出大纲与判大纲是同一趟：三列（型 id / 中文标签 / 关键内容点）全部从资产查出来，所以
 * 「三列齐全」是结构保证而不是纪律——填不出中文标签只有一种原因，那个型不在资产里，而那
 * 件事同一趟就被挡下。
 *
 * `--steps` 收的 JSON：
 *
 *     { "skeleton": "sk-landing" | null,
 *       "steps": [ { "pattern": "hero.centered-pitch" },
 *                  { "taxonomy": "pricing", "gapReason": "本资产无此型，按形态缺口处理" } ] }
 *
 * 退出码：`0` 无阻断 / `1` 有阻断。**提示不影响退出码**：它们是程度问题，交拍板的人裁。
 * 判据一律在 `lib/outline.mjs`，本文件只负责读文件、印表、给退出码。
 */

import fs from 'node:fs'
import { pathToFileURL } from 'node:url'
import { readOutlineSources, checkOutline, OutlineError } from './lib/outline.mjs'

const opt = (argv, flag) => {
	const i = argv.indexOf(flag)
	return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : null
}

export function lintOutline({ assetDir, steps, skeleton = null }) {
	const sources = readOutlineSources(assetDir)
	const result = checkOutline({ sources, steps, skeleton })
	return { styleSetId: sources.styleSetId, skeleton, verdict: result.blocking.length ? 'blocked' : 'pass', ...result }
}

/** 大纲本身就是交付物，所以印成 markdown 表——拍板的人要读它，不是读 JSON。 */
function printOutline(rows) {
	console.log('| # | 型 | 中文标签 | 关键内容点 |')
	console.log('| --- | --- | --- | --- |')
	for (const r of rows) {
		const pattern = r.pattern ?? `（缺口：${r.taxonomy}）`
		console.log(`| ${r.at} | ${pattern} | ${r.labelZh ?? '—'} | ${r.keyPoints ?? '—'} |`)
	}
}

function main(argv) {
	const assetDir = opt(argv, '--asset')
	const stepsFile = opt(argv, '--steps')
	if (!assetDir || !stepsFile) {
		console.error('用法：node scripts/lint-outline.mjs --asset <资产目录> --steps <序列.json> [--json]')
		process.exit(1)
	}

	let input
	try {
		input = JSON.parse(fs.readFileSync(stepsFile, 'utf8'))
	} catch (e) {
		console.error(`读不出序列输入 ${stepsFile}：${e.message}`)
		process.exit(1)
	}
	if (!Array.isArray(input.steps) || !input.steps.length) {
		console.error('序列输入里 `steps` 必须是非空数组')
		process.exit(1)
	}

	let result
	try {
		result = lintOutline({ assetDir, steps: input.steps, skeleton: input.skeleton ?? null })
	} catch (e) {
		console.error(e instanceof OutlineError ? `[${e.code}] ${e.message}` : String(e?.message ?? e))
		process.exit(1)
	}

	if (argv.includes('--json')) {
		console.log(JSON.stringify(result, null, 2))
	} else {
		printOutline(result.outline)
		if (result.gaps.length) {
			console.log(`\n形态缺口 ${result.gaps.length} 处（不阻断，但会跟着产物往下走）：`)
			for (const g of result.gaps) console.log(`  第 ${g.at} 步 ${g.taxonomy}：${g.reason}`)
		}
		if (result.hints.length) {
			console.log(`\n形状提示 ${result.hints.length} 条（不影响退出码，拍板时看一眼）：`)
			for (const h of result.hints) console.log(`  [${h.code}] ${h.reason}`)
		}
		console.log(`\n大纲门：${result.verdict}（${result.blocking.length} 条阻断）`)
		for (const b of result.blocking) console.log(`  [${b.code}] ${b.reason}`)
		if (result.verdict === 'pass') console.log('\n下一步：把这张表给用户拍板。拍板后 trace 里记 `sequence.approvedBy: "user"` 与被拍板的 steps，否则出页时门七（sequence-approval）会挡。')
	}
	process.exit(result.verdict === 'pass' ? 0 : 1)
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
	main(process.argv.slice(2))
}
