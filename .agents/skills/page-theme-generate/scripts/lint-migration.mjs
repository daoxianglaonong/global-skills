#!/usr/bin/env node
/**
 * 优化模式的迁移门：色值承诺兑现 / 色值残余背书 / 非色承诺兑现 / 非色残余背书 / 裁决保持锁 /
 * 内容锁 / 结构锁 / 断点锁 / 主题 API 闭集锁。后两道判的是**增量**（`--after` 减 `--before`），
 * 不是绝对集合；裁决保持锁判的是「裁了别动的那些处，源值还在不在」。
 *
 *   node scripts/lint-migration.mjs --asset <资产目录> --before <改造前产物> --after <改造后产物>
 *        --verdicts <色值裁决.json> [--type-verdicts <非色裁决.json>] [--json <输出路径>]
 *
 * 两份裁决记录分家：`--verdicts` 收 `value-map.mjs --read-back --json`（行 id `vm-`），
 * `--type-verdicts` 收 `type-map.mjs --read-back --json`（行 id `tm-`）。互喂会当场
 * `verdicts-shape` / `type-verdicts-shape`。
 *
 * `--type-verdicts` **不是可选装饰**：改造前产物里但凡有一条落在非色表射程里的字面量，
 * 缺它就退 `type-verdicts-missing`。可以省略的只有「一条都没有」那种产物。
 *
 * `--json` 带路径。只写 `--json` 不给路径是用法错误，退 1。
 * 退出码只有 `0` 全绿与 `1` 有阻断。
 *
 * `lintMigration()` 可喂内存输入，坏用例不必每次落盘。
 */

import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { admitAsset } from './admit-asset.mjs'
import { scanCss, scanHtml } from './lib/css-scan.mjs'
import { loadClosedSet } from './lib/closed-set.mjs'
import { buildValueMap } from './lib/value-rows.mjs'
import { buildTypeMap } from './lib/type-rows.mjs'
import { runMigrationGates } from './lib/migration-gates.mjs'
import { collectArtifactFiles } from './lib/collect-artifact.mjs'

const NEXT_ACTION = {
	'baseline-missing': (file) =>
		`把 --before 指到改造前那份产物（第 2 步拷下来的基线）${file ? `（当前 \`${file}\` 不存在）` : '；没给或路径不存在都不许跑门'}`,
	'baseline-empty': (file) =>
		`把 --before 指到至少含一份 .html 或 .css 的改造前基线${file ? `（当前 \`${file}\` 一份都没有）` : ''}；空目录会让内容锁整段哑掉`,
	'after-empty': (file) =>
		`把 --after 指到至少含一份 .html 或 .css 的改造后产物${file ? `（当前 \`${file}\` 一份都没有）` : ''}`,
	'verdicts-missing': (file) =>
		`把 --verdicts 指到 \`value-map.mjs --read-back --json\` 那份输出${file ? `（当前 \`${file}\` 读不到）` : ''}`,
	'verdicts-unparseable': (file) => `修 \`${file || '--verdicts'}\` 使它能被 JSON.parse`,
	'verdicts-shape': () =>
		'这份不是 --read-back --json 的输出：要有 rows[]，且每行带 usage / normalizedValue / verdict / acceptedCssVar',
	'verdicts-accept-token-absent': () =>
		'有 accept 行的 acceptedCssVar 是空的：回灌那侧本该挡下，这里不进门。回去填选中 token 再 --read-back',
	'verdicts-blocked': () => '那份裁决记录的 verdict 不是 pass：裁决自己都没读回通过，不能当准绳',
	'verdicts-stale': () =>
		'拿 --before 与 --asset 重算的行 id 集合与 --verdicts 对不上：这份裁决对的不是这份改造前产物',
	'type-verdicts-missing': (file) =>
		`改造前产物里有非色字面量（字体栈 / 圆角 / 描边宽 / 间距 / 字号），必须给 --type-verdicts${file ? `（当前 \`${file}\` 读不到）` : ''}：先跑 \`type-map.mjs --out\` 出表、人填、再 \`--read-back --json\``,
	'type-verdicts-unparseable': (file) => `修 \`${file || '--type-verdicts'}\` 使它能被 JSON.parse`,
	'type-verdicts-shape': () =>
		'这份不是 `type-map.mjs --read-back --json` 的输出：要有 `mapKind: "type"` 与 rows[]，且每行带 kind / normalizedValue / verdict / acceptedCssVar / lossy。色值那份喂到这里就是这个报错',
	'type-verdicts-accept-token-absent': () =>
		'有 accept 行的 acceptedCssVar 是空的：回灌那侧本该挡下，这里不进门。回去填选中 token 再 --read-back',
	'type-verdicts-blocked': () => '那份非色裁决记录的 verdict 不是 pass：裁决自己都没读回通过，不能当准绳',
	'type-verdicts-stale': () =>
		'拿 --before 与 --asset 重算的非色行 id 集合与 --type-verdicts 对不上：这份裁决对的不是这份改造前产物',
	'type-verdicts-omit-with-candidate': () =>
		'有行裁了 omit，但重算下来它有候选：omit 的意思是「资产里没有这个值」，有候选的行要么 accept 要么 defer',
	'type-verdicts-lossy-required': () =>
		'有 accept 行选中的是近义栈（重算 matchedBy 为 stack-near），信封里 lossy 却不是 true：近义拼并视觉不等价，那面旗不许在执行侧消失。回去把 lossy 那一格标「是」再 --read-back',
}

