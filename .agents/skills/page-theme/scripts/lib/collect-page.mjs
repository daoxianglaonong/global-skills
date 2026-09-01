/**
 * 单页采集流水线。顺序服从 E-21，落盘清单服从 E-82 / E-83，逐文件形状服从 E-84–E-95。
 * 采集强制无痕、未登录（E-73）；同意条只探测不点击（E-76）；默认软停只跑给定 URL（E-79 / E-80）。
 */
import path from 'node:path'
import { writeJson, sha256 } from './fsutil.mjs'
import { stableGate, warmupScroll, doubleRaf, retagLandmarks } from './gates.mjs'
import { resolveViewports, SLOTS, FALLBACK } from './viewports.mjs'
import {
	attachStylesheetSniffer,
	collectCssOrigins,
	spillOverflow,
	firstPartyCssUnion,
	analyzeCss,
	normalizeFrequency,
	mediaUnique,
	mediaFeatures
} from './css-origins.mjs'
import {
	markThirdPartyWidgetsInPage,
	collectPaintedAreaInPage,
	collectLandmarksInPage,
	collectCustomPropertiesInPage,
	collectFontsInPage
} from './in-page-visual.mjs'
import {
	probeConsentInPage,
	probeDefaultSchemeInPage,
	collectNavCandidatesInPage,
	collectCopyInPage,
	collectMotionSnapshotInPage
} from './in-page-semantic.mjs'
import { collectInteractionStates } from './interaction.mjs'
import { createShotter } from './shots.mjs'
import { probeDarkMode } from './dark.mjs'
import { probeLogoColor } from './logo.mjs'
import { buildFirstPartyVariables, buildCustomProperties } from './first-party-vars.mjs'
import { buildPaintedArea, buildNoiseReport, buildRoleCandidates, fontFaceFamilies } from './derive.mjs'
import { maskSelectors, floorShotHideSelectors } from './overrides.mjs'

const NAV_TIMEOUT_MS = 30000 // E-18
const ANTI_BOT_WAIT_MS = 8000 // E-74 本项目自定
const HYDRATION_MIN_CHARS = 40 // E-74 本项目自定
const ANTI_BOT_TITLE = /just a moment|attention required|安全验证|访问验证|人机验证|verify you are human/i
const ANTI_BOT_DOM = /cf-turnstile|challenge-running|cf-browser-verification|waf_captcha|_Incapsula_/i
const LOGIN_PATH = /\/(login|signin|sign-in|passport|auth|account\/login)(\/|$|\?)/i

/**
 * E-74 检测表。硬失败线只划在「连首屏 DOM 都拿不到」（O-44），其余记 failures 继续交付。
 *
 * 可达性一律以「带真实 UA 的浏览器 GET + 首屏 DOM 实测」为准，**不得**用 HEAD 或裸状态码断死链：
 * 华为云等站的 WAF 对无 UA 的 HEAD 常回 HTTP 567，据此判定会把活页判成死链（试点实测）。
 */
async function detectFailures(page, response) {
	const failures = []
	const status = response ? response.status() : 0
	const title = await page.title().catch(() => '')
	const head = await page.evaluate(() => document.documentElement.innerHTML.slice(0, 4096)).catch(() => '')
	if (ANTI_BOT_TITLE.test(title) || ANTI_BOT_DOM.test(head)) {
		await page.waitForTimeout(ANTI_BOT_WAIT_MS)
		const title2 = await page.title().catch(() => '')
		if (ANTI_BOT_TITLE.test(title2)) {
			failures.push({ code: 'ANTI_BOT', message: `挑战页：${title2}`, url: page.url(), htmlHead: head.slice(0, 4096) })
		}
	}
	if (status === 401 || status === 403 || LOGIN_PATH.test(page.url())) {
		const wall = await page
			.evaluate(() => {
				const pwd = [...document.querySelectorAll('input[type=password]')].some((el) => {
					const r = el.getBoundingClientRect()
					return r.width > 0 && r.top < window.innerHeight
				})
				const marketing = !!document.querySelector('main section, [role=main] section, footer')
				return { pwd, marketing }
			})
			.catch(() => ({ pwd: false, marketing: true }))
		if (status === 401 || status === 403 || (wall.pwd && !wall.marketing)) {
			failures.push({ code: 'LOGIN_WALL', message: '登录墙挡住内容楼层', url: page.url() })
		}
	}
	const textLen = await page
		.evaluate(() => ((document.body && document.body.innerText) || '').trim().length)
		.catch(() => 0)
	if (textLen < HYDRATION_MIN_CHARS) {
		failures.push({ code: 'HYDRATION_EMPTY', message: `load 后正文仅 ${textLen} 字`, url: page.url() })
	}
	// 状态码放在最后判：DOM 已实测可用时只记事实、不中止该 URL（WAF 异常码不等于死链）
	if (status >= 400) {
		failures.push({
			code: 'HTTP_ERROR',
			status,
			domUsable: textLen >= HYDRATION_MIN_CHARS,
			message:
				textLen >= HYDRATION_MIN_CHARS
					? `主文档 HTTP ${status}，但首屏 DOM 与正文可用，按实测继续采集（WAF 异常码不判死链）`
					: `主文档 HTTP ${status}`,
			url: page.url()
		})
	}
	return { failures, title, textLen }
}

