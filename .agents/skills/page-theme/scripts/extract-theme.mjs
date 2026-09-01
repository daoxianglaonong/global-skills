#!/usr/bin/env node
/**
 * 生产入口（O-06 / O-25 / O-27）。
 *
 *   node scripts/extract-theme.mjs --url <abs-url> [--url ...] [--supplied <path-or-url> ...]
 *                                  [--asset-dir <dir>] [--style-set-id <id>]
 *
 * 落盘后以短摘要退出（O-27 / O-30）：写了哪些文件、主 URL、style-set-id、是否软停、体检是否报警。
 * 采集大表一律不打 stdout。headed 与截图逃生阀不进参数表（E-75 / E-34），只走环境变量。
 */
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'

import { normalizeUrlList } from './normalize-url.mjs'
import { computeStyleSet } from './style-set-id.mjs'
import { computePageId } from './lib/page-id.mjs'
import { writeJson, writeGitignores, written, exists, readTextIfExists } from './lib/fsutil.mjs'
import { loadSiteOverrides } from './lib/overrides.mjs'
import { parseYaml } from './lib/yaml.mjs'
import { collectPage } from './lib/collect-page.mjs'
import { acceptSupplied, buildSupplyMatch, rejectionNotices } from './lib/supplied.mjs'
import { assignDensityCandidates, collectHistoricalPadBlocks, cohesionHint } from './lib/derive.mjs'

const require = createRequire(import.meta.url)
const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url))
const UA_LOCALE = process.env.PAGE_THEME_LOCALE || 'zh-CN'
/** E-75：内部开关，默认关，中性名，取值 `retry` 表示失败后有头重试一次；不得当抗封手段 */
const HEADED = process.env.PAGE_THEME_HEADED === 'retry' ? 'retry' : 'off'

function parseArgs(argv) {
	const out = { url: [], supplied: [], assetDir: null, styleSetId: null }
	for (let i = 0; i < argv.length; i++) {
		const a = argv[i]
		if (a === '--url') out.url.push(argv[++i])
		else if (a === '--supplied') out.supplied.push(argv[++i])
		else if (a === '--asset-dir') out.assetDir = argv[++i]
		else if (a === '--style-set-id') out.styleSetId = argv[++i]
		else if (a === '--help' || a === '-h') out.help = true
		else if (a.startsWith('--')) out.unknown = (out.unknown || []).concat(a)
	}
	return out
}

/** 依赖包自带 `exports` 时 require('<pkg>/package.json') 会被挡，改按路径直读 */
async function depManifest(name) {
	try {
		const text = await fs.readFile(path.join(SCRIPT_DIR, 'node_modules', ...name.split('/'), 'package.json'), 'utf8')
		return JSON.parse(text)
	} catch {
		return null
	}
}

