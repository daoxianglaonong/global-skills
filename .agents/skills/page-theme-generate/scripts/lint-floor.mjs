#!/usr/bin/env node
/**
 * 楼层自检门：一份产出的楼层（HTML 片段 + 可选 CSS + 可选 trace）过不过十二道门。
 *
 *   node scripts/lint-floor.mjs --asset <资产目录> --html <楼层.html>
 *        [--css a.css,b.css] [--trace generate-trace.json] [--json]
 *
 * 前六道门的函数体在 `lib/gates.mjs`（audit 逐字锁着）；门七 `sequence-approval` 也在
 * `gates.mjs`；门八 `paint-consistency`、门九 `variant-lock`、门十 `responsive-inheritance`
 * 判据外拆，各留薄壳；门十一 `type-literal` 借非色表的抽取器，也在 `gates.mjs`；门十二
 * `layout-envelope` 判据在 `lib/layout-envelope-gate.mjs`，**那一份与 audit 逐字节相同**。
 * 本文件只负责「把文件读进来、把结论打出去」。两件事分开，是为了让每道门的失败用例能
 * 直接喂声明数组，不必每次现造一份磁盘上的 HTML。
 *
 * **旗标一个都不新增**：包络那道门的判据阈值不许升成 CLI 参数——门要么按资产里的规律判，
 * 要么不判，不存在「这次放宽一点」的入口。
 *
 * 退出码：`0` 全绿 / `1` 有阻断。十二道门**没有报警档**——它们判的都是可证伪的事实（这一处
 * 到底用了什么、这条序列声明过没有），不是程度问题。程度问题在大纲那一族，见 `lint-outline.mjs`。
 *
 * 自检门不是 page-theme-audit。它只回答「这份产物在语法层面有没有背叛资产」，不回答「像不像
 * 那个站」。后者归 page-theme-audit，且那一侧有意不接收本侧的任何过程叙述。
 */

import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { scanArtifact } from './lib/css-scan.mjs'
import { loadClosedSet } from './lib/closed-set.mjs'
import { runAllGates } from './lib/gates.mjs'
import { admitAsset } from './admit-asset.mjs'

/**
 * 对一份已在内存里的产物跑全部门。
 *
 * 接受内存输入而不是只接受路径，是因为门的失败用例需要「与合格产物只差一处」的输入；
 * 逐个在磁盘上摆一份近乎相同的 HTML，改判据时会有一半忘了同步。
 */
export function lintFloor({ assetDir, html = '', htmlFile = '<html>', css = [], trace = null }) {
	const admission = admitAsset(assetDir)
	if (admission.verdict !== 'ok') {
		return {
			verdict: 'blocked',
			admission,
			findings: [{ gate: 'asset-admission', level: 'block', reason: `资产未通过准入（${admission.verdict}）：${admission.reason}`, nextAction: admission.nextAction }],
		}
	}
	const closedSet = loadClosedSet(admission.assetDir)
	const { declarations } = scanArtifact({ html, htmlFile, css })
	const findings = runAllGates({ declarations, closedSet, trace, assetDir: admission.assetDir, html, css, htmlFile })
	return {
		verdict: findings.length ? 'blocked' : 'pass',
		admission,
		styleSetId: closedSet.styleSetId,
		declarationCount: declarations.length,
		findings,
	}
}

/**
 * 取一个带值的开关。收的是完整旗标（`'--asset'`）而不是名字片段，因为拼旗标要写
 * `` `--${name}` ``，而本包有一道形状门专门禁止用字符串拼 `--` 开头的名字——那道门分不清
 * 你拼的是 CLI 旗标还是 CSS 变量名，也不该分。与其给门开个例外，不如不写那个形状。
 */
const opt = (argv, flag) => {
	const i = argv.indexOf(flag)
	return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : null
}

function main(argv) {
	const assetDir = opt(argv, '--asset')
	const htmlFile = opt(argv, '--html')
	if (!assetDir || !htmlFile) {
		console.error('用法：node scripts/lint-floor.mjs --asset <资产目录> --html <楼层.html> [--css a.css,b.css] [--trace t.json] [--json]')
		process.exit(1)
	}
	if (!fs.existsSync(htmlFile)) {
		console.error(`楼层产物不存在：${htmlFile}`)
		process.exit(1)
	}
	const cssPaths = (opt(argv, '--css') || '')
		.split(',')
		.map((s) => s.trim())
		.filter(Boolean)
	for (const f of cssPaths) {
		if (!fs.existsSync(f)) {
			console.error(`CSS 不存在：${f}`)
			process.exit(1)
		}
	}
	const tracePath = opt(argv, '--trace')

	const result = lintFloor({
		assetDir,
		html: fs.readFileSync(htmlFile, 'utf8'),
		htmlFile,
		css: cssPaths.map((f) => ({ file: f, text: fs.readFileSync(f, 'utf8') })),
		trace: tracePath ? JSON.parse(fs.readFileSync(tracePath, 'utf8')) : null,
	})

	if (argv.includes('--json')) {
		console.log(JSON.stringify(result, null, 2))
	} else {
		console.log(`自检门：${result.verdict}（${result.findings.length} 条阻断 / 扫了 ${result.declarationCount ?? 0} 条声明）`)
		for (const f of result.findings) {
			const at = [f.file && path.basename(f.file), f.selector, f.prop, f.floor, f.field].filter(Boolean).join(' · ')
			console.log(`  [${f.gate}] ${at}${at ? ' → ' : ''}${f.var ?? f.value ?? f.image ?? ''}`)
			console.log(`      ${f.reason}`)
		}
	}
	process.exit(result.verdict === 'pass' ? 0 : 1)
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
	main(process.argv.slice(2))
}