async function applyMask(page, selectors) {
	if (!selectors.length) return null
	const css = `${selectors.join(',')} { visibility: hidden !important; }`
	return page.addStyleTag({ content: css }).catch(() => null)
}

/** 逐档采集：面积 + 楼层 + 截图 + by-viewport 调试包。 */
async function collectSlot(page, ctx) {
	const { slot, viewport, overrides, shotter, withFloors, colorScheme } = ctx
	await page.setViewportSize({ width: viewport.viewport_px, height: viewport.height })
	const gate = await stableGate(page, { width: viewport.viewport_px, height: viewport.height })
	const warm = await warmupScroll(page, { width: viewport.viewport_px, height: viewport.height })

	const landmarks = await page.evaluate(collectLandmarksInPage, {
		slot,
		colorScheme,
		wrapperSelectors: overrides.wrappers.filter((w) => w && w.action === 'unwrap').map((w) => w.selector),
		splitHints: overrides.floors.filter((f) => f && f.action === 'split-hint').map((f) => f.selector)
	})

	const maskStyle = await applyMask(page, maskSelectors(overrides))
	const painted = await page.evaluate(collectPaintedAreaInPage, {
		slot,
		excludeSelectors: maskSelectors(overrides),
		noiseActive: overrides.effective
	})

	let full = null
	let viewportShot = null
	const floorShots = {}
	if (shotter) {
		full = await shotter.full(landmarks.documentSize.height)
		viewportShot = await shotter.viewport()
		if (withFloors) {
			const hideExtra = floorShotHideSelectors(overrides)
			const extraStyle = await applyMask(page, hideExtra)
			for (const item of landmarks.items) {
				const res = await shotter.floor(item.id, item.selector, item.bboxDoc)
				if (res.ok) floorShots[item.id] = res.path
			}
			if (extraStyle) await extraStyle.evaluate((el) => el.remove()).catch(() => {})
		}
	}
	if (maskStyle) await maskStyle.evaluate((el) => el.remove()).catch(() => {})

	for (const item of landmarks.items) {
		item.screenshot = floorShots[item.id] || null
	}

	return { slot, gate, warm, landmarks, painted, shots: { full, viewport: viewportShot } }
}

/**
 * @returns {{pageId:string, ok:boolean, failures:object[], summary:object}}
 */
