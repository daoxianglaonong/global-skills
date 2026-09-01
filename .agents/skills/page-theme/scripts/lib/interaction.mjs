/**
 * 交互态采集（E-23–E-26）。伪类优先走 CDP `CSS.forcePseudoState`；
 * 变量驱动的 hover 变化几乎不生效时按 E-24 回退真实鼠标，并标 `trigger: cdp | mouse`。
 * 取节点必须用 DOM.getDocument + DOM.querySelector（Playwright 1.62 无公开 remoteObject）。
 */
import { parseCssColor, deltaE00 } from './color.mjs'
import { doubleRaf } from './gates.mjs'
import { pickInteractionTargetsInPage } from './in-page-semantic.mjs'

const DELTA_TRIGGER = 2 // E-24 本项目自定触发线，不是色匹配 fail 线
export const SLOT_NAMES = ['primary_cta', 'secondary_cta', 'nav_link', 'body_link', 'input_outline']

/** E-26 采集属性闭集；四边一致的 border 折叠成一条。 */
function readStyleInPage(el) {
	const cs = getComputedStyle(el)
	const sides = ['Top', 'Right', 'Bottom', 'Left']
	const widths = sides.map((s) => cs[`border${s}Width`])
	const styles = sides.map((s) => cs[`border${s}Style`])
	const colors = sides.map((s) => cs[`border${s}Color`])
	const uniform = widths.every((w) => w === widths[0]) && styles.every((s) => s === styles[0]) && colors.every((c) => c === colors[0])
	return {
		backgroundColor: cs.backgroundColor,
		color: cs.color,
		border: uniform
			? { uniform: true, width: widths[0], style: styles[0], color: colors[0] }
			: { uniform: false, width: widths, style: styles, color: colors },
		boxShadow: cs.boxShadow,
		outline: cs.outline,
		outlineOffset: cs.outlineOffset,
		opacity: cs.opacity,
		transform: cs.transform,
		transitionDuration: cs.transitionDuration,
		transitionTimingFunction: cs.transitionTimingFunction,
		borderRadius: cs.borderRadius
	}
}

async function read(page, selector) {
	return page.locator(selector).first().evaluate(readStyleInPage)
}

async function withForcedPseudo(page, selector, pseudo, fn) {
	const client = await page.context().newCDPSession(page)
	try {
		await client.send('DOM.enable')
		await client.send('CSS.enable')
		const doc = await client.send('DOM.getDocument')
		const { nodeId } = await client.send('DOM.querySelector', { nodeId: doc.root.nodeId, selector })
		if (!nodeId) return { ok: false, reason: 'no-node-id' }
		await client.send('CSS.forcePseudoState', { nodeId, forcedPseudoClasses: [pseudo] })
		await doubleRaf(page)
		await new Promise((r) => setTimeout(r, 120))
		// 截图必须在同一 CDPSession 存活期间完成（E-23）
		const value = await fn()
		await client.send('CSS.forcePseudoState', { nodeId, forcedPseudoClasses: [] })
		return { ok: true, value }
	} catch (err) {
		return { ok: false, reason: String(err.message || err) }
	} finally {
		await client.detach().catch(() => {})
	}
}

function bgDelta(a, b) {
	const pa = parseCssColor(a && a.backgroundColor)
	const pb = parseCssColor(b && b.backgroundColor)
	if (!pa || !pb) return null
	if ((pa.a ?? 1) < 0.08 && (pb.a ?? 1) < 0.08) return 0
	return deltaE00(pa, pb)
}

/**
 * @param {import('playwright').Page} page
 * @param {(slot:string,state:string)=>Promise<string|null>} shoot 截图回调，返回资产内相对路径
 */
export async function collectInteractionStates(page, { viewportPx, shoot }) {
	const picked = await page.evaluate(pickInteractionTargetsInPage)
	const slots = {}

	for (const slot of SLOT_NAMES) {
		const target = picked.slots[slot]
		if (!target) {
			slots[slot] = { omitted: true, reason: 'no-representative-element' }
			continue
		}
		const selector = target.selector
		try {
			await page.locator(selector).first().scrollIntoViewIfNeeded({ timeout: 5000 })
			await doubleRaf(page)
		} catch {
			/* 滚不到也继续读 computed */
		}

		let rest
		try {
			rest = await read(page, selector)
		} catch (err) {
			slots[slot] = { omitted: true, reason: `unreadable: ${String(err.message || err)}` }
			continue
		}

		const hoverCdp = await withForcedPseudo(page, selector, 'hover', async () => {
			const style = await read(page, selector)
			const shot = shoot ? await shoot(slot, 'hover') : null
			return { style, shot }
		})
		let hover = hoverCdp.ok ? hoverCdp.value.style : null
		let hoverShot = hoverCdp.ok ? hoverCdp.value.shot : null
		let trigger = 'cdp'
		const cdpDelta = bgDelta(rest, hover)

		// E-24：CSS 变量驱动的 hover 在 CDP 下可能几乎不变色，必须再跑一次真实鼠标
		if (cdpDelta !== null && cdpDelta < DELTA_TRIGGER) {
			try {
				await page.locator(selector).first().hover({ timeout: 4000 })
				await doubleRaf(page)
				await new Promise((r) => setTimeout(r, 140))
				const mouseStyle = await read(page, selector)
				const mouseDelta = bgDelta(rest, mouseStyle)
				if (mouseDelta !== null && mouseDelta >= DELTA_TRIGGER) {
					hover = mouseStyle
					trigger = 'mouse'
					if (shoot) hoverShot = await shoot(slot, 'hover')
				}
				await page.mouse.move(0, 0)
				await doubleRaf(page)
			} catch {
				/* 鼠标回退失败保持 CDP 结果 */
			}
		}

		const focusCdp = await withForcedPseudo(page, selector, 'focus-visible', async () => {
			const style = await read(page, selector)
			const shot = shoot ? await shoot(slot, 'focus-visible') : null
			return { style, shot }
		})

		slots[slot] = {
			omitted: false,
			selector,
			text: target.text,
			tagName: target.tagName,
			inChrome: target.inChrome,
			rest,
			hover,
			focusVisible: focusCdp.ok ? focusCdp.value.style : null,
			trigger,
			deltaE00: { cdpHover: cdpDelta, restToHover: bgDelta(rest, hover) },
			screenshots: {
				hover: hoverShot,
				focusVisible: focusCdp.ok ? focusCdp.value.shot : null
			}
		}
	}

	return {
		schemaVersion: 1,
		viewport_px: viewportPx,
		slots,
		// hero 内实心可点色块但没落进闭集槽位 → 交 agent（E-25），脚本不发明第四套选择器
		unmapped: picked.unmapped
	}
}
