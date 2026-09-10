#!/usr/bin/env node
/**
 * 对一份产物跑十道门，只出结论，一个字都不改产物。
 *
 *   node scripts/lint-artifact.mjs --asset <资产目录> --artifact <文件或目录>
 *        [--trace <generate-trace.json>] [--json <输出路径>]
 *
 * `--asset` 必给，缺了硬失败。十道门恒跑，`gates[]` 十行恒在；某道门没有输入时写
 * `status: "no-input"` 而不是 `findings: 0`。退出码只有 0 / 1，不用 2。
 *
 * **旗标一个都不新增**：第十道门读的是资产里的 `layout-envelope.json`，它的判据阈值不许升成
 * CLI 参数——门要么按资产里的规律判，要么不判，不存在「这次放宽一点」的入口。
 *
 * 不读生成侧自由文本。trace 走白名单。成功态报告含 `trace`（白名单读面；未给则为
 * `null`）。前置失败的 `precheck` 带 `nextAction`。输出不含时间戳、耗时、随机 id。
 */

import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { scanCss, scanHtml } from './lib/css-scan.mjs'
import { loadClosedSet } from './lib/closed-set.mjs'
import { collectArtifactFiles } from './lib/collect-artifact.mjs'
import { runAllGates, whitelistTrace } from './lib/gates.mjs'

const REQUIRED = ['closed-set.json', 'tokens.json', 'DESIGN.md', 'voice.md']

const NEXT_ACTION = {
	'asset-missing': (file) =>
		file
			? `把 --asset 指到一份存在的资产目录（当前 \`${file}\` 不存在或不是目录），须含 closed-set.json、tokens.json、DESIGN.md、voice.md`
			: '把 --asset 指到一份存在的资产目录，须含 closed-set.json、tokens.json、DESIGN.md、voice.md',
	'asset-incomplete': (file) =>
		`补齐资产里的 \`${file}\`（四份必读件：closed-set.json、tokens.json、DESIGN.md、voice.md），或改 --asset 指到齐全的目录`,
	'closed-set-unparseable': () => '修 closed-set.json 使它能被 JSON.parse；缺件本身归采集侧 validate-asset.mjs 判',
	'artifact-empty': (file) =>
		`把 --artifact 指到至少含一份 .html 或 .css 的文件或目录${file ? `（当前 \`${file}\` 一份都没有）` : ''}`,
}

const blocked = (code, file) => ({
	verdict: 'blocked',
	precheck: { code, file, nextAction: NEXT_ACTION[code](file) },
	findings: [],
})

export function precheckAsset(assetDir) {
	if (!assetDir) return blocked('asset-missing', '')
	const root = path.resolve(assetDir)
	if (!fs.existsSync(root) || !fs.statSync(root).isDirectory()) return blocked('asset-missing', String(assetDir))
	for (const file of REQUIRED) {
		const full = path.join(root, file)
		if (!fs.existsSync(full)) return blocked('asset-incomplete', file)
		try {
			fs.readFileSync(full, 'utf8')
		} catch {
			return blocked('asset-incomplete', file)
		}
	}
	try {
		JSON.parse(fs.readFileSync(path.join(root, 'tokens.json'), 'utf8'))
	} catch {
		return blocked('asset-incomplete', 'tokens.json')
	}
	try {
		loadClosedSet(root)
	} catch {
		return blocked('closed-set-unparseable', 'closed-set.json')
	}
	return null
}

function splitFiles(entries) {
	const htmlFiles = []
	const cssFiles = []
	for (const f of entries) {
		const rel = String(f.file ?? f.rel ?? '').split(path.sep).join('/')
		const text = f.text ?? fs.readFileSync(f.abs, 'utf8')
		if (/\.html$/i.test(rel)) htmlFiles.push({ file: rel, text })
		else if (/\.css$/i.test(rel)) cssFiles.push({ file: rel, text })
	}
	return { htmlFiles, cssFiles }
}

export function serializeReport(report) {
	return JSON.stringify(report, null, 2)
}

/**
 * 对一份已在内存里或磁盘上的产物跑全部门。
 *
 * 接受内存 `files` 是因为门的失败用例需要「与合格产物只差一处」的输入。
 */
export function lintArtifact({ assetDir, artifact, files, trace = undefined, hasTrace, tracePath } = {}) {
	const pre = precheckAsset(assetDir)
	if (pre) return pre

	let entries
	if (Array.isArray(files) && files.length) {
		entries = files
	} else if (artifact) {
		const collected = collectArtifactFiles(artifact)
		if (!collected.files.length) return blocked('artifact-empty', String(artifact))
		entries = collected.files
	} else {
		return blocked('artifact-empty', '')
	}

	const root = path.resolve(assetDir)
	const closedSet = loadClosedSet(root)
	const tokens = JSON.parse(fs.readFileSync(path.join(root, 'tokens.json'), 'utf8'))
	const designText = fs.readFileSync(path.join(root, 'DESIGN.md'), 'utf8')
	const voiceText = fs.readFileSync(path.join(root, 'voice.md'), 'utf8')

	const { htmlFiles, cssFiles } = splitFiles(entries)
	if (!htmlFiles.length && !cssFiles.length) return blocked('artifact-empty', artifact ? String(artifact) : '')

	const declarations = []
	for (const h of htmlFiles) declarations.push(...scanHtml(h.text, h.file).declarations)
	for (const c of cssFiles) declarations.push(...scanCss(c.text, c.file))

	let parsedTrace = null
	let traceGiven = hasTrace
	if (tracePath) {
		parsedTrace = whitelistTrace(JSON.parse(fs.readFileSync(tracePath, 'utf8')))
		traceGiven = true
	} else if (hasTrace === true) {
		parsedTrace = whitelistTrace(trace)
		traceGiven = true
	} else if (hasTrace === false) {
		traceGiven = false
	} else if (trace != null) {
		parsedTrace = whitelistTrace(trace)
		traceGiven = true
	} else {
		traceGiven = false
	}

	const { gates, findings } = runAllGates({
		declarations,
		closedSet,
		tokens,
		designText,
		voiceText,
		htmlFiles,
		trace: parsedTrace,
		assetDir: root,
		hasTrace: !!traceGiven,
	})

	return {
		verdict: findings.length ? 'blocked' : 'pass',
		styleSetId: closedSet.styleSetId,
		declarationCount: declarations.length,
		gates,
		findings,
		trace: traceGiven ? parsedTrace : null,
	}
}

const opt = (argv, flag) => {
	const i = argv.indexOf(flag)
	return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : null
}

function main(argv) {
	const assetDir = opt(argv, '--asset')
	const artifact = opt(argv, '--artifact')
	const tracePath = opt(argv, '--trace')
	const jsonPath = opt(argv, '--json')
	if (!assetDir || !artifact) {
		console.error('用法：node scripts/lint-artifact.mjs --asset <资产目录> --artifact <文件或目录> [--trace t.json] [--json 输出路径]')
		process.exit(1)
	}
	const result = lintArtifact({ assetDir, artifact, tracePath })
	const serialized = serializeReport(result)
	if (jsonPath) {
		fs.mkdirSync(path.dirname(path.resolve(jsonPath)), { recursive: true })
		fs.writeFileSync(jsonPath, serialized)
	}
	console.log(serialized)
	process.exit(result.verdict === 'pass' ? 0 : 1)
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
	main(process.argv.slice(2))
}
