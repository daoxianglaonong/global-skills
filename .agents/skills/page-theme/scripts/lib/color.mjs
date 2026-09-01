/**
 * 颜色工具。raw 里颜色必须同时给 `hex` + `oklch`（E-81）；ΔE00 用于 E-24 触发线与 E-94 记录。
 * 本模块只做换算，不做任何角色判定。
 */

const NAMED = {
	transparent: { r: 0, g: 0, b: 0, a: 0 },
	black: { r: 0, g: 0, b: 0, a: 1 },
	white: { r: 255, g: 255, b: 255, a: 1 },
	currentcolor: null
}

/** 解析 computed 值（`rgb()` / `rgba()` / hex / 少量关键字）。解析不了返回 null，不猜。 */
export function parseCssColor(input) {
	if (input === null || input === undefined) return null
	const s = String(input).trim().toLowerCase()
	if (!s || s === 'none') return null
	if (s in NAMED) return NAMED[s]

	let m = s.match(/^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)(?:\s*,\s*([\d.]+%?))?\s*\)$/)
	if (!m) m = s.match(/^rgba?\(\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)(?:\s*\/\s*([\d.]+%?))?\s*\)$/)
	if (m) {
		let a = 1
		if (m[4] !== undefined) a = m[4].endsWith('%') ? Number(m[4].slice(0, -1)) / 100 : Number(m[4])
		return { r: Number(m[1]), g: Number(m[2]), b: Number(m[3]), a }
	}

	m = s.match(/^#([0-9a-f]{3,8})$/)
	if (m) {
		let h = m[1]
		if (h.length === 3 || h.length === 4) h = h.split('').map((c) => c + c).join('')
		return {
			r: parseInt(h.slice(0, 2), 16),
			g: parseInt(h.slice(2, 4), 16),
			b: parseInt(h.slice(4, 6), 16),
			a: h.length >= 8 ? parseInt(h.slice(6, 8), 16) / 255 : 1
		}
	}
	return null
}

export function toHex(c) {
	if (!c) return null
	const h = (n) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0')
	return `#${h(c.r)}${h(c.g)}${h(c.b)}`
}

function srgbToLinear(v) {
	const x = v / 255
	return x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4
}

/** WCAG 相对亮度（E-100 判定与 T-117 对比度共用） */
export function relativeLuminance(c) {
	if (!c) return null
	return 0.2126 * srgbToLinear(c.r) + 0.7152 * srgbToLinear(c.g) + 0.0722 * srgbToLinear(c.b)
}

export function contrastRatio(a, b) {
	const la = relativeLuminance(a)
	const lb = relativeLuminance(b)
	if (la === null || lb === null) return null
	const hi = Math.max(la, lb)
	const lo = Math.min(la, lb)
	return Number(((hi + 0.05) / (lo + 0.05)).toFixed(4))
}

/** sRGB → OKLCH（Ottosson 2020 矩阵）。返回 { l, c, h }，h 单位度，无彩时 h = 0。 */
export function srgbToOklch(c) {
	if (!c) return null
	const r = srgbToLinear(c.r)
	const g = srgbToLinear(c.g)
	const b = srgbToLinear(c.b)
	const l_ = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b)
	const m_ = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b)
	const s_ = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b)
	const L = 0.2104542553 * l_ + 0.793617785 * m_ - 0.0040720468 * s_
	const A = 1.9779984951 * l_ - 2.428592205 * m_ + 0.4505937099 * s_
	const B = 0.0259040371 * l_ + 0.7827717662 * m_ - 0.808675766 * s_
	const chroma = Math.hypot(A, B)
	let hue = (Math.atan2(B, A) * 180) / Math.PI
	if (hue < 0) hue += 360
	return {
		l: Number(L.toFixed(4)),
		c: Number(chroma.toFixed(4)),
		h: chroma < 1e-4 ? 0 : Number(hue.toFixed(2))
	}
}

export function oklchString(c) {
	const o = srgbToOklch(c)
	return o ? `oklch(${o.l} ${o.c} ${o.h})` : null
}

