#!/usr/bin/env node
/**
 * 选型素材：本资产有哪些骨架型、哪些 taxonomy 曾同页出现、两套闭集分别是什么。
 *
 *   node scripts/sequence-sources.mjs --asset <资产目录> [--want hero,pricing] [--json]
 *
 * 为什么共现要脚本算：它是「10 页两两配对」这种一眼看不出、且看错了不会报错的数。骨架型
 * 装不装得下也一样——「装不下」必须是有据可查的一步，否则回退就成了「选型选累了」。
 *
 * 选型本身不在这里。哪一型对得上目标页，是语义判断，脚本不替它做；本脚本只把判断所需的
 * 事实摊开。同理，本脚本不产出序列，也不判合法性——那是 `lint-outline.mjs` 的事。
 */

import { pathToFileURL } from 'node:url'
import { readOutlineSources, cooccurrence, coCount, matchSkeletons, sequenceFromCooccurrence, OutlineError } from './lib/outline.mjs'

const opt = (argv, flag) => {
	const i = argv.indexOf(flag)
	return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : null
}

const list = (raw) =>
	(raw || '')
		.split(',')
		.map((s) => s.trim())
		.filter(Boolean)

export function sequenceSources(assetDir, want = []) {
	const sources = readOutlineSources(assetDir)
	const stats = cooccurrence(sources.pages)
	const content = [...sources.content]
	return {
		styleSetId: sources.styleSetId,
		vocabulary: [...sources.vocabulary].sort(),
		available: [...sources.available].sort(),
		content: content.sort(),
		pages: sources.pages,
		skeletons: matchSkeletons(sources.skeletons, want),
		cooccurrence: {
			pageCount: stats.pageCount,
			weak: stats.pageCount < 3,
			pairs: content
				.flatMap((a, i) => content.slice(i + 1).map((b) => ({ a, b, n: coCount(stats, a, b) })))
				.filter((p) => p.n > 0)
				.sort((x, y) => y.n - x.n),
			position: [...stats.position].map(([taxonomy, at]) => ({ taxonomy, at: Number(at.toFixed(3)) })).sort((x, y) => x.at - y.at),
		},
		fallback: want.length ? sequenceFromCooccurrence(stats, { seed: want.filter((t) => sources.content.has(t)), content: sources.content }) : null,
	}
}

function main(argv) {
	const assetDir = opt(argv, '--asset')
	if (!assetDir) {
		console.error('用法：node scripts/sequence-sources.mjs --asset <资产目录> [--want hero,pricing] [--json]')
		process.exit(1)
	}
	let out
	try {
		out = sequenceSources(assetDir, list(opt(argv, '--want')))
	} catch (e) {
		console.error(e instanceof OutlineError ? `[${e.code}] ${e.message}` : String(e?.message ?? e))
		process.exit(1)
	}

	if (argv.includes('--json')) {
		console.log(JSON.stringify(out, null, 2))
		return
	}

	console.log(`资产 ${out.styleSetId}：词表闭集 ${out.vocabulary.length} 词 / 有型可用 ${out.available.length} 类 / 其中内容楼层 ${out.content.length} 类`)
	console.log(`  有型可用：${out.available.join(' ')}`)
	console.log(`  内容楼层：${out.content.join(' ')}（顶栏页脚这类按资产的 chrome 挂载自动补，不进序列）`)

	console.log(`\n骨架型 ${out.skeletons.length} 型：`)
	for (const sk of out.skeletons) {
		const steps = sk.steps.map((s) => `${s.taxonomy}×${s.repeat?.min}-${s.repeat?.max}`).join(' → ')
		const verdict = sk.missing.length ? `装不下：${sk.missing.join(' ')} 不在本型 steps 里` : '装得下'
		console.log(`  ${sk.id}（${sk.labelZh}，confidence ${sk.confidence}）${steps ? ` ${steps}` : ''}\n      ${verdict}`)
	}

	const co = out.cooccurrence
	console.log(`\n共现统计（${co.pageCount} 页${co.weak ? '，页数不够，两两计数排不出高低，只能当弱证据' : ''}）：`)
	for (const p of co.pairs) console.log(`  ${p.a} + ${p.b}：${p.n} 页同现`)
	console.log(`  平均序位：${co.position.map((p) => p.taxonomy).join(' → ')}`)

	if (out.fallback) {
		console.log(`\n共现回退提案：${out.fallback.taxonomies.join(' → ')}${out.fallback.weak ? '（弱证据，拍板时留意）' : ''}`)
	}
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
	main(process.argv.slice(2))
}