/** O-28 依赖前置检查。任一失败即进 O-29，不得开始导航，不得降级成 blockers 空跑（M-47）。 */
async function preflight() {
	const missing = []
	const major = Number(process.versions.node.split('.')[0])
	if (!Number.isFinite(major) || major < 20) {
		missing.push({ item: 'Node', actual: process.version, fix: '安装 Node 20 或以上 LTS，并确保 node 在 PATH' })
	}
	const want = [
		{ name: 'playwright', re: /^1\.62\./ },
		{ name: '@projectwallace/css-analyzer', re: /^9\.9\./ }
	]
	for (const dep of want) {
		try {
			const pkg = await depManifest(dep.name)
			if (!pkg || !dep.re.test(pkg.version)) {
				missing.push({ item: `本包依赖 ${dep.name}`, actual: pkg.version, fix: '在 scripts/ 执行 npm ci' })
			}
		} catch {
			missing.push({ item: `本包依赖 ${dep.name}`, actual: '未安装', fix: '在 scripts/ 执行 npm ci' })
		}
	}
	// 4. 禁装包：extract-css-core 不得出现在 node_modules 或 lockfile（O-26 第 3 款 / E-03）
	if (await exists(path.join(SCRIPT_DIR, 'node_modules', 'extract-css-core'))) {
		missing.push({ item: '禁装包 extract-css-core', actual: '存在于 node_modules', fix: '删除该依赖并回到移植模块 css-walk.mjs' })
	}
	const lock = await readTextIfExists(path.join(SCRIPT_DIR, 'package-lock.json'))
	if (lock && lock.includes('extract-css-core')) {
		missing.push({ item: '禁装包 extract-css-core', actual: '出现在 lockfile', fix: '删除该依赖并回到移植模块 css-walk.mjs' })
	}

	let chromium = null
	if (!missing.some((m) => m.item.includes('playwright'))) {
		try {
			const pw = await import('playwright')
			chromium = pw.chromium
			const exe = chromium.executablePath()
			if (!(await exists(exe))) {
				missing.push({ item: '浏览器二进制', actual: `不存在：${exe}`, fix: '在 scripts/ 执行 npx playwright install chromium' })
			}
		} catch (err) {
			missing.push({ item: '浏览器二进制', actual: String(err.message || err), fix: '在 scripts/ 执行 npx playwright install chromium' })
		}
	}
	return { ok: missing.length === 0, missing, chromium }
}

function preflightMessage(missing) {
	return [
		'采集前置检查未通过，已停在采集段，未开始抓取。',
		'',
		'缺项：',
		...missing.map((m) => `- ${m.item}：${m.actual}`),
		'',
		'请在本 skill 的 scripts/ 目录执行：',
		...[...new Set(missing.map((m) => m.fix))],
		'',
		'完成后用原参数重新调用本 skill。'
	].join('\n')
}

/**
 * Q-48 / O-49：命中 holdout.yaml 的 URL 不得采集，也不得记为 blockers。
 * 文件在但解析不了时**必须硬停**：读不出 `urls_forbidden` 就等于不知道哪些页禁采，
 * 继续跑有可能把留出页采进来，按 Q-49 留出验证当场作废。宁可停在采集前。
 */