function rgbToLab(c) {
	const r = srgbToLinear(c.r)
	const g = srgbToLinear(c.g)
	const b = srgbToLinear(c.b)
	let x = (r * 0.4124564 + g * 0.3575761 + b * 0.1804375) / 0.95047
	let y = r * 0.2126729 + g * 0.7151522 + b * 0.072175
	let z = (r * 0.0193339 + g * 0.119192 + b * 0.9503041) / 1.08883
	const f = (t) => (t > 216 / 24389 ? Math.cbrt(t) : (841 / 108) * t + 4 / 29)
	x = f(x)
	y = f(y)
	z = f(z)
	return { L: 116 * y - 16, a: 500 * (x - y), b: 200 * (y - z) }
}

/** CIEDE2000。E-24 的触发线用它，E-94 只记录不设 fail 线（T-90）。 */
export function deltaE00(c1, c2) {
	if (!c1 || !c2) return null
	const a = rgbToLab(c1)
	const b = rgbToLab(c2)
	const kL = 1
	const kC = 1
	const kH = 1
	const C1 = Math.hypot(a.a, a.b)
	const C2 = Math.hypot(b.a, b.b)
	const Cbar = (C1 + C2) / 2
	const G = 0.5 * (1 - Math.sqrt(Cbar ** 7 / (Cbar ** 7 + 25 ** 7)))
	const a1p = (1 + G) * a.a
	const a2p = (1 + G) * b.a
	const C1p = Math.hypot(a1p, a.b)
	const C2p = Math.hypot(a2p, b.b)
	const deg = (rad) => (rad * 180) / Math.PI
	const rad = (d) => (d * Math.PI) / 180
	const h1p = C1p === 0 ? 0 : (deg(Math.atan2(a.b, a1p)) + 360) % 360
	const h2p = C2p === 0 ? 0 : (deg(Math.atan2(b.b, a2p)) + 360) % 360
	const dLp = b.L - a.L
	const dCp = C2p - C1p
	let dhp = 0
	if (C1p * C2p !== 0) {
		dhp = h2p - h1p
		if (dhp > 180) dhp -= 360
		else if (dhp < -180) dhp += 360
	}
	const dHp = 2 * Math.sqrt(C1p * C2p) * Math.sin(rad(dhp) / 2)
	const Lbar = (a.L + b.L) / 2
	const Cbarp = (C1p + C2p) / 2
	let hbarp = h1p + h2p
	if (C1p * C2p !== 0) {
		if (Math.abs(h1p - h2p) > 180) hbarp += h1p + h2p < 360 ? 360 : -360
		hbarp /= 2
	}
	const T =
		1 -
		0.17 * Math.cos(rad(hbarp - 30)) +
		0.24 * Math.cos(rad(2 * hbarp)) +
		0.32 * Math.cos(rad(3 * hbarp + 6)) -
		0.2 * Math.cos(rad(4 * hbarp - 63))
	const dTheta = 30 * Math.exp(-(((hbarp - 275) / 25) ** 2))
	const Rc = 2 * Math.sqrt(Cbarp ** 7 / (Cbarp ** 7 + 25 ** 7))
	const Sl = 1 + (0.015 * (Lbar - 50) ** 2) / Math.sqrt(20 + (Lbar - 50) ** 2)
	const Sc = 1 + 0.045 * Cbarp
	const Sh = 1 + 0.015 * Cbarp * T
	const Rt = -Math.sin(rad(2 * dTheta)) * Rc
	return Number(
		Math.sqrt(
			(dLp / (kL * Sl)) ** 2 +
				(dCp / (kC * Sc)) ** 2 +
				(dHp / (kH * Sh)) ** 2 +
				Rt * (dCp / (kC * Sc)) * (dHp / (kH * Sh))
		).toFixed(3)
	)
}

/** raw 落盘用的统一颜色描述：hex + alpha + oklch（E-81） */
export function describeColor(cssValue) {
	const parsed = parseCssColor(cssValue)
	if (!parsed) return null
	return {
		hex: toHex(parsed),
		alpha: Number(Number(parsed.a ?? 1).toFixed(4)),
		oklch: srgbToOklch(parsed),
		css: String(cssValue)
	}
}