const blocked = (code, file) => ({
	verdict: 'blocked',
	precheck: { code, file: file ?? '', nextAction: NEXT_ACTION[code](file) },
	findings: [],
})

function toMemFiles(collected) {
	return collected.files.map((f) => ({
		rel: String(f.rel).split(path.sep).join('/'),
		text: fs.readFileSync(f.abs, 'utf8'),
	}))
}

function splitHtmlCss(files) {
	const html = []
	const css = []
	for (const f of files ?? []) {
		const rel = String(f.rel ?? f.file ?? '').split(path.sep).join('/')
		if (/\.html$/i.test(rel)) html.push({ file: rel, text: f.text })
		else if (/\.css$/i.test(rel)) css.push({ file: rel, text: f.text })
	}
	return { html, css }
}

function declarationsOf(files) {
	const { html, css } = splitHtmlCss(files)
	const out = []
	for (const f of html) out.push(...scanHtml(f.text, f.file).declarations)
	for (const f of css) out.push(...scanCss(f.text, f.file))
	return out
}

function parseVerdicts(verdicts) {
	if (verdicts == null) return { missing: true }
	if (typeof verdicts === 'string') {
		try {
			return { doc: JSON.parse(verdicts) }
		} catch {
			return { unparseable: true }
		}
	}
	if (typeof verdicts === 'object') return { doc: verdicts }
	return { unparseable: true }
}

function shapeOk(doc) {
	if (!doc || !Array.isArray(doc.rows)) return false
	for (const row of doc.rows) {
		if (!row || typeof row !== 'object') return false
		if (!('usage' in row) || !('normalizedValue' in row) || !('verdict' in row) || !('acceptedCssVar' in row)) return false
	}
	return true
}

function acceptTokenAbsent(doc) {
	return (doc.rows ?? []).some((r) => r.verdict === 'accept' && !String(r.acceptedCssVar ?? '').trim())
}

/**
 * 非色裁决记录的形状。多问一句 `mapKind`：两张表的行字段各不相同，但「把色值那份错喂到
 * `--type-verdicts`」是最容易犯的错，而它的行恰好也带 verdict / acceptedCssVar——只按
 * 字段名判会让它一路走到 stale 才报，报出来的话还指错方向。
 */
function typeShapeOk(doc) {
	if (!doc || doc.mapKind !== 'type' || !Array.isArray(doc.rows)) return false
	for (const row of doc.rows) {
		if (!row || typeof row !== 'object') return false
		if (!('kind' in row) || !('normalizedValue' in row) || !('verdict' in row) || !('acceptedCssVar' in row) || !('lossy' in row)) {
			return false
		}
	}
	return true
}

/**
 * omit 只许零候选行用。回灌那侧已经判过一次，这里**再判一次**，因为准入只信封上验
 * id 集合与 `verdict: pass`——手写一份 `pass` 的信封本来能把 omit 当免检咒语用。
 * 判据不抄：拿 `--before` 重算出来的候选列，与回灌那侧同一份 `buildTypeMap`。
 */
function omitWithCandidate(doc, recomputed) {
	const candidateCount = new Map(recomputed.rows.map((r) => [r.id, r.candidates.length]))
	return (doc.rows ?? []).some((r) => r.verdict === 'omit' && (candidateCount.get(r.id) ?? 0) > 0)
}

/**
 * 近义 accept 必须带 lossy 旗。与上面 omit 那条**同一个理由**：回灌判过一次不够，准入只
 * 验信封的 id 集合与 `verdict: pass`，所以手写一份 `pass` 的信封能把「该标 lossy 的 accept」
 * 混进来。独立复核实测过这条旁路（把近义行的 `lossy` 改成 `false`，`lintMigration` 退 0）。
 *
 * 它不让人逃兑现——accept 行照样得换成 `var()`——但会让「有失真」这面旗在执行侧消失，
 * 而那面旗是 `lossy` 这个字段唯一的用途。omit 有二次准入而 lossy 没有，是不对称，不是取舍。
 *
 * 判据不抄回灌那侧的结论：拿 `--before` 重算的 `candidates[].matchedBy` 现查。
 */
