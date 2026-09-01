/**
 * O-37 九步：style-set-id、variant、sourceId。
 * eTLD+1 一律走 tldts 的 PSL 快照（合同 §3），禁止内嵌手写后缀子集。
 * 自测（O-37 测试向量全表 8 条）：node style-set-id.mjs --selftest
 */
import path from 'node:path'
import { getDomain } from 'tldts'
import { normalizeUrlInput } from './normalize-url.mjs'

/** `github.io` 一类私有后缀必须参与 eTLD+1，否则 O-37 向量第 8 行不成立 */
const TLDTS_OPTS = { allowPrivateDomains: true }
const IPV4 = /^\d{1,3}(?:\.\d{1,3}){3}$/

/** 归一名：只留 [a-z0-9-]，点号换连字符，保留 xn-- 前缀（O-37 第 5 步）。 */
export function normalizeName(input) {
	return String(input)
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '')
}

function isIpLiteral(host) {
	return IPV4.test(host) || (host.startsWith('[') && host.endsWith(']'))
}

/** O-37 第 2–6 步：拆出 host / eTLD+1 归一名 / rest。 */
function dissect(url) {
	// WHATWG 已把 IDN 转成 A-label（punycode），第 5 步不需另做转换
	const host = url.hostname.toLowerCase().replace(/\.$/, '')
	if (isIpLiteral(host)) {
		const bare = host.replace(/^\[|\]$/g, '')
		return { host, etld1: host, etld1Name: bare.replace(/[.:]/g, '-'), rest: '', ip: true }
	}
	const etld1 = getDomain(host, TLDTS_OPTS) || host
	let rest = host.endsWith(etld1) ? host.slice(0, Math.max(0, host.length - etld1.length - 1)) : ''
	const labels = rest ? rest.split('.') : []
	if (labels[0] === 'www') labels.shift()
	return { host, etld1, etld1Name: normalizeName(etld1), rest: labels.join('.'), ip: false }
}

/**
 * @param {{inputRaw:string, normalizedUrl:string|null, transforms:string[], error?:string}[]} records
 *        normalize-url 的输出（本层插在 O-37 第 1 步之前，合同裁决 3）
 * @param {string|null} explicitStyleSetId O-32 的 --style-set-id
 */
export function computeStyleSet(records, explicitStyleSetId = null) {
	const sources = []
	const blockers = []

	for (const rec of records) {
		if (!rec.normalizedUrl) {
			blockers.push({
				code: 'url-unparseable',
				scope: 'site',
				inputRaw: rec.inputRaw,
				message: `URL 无法按 WHATWG 解析或 scheme 不受理，未收：${rec.inputRaw}`
			})
			continue
		}
		let url
		try {
			url = new URL(rec.normalizedUrl)
		} catch {
			blockers.push({
				code: 'url-unparseable',
				scope: 'site',
				inputRaw: rec.inputRaw,
				message: `URL 无法按 WHATWG 解析，未收：${rec.inputRaw}`
			})
			continue
		}
		sources.push({ record: rec, url, ...dissect(url) })
	}

	const main = sources[0] || null
	// 第 8 步：显式命名优先，否则取主 URL 的 eTLD+1 归一名
	const styleSetId = explicitStyleSetId ? normalizeName(explicitStyleSetId) : main ? main.etld1Name : ''

	const out = sources.map((s, i) => {
		// 第 7 步：同注册域取 rest；跨注册域取该来源 eTLD+1 归一名，其后有 rest 再接 `.rest`
		let variant = ''
		if (main && s.etld1 === main.etld1) variant = s.rest
		else variant = s.rest ? `${s.etld1Name}.${s.rest}` : s.etld1Name
		return {
			sourceId: `source-${String(i + 1).padStart(2, '0')}`,
			inputRaw: s.record.inputRaw,
			url: s.url.href,
			transforms: s.record.transforms,
			host: s.host,
			etld1: s.etld1,
			variant,
			isMain: i === 0
		}
	})

	return { styleSetId, sources: out, blockers, mainUrl: main ? main.url.href : null }
}

/** 便捷入口：直接吃用户原始字符串。 */
export function computeStyleSetFromRaw(rawList, explicitStyleSetId = null) {
	return computeStyleSet(rawList.flatMap((r) => normalizeUrlInput(r)), explicitStyleSetId)
}

// ---------------------------------------------------------------- 自测（O-37 测试向量全表）

const VECTORS = [
	{ url: 'https://www.huaweicloud.com/', styleSetId: 'huaweicloud-com', variant: '', note: '主 URL' },
	{ url: 'https://activity.huaweicloud.com/xxx', styleSetId: 'huaweicloud-com', variant: 'activity', note: '同注册域子域' },
	{ url: 'https://foo.bar.huaweicloud.com/', styleSetId: 'huaweicloud-com', variant: 'foo.bar', note: '同注册域多级子域' },
	{ url: 'https://www.huaweicloud.cn/', styleSetId: 'huaweicloud-com', variant: 'huaweicloud-cn', note: '跨注册域' },
	{ url: 'https://docs.example.co.uk/a', styleSetId: 'huaweicloud-com', variant: 'example-co-uk.docs', note: '跨注册域带子域' },
	{ url: 'https://127.0.0.1:8080/', styleSetId: 'huaweicloud-com', variant: '127-0-0-1', note: 'IPv4 字面量' },
	{ url: 'https://www.bbc.co.uk/', styleSetId: 'bbc-co-uk', variant: '', note: '作主 URL', asMain: true },
	{ url: 'https://foo.github.io/bar', styleSetId: 'foo-github-io', variant: '', note: '作主 URL；github.io 是 eTLD', asMain: true }
]

function runSelfTest() {
	const MAIN = 'https://www.huaweicloud.com/'
	let failed = 0
	for (const v of VECTORS) {
		const list = v.asMain ? [v.url] : [MAIN, v.url]
		const res = computeStyleSetFromRaw(list)
		const target = res.sources[v.asMain ? 0 : 1]
		const ok = res.styleSetId === v.styleSetId && target && target.variant === v.variant
		if (!ok) failed++
		process.stdout.write(
			`${ok ? 'PASS' : 'FAIL'} ${v.url}\n` +
				`     style_set_id=${res.styleSetId} variant=${JSON.stringify(target && target.variant)} （${v.note}）\n` +
				(ok ? '' : `     期望 style_set_id=${v.styleSetId} variant=${JSON.stringify(v.variant)}\n`)
		)
	}
	// 第 9 步：sourceId 按首次出现顺序编号，同一次调用内不得复用
	const seq = computeStyleSetFromRaw([MAIN, 'https://activity.huaweicloud.com/x', 'https://www.huaweicloud.cn/'])
	const ids = seq.sources.map((s) => s.sourceId)
	const seqOk = JSON.stringify(ids) === JSON.stringify(['source-01', 'source-02', 'source-03'])
	if (!seqOk) failed++
	process.stdout.write(`${seqOk ? 'PASS' : 'FAIL'} sourceId 顺序编号 ${JSON.stringify(ids)}\n`)

	process.stdout.write(`style-set-id 自测：${VECTORS.length + 1 - failed}/${VECTORS.length + 1} 通过\n`)
	process.exit(failed ? 1 : 0)
}

const invokedDirectly = process.argv[1] && import.meta.filename === path.resolve(process.argv[1])
if (invokedDirectly && process.argv.includes('--selftest')) runSelfTest()
