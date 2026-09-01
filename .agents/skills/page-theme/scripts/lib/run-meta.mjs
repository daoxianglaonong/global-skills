/**
 * `page-theme/<style-set-id>/run-meta.json` 的写手〔B-36〕。
 *
 *   node scripts/lib/run-meta.mjs --asset-dir <dir> [--trigger initial|add-page|refetch]
 *
 * 定义方是第 06 章：路径 M-58 · append-only M-21 / M-59 · 形状 M-60 · 取值域 M-61 ·
 * `renames[]` M-26 / M-62 · `params` M-63 · 与 `session.json` 的分界 M-68。
 *
 * 三条边界，实现层不得含糊：
 *
 * 1. **类别是 `log`，append-only。** 新 run 只许 push 到 `runs[]` 末尾；既有元素一律不改不删；
 *    重算时**不得**把本文件当 derived 删掉重建（M-21 / M-59）。与 `session.json`「随重抓覆盖」
 *    的分界写死在 M-68，两边不得混。
 * 2. **`stylesheetSplits[]` 的权威只在本文件**（M-13）。分裂是对**当前 raw 全集**去重时发现的，
 *    不是单次导航的仪器读数，故**不得**回写 `session.json`（E-84 明文禁止）。
 * 3. **视口 / UA / 门控 / `darkMode` / `defaultScheme` / `loggedIn` / 原始 `failures[]` 不进本文件**
 *    （M-63 / M-68），它们的权威在 `raw/session.json`。
 *
 * 调用时机：**分析段末尾**。必须在入口文件 `README.md` 落盘之后跑——`coverage` 快照（M-61）
 * 从 README「覆盖度」节读回，那是 `coverage` 当前值的唯一权威落点（G-05a / M-44），本文件只存快照，
 * 不做第二份权威。`E-01` 禁止采集脚本自己写 `coverage` / `run-meta.json`，故本模块提供能力、
 * 由分析段的写出步骤调用，`extract-theme.mjs` 不调它。
 */
import fs from 'node:fs/promises'
import fsSync from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { findCoverage } from '../accept/lib/asset-read.mjs'
import { dedupeKey } from './css-origins.mjs'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const SCRIPTS_ROOT = path.resolve(HERE, '..')
const require = createRequire(path.join(SCRIPTS_ROOT, 'package.json'))

/** 合同 §3 锁定的五个依赖，一个不多一个不少；子代理不得自行加第六个。 */
const LOCKED_DEPS = ['playwright', '@projectwallace/css-analyzer', 'tldts', 'pixelmatch', 'sharp']

const readJson = async (p) => JSON.parse(await fs.readFile(p, 'utf8'))
const exists = async (p) => {
	try {
		await fs.access(p)
		return true
	} catch {
		return false
	}
}

/**
 * 已装版本从各包自己的 `package.json` 读实测值；读不到必须 omit，不得填幻觉值（D3）。
 * 直接拼 `node_modules/<name>/package.json`：带 `exports` 映射的包（`sharp` / `css-analyzer`）
 * 不对外暴露 `./package.json`，走 `require('<name>/package.json')` 会解析失败。
 */
function installedDeps() {
	const out = {}
	for (const name of LOCKED_DEPS) {
		try {
			out[name] = require(path.join(SCRIPTS_ROOT, 'node_modules', ...name.split('/'), 'package.json')).version
		} catch {
			/* 未装：omit 该键 */
		}
	}
	return out
}

/**
 * vendored `page-theme-core` 的版本号。**从副本的 `VENDOR.json` 读实测值，不得硬编码**——
 * 硬编码等于台账记的是「作者当时以为的版本」，而判据实际来自磁盘上那份副本，两者会静默分叉。
 * 读不到必须 omit（同 D3），不填幻觉值。
 *
 * 候选路径按「就近优先」排：本包自带副本 → 采集包的副本。
 */
const VENDOR_MANIFESTS = [
	path.join(SCRIPTS_ROOT, 'vendor', 'VENDOR.json'),
	path.resolve(SCRIPTS_ROOT, '..', '..', 'page-theme-extract', 'scripts', 'vendor', 'VENDOR.json')
]

function vendoredCoreVersion() {
	for (const file of VENDOR_MANIFESTS) {
		try {
			const version = JSON.parse(fsSync.readFileSync(file, 'utf8'))?.core?.version
			if (typeof version === 'string' && version) return version
		} catch {
			/* 该候选不存在或读不出：换下一个 */
		}
	}
	return null
}

