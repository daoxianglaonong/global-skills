/**
 * 截图双轨与降级（E-30–E-34）。整页 fullPage + 按 landmark 切楼层；
 * 切片瞬间隐藏 sticky / fixed；原图 PNG 走 gitignore，入库的是 WebP 缩略 + index.json（E-32）。
 */
import path from 'node:path'
import sharp from 'sharp'
import { writeBinary, relFromAsset } from './fsutil.mjs'
import { doubleRaf } from './gates.mjs'

const CLIP_LIMIT_PX = 16384 // Blink 单边纹理上限
const THUMB_WIDTH = 960
const HIDE_STICKY_CSS = `
[data-pt-sticky-hide] { visibility: hidden !important; }
`

/** 切片瞬间把 sticky / fixed 顶栏设为 visibility:hidden（E-30）。 */
async function markSticky(page) {
	return page.evaluate(() => {
		const marked = []
		for (const el of document.body ? document.body.querySelectorAll('*') : []) {
			const cs = getComputedStyle(el)
			if (cs.position !== 'fixed' && cs.position !== 'sticky') continue
			el.setAttribute('data-pt-sticky-hide', '1')
			marked.push(1)
		}
		return marked.length
	})
}

async function unmarkSticky(page) {
	await page.evaluate(() => {
		for (const el of document.querySelectorAll('[data-pt-sticky-hide]')) el.removeAttribute('data-pt-sticky-hide')
	})
}

async function toWebp(pngPath, buf) {
	const webpPath = pngPath.replace(/\.png$/, '.webp')
	const out = await sharp(buf).resize({ width: THUMB_WIDTH, withoutEnlargement: true }).webp({ quality: 72 }).toBuffer()
	await writeBinary(webpPath, out)
	return webpPath
}

