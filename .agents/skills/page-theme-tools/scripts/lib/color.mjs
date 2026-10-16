// CSS colour parsing, normalisation and CIEDE2000 distance. No thresholds live here:
// "is this the same design intent" is a model decision; scripts only report exact / deltaE.

const NAMED_LIST = `aliceblue f0f8ff antiquewhite faebd7 aqua 00ffff aquamarine 7fffd4 azure f0ffff
beige f5f5dc bisque ffe4c4 black 000000 blanchedalmond ffebcd blue 0000ff blueviolet 8a2be2
brown a52a2a burlywood deb887 cadetblue 5f9ea0 chartreuse 7fff00 chocolate d2691e coral ff7f50
cornflowerblue 6495ed cornsilk fff8dc crimson dc143c cyan 00ffff darkblue 00008b darkcyan 008b8b
darkgoldenrod b8860b darkgray a9a9a9 darkgreen 006400 darkgrey a9a9a9 darkkhaki bdb76b
darkmagenta 8b008b darkolivegreen 556b2f darkorange ff8c00 darkorchid 9932cc darkred 8b0000
darksalmon e9967a darkseagreen 8fbc8f darkslateblue 483d8b darkslategray 2f4f4f darkslategrey 2f4f4f
darkturquoise 00ced1 darkviolet 9400d3 deeppink ff1493 deepskyblue 00bfff dimgray 696969
dimgrey 696969 dodgerblue 1e90ff firebrick b22222 floralwhite fffaf0 forestgreen 228b22
fuchsia ff00ff gainsboro dcdcdc ghostwhite f8f8ff gold ffd700 goldenrod daa520 gray 808080
green 008000 greenyellow adff2f grey 808080 honeydew f0fff0 hotpink ff69b4 indianred cd5c5c
indigo 4b0082 ivory fffff0 khaki f0e68c lavender e6e6fa lavenderblush fff0f5 lawngreen 7cfc00
lemonchiffon fffacd lightblue add8e6 lightcoral f08080 lightcyan e0ffff lightgoldenrodyellow fafad2
lightgray d3d3d3 lightgreen 90ee90 lightgrey d3d3d3 lightpink ffb6c1 lightsalmon ffa07a
lightseagreen 20b2aa lightskyblue 87cefa lightslategray 778899 lightslategrey 778899
lightsteelblue b0c4de lightyellow ffffe0 lime 00ff00 limegreen 32cd32 linen faf0e6 magenta ff00ff
maroon 800000 mediumaquamarine 66cdaa mediumblue 0000cd mediumorchid ba55d3 mediumpurple 9370db
mediumseagreen 3cb371 mediumslateblue 7b68ee mediumspringgreen 00fa9a mediumturquoise 48d1cc
mediumvioletred c71585 midnightblue 191970 mintcream f5fffa mistyrose ffe4e1 moccasin ffe4b5
navajowhite ffdead navy 000080 oldlace fdf5e6 olive 808000 olivedrab 6b8e23 orange ffa500
orangered ff4500 orchid da70d6 palegoldenrod eee8aa palegreen 98fb98 paleturquoise afeeee
palevioletred db7093 papayawhip ffefd5 peachpuff ffdab9 peru cd853f pink ffc0cb plum dda0dd
powderblue b0e0e6 purple 800080 rebeccapurple 663399 red ff0000 rosybrown bc8f8f royalblue 4169e1
saddlebrown 8b4513 salmon fa8072 sandybrown f4a460 seagreen 2e8b57 seashell fff5ee sienna a0522d
silver c0c0c0 skyblue 87ceeb slateblue 6a5acd slategray 708090 slategrey 708090 snow fffafa
springgreen 00ff7f steelblue 4682b4 tan d2b48c teal 008080 thistle d8bfd8 tomato ff6347
turquoise 40e0d0 violet ee82ee wheat f5deb3 white ffffff whitesmoke f5f5f5 yellow ffff00
yellowgreen 9acd32`