/** M-61：`runId` 本 run 内唯一，取 `finishedAt` 压缩 + 短随机（本项目自定）。 */
function makeRunId(finishedAt) {
	const stamp = new Date(finishedAt).toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z')
	const rand = Math.random().toString(16).slice(2, 6)
	return `${stamp}-${rand}`
}

/**
 * M-13 分裂：同一 `href` 在不同页拿到不同字节时，键必须升为 `url:<绝对 URL>#sha256:<hash>`，
 * 两份都进频率分析。本函数按 M-12 去重键扫当前 raw 全集，只记「哪两个键被拆开」，不复制 CSS 文本。
 */
export async function collectStylesheetSplits(assetDir, pageIds) {
	const byKey = new Map()
	for (const pageId of pageIds) {
		const file = path.join(assetDir, 'raw', pageId, 'css-origins.json')
		if (!(await exists(file))) continue
		let origins
		try {
			origins = await readJson(file)
		} catch {
			continue
		}
		const pageUrl = origins.find((o) => o.type === 'style' || o.type === 'inline')?.href || ''
		for (const o of origins) {
			if (!o.firstParty || o.blocked) continue
			const key = dedupeKey(o, pageUrl)
			if (!key.startsWith('url:')) continue // inline 键本身就是文本 hash，不存在同键异字节
			const sha = o.sha256 || null
			if (!sha) continue // 未溢出到磁盘的小表没有 sha256 记录，无法参与分裂判定
			if (!byKey.has(key)) byKey.set(key, new Map())
			const bucket = byKey.get(key)
			if (!bucket.has(sha)) bucket.set(sha, [])
			bucket.get(sha).push(pageId)
		}
	}
	const splits = []
	for (const [key, bucket] of byKey) {
		if (bucket.size < 2) continue
		splits.push({
			key,
			splitInto: [...bucket.entries()].map(([sha256, pages]) => ({ key: `${key}#${sha256}`, sha256, pageIds: pages }))
		})
	}
	return splits
}

/**
 * M-61 `trigger`：`initial` = 目录尚无入口文件；`add-page` = 本次含新 URL；`refetch` = 全部已有 raw。
 * 判据的权威时刻是 run 开始，而资产里没有留痕该时刻的字段，故本实现按台账推定：
 * 无 `run-meta.json` 即首跑；否则看本次 `pages[]` 是否出现过去 `coverage.pages` 里没有的 `pageId`。
 * 该推定已列入交付说明「待缝合」，条款补齐前不得当权威。
 */
function inferTrigger(previous, sessionPageIds) {
	if (!previous || !Array.isArray(previous.runs) || previous.runs.length === 0) return 'initial'
	const known = new Set()
	for (const run of previous.runs) {
		for (const p of run?.coverage?.pages || []) if (p.pageId) known.add(p.pageId)
		for (const p of run?.pages || []) if (p.pageId) known.add(p.pageId)
	}
	return sessionPageIds.some((id) => !known.has(id)) ? 'add-page' : 'refetch'
}

/**
 * 追加一条 run 台账。
 *
 * @param {string} assetDir 资产根 `page-theme/<style-set-id>/`
 * @param {{trigger?:string, renames?:Array, params?:object, runtimeError?:object|null, now?:string}} [opts]
 */