export async function collectPage({
	browser,
	source,
	pageId,
	assetDir,
	overrides,
	contextBase,
	shotIndex,
	isMainUrl
}) {
	const rawPageDir = path.join(assetDir, 'raw', pageId)
	const failures = []
	const contextOptions = {
		...contextBase,
		viewport: { width: FALLBACK.pc.px, height: FALLBACK.pc.height },
		colorScheme: 'light'
	}
	// E-73：干净 context，无 storageState，loggedIn 恒 false
	const context = await browser.newContext(contextOptions)
	const page = await context.newPage()
	page.setDefaultTimeout(20000)
	page.setDefaultNavigationTimeout(NAV_TIMEOUT_MS)
	const sniffedBodies = attachStylesheetSniffer(page)

	let response = null
	let bodyHash = null
	let etag = null
	page.on('response', (res) => {
		if (res.url() === source.url || res.request().isNavigationRequest()) {
			const h = res.headers()
			if (h.etag && !etag) etag = h.etag
		}
	})
	try {
		response = await page.goto(source.url, { waitUntil: 'load', timeout: NAV_TIMEOUT_MS })
	} catch (err) {
		failures.push({ code: 'HTTP_ERROR', message: `导航失败：${String(err.message || err)}`, url: source.url })
	}

	const hasDom = await page.evaluate(() => !!(document.body && document.documentElement)).catch(() => false)
	if (!hasDom) {
		await context.close().catch(() => {})
		return { pageId, ok: false, hardFail: isMainUrl, failures: [...failures, { code: 'HTTP_ERROR', message: '拿不到首屏 DOM', url: source.url }] }
	}
	try {
		if (response) bodyHash = `sha256:${sha256(await response.text())}`
	} catch {
		/* 部分导航响应体不可再读 */
	}

	const detected = await detectFailures(page, response)
	failures.push(...detected.failures)
	const blockedHard = detected.failures.some((f) => f.code === 'ANTI_BOT' || f.code === 'LOGIN_WALL')

	const gate0 = await stableGate(page, contextOptions.viewport)
	// E-76：同意条只探测不点击
	const consent = await page.evaluate(probeConsentInPage).catch(() => ({ hits: [], ctaOccluded: false }))
	overrides.consentCandidates = consent.hits.map((h) => h.selector)
	const warm0 = await warmupScroll(page, contextOptions.viewport)

	// E-103：面积统计与截图之前把第三方 widget 根写进源 DOM
	const rootVars = await page.evaluate(collectCustomPropertiesInPage)
	const widgets = await page
		.evaluate(markThirdPartyWidgetsInPage, {
			firstPartyEtld1: source.etld1,
			excludeSelectors: overrides.noise.excludeSelectors,
			overlaySelectors: overrides.overlays.map((o) => o.selector).filter(Boolean)
		})
		.catch(() => [])

	// E-43 之后才分源；css-origins 先走，频率与聚类都吃第一方并集
	const originsResult = await collectCssOrigins(page, {
		sniffedBodies,
		overflowDir: path.join(rawPageDir, 'css-origins'),
		pageId
	})
	const union = firstPartyCssUnion(originsResult.origins, page.url())
	const analyzed = analyzeCss(union.text)
	const normalized = normalizeFrequency(analyzed)
	const media = mediaUnique(analyzed)
	const features = mediaFeatures(analyzed)
	if (originsResult.stillBlocked.length) {
		failures.push({
			code: 'CORS_STYLESHEET',
			message: `${originsResult.stillBlocked.length} 张跨源 stylesheet 未恢复`,
			url: page.url()
		})
	}

	// E-08–E-13：聚类定三档实际像素
	const resolved = resolveViewports(media, rootVars.rootFontSizePx)
	const bySlotViewport = Object.fromEntries(resolved.viewports.map((v) => [v.slot, v]))

	const finalUrl = page.url()
	const perSlotResults = {}
	const landmarksBySlot = {}
	const shotters = {}
	for (const slot of ['pc', 'tablet', 'mobile']) {
		const viewport = bySlotViewport[slot]
		shotters[slot] = createShotter({
			page,
			assetDir,
			pageId,
			slot,
			viewportPx: viewport.viewport_px,
			viewportSource: viewport.viewportSource,
			colorScheme: 'light',
			index: shotIndex
		})
		const res = await collectSlot(page, {
			slot,
			viewport,
			overrides,
			shotter: blockedHard ? null : shotters[slot],
			withFloors: slot === 'pc',
			colorScheme: 'light'
		})
		perSlotResults[slot] = res.painted
		landmarksBySlot[slot] = {
			pageId,
			slot,
			viewport_px: viewport.viewport_px,
			viewportSource: viewport.viewportSource,
			colorScheme: 'light',
			documentSize: res.landmarks.documentSize,
			items: res.landmarks.items
		}
		await writeJson(path.join(rawPageDir, 'by-viewport', `${slot}.json`), {
			schemaVersion: 1,
			pageId,
			slot,
			viewport_px: viewport.viewport_px,
			viewportSource: viewport.viewportSource,
			gate: res.gate,
			warmup: res.warm,
			painted: res.painted,
			landmarkCount: res.landmarks.items.length,
			shots: res.shots
		})
	}

	// 仅 pc 上采交互态与 PRM 差分（E-21 第 7 步 / E-27）
	await page.setViewportSize({ width: bySlotViewport.pc.viewport_px, height: bySlotViewport.pc.height })
	await stableGate(page, { width: bySlotViewport.pc.viewport_px, height: bySlotViewport.pc.height })
	// E-41 当帧重标：mobile 档结束后 data-pt-floor 还指着 mobile 的楼层，语料 floorId 必须挂回 pc
	await retagLandmarks(page, landmarksBySlot.pc.items.map((i) => ({ id: i.id, selector: i.selector })))
	const interaction = blockedHard
		? { schemaVersion: 1, viewport_px: bySlotViewport.pc.viewport_px, slots: {}, unmapped: [] }
		: await collectInteractionStates(page, {
				viewportPx: bySlotViewport.pc.viewport_px,
				shoot: (slotName, state) => shotters.pc.state(slotName, state)
			})

	// T-60 识别色探针的栅格侧：位图 logo 上 CSS 读不到颜色，切图数主色当弱旁证
	const logoRaster = blockedHard ? null : await probeLogoColor(page)

	const motionRest = await page.evaluate(collectMotionSnapshotInPage).catch(() => [])
	await page.emulateMedia({ reducedMotion: 'reduce' }).catch(() => {})
	await doubleRaf(page)
	const motionReduced = await page.evaluate(collectMotionSnapshotInPage).catch(() => [])
	await page.emulateMedia({ reducedMotion: 'no-preference' }).catch(() => {})

	const fonts = await page.evaluate(collectFontsInPage).catch(() => ({ fontFace: [], stylesheets: [], computedStacks: [], documentFonts: [] }))
	const copy = await page.evaluate(collectCopyInPage, { maxItems: 800 })
	const navCandidates = await page.evaluate(collectNavCandidatesInPage).catch(() => [])
	const defaultSchemeProbe = await page.evaluate(probeDefaultSchemeInPage).catch(() => ({
		defaultSchemeObserved: false,
		skippedReason: 'probe-failed',
		candidate: 'light'
	}))
	const defaultScheme = defaultSchemeProbe.defaultSchemeObserved ? defaultSchemeProbe.scheme : defaultSchemeProbe.candidate

	// E-28：先探测再决定是否新开 dark context
	const darkResult = await probeDarkMode({
		browser,
		contextOptions: { ...contextOptions, viewport: { width: bySlotViewport.pc.viewport_px, height: bySlotViewport.pc.height } },
		url: finalUrl,
		page,
		firstPartyCss: union.text,
		landmarks: landmarksBySlot.pc.items,
		defaultScheme
	})
	if (darkResult.failed) {
		failures.push({ code: 'DARK_PROBE_FAILED', message: darkResult.reason, url: finalUrl })
	}

	let darkCustomProps = null
	if (darkResult.darkMode === 'supported' && darkResult.darkPage) {
		const dp = darkResult.darkPage
		const darkShotter = createShotter({
			page: dp,
			assetDir,
			pageId,
			slot: 'pc',
			viewportPx: bySlotViewport.pc.viewport_px,
			viewportSource: bySlotViewport.pc.viewportSource,
			colorScheme: 'dark',
			index: shotIndex
		})
		const darkOrigins = await collectCssOrigins(dp, {
			sniffedBodies: null,
			overflowDir: path.join(rawPageDir, 'dark', 'css-origins'),
			pageId
		})
		const darkUnion = firstPartyCssUnion(darkOrigins.origins, dp.url())
		const darkAnalyzed = analyzeCss(darkUnion.text)
		const darkLandmarks = await dp.evaluate(collectLandmarksInPage, { slot: 'pc', colorScheme: 'dark', wrapperSelectors: [], splitHints: [] })
		const darkPainted = await dp.evaluate(collectPaintedAreaInPage, { slot: 'pc', excludeSelectors: maskSelectors(overrides), noiseActive: overrides.effective })
		darkCustomProps = await dp.evaluate(collectCustomPropertiesInPage)
		await darkShotter.dark('full')
		await darkShotter.dark('viewport')
		const darkMobile = createShotter({
			page: dp,
			assetDir,
			pageId,
			slot: 'mobile',
			viewportPx: bySlotViewport.mobile.viewport_px,
			viewportSource: bySlotViewport.mobile.viewportSource,
			colorScheme: 'dark',
			index: shotIndex
		})
		await dp.setViewportSize({ width: bySlotViewport.mobile.viewport_px, height: bySlotViewport.mobile.height })
		await stableGate(dp, { width: bySlotViewport.mobile.viewport_px, height: bySlotViewport.mobile.height })
		const darkMobilePainted = await dp.evaluate(collectPaintedAreaInPage, { slot: 'mobile', excludeSelectors: [], noiseActive: overrides.effective })
		await darkMobile.dark('viewport')

		const darkDir = path.join(rawPageDir, 'dark')
		await writeJson(path.join(darkDir, 'css-origins.json'), darkOrigins.origins)
		await writeJson(path.join(darkDir, 'css-frequency.json'), darkAnalyzed.ok ? darkAnalyzed.result : { error: darkAnalyzed.reason })
		await writeJson(
			path.join(darkDir, 'painted-area.json'),
			buildPaintedArea({
				pageId,
				pageUrl: finalUrl,
				perSlot: { pc: darkPainted, mobile: darkMobilePainted },
				normalized: normalizeFrequency(darkAnalyzed)
			})
		)
		await writeJson(path.join(darkDir, 'custom-properties.json'), buildCustomProperties(darkCustomProps, null))
		await writeJson(path.join(darkDir, 'landmarks.pc.json'), {
			pageId,
			slot: 'pc',
			viewport_px: bySlotViewport.pc.viewport_px,
			viewportSource: bySlotViewport.pc.viewportSource,
			colorScheme: 'dark',
			documentSize: darkLandmarks.documentSize,
			items: darkLandmarks.items
		})
		await darkResult.darkContext.close().catch(() => {})
	} else if (darkResult.darkContext) {
		await darkResult.darkContext.close().catch(() => {})
	}

	// ---- 落盘（E-82 无条件文件，逐页层）
	const painted = buildPaintedArea({ pageId, pageUrl: finalUrl, perSlot: perSlotResults, normalized })
	const firstPartyVars = buildFirstPartyVariables(rootVars, union.text, originsResult.origins)
	// E-85 overflow 必须在频率并集与 alias 网扫完原文之后才清空 css，否则最大的表整个退出统计
	await spillOverflow(originsResult)
	await writeJson(path.join(rawPageDir, 'css-origins.json'), originsResult.origins)
	await writeJson(path.join(rawPageDir, 'css-frequency.json'), {
		schemaVersion: 1,
		pageId,
		firstPartyKeys: union.keys,
		analyzer: analyzed.ok ? analyzed.result : null,
		error: analyzed.ok ? null : analyzed.reason
	})
	await writeJson(path.join(rawPageDir, 'css-frequency.normalized.json'), { schemaVersion: 1, pageId, ...normalized })
	await writeJson(path.join(rawPageDir, 'painted-area.json'), painted)
	await writeJson(path.join(rawPageDir, 'media-queries.json'), {
		schemaVersion: 1,
		pageId,
		rawUnique: media,
		features,
		rootFontSizePx: rootVars.rootFontSizePx,
		clusteredBucketsPx: resolved.buckets,
		bands: resolved.bands,
		sampled: resolved.viewports.map((v) => ({ slot: v.slot, viewport_px: v.viewport_px, viewportSource: v.viewportSource }))
	})
	await writeJson(path.join(rawPageDir, 'custom-properties.json'), buildCustomProperties(rootVars, darkCustomProps))
	await writeJson(path.join(rawPageDir, 'first-party-variables.json'), firstPartyVars)
	await writeJson(path.join(rawPageDir, 'fonts.json'), { schemaVersion: 1, pageId, ...fonts })
	await writeJson(path.join(rawPageDir, 'interaction-states.json'), interaction)
	await writeJson(
		path.join(rawPageDir, 'noise-report.json'),
		buildNoiseReport({
			pageId,
			pageUrl: finalUrl,
			perSlot: perSlotResults,
			origins: originsResult.origins,
			iframes: widgets.filter((w) => w.tag === 'iframe').map((w) => ({ ...w, host: null })),
			overrides
		})
	)
	const roleCandidates = buildRoleCandidates({
		pageId,
		pageUrl: finalUrl,
		painted,
		roleEvidence: perSlotResults.pc ? perSlotResults.pc.roleEvidence : {},
		defaultScheme,
		logoRaster
	})
	await writeJson(path.join(rawPageDir, 'role-candidates.json'), roleCandidates)

	const corpusHash = sha256(JSON.stringify(copy.items.map((i) => i.text)))
	await writeJson(path.join(rawPageDir, 'copy-corpus.json'), {
		schemaVersion: 1,
		pageId,
		url: finalUrl,
		loggedIn: false,
		items: copy.items
	})
	await writeJson(path.join(rawPageDir, 'copy-stats.json'), {
		schemaVersion: 1,
		pageId,
		pageCount: 1,
		itemCount: copy.items.length,
		hash: `sha256:${corpusHash}`,
		url: finalUrl,
		loggedIn: false,
		copyTruncated: copy.copyTruncated,
		bySlot: copy.bySlot,
		textAutospace: {
			computed: copy.textAutospace.computed,
			declaredInFirstParty: /text-autospace/i.test(union.text),
			source: /text-autospace/i.test(union.text) ? 'author-declared' : 'ua-initial',
			samples: copy.textAutospace.samples,
			autospaceActive: copy.textAutospace.autospaceActive
		},
		person: copy.person,
		cta: copy.cta,
		ctaUnmapped: copy.ctaUnmapped,
		productNameCandidates: copy.productNameCandidates,
		numberSamples: copy.numberSamples,
		chromeCopyPreview: copy.chromeCopyPreview
	})

	// E-83 条件文件：观测到动效才写
	const motionChanged = motionRest.some((a, i) => motionReduced[i] && a.transitionDuration !== motionReduced[i].transitionDuration)
	const hasMotion = motionRest.some((m) => m.animationName !== 'none' || (m.transitionDuration && m.transitionDuration !== '0s'))
	let motionWritten = false
	if (hasMotion) {
		await writeJson(path.join(rawPageDir, 'motion-reduced.json'), {
			schemaVersion: 1,
			pageId,
			viewport_px: bySlotViewport.pc.viewport_px,
			changed: motionChanged,
			rest: motionRest,
			reduced: motionReduced
		})
		motionWritten = true
	}

	await context.close().catch(() => {})

	const dominantFont = painted.slots.pc && painted.slots.pc.fonts[0] ? painted.slots.pc.fonts[0].fontFamily : null
	// B-35：本页第一方 CSS 并集里的 `@font-face` 族名，去重排序后作字体轴的设计意图证据
	const firstPartyFontFaces = [...new Set(fontFaceFamilies(union.text))].sort().join(', ')
	const identity = roleCandidates.candidates.find((c) => c.proposedRoles.includes('color.identity'))
	const primary = roleCandidates.candidates.find((c) => c.proposedRoles.includes('color.primary'))

	return {
		pageId,
		ok: true,
		hardFail: false,
		failures,
		landmarksBySlot,
		viewports: resolved.viewports,
		summary: {
			pageId,
			sourceId: source.sourceId,
			url: source.url,
			finalUrl,
			variant: source.variant,
			title: detected.title,
			extractedAt: new Date().toISOString(),
			darkMode: darkResult.darkMode,
			darkReason: darkResult.reason,
			defaultScheme,
			defaultSchemeObserved: !!defaultSchemeProbe.defaultSchemeObserved,
			skippedReason: defaultSchemeProbe.skippedReason || null,
			readyGate: {
				used: gate0.used,
				fontsTimeout: gate0.fontsTimeout,
				lazyTruncated: warm0.lazyTruncated,
				quietOk: gate0.quietOk
			},
			corpusIndex: { hash: `sha256:${corpusHash}`, itemCount: copy.items.length, loggedIn: false },
			candidatePages: navCandidates,
			consent: { hits: consent.hits, ctaOccludedByConsent: consent.ctaOccluded },
			fingerprints: { ...(etag ? { etag } : {}), ...(bodyHash ? { bodyHash } : {}) },
			// E-48：独立 token 文件探测是加分项，失败写 not_found 后继续纯反推
			firstPartyTokens: firstPartyVars.tokenFileProbe.status,
			motionWritten,
			logoProbe: logoRaster,
			// 体检输入必须带 confidence（B-34：两侧都是 low 的弱旁证不得构成分歧断言）。
			// 面积表的字体行没有 confidence 字段（E-86 未定义），故记 null——这是「无此观测位」的
			// 如实陈述，不得为凑判据填一个档（D3）。
			// 字体轴另带 designedValue（B-35）：本页第一方 `@font-face` 声明的族名集合。字体栈里
			// 其余族名是由 OS / 浏览器解析出的系统回退，不是本站的设计选择，不得据其不同判分歧。
			cohesionAxes: {
				'color.identity': identity ? { value: identity.hex, confidence: identity.confidence } : null,
				'color.primary': primary ? { value: primary.hex, confidence: primary.confidence } : null,
				'typography.fontFamily': dominantFont
					? { value: dominantFont, confidence: null, designedValue: firstPartyFontFaces }
					: null
			},
			cssOriginCount: originsResult.origins.length,
			corsRecovered: originsResult.recovered.length,
			corsStillBlocked: originsResult.stillBlocked.length,
			widgetsMarked: widgets.length
		}
	}
}