function lossyRequired(doc, recomputed) {
	const nearVars = new Map(
		recomputed.rows.map((r) => [
			r.id,
			new Set(r.candidates.filter((c) => c.matchedBy === 'stack-near').map((c) => c.cssVar)),
		]),
	)
	return (doc.rows ?? []).some(
		(r) => r.verdict === 'accept' && nearVars.get(r.id)?.has(r.acceptedCssVar) && r.lossy !== true,
	)
}

function idSet(rows) {
	return new Set((rows ?? []).map((r) => r.id))
}

function setsEqual(a, b) {
	if (a.size !== b.size) return false
	for (const x of a) if (!b.has(x)) return false
	return true
}

/**
 * 迁移门退出判定。**两条兑现率各自独立阻断**，不依赖任何其它 finding：把 findings 清空、
 * 只把某一条 rate 造成 0.9，仍必须 blocked。色与非色分开判，否则非色那条只要色那条为 1
 * 就会被静默吞掉。`rate === null`（分母为 0，全 defer / omit）不阻断。
 */
export function decideMigrationVerdict(findings, fulfillment, typeFulfillment) {
	const short = (f) => f?.rate != null && f.rate !== 1
	return findings?.length || short(fulfillment) || short(typeFulfillment) ? 'blocked' : 'pass'
}

function rateShortFinding(gate, code, fulfillment, what) {
	return {
		gate,
		level: 'block',
		code,
		reason: `${what}承诺兑现率必须恰好为 1，当前是 ${fulfillment.rate}（${fulfillment.fulfilled}/${fulfillment.acceptOccurrences}）`,
		rate: fulfillment.rate,
		acceptOccurrences: fulfillment.acceptOccurrences,
		fulfilled: fulfillment.fulfilled,
	}
}

/**
 * 对一份已在内存里的迁移输入跑准入 + 九道门。
 *
 * @param {object} input
 * @param {string} input.assetDir
 * @param {{ rel: string, text: string }[] | null} [input.beforeFiles]
 * @param {{ rel: string, text: string }[]} [input.afterFiles]
 * @param {object | string | null} [input.verdicts]
 * @param {object | string | null} [input.typeVerdicts]
 * @param {boolean} [input.baselinePresent]
 * @param {string} [input.beforeFile]
 * @param {string} [input.afterFile]
 * @param {string} [input.verdictsFile]
 * @param {string} [input.typeVerdictsFile]
 */
