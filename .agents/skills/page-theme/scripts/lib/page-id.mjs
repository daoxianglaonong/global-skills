/**
 * E-99 `pageId` 确定性算法。`coverage.pages[].pageId`（M-39）、`raw/{page-id}/`、
 * `screenshots/{page-id}/` 必须共用本函数；同身份重抓必须得到同一值。
 * 自测（E-99 对照表 8 行）：node lib/page-id.mjs --selftest
 */
import crypto from 'node:crypto'
import path from 'node:path'

/** 第 4 步跟踪参数闭集（本项目自定） */
const TRACKING = [/^utm_/i, /^fbclid$/i, /^gclid$/i, /^gad_/i, /^_ga$/i, /^mc_cid$/i, /^mc_eid$/i]

function sha256(text) {
	return crypto.createHash('sha256').update(text, 'utf8').digest('hex')
}

/** 第 6 步文件名安全：逐段施加，跨段的 `--` 分隔符不得被压缩掉 */
function safeSegment(input) {
	return String(input)
		.toLowerCase()
		.replace(/[^a-z0-9._-]+/g, '-')
		.replace(/-+/g, '-')
		.replace(/^[-.]+|[-.]+$/g, '')
}

/** 第 6 步 canonical：origin（剥 www）+ 归一 pathname + 过滤后 search */
function canonicalOf(url, normPath, filteredSearch) {
	const host = url.hostname.toLowerCase().replace(/^www\./, '')
	const port = url.port ? `:${url.port}` : ''
	return `${url.protocol}//${host}${port}${normPath}${filteredSearch ? `?${filteredSearch}` : ''}`
}

/**
 * @param {string} finalUrl 该页最终 URL
 * @param {string} variant O-37 第 7 步的 variant，空串表示主注册域且无子域
 * @param {Map<string,string>} [taken] 已占用的 pageId → canonical，用于第 7 步冲突消解
 */
export function computePageId(finalUrl, variant = '', taken = new Map()) {
	const url = new URL(finalUrl)

	// 第 2 步：pathname 解码、去尾 `/`（根除外）、忽略 hash
	let decoded = url.pathname
	try {
		decoded = decodeURIComponent(url.pathname)
	} catch {
		/* 保留原始 pathname */
	}
	const normPath = decoded !== '/' ? decoded.replace(/\/+$/, '') : '/'

	// 第 3 / 8 步：路径茎
	const stemRaw = normPath === '/' || normPath === '' ? 'home' : normPath.replace(/^\/+/, '').replace(/\//g, '-')
	let stem = safeSegment(stemRaw) || 'home'

	// 第 4 步：丢跟踪参数、按名排序、拼 k=v&k=v
	const kept = []
	for (const [k, v] of url.searchParams.entries()) {
		if (TRACKING.some((re) => re.test(k))) continue
		kept.push([k, v])
	}
	kept.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : a[1] < b[1] ? -1 : 1))
	const filteredSearch = kept.map(([k, v]) => `${k}=${v}`).join('&')
	let querySeg = ''
	if (filteredSearch) {
		const safe = safeSegment(filteredSearch)
		querySeg = safe.length > 24 ? `q-${sha256(filteredSearch).slice(0, 8)}` : `q-${safe}`
	}

	// 第 5 步：来源前缀（跨注册域 pageId 唯一性由此兜住）
	const variantSeg = variant ? safeSegment(String(variant).replace(/\./g, '-')) : ''

	const parts = [variantSeg, stem, querySeg].filter(Boolean)
	let pageId = parts.join('--')

	const canonical = canonicalOf(url, normPath, filteredSearch)

	// 第 6 步：最长 80，截断时写入 canonical 短哈希
	if (pageId.length > 80) {
		const tag = sha256(canonical).slice(0, 8)
		pageId = `${pageId.slice(0, 80 - tag.length - 1).replace(/[-.]+$/, '')}-${tag}`
	}

	// 第 7 步：同名不同身份 → 追加 canonical 短哈希；同身份重抓复用原值
	const prior = taken.get(pageId)
	if (prior !== undefined && prior !== canonical) {
		pageId = `${pageId}-${sha256(canonical).slice(0, 6)}`
	}
	taken.set(pageId, canonical)

	if (!pageId || pageId === '.' || pageId === '..') pageId = 'home'
	return pageId
}

/** raw / screenshots 目录名安全兜底：调用方拼路径前统一走这里 */
export function pageDir(root, pageId, ...rest) {
	return path.join(root, pageId, ...rest)
}

// ---------------------------------------------------------------- 自测（E-99 对照表）

const VECTORS = [
	{ url: 'https://www.huaweicloud.com/', variant: '', expect: 'home' },
	{ url: 'https://www.huaweicloud.com/product', variant: '', expect: 'product' },
	{ url: 'https://www.huaweicloud.com/a/b', variant: '', expect: 'a-b' },
	{ url: 'https://activity.huaweicloud.com/xxx', variant: 'activity', expect: 'activity--xxx' },
	{ url: 'https://www.huaweicloud.cn/', variant: 'huaweicloud-cn', expect: 'huaweicloud-cn--home' },
	{ url: 'https://docs.example.co.uk/a', variant: 'example-co-uk.docs', expect: 'example-co-uk-docs--a' },
	{ url: 'https://www.example.com/?utm_source=x', variant: '', expect: 'home' },
	{ url: 'https://www.example.com/p?id=1', variant: '', expect: 'p--q-id-1' }
]

function runSelfTest() {
	let failed = 0
	for (const v of VECTORS) {
		const got = computePageId(v.url, v.variant, new Map())
		const ok = got === v.expect
		if (!ok) failed++
		process.stdout.write(`${ok ? 'PASS' : 'FAIL'} ${v.url} → ${got}${ok ? '' : `（期望 ${v.expect}）`}\n`)
	}
	// 第 7 步冲突：同名不同 canonical 必须错开；同身份重抓必须复用
	const taken = new Map()
	const a = computePageId('https://www.huaweicloud.com/', '', taken)
	const b = computePageId('https://www.huaweicloud.com:8443/', '', taken)
	const again = computePageId('https://www.huaweicloud.com/', '', taken)
	const collisionOk = a === 'home' && b !== a && again === 'home'
	if (!collisionOk) failed++
	process.stdout.write(`${collisionOk ? 'PASS' : 'FAIL'} 冲突消解 ${a} / ${b} / 重抓 ${again}\n`)

	process.stdout.write(`page-id 自测：${VECTORS.length + 1 - failed}/${VECTORS.length + 1} 通过\n`)
	process.exit(failed ? 1 : 0)
}

const invokedDirectly = process.argv[1] && import.meta.filename === path.resolve(process.argv[1])
if (invokedDirectly && process.argv.includes('--selftest')) runSelfTest()