export function createShotter({ page, assetDir, pageId, slot, viewportPx, viewportSource, colorScheme, index }) {
	const baseDir = path.join(assetDir, 'screenshots', pageId)

	async function capture(relPath, options, meta) {
		const pngPath = path.join(baseDir, relPath)
		let buf
		let degraded = meta.degraded || null
		try {
			buf = await page.screenshot({ animations: 'disabled', caret: 'hide', timeout: 45000, ...options })
		} catch (err) {
			// E-34 第 1 级：fonts.ready 拖死截图器 → 逃生阀后重试
			process.env.PW_TEST_SCREENSHOT_NO_FONTS_READY = '1'
			degraded = 'fonts-escape'
			try {
				buf = await page.screenshot({ animations: 'disabled', caret: 'hide', timeout: 45000, ...options })
			} catch (err2) {
				return { ok: false, reason: String(err2.message || err || '') }
			}
		}
		await writeBinary(pngPath, buf)
		const webpPath = await toWebp(pngPath, buf)
		const item = {
			path: relFromAsset(assetDir, pngPath),
			thumb: relFromAsset(assetDir, webpPath),
			kind: meta.kind,
			pageId,
			slot,
			viewport_px: viewportPx,
			viewportSource,
			colorScheme,
			landmarkId: meta.landmarkId ?? null,
			selector: meta.selector ?? null,
			bboxDoc: meta.bboxDoc ?? null,
			mask: meta.mask || [],
			animations: 'disabled',
			degraded,
			stickyArtifacts: meta.stickyArtifacts || null
		}
		index.push(item)
		return { ok: true, item }
	}

	return {
		/** 整页：允许 sticky 伪影，index 标 stickyArtifacts: possible（E-30） */
		async full(documentHeight) {
			await page.evaluate(() => window.scrollTo(0, 0))
			await doubleRaf(page)
			if (documentHeight > CLIP_LIMIT_PX) {
				// E-34 第 2 级：超 16384 → 降级为 viewport + 逐层 clip
				return capture(`${slot}--full.png`, { fullPage: false }, {
					kind: 'full',
					degraded: 'clip-16384',
					stickyArtifacts: 'possible'
				})
			}
			return capture(`${slot}--full.png`, { fullPage: true }, { kind: 'full', stickyArtifacts: 'possible' })
		},
		async viewport() {
			await page.evaluate(() => window.scrollTo(0, 0))
			await doubleRaf(page)
			return capture(`${slot}--viewport.png`, { fullPage: false }, { kind: 'viewport' })
		},
		/** 楼层：对 landmark 根做 locator.screenshot；locator 失效时当帧重标 + clip（E-34 第 3 级） */
		async floor(landmarkId, selector, bboxDoc) {
			const rel = path.join('floors', `${slot}--${landmarkId}.png`)
			const pngPath = path.join(baseDir, rel)
			const count = await markSticky(page)
			const style = await page.addStyleTag({ content: HIDE_STICKY_CSS }).catch(() => null)
			try {
				let buf = null
				let degraded = null
				try {
					buf = await page
						.locator(`[data-pt-floor="${landmarkId}"]`)
						.first()
						.screenshot({ animations: 'disabled', caret: 'hide', timeout: 30000 })
				} catch {
					degraded = 'relabel-clip'
					const box = await page.evaluate((id) => {
						const el = document.querySelector(`[data-pt-floor="${id}"]`)
						if (!el) return null
						const r = el.getBoundingClientRect()
						return {
							x: Math.max(0, Math.round(r.x + window.scrollX)),
							y: Math.max(0, Math.round(r.y + window.scrollY)),
							width: Math.max(1, Math.round(r.width)),
							height: Math.max(1, Math.min(r.height, 16000))
						}
					}, landmarkId)
					if (!box) return { ok: false, reason: 'landmark-lost' }
					buf = await page.screenshot({ animations: 'disabled', caret: 'hide', fullPage: true, clip: box, timeout: 45000 })
				}
				await writeBinary(pngPath, buf)
				const webpPath = await toWebp(pngPath, buf)
				index.push({
					path: relFromAsset(assetDir, pngPath),
					thumb: relFromAsset(assetDir, webpPath),
					kind: 'floor',
					pageId,
					slot,
					viewport_px: viewportPx,
					viewportSource,
					colorScheme,
					landmarkId,
					selector,
					bboxDoc: bboxDoc || null,
					mask: count ? ['sticky'] : [],
					animations: 'disabled',
					degraded,
					stickyArtifacts: null
				})
				return { ok: true, path: relFromAsset(assetDir, pngPath) }
			} catch (err) {
				return { ok: false, reason: String(err.message || err) }
			} finally {
				if (style) await style.evaluate((el) => el.remove()).catch(() => {})
				await unmarkSticky(page)
			}
		},
		/** 交互态切片，必须在 CDP forcePseudoState 存活期间调用（E-23） */
		async state(slotName, stateName, selector) {
			const rel = path.join('states', `${slot}--${slotName}--${stateName}.png`)
			const pngPath = path.join(baseDir, rel)
			try {
				const buf = await page
					.locator(selector || `[data-pt-tgt="${slotName}"]`)
					.first()
					.screenshot({ animations: 'disabled', caret: 'hide', timeout: 15000 })
				await writeBinary(pngPath, buf)
				const webpPath = await toWebp(pngPath, buf)
				index.push({
					path: relFromAsset(assetDir, pngPath),
					thumb: relFromAsset(assetDir, webpPath),
					kind: 'state',
					pageId,
					slot,
					viewport_px: viewportPx,
					viewportSource,
					colorScheme,
					landmarkId: null,
					selector: selector || `[data-pt-tgt="${slotName}"]`,
					bboxDoc: null,
					mask: [],
					animations: 'disabled',
					degraded: null,
					stickyArtifacts: null
				})
				return relFromAsset(assetDir, pngPath)
			} catch {
				return null
			}
		},
		/** 暗色截图必须落在该页目录下，不得另开 screenshots/dark/（E-31） */
		async dark(kind) {
			const rel = path.join('dark', `${slot}--${kind}.png`)
			return capture(rel, { fullPage: kind === 'full' }, { kind: kind === 'full' ? 'full' : 'viewport' })
		}
	}
}