export const NAMED = new Map()
{
	const parts = NAMED_LIST.split(/\s+/)
	for (let i = 0; i < parts.length; i += 2) NAMED.set(parts[i], `#${parts[i + 1]}`)
}

/** Colour-ish keywords that never count as an off-asset colour. */
export const NEUTRAL_KEYWORDS = new Set(['transparent', 'currentcolor', 'inherit', 'initial', 'unset', 'revert', 'none'])

function channel(v, max) {
	if (v === undefined) return null
	return v.endsWith('%') ? (Number(v.slice(0, -1)) / 100) * max : Number(v)
}

function alphaOf(v) {
	if (v === undefined) return 1
	return v.endsWith('%') ? Number(v.slice(0, -1)) / 100 : Number(v)
}

function hslToRgb(h, s, l) {
	const k = (n) => (n + h / 30) % 12
	const a = s * Math.min(l, 1 - l)
	const f = (n) => l - a * Math.max(-1, Math.min(k(n) - 3, 9 - k(n), 1))
	return { r: f(0) * 255, g: f(8) * 255, b: f(4) * 255 }
}

/** Parse hex / rgb[a] / hsl[a] / named colours. Returns {r,g,b,a} or null; never guesses. */
export function parseColor(input) {
	if (input === null || input === undefined) return null
	const s = String(input).trim().toLowerCase()
	if (s === 'transparent') return { r: 0, g: 0, b: 0, a: 0 }
	if (NAMED.has(s)) return parseColor(NAMED.get(s))
	let m = s.match(/^#([0-9a-f]+)$/)
	if (m) {
		let h = m[1]
		if (![3, 4, 6, 8].includes(h.length)) return null
		if (h.length < 6) h = [...h].map((c) => c + c).join('')
		return {
			r: parseInt(h.slice(0, 2), 16),
			g: parseInt(h.slice(2, 4), 16),
			b: parseInt(h.slice(4, 6), 16),
			a: h.length === 8 ? parseInt(h.slice(6, 8), 16) / 255 : 1
		}
	}
	m = s.match(/^(rgb|hsl)a?\((.*)\)$/)
	if (!m) return null
	const parts = m[2].replace(/\s*\/\s*/, ' / ').split(/\s*,\s*|\s+/).filter((p) => p && p !== '/')
	if (parts.length < 3 || parts.length > 4) return null
	const a = alphaOf(parts[3])
	let rgb
	if (m[1] === 'rgb') {
		rgb = { r: channel(parts[0], 255), g: channel(parts[1], 255), b: channel(parts[2], 255) }
	} else {
		const h = Number(parts[0].replace(/deg$/, ''))
		rgb = hslToRgb(((h % 360) + 360) % 360, channel(parts[1], 1), channel(parts[2], 1))
	}
	if ([rgb.r, rgb.g, rgb.b, a].some((x) => !Number.isFinite(x))) return null
	return { ...rgb, a }
}

const byte = (n) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0')

/** Canonical comparison key: 8-digit lowercase hex, alpha included. */
export function colorKey(value) {
	const c = typeof value === 'string' ? parseColor(value) : value
	if (!c) return null
	return `#${byte(c.r)}${byte(c.g)}${byte(c.b)}${byte((c.a ?? 1) * 255)}`
}

/** Human-facing hex: 6 digits when opaque, 8 when not. */
export function colorHex(value) {
	const k = colorKey(value)
	if (!k) return null
	return k.endsWith('ff') ? k.slice(0, 7) : k
}

/**
 * Every colour literal inside a CSS value (hex, functions, named words). Colour functions that
 * parseColor does not understand (oklch, lab, color(), ...) come back with key null.
 */
export function colorLiterals(value) {
	const out = []
	const v = String(value)
		.replace(/url\([^)]*\)/gi, 'url()')
		.replace(/"[^"]*"|'[^']*'/g, '""')
		.replace(/--[\w-]+/g, '--')
	for (const m of v.matchAll(/#[0-9a-fA-F]{3,8}\b|\b(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch|color)\([^)]*\)|\b[a-zA-Z]+\b/gi)) {
		const word = m[0].toLowerCase()
		if (/^[a-z]+$/.test(word) && !NAMED.has(word)) continue
		out.push({ raw: m[0], key: colorKey(m[0]), index: m.index })
	}
	return out
}

function lin(v) {
	const x = v / 255
	return x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4
}

function toLab(c) {
	const r = lin(c.r)
	const g = lin(c.g)
	const b = lin(c.b)
	const f = (t) => (t > 216 / 24389 ? Math.cbrt(t) : (841 / 108) * t + 4 / 29)
	const x = f((r * 0.4124564 + g * 0.3575761 + b * 0.1804375) / 0.95047)
	const y = f(r * 0.2126729 + g * 0.7151522 + b * 0.072175)
	const z = f((r * 0.0193339 + g * 0.119192 + b * 0.9503041) / 1.08883)
	return { L: 116 * y - 16, a: 500 * (x - y), b: 200 * (y - z) }
}

/** CIEDE2000 between two colours (strings or parsed). Alpha is ignored. */
export function deltaE00(x, y) {
	const c1 = typeof x === 'string' ? parseColor(x) : x
	const c2 = typeof y === 'string' ? parseColor(y) : y
	if (!c1 || !c2) return null
	const p = toLab(c1)
	const q = toLab(c2)
	const rad = (d) => (d * Math.PI) / 180
	const deg = (r) => (r * 180) / Math.PI
	const Cbar = (Math.hypot(p.a, p.b) + Math.hypot(q.a, q.b)) / 2
	const G = 0.5 * (1 - Math.sqrt(Cbar ** 7 / (Cbar ** 7 + 25 ** 7)))
	const a1 = (1 + G) * p.a
	const a2 = (1 + G) * q.a
	const C1 = Math.hypot(a1, p.b)
	const C2 = Math.hypot(a2, q.b)
	const h1 = C1 === 0 ? 0 : (deg(Math.atan2(p.b, a1)) + 360) % 360
	const h2 = C2 === 0 ? 0 : (deg(Math.atan2(q.b, a2)) + 360) % 360
	let dh = 0
	if (C1 * C2 !== 0) {
		dh = h2 - h1
		if (dh > 180) dh -= 360
		else if (dh < -180) dh += 360
	}
	const dH = 2 * Math.sqrt(C1 * C2) * Math.sin(rad(dh) / 2)
	const Lbar = (p.L + q.L) / 2
	const Cb = (C1 + C2) / 2
	let hbar = h1 + h2
	if (C1 * C2 !== 0) {
		if (Math.abs(h1 - h2) > 180) hbar += h1 + h2 < 360 ? 360 : -360
		hbar /= 2
	}
	const T = 1 - 0.17 * Math.cos(rad(hbar - 30)) + 0.24 * Math.cos(rad(2 * hbar)) +
		0.32 * Math.cos(rad(3 * hbar + 6)) - 0.2 * Math.cos(rad(4 * hbar - 63))
	const dTheta = 30 * Math.exp(-(((hbar - 275) / 25) ** 2))
	const Rc = 2 * Math.sqrt(Cb ** 7 / (Cb ** 7 + 25 ** 7))
	const Sl = 1 + (0.015 * (Lbar - 50) ** 2) / Math.sqrt(20 + (Lbar - 50) ** 2)
	const Sc = 1 + 0.045 * Cb
	const Sh = 1 + 0.015 * Cb * T
	const Rt = -Math.sin(rad(2 * dTheta)) * Rc
	const dL = q.L - p.L
	const dC = C2 - C1
	return Number(Math.sqrt((dL / Sl) ** 2 + (dC / Sc) ** 2 + (dH / Sh) ** 2 + Rt * (dC / Sc) * (dH / Sh)).toFixed(3))
}
