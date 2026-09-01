/**
 * 输入柔性归一化层。插在 O-37 第 1 步之前，实现〔009〕构建合同裁决 3 的八条规则。
 * 归一化不得静默：每条 URL 落 { inputRaw, normalizedUrl, transforms[] } 进 raw/session.json。
 * 自测：node normalize-url.mjs --selftest
 */
import path from 'node:path'

const ZERO_WIDTH = /[\u200B-\u200D\uFEFF]/g
const TRAILING_PUNCT = /[,;。，、)\]]+$/u
const LEADING_PUNCT = /^[(\[]+/u
const MD_LINK = /\[[^\]\n]*\]\(\s*([^)\s]+)\s*\)/gu
/** 只有带 `//` 的才算已写 scheme：否则 `localhost:3000` 会被误判成 `localhost:` 协议 */
const HAS_SCHEME = /^[a-z][a-z0-9+.\-]*:\/\//iu
/** 主机形：普通标签（含 IDN 中文域名 / xn--）、localhost、IPv4、[IPv6]，可带端口、路径、query、hash */
const HOSTLIKE =
	/^(?:\[[0-9a-fA-F:.]+\]|localhost|\d{1,3}(?:\.\d{1,3}){3}|(?:[^\s/?#:@.]+\.)+[^\s/?#:@.]{2,})(?::\d{1,5})?(?:[/?#][^\s]*)?$/u
/** 规则 3 的切分点：逗号后紧跟新 URL 起手式时才切，避免劈开 `?ids=1,2` */
const COMMA_SPLIT = /,(?=\s*(?:[a-z][a-z0-9+.\-]*:\/\/|www\.|(?:[^\s/?#:@.,]+\.)+[^\s/?#:@.,]{2,}))/iu
const ACCEPTED_PROTOCOLS = new Set(['http:', 'https:'])

/** 剥外层包裹（规则 2），可嵌套多层。 */
function unwrap(token, transforms) {
	let s = token
	for (let i = 0; i < 8; i++) {
		const before = s
		if (s.startsWith('<') && s.endsWith('>')) {
			s = s.slice(1, -1)
			transforms.push('unwrap:angle')
		}
		for (const q of ['"', "'", '`']) {
			if (s.length >= 2 && s.startsWith(q) && s.endsWith(q)) {
				s = s.slice(1, -1)
				transforms.push(`unwrap:quote${q === '"' ? 'double' : q === "'" ? 'single' : 'back'}`)
			}
		}
		const lead = s.match(LEADING_PUNCT)
		if (lead) {
			s = s.slice(lead[0].length)
			transforms.push('strip-leading-punct')
		}
		const tail = s.match(TRAILING_PUNCT)
		if (tail) {
			s = s.slice(0, -tail[0].length)
			transforms.push('strip-trailing-punct')
		}
		s = s.trim()
		if (s === before) break
	}
	return s
}

/** 规则 1–3：清洗后切成若干候选 token，保留基础 transforms。 */
function tokenize(inputRaw) {
	const base = []
	let s = String(inputRaw ?? '')
	const trimmed = s.trim()
	if (trimmed !== s) base.push('trim')
	s = trimmed
	const stripped = s.replace(ZERO_WIDTH, '')
	if (stripped !== s) {
		s = stripped
		base.push('strip-zero-width')
	}

	// markdown 链接与散落 token 必须按出现位置交错收集，顺序即 source 顺序（规则 3）
	const segments = []
	let cursor = 0
	MD_LINK.lastIndex = 0
	for (let m = MD_LINK.exec(s); m; m = MD_LINK.exec(s)) {
		if (m.index > cursor) segments.push({ text: s.slice(cursor, m.index), md: false })
		segments.push({ text: m[1], md: true })
		cursor = m.index + m[0].length
	}
	if (cursor < s.length) segments.push({ text: s.slice(cursor), md: false })

	const tokens = []
	for (const seg of segments) {
		if (seg.md) {
			tokens.push({ text: seg.text, extra: ['unwrap:markdown-link'] })
			continue
		}
		for (const chunk of seg.text.split(/\s+/u)) {
			if (!chunk) continue
			const parts = chunk.split(COMMA_SPLIT)
			for (const part of parts) {
				const t = part.trim()
				if (t) tokens.push({ text: t, extra: parts.length > 1 ? ['split-multi:comma'] : [] })
			}
		}
	}
	if (tokens.length > 1) base.push(`split-multi:${tokens.length}`)
	return { base, tokens }
}

/**
 * 把一个用户输入值归一成 0..n 条 URL 记录。
 * @returns {{inputRaw:string, normalizedUrl:string|null, transforms:string[], error?:string}[]}
 */
export function normalizeUrlInput(inputRaw) {
	const { base, tokens } = tokenize(inputRaw)
	const out = []
	for (const tok of tokens) {
		const transforms = [...base, ...tok.extra]
		let s = unwrap(tok.text, transforms)

		// 规则 4：无 scheme 且形如主机名 → 只补 https，不试探 http
		if (!HAS_SCHEME.test(s)) {
			if (s.startsWith('//')) {
				s = `https:${s}`
				transforms.push('add-scheme:https')
			} else if (HOSTLIKE.test(s)) {
				s = `https://${s}`
				transforms.push('add-scheme:https')
			}
		}

		let u
		try {
			u = new URL(s)
		} catch {
			out.push({ inputRaw: String(inputRaw ?? ''), normalizedUrl: null, transforms, error: 'url-unparseable' })
			continue
		}
		// 规则 5：scheme 归小写（WHATWG 已保证）；hostname 归一见 O-37 第 2 步
		if (!ACCEPTED_PROTOCOLS.has(u.protocol)) {
			out.push({
				inputRaw: String(inputRaw ?? ''),
				normalizedUrl: null,
				transforms: [...transforms, `reject-scheme:${u.protocol.replace(':', '')}`],
				error: 'url-unparseable'
			})
			continue
		}
		// 规则 6：query 与 hash 原样保留，不删 utm_* 或任何参数
		const normalizedUrl = u.href
		if (normalizedUrl !== tok.text) transforms.push('whatwg-serialize')
		out.push({ inputRaw: String(inputRaw ?? ''), normalizedUrl, transforms })
	}
	if (!out.length) {
		out.push({ inputRaw: String(inputRaw ?? ''), normalizedUrl: null, transforms: base, error: 'url-unparseable' })
	}
	return out
}

/** 把 CLI 的多个 --url 值一次归一，保持出现顺序（规则 3 的多条各自成为独立 source）。 */
export function normalizeUrlList(rawList) {
	return rawList.flatMap((raw) => normalizeUrlInput(raw))
}

// ---------------------------------------------------------------- 自测

const CASES = [
	{
		rule: 1,
		name: '去首尾空白 + 剥零宽字符',
		input: '  \u200bhttps://www.huaweicloud.com/\ufeff  ',
		expect: ['https://www.huaweicloud.com/'],
		wants: ['trim', 'strip-zero-width']
	},
	{
		rule: 2,
		name: '剥外层包裹：<>、引号、反引号、markdown、尾随标点',
		input: '<https://a.com/x> "https://b.com" `https://c.com` [华为云](https://www.huaweicloud.com/) https://d.com/e，',
		expect: [
			'https://a.com/x',
			'https://b.com/',
			'https://c.com/',
			'https://www.huaweicloud.com/',
			'https://d.com/e'
		],
		wants: ['unwrap:angle', 'unwrap:markdown-link', 'strip-trailing-punct']
	},
	{
		rule: 3,
		name: '一个值内的多条按出现顺序拆成独立 source',
		input: 'huaweicloud.com, www.huaweicloud.cn\nhttps://x.com/a',
		expect: ['https://huaweicloud.com/', 'https://www.huaweicloud.cn/', 'https://x.com/a'],
		wants: ['split-multi:3']
	},
	{
		rule: 4,
		name: '裸主机名补 https（含 IDN 中文域名与端口），不试探 http',
		input: 'huaweicloud.com 中文域名.中国:8443/a 127.0.0.1:8080 localhost:3000',
		expect: [
			'https://huaweicloud.com/',
			'https://xn--fiq06l2rdsvs.xn--fiqs8s:8443/a',
			'https://127.0.0.1:8080/',
			'https://localhost:3000/'
		],
		wants: ['add-scheme:https']
	},
	{
		rule: 5,
		name: 'scheme 与 host 归小写，路径大小写保留',
		input: 'HTTPS://Www.A.COM/Path/Mixed',
		expect: ['https://www.a.com/Path/Mixed'],
		wants: []
	},
	{
		rule: 6,
		name: 'query 与 hash 原样保留，不删 utm_*',
		input: 'https://a.com/p?utm_source=x&utm_medium=y&id=1#frag',
		expect: ['https://a.com/p?utm_source=x&utm_medium=y&id=1#frag'],
		wants: []
	},
	{
		rule: 7,
		name: '归一后仍不可解析或非 http/https → url-unparseable',
		input: 'ftp://a.com javascript:alert(1) 这不是一个地址',
		expect: [null, null, null],
		wants: ['reject-scheme:ftp']
	},
	{
		rule: 8,
		name: '每条都带可回放的 transforms 对照，归一化不静默',
		input: ' <huaweicloud.com> ',
		expect: ['https://huaweicloud.com/'],
		wants: ['trim', 'unwrap:angle', 'add-scheme:https']
	}
]

function runSelfTest() {
	let failed = 0
	for (const c of CASES) {
		const recs = normalizeUrlInput(c.input)
		const got = recs.map((r) => r.normalizedUrl)
		const allTransforms = recs.flatMap((r) => r.transforms)
		const okUrls = JSON.stringify(got) === JSON.stringify(c.expect)
		const missing = c.wants.filter((w) => !allTransforms.includes(w))
		const ok = okUrls && missing.length === 0
		if (!ok) failed++
		process.stdout.write(
			`${ok ? 'PASS' : 'FAIL'} 规则 ${c.rule} ${c.name}\n` +
				(ok ? '' : `     期望 ${JSON.stringify(c.expect)}\n     实得 ${JSON.stringify(got)}\n     缺 transforms ${JSON.stringify(missing)}\n`)
		)
	}
	process.stdout.write(`normalize-url 自测：${CASES.length - failed}/${CASES.length} 通过\n`)
	process.exit(failed ? 1 : 0)
}

const invokedDirectly = process.argv[1] && import.meta.filename === path.resolve(process.argv[1])
if (invokedDirectly && process.argv.includes('--selftest')) runSelfTest()