export function lintMigration({
	assetDir,
	beforeFiles = null,
	afterFiles = [],
	verdicts = null,
	typeVerdicts = null,
	baselinePresent = true,
	beforeFile = '',
	afterFile = '',
	verdictsFile = '',
	typeVerdictsFile = '',
}) {
	const admission = admitAsset(assetDir)
	if (admission.verdict !== 'ok') {
		return {
			verdict: 'blocked',
			precheck: {
				code: admission.verdict,
				file: assetDir ?? '',
				nextAction: admission.nextAction,
			},
			findings: [],
		}
	}
	if (!baselinePresent) return blocked('baseline-missing', beforeFile)
	if (!(afterFiles ?? []).length) return blocked('after-empty', afterFile)
	if (!(beforeFiles ?? []).length) return blocked('baseline-empty', beforeFile)

	const parsed = parseVerdicts(verdicts)
	if (parsed.missing) return blocked('verdicts-missing', verdictsFile)
	if (parsed.unparseable) return blocked('verdicts-unparseable', verdictsFile)
	const doc = parsed.doc
	if (!shapeOk(doc)) return blocked('verdicts-shape', verdictsFile)
	if (acceptTokenAbsent(doc)) return blocked('verdicts-accept-token-absent', verdictsFile)
	if (doc.verdict !== 'pass') return blocked('verdicts-blocked', verdictsFile)

	const closedSet = loadClosedSet(admission.assetDir)
	const beforeDecls = declarationsOf(beforeFiles ?? [])
	const recomputed = buildValueMap({
		declarations: beforeDecls,
		closedSet,
		styleSetId: closedSet.styleSetId,
		asset: '.',
		artifactRoot: '.',
	})
	if (!setsEqual(idSet(recomputed.rows), idSet(doc.rows))) return blocked('verdicts-stale', verdictsFile)

	const recomputedType = buildTypeMap({
		declarations: beforeDecls,
		closedSet,
		styleSetId: closedSet.styleSetId,
		asset: '.',
		artifactRoot: '.',
	})
	const parsedType = parseVerdicts(typeVerdicts)
	let typeDoc = null
	if (parsedType.missing) {
		if (recomputedType.rows.length) return blocked('type-verdicts-missing', typeVerdictsFile)
	} else {
		if (parsedType.unparseable) return blocked('type-verdicts-unparseable', typeVerdictsFile)
		typeDoc = parsedType.doc
		if (!typeShapeOk(typeDoc)) return blocked('type-verdicts-shape', typeVerdictsFile)
		if (acceptTokenAbsent(typeDoc)) return blocked('type-verdicts-accept-token-absent', typeVerdictsFile)
		if (typeDoc.verdict !== 'pass') return blocked('type-verdicts-blocked', typeVerdictsFile)
		if (!setsEqual(idSet(recomputedType.rows), idSet(typeDoc.rows))) return blocked('type-verdicts-stale', typeVerdictsFile)
		if (omitWithCandidate(typeDoc, recomputedType)) return blocked('type-verdicts-omit-with-candidate', typeVerdictsFile)
		if (lossyRequired(typeDoc, recomputedType)) return blocked('type-verdicts-lossy-required', typeVerdictsFile)
	}

	const afterDeclarations = declarationsOf(afterFiles)
	const { html: beforeHtml } = splitHtmlCss(beforeFiles ?? [])
	const { html: afterHtml } = splitHtmlCss(afterFiles)
	const { gates, findings, fulfillment, typeFulfillment } = runMigrationGates({
		afterDeclarations,
		beforeDeclarations: beforeDecls,
		beforeHtml,
		afterHtml,
		// 断点锁吃**原始文本**（`css-scan` 递归进 @media 时把条件丢了，而它被 audit 逐字锁着）。
		beforeSources: beforeFiles ?? [],
		afterSources: afterFiles,
		rows: doc.rows,
		typeRows: typeDoc ? typeDoc.rows : null,
		closedSet,
	})
	const outFindings = [...findings]
	const pushRateShort = (gate, code, f, what) => {
		if (f.rate == null || f.rate === 1 || outFindings.some((x) => x.code === code)) return
		outFindings.push(rateShortFinding(gate, code, f, what))
		const row = gates.find((g) => g.gate === gate)
		if (row) row.findings += 1
	}
	pushRateShort('accept-fulfillment', 'fulfillment-rate-short', fulfillment, '')
	pushRateShort('type-accept-fulfillment', 'type-fulfillment-rate-short', typeFulfillment, '非色')
	return {
		verdict: decideMigrationVerdict(outFindings, fulfillment, typeFulfillment),
		styleSetId: closedSet.styleSetId,
		fulfillment,
		typeFulfillment,
		gates,
		findings: outFindings,
	}
}

const opt = (argv, flag) => {
	const i = argv.indexOf(flag)
	return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : null
}

function main(argv) {
	const jsonIdx = argv.indexOf('--json')
	if (jsonIdx >= 0) {
		const next = argv[jsonIdx + 1]
		if (!next || next.startsWith('--')) {
			console.error(
				'用法：node scripts/lint-migration.mjs --asset <资产> --before <改造前> --after <改造后> --verdicts <色值裁决.json> [--type-verdicts <非色裁决.json>] --json <输出路径>',
			)
			process.exit(1)
		}
	}

	const assetDir = opt(argv, '--asset')
	const beforePath = opt(argv, '--before')
	const afterPath = opt(argv, '--after')
	const verdictsPath = opt(argv, '--verdicts')
	const typeVerdictsPath = opt(argv, '--type-verdicts')
	const jsonPath = opt(argv, '--json')

	const baselinePresent = !!(beforePath && fs.existsSync(path.resolve(beforePath)))
	const beforeFiles = baselinePresent ? toMemFiles(collectArtifactFiles(beforePath)) : null
	const afterFiles = afterPath && fs.existsSync(path.resolve(afterPath)) ? toMemFiles(collectArtifactFiles(afterPath)) : []

	const readIfPresent = (p) => (p && fs.existsSync(path.resolve(p)) ? fs.readFileSync(p, 'utf8') : null)

	const result = lintMigration({
		assetDir,
		beforeFiles,
		afterFiles,
		verdicts: readIfPresent(verdictsPath),
		typeVerdicts: readIfPresent(typeVerdictsPath),
		baselinePresent,
		beforeFile: beforePath ?? '',
		afterFile: afterPath ?? '',
		verdictsFile: verdictsPath ?? '',
		typeVerdictsFile: typeVerdictsPath ?? '',
	})

	const serialized = JSON.stringify(result, null, 2)
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