export async function appendRun(assetDir, opts = {}) {
	const file = path.join(assetDir, 'run-meta.json')
	const session = await readJson(path.join(assetDir, 'raw', 'session.json'))

	// M-61 startedAt 必填、不得 null 不得 omit：Q-53 第 2 条与 Q-04 都读它
	const startedAt = session.startedAt
	if (!startedAt) throw new Error('run-meta.json 写不出：raw/session.json 缺 startedAt（M-61 必填）')
	const finishedAt = opts.now || session.extractedAt || new Date().toISOString()

	// 既有台账原样读进来，只 push 不改（M-21 / M-59）
	let previous = null
	if (await exists(file)) {
		previous = await readJson(file)
		if (previous.version !== 1) throw new Error(`run-meta.json 的 version 必须是 1，实得 ${JSON.stringify(previous.version)}`)
		if (!Array.isArray(previous.runs)) throw new Error('run-meta.json 的 runs 必须是数组，拒绝覆盖既有台账')
	}

	const sessionPages = (session.pages || []).map((p) => ({
		pageId: p.pageId,
		url: p.url,
		finalUrl: p.finalUrl,
		extractedAt: p.extractedAt,
		fingerprints: p.fingerprints || {}
	}))

	// M-44：coverage 快照取入口文件「覆盖度」节的当前值，不另立第二份权威
	const found = findCoverage(assetDir)
	if (!found || !found.coverage) {
		throw new Error(`run-meta.json 写不出：入口文件读不出 coverage（${(found && found.notes ? found.notes : []).join('；')}）`)
	}

	const overridesHash = session.siteOverrides && session.siteOverrides.hash ? session.siteOverrides.hash : null
	const suppliedFiles = []
	const suppliedFile = path.join(assetDir, 'raw', 'supplied-design-system.json')
	if (await exists(suppliedFile)) {
		try {
			const snap = await readJson(suppliedFile)
			for (const f of snap.files || []) suppliedFiles.push(f.url || f.path)
		} catch {
			/* 供给快照读不出时按无供给记，不编造 */
		}
	}

	const coreVersion = vendoredCoreVersion()

	const entry = {
		runId: makeRunId(finishedAt),
		startedAt,
		finishedAt,
		trigger: opts.trigger || inferTrigger(previous, sessionPages.map((p) => p.pageId)),
		scriptVersion: session.scriptVersion || require('../package.json').version,
		// 判据底座的版本：CSS 变量名派生与颜色三档都出自它，换版可能改判档，故必须留痕。
		// 与 `deps` 分开记——`deps` 是合同锁定的五个第三方包，core 不是第三方也不是可选项。
		...(coreVersion ? { coreVersion } : {}),
		...(overridesHash ? { overridesHash } : {}), // M-56：无文件则 omit
		// M-63：只收 O-32 的 url / supplied / asset_dir，不得写入密钥
		params: opts.params || {
			urls: (session.sources || []).map((s) => s.url),
			assetDir: null,
			supplied: suppliedFiles
		},
		// 本项目自定扩展：合同 §3 要求 `tldts` 等锁定依赖的版本入本文件，而 M-60 / M-61 没有对应字段。
		// 已列入「待缝合」请 ch06 补条款；在补齐之前形状固定为「包名 → 实测版本」的平表。
		deps: installedDeps(),
		pages: sessionPages,
		stylesheetSplits: await collectStylesheetSplits(assetDir, sessionPages.map((p) => p.pageId)),
		// M-26 / M-62：改名只进本数组，且要靠与上一版 tokens.json 做 diff 才有内容。
		// 首跑没有上一版，故为 []；调用方算出改名时通过 opts.renames 传入。
		renames: opts.renames || [],
		coverage: found.coverage,
		runtimeError: opts.runtimeError === undefined ? null : opts.runtimeError
	}

	const appendedAfter = previous ? previous.runs.length : 0
	const doc = previous ? { ...previous, runs: [...previous.runs, entry] } : { version: 1, runs: [entry] }
	await fs.writeFile(file, `${JSON.stringify(doc, null, 2)}\n`, 'utf8')
	return { file, entry, appendedAfter, runCount: doc.runs.length }
}

async function cli() {
	const argv = process.argv.slice(2)
	const get = (flag) => {
		const i = argv.indexOf(flag)
		return i >= 0 ? argv[i + 1] : null
	}
	const assetDir = get('--asset-dir')
	if (!assetDir) {
		process.stdout.write('用法：node scripts/lib/run-meta.mjs --asset-dir <dir> [--trigger initial|add-page|refetch]\n')
		process.exit(2)
	}
	const trigger = get('--trigger')
	const res = await appendRun(assetDir, trigger ? { trigger } : {})
	process.stdout.write(
		`已追加运行台账：${res.file}（runs ${res.appendedAfter} → ${res.runCount}，runId=${res.entry.runId}，` +
			`trigger=${res.entry.trigger}，startedAt=${res.entry.startedAt}，stylesheetSplits=${res.entry.stylesheetSplits.length}，` +
			`core=${res.entry.coreVersion || '未读到 vendored VENDOR.json'}）\n`
	)
}

const invokedDirectly = process.argv[1] && import.meta.filename === path.resolve(process.argv[1])
if (invokedDirectly) {
	cli().catch((err) => {
		process.stderr.write(`${String(err.message || err)}\n`)
		process.exit(1)
	})
}