async function loadHoldout(assetDir) {
	const file = path.join(assetDir, 'holdout.yaml')
	const text = await readTextIfExists(file)
	if (text === null) return { declared: false, forbidden: [] }
	let doc = {}
	try {
		doc = parseYaml(text, file) || {}
	} catch (err) {
		throw new Error(
			`holdout.yaml 解析失败，已停在采集前（未抓取任何页）：${err.message}\n` +
				'读不出 urls_forbidden 就无法保证留出页不被采集（Q-49）。请修好该文件后重跑。'
		)
	}
	const forbidden = []
	const push = (v) => {
		if (typeof v === 'string' && /^https?:\/\//i.test(v)) forbidden.push(v.trim())
	}
	for (const v of Array.isArray(doc.urls_forbidden) ? doc.urls_forbidden : []) push(v)
	if (doc.ground_truth && typeof doc.ground_truth === 'object') push(doc.ground_truth.url)
	return { declared: true, forbidden, status: doc.status || null }
}

function sameUrl(a, b) {
	try {
		const ua = new URL(a)
		const ub = new URL(b)
		return ua.origin === ub.origin && ua.pathname.replace(/\/+$/, '') === ub.pathname.replace(/\/+$/, '') && ua.search === ub.search
	} catch {
		return a === b
	}
}

async function main() {
	const args = parseArgs(process.argv.slice(2))
	if (args.help || !args.url.length) {
		process.stdout.write(
			'用法：node scripts/extract-theme.mjs --url <abs-url> [--url ...] [--supplied <path-or-url> ...] [--asset-dir <dir>] [--style-set-id <id>]\n'
		)
		process.exit(args.help ? 0 : 2)
	}

	const pre = await preflight()
	if (!pre.ok) {
		process.stdout.write(`${preflightMessage(pre.missing)}\n`)
		process.exit(1)
	}
	const { chromium } = pre

	// 合同裁决 3 的柔性归一化层，插在 O-37 第 1 步之前
	const normalized = normalizeUrlList(args.url)
	const styleSet = computeStyleSet(normalized, args.styleSetId)
	if (!styleSet.sources.length) {
		process.stdout.write('没有可受理的 URL（全部 url-unparseable），未开始抓取。\n')
		process.exit(1)
	}

	const assetDir = path.resolve(args.assetDir || path.join(process.cwd(), 'page-theme', styleSet.styleSetId))
	await fs.mkdir(assetDir, { recursive: true })
	const overrides = await loadSiteOverrides(assetDir)
	const holdout = await loadHoldout(assetDir)

	const startedAt = new Date().toISOString()
	const skippedByHoldout = []
	const accepted = []
	for (const s of styleSet.sources) {
		if (holdout.forbidden.some((f) => sameUrl(f, s.url))) {
			skippedByHoldout.push(s.url)
			continue
		}
		accepted.push(s)
	}
	if (!accepted.length) {
		process.stdout.write('本次全部 URL 命中 holdout.yaml，按 Q-48 不采集，未开始抓取。\n')
		process.exit(0)
	}

	const launchOptions = { headless: true, args: ['--disable-blink-features=AutomationControlled'] }
	let browser
	try {
		browser = await chromium.launch(launchOptions)
	} catch (err) {
		process.stdout.write(`采集前置检查未通过：浏览器启动失败（${String(err.message || err)}）。\n`)
		process.exit(1)
	}

	const contextBase = {
		deviceScaleFactor: 1, // E-17：固定桌面 Chromium，不用真机预设
		locale: UA_LOCALE,
		extraHTTPHeaders: { 'Accept-Language': `${UA_LOCALE},zh;q=0.9,en;q=0.8` },
		reducedMotion: 'no-preference'
	}

	const shotIndex = []
	const pageSummaries = []
	const allFailures = []
	const landmarksByPage = new Map()
	const takenPageIds = new Map()
	let hardFail = null
	let runViewports = null

	for (const source of accepted) {
		const pageId = computePageId(source.url, source.variant, takenPageIds)
		let result
		try {
			result = await collectPage({
				browser,
				source,
				pageId,
				assetDir,
				overrides,
				contextBase,
				shotIndex,
				isMainUrl: source.isMain
			})
		} catch (err) {
			result = {
				pageId,
				ok: false,
				hardFail: source.isMain,
				failures: [{ code: 'HTTP_ERROR', message: String(err.message || err), url: source.url }]
			}
		}
		// E-75：headed 是失败后重试一次的实现开关，默认关，不得当抗封手段
		if (!result.ok && HEADED === 'retry') {
			const headedBrowser = await chromium.launch({ ...launchOptions, headless: false }).catch(() => null)
			if (headedBrowser) {
				try {
					result = await collectPage({
						browser: headedBrowser,
						source,
						pageId,
						assetDir,
						overrides,
						contextBase,
						shotIndex,
						isMainUrl: source.isMain
					})
				} catch {
					/* 保留原失败结果 */
				}
				await headedBrowser.close().catch(() => {})
			}
		}
		allFailures.push(...(result.failures || []).map((f) => ({ ...f, pageId, sourceId: source.sourceId })))
		if (!result.ok) {
			if (result.hardFail) hardFail = { code: 'no-first-screen-dom', message: '主 URL 拿不到首屏 DOM', pageUrl: source.url }
			continue
		}
		landmarksByPage.set(pageId, result.landmarksBySlot)
		pageSummaries.push(result.summary)
		if (source.isMain) runViewports = result.viewports
	}

	await browser.close().catch(() => {})

	if (hardFail) {
		process.stdout.write(
			`采集硬失败（${hardFail.code}）：${hardFail.message}\n主 URL：${styleSet.mainUrl}\n未编造资产。\n`
		)
		process.exit(1)
	}

	// E-98：density 站内分布必须覆盖当前资产全部已采页，含本次未重抓的历史页
	const historical = await collectHistoricalPadBlocks(assetDir, new Set(landmarksByPage.keys()))
	const density = assignDensityCandidates(landmarksByPage, historical)
	for (const [pageId, bySlot] of landmarksByPage) {
		for (const [slot, doc] of Object.entries(bySlot)) {
			await writeJson(path.join(assetDir, 'raw', pageId, `landmarks.${slot}.json`), doc)
		}
	}

	// E-51 / E-56：有供给才写两个 run 级 raw 文件
	const inputDir = path.join(assetDir, 'input', 'design-system')
	const { snapshot, rejects } = await acceptSupplied(args.supplied, inputDir)
	if (snapshot) {
		await writeJson(path.join(assetDir, 'raw', 'supplied-design-system.json'), snapshot)
		const mainPage = pageSummaries[0]
		let measuredColors = []
		let measuredLengths = []
		if (mainPage) {
			try {
				const painted = JSON.parse(await fs.readFile(path.join(assetDir, 'raw', mainPage.pageId, 'painted-area.json'), 'utf8'))
				const pc = painted.slots.pc || {}
				measuredColors = (pc.colors || []).map((c) => ({ hex: c.hex, paintedRatio: c.paintedRatio, property: c.property }))
				measuredLengths = [...(pc.space ? pc.space.padding : []), ...(pc.space ? pc.space.gap : [])].map((s) => ({ px: Number(s.px) }))
			} catch {
				/* 主页面 painted-area 缺失时只落空对照 */
			}
		}
		await writeJson(path.join(assetDir, 'raw', 'supply-match.json'), buildSupplyMatch(snapshot, measuredColors, measuredLengths))
	}

	// E-84 run 级 session.json（不是 run-meta.json；不得写 coverage / blockers / stylesheetSplits）
	const mainSummary = pageSummaries.find((p) => p.url === styleSet.mainUrl) || pageSummaries[0] || null
	const pwVersion = (await depManifest('playwright'))?.version || null
	const analyzerVersion = (await depManifest('@projectwallace/css-analyzer'))?.version || null
	const tldtsVersion = (await depManifest('tldts'))?.version || null
	const userAgent = `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome Playwright/${pwVersion}`

	const session = {
		schemaVersion: 1,
		extractedAt: new Date().toISOString(),
		startedAt,
		url: styleSet.mainUrl,
		finalUrl: mainSummary ? mainSummary.finalUrl : styleSet.mainUrl,
		pageId: mainSummary ? mainSummary.pageId : null,
		styleSetId: styleSet.styleSetId,
		// 归一化不得静默：用户给什么、脚本改成了什么必须可查（合同裁决 3 第 8 条）
		inputNormalization: normalized,
		sources: styleSet.sources.map((s) => ({
			sourceId: s.sourceId,
			inputRaw: s.inputRaw,
			url: s.url,
			variant: s.variant,
			transforms: s.transforms
		})),
		pages: pageSummaries.map((p) => ({
			pageId: p.pageId,
			sourceId: p.sourceId,
			url: p.url,
			finalUrl: p.finalUrl,
			variant: p.variant,
			extractedAt: p.extractedAt,
			fingerprints: p.fingerprints
		})),
		playwright: pwVersion,
		cssAnalyzer: analyzerVersion,
		tldts: tldtsVersion,
		scriptVersion: require('./package.json').version,
		userAgent,
		dpr: 1,
		locale: UA_LOCALE,
		loggedIn: false,
		darkMode: mainSummary ? mainSummary.darkMode : 'omitted',
		darkModeReason: mainSummary ? mainSummary.darkReason : null,
		defaultScheme: mainSummary ? mainSummary.defaultScheme : 'light',
		defaultSchemeObserved: mainSummary ? mainSummary.defaultSchemeObserved : false,
		...(mainSummary && mainSummary.skippedReason ? { skippedReason: mainSummary.skippedReason } : {}),
		first_party_tokens: mainSummary ? mainSummary.firstPartyTokens : 'not_found',
		viewports: (runViewports || []).map((v) => ({
			slot: v.slot,
			viewport_px: v.viewport_px,
			viewportSource: v.viewportSource,
			height: v.height
		})),
		readyGate: mainSummary
			? mainSummary.readyGate
			: { used: [], fontsTimeout: false, lazyTruncated: false, quietOk: false },
		failures: allFailures,
		candidatePages: pageSummaries.flatMap((p) => p.candidatePages).slice(0, 60),
		corpusIndex: {
			pageCount: pageSummaries.length,
			pages: pageSummaries.map((p) => ({
				pageId: p.pageId,
				url: p.finalUrl,
				hash: p.corpusIndex.hash,
				itemCount: p.corpusIndex.itemCount,
				loggedIn: false
			}))
		},
		logoProbes: pageSummaries.map((p) => ({ pageId: p.pageId, ...(p.logoProbe || { skippedReason: 'not-probed' }) })),
		ctaOccludedByConsent: pageSummaries.some((p) => p.consent.ctaOccludedByConsent),
		consentCandidates: pageSummaries.flatMap((p) => p.consent.hits),
		holdoutFilePresent: holdout.declared,
		holdoutSkippedUrls: skippedByHoldout,
		siteOverrides: { present: overrides.present, effective: overrides.effective, hash: overrides.hash },
		densityDistribution: density,
		suppliedRejects: rejects
	}
	await writeJson(path.join(assetDir, 'raw', 'session.json'), session)

	// E-33：screenshots/index.json 必须能被该形状校验，第二段按此加载、禁止 glob
	await writeJson(path.join(assetDir, 'screenshots', 'index.json'), { schemaVersion: 1, items: shotIndex })
	await writeGitignores(assetDir)

	// ---- O-27 短摘要（不得把采集大表打到 stdout）
	const cohesion = cohesionHint(pageSummaries)
	const lines = []
	lines.push(`采集完成：${pageSummaries.length} 页 / ${written.length} 个文件写入 ${path.relative(process.cwd(), assetDir) || assetDir}`)
	lines.push(`主 URL：${styleSet.mainUrl}`)
	lines.push(`style-set-id：${styleSet.styleSetId}`)
	lines.push(`软停：${pageSummaries.length === 1 ? '是（单页资产即合格，扩充走二次调用）' : '否'}`)
	lines.push(
		`主题一致性体检：${cohesion.verdict === 'cohesive' ? '未报警' : `报警（疑似多套设计语言，分歧轴 ${cohesion.divergences.map((d) => d.axis).join(' / ')}）`}`
	)
	if (cohesion.pending.length) {
		lines.push(
			`　待人核弱观测 ${cohesion.pending.length} 条（两侧 confidence 均为 low，不构成分歧）：${cohesion.pending.map((p) => p.axis).join(' / ')}`
		)
	}
	lines.push(
		`页面：${pageSummaries.map((p) => `${p.pageId}（${p.darkMode}/${p.defaultScheme}）`).join('、') || '无'}`
	)
	if (skippedByHoldout.length) lines.push(`holdout 跳过：${skippedByHoldout.length} 条`)
	if (allFailures.length) lines.push(`采集受阻 ${allFailures.length} 条：${[...new Set(allFailures.map((f) => f.code))].join('、')}（已写入 session.failures，请投影进 coverage.blockers）`)
	if (rejects.length) lines.push('')
	for (const notice of rejectionNotices(rejects, styleSet.styleSetId)) lines.push(notice)
	if (styleSet.blockers.length) {
		lines.push(`未受理 URL ${styleSet.blockers.length} 条（url-unparseable）：${styleSet.blockers.map((b) => b.inputRaw).join('、')}`)
	}
	lines.push('raw 已落盘，请按需 Read；不要整盘读入上下文。')
	process.stdout.write(`${lines.join('\n')}\n`)
}

main().catch((err) => {
	process.stderr.write(`${String(err && err.stack ? err.stack : err)}\n`)
	process.exit(1)
})
