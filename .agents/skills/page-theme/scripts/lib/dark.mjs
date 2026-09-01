/**
 * 暗色探测与判定（E-28 / E-29）。先探测再决定是否新开 dark context；
 * 三条假阳性（透明背景、子串选择器扫到 html/body、整页深色品牌）必须防住。
 * `defaultScheme`（E-100）与本判定正交，由 probeDefaultSchemeInPage 给出。
 */
import { parseCssColor, deltaE00, relativeLuminance } from './color.mjs'
import { stableGate, warmupScroll } from './gates.mjs'
import { probeDarkSignalsInPage } from './in-page-semantic.mjs'

const DARK_MEDIA = /prefers-color-scheme\s*:\s*dark/i
const DARK_SELECTOR = /\[data-theme\s*[~|^$*]?=\s*["']?dark|\[data-bs-theme\s*=\s*["']?dark|(?:^|[\s,>+~])(?:html|body)?\.dark\b|color-scheme\s*:\s*[^;]*\bdark\b/i
const SEMANTIC_DELTA = 2

function opaqueColor(css) {
	const c = parseCssColor(css)
	// E-29 条 1：透明背景不得当作 L = 0 的深色
	if (!c || (c.a ?? 1) < 0.08) return null
	return c
}

/**
 * @returns {{darkMode:'supported'|'section-only'|'omitted', reason:string, evidence:object,
 *            darkContext:import('playwright').BrowserContext|null, darkPage:import('playwright').Page|null}}
 */
export async function probeDarkMode({ browser, contextOptions, url, page, firstPartyCss, landmarks, defaultScheme }) {
	const hasDarkMedia = DARK_MEDIA.test(firstPartyCss || '')
	const hasDarkSelector = DARK_SELECTOR.test(firstPartyCss || '')
	const signals = await page.evaluate(probeDarkSignalsInPage)
	const lightHtmlBg = opaqueColor(signals.htmlBackground)
	const lightBodyBg = opaqueColor(signals.bodyBackground)
	const rootSwitch = signals.rootThemeAttr || signals.hasSwitcher

	const evidence = { hasDarkMedia, hasDarkSelector, ...signals, defaultScheme }

	// E-29 条 3：整页深色品牌 / 仅 inverse 楼层，且无 dark media、无根切换器 → 不得写 raw/{page-id}/dark/
	if (!hasDarkMedia && !rootSwitch) {
		const inverse = (landmarks || []).some((item) => {
			if (item.roleHint !== 'section') return false
			const c = opaqueColor(item.computed && item.computed.backgroundColor)
			if (!c) return false
			const L = relativeLuminance(c)
			return defaultScheme === 'light' ? L < 0.2 : L > 0.8
		})
		return {
			darkMode: inverse ? 'section-only' : 'omitted',
			reason: inverse
				? '无 dark media、无根切换器，只观测到 inverse 楼层；按 E-29 不写 dark/'
				: '无 dark media、无根切换器、无 inverse 楼层',
			evidence,
			darkContext: null,
			darkPage: null
		}
	}

	// 有 dark media 或根切换器才付新开 context 的代价（E-28：不得在同一 page 上来回 emulateMedia）
	let context = null
	let darkPage = null
	try {
		context = await browser.newContext({ ...contextOptions, colorScheme: 'dark' })
		darkPage = await context.newPage()
		darkPage.setDefaultNavigationTimeout(60000)
		await darkPage.goto(url, { waitUntil: 'load', timeout: 60000 })
		await stableGate(darkPage, contextOptions.viewport)
		const darkSignals = await darkPage.evaluate(probeDarkSignalsInPage)
		evidence.darkSignals = darkSignals

		const darkHtmlBg = opaqueColor(darkSignals.htmlBackground)
		const darkBodyBg = opaqueColor(darkSignals.bodyBackground)
		const deltas = [deltaE00(lightHtmlBg, darkHtmlBg), deltaE00(lightBodyBg, darkBodyBg)].filter((d) => d !== null)
		evidence.semanticDeltaE00 = deltas
		const changed = deltas.some((d) => d >= SEMANTIC_DELTA)

		if (!changed) {
			await context.close().catch(() => {})
			return {
				darkMode: 'omitted',
				reason: hasDarkMedia
					? 'CSS 含 prefers-color-scheme: dark，但切 colorScheme:dark 后语义色未变化'
					: '仅有根切换器、无 CSS 对应选择器命中，未观测到语义色变化',
				evidence,
				darkContext: null,
				darkPage: null
			}
		}
		await warmupScroll(darkPage, contextOptions.viewport)
		return {
			darkMode: 'supported',
			reason: '存在 dark media / 根切换器，且切 colorScheme:dark 后语义色变化',
			evidence,
			darkContext: context,
			darkPage
		}
	} catch (err) {
		if (context) await context.close().catch(() => {})
		return {
			darkMode: 'omitted',
			reason: `暗色探测失败：${String(err.message || err)}`,
			evidence: { ...evidence, error: String(err.message || err) },
			darkContext: null,
			darkPage: null,
			failed: true
		}
	}
}
