/**
 * 目标 variant 锁的判据源：资产的 variant 词表、体检结论、页壳挂载点。
 *
 * 判的是三件事，判据全部来自资产，本模块不认识任何站点：
 *
 * | 事实 | 从哪读 |
 * | --- | --- |
 * | 这份资产疑不疑似含多套设计语言 | `README.md` 那份 `coverage` 的 `cohesion.verdict` |
 * | 这份资产有哪几个 variant | 同一份 `coverage` 的 `pages[].variant` 去重（空串是 default，不进词表） |
 * | 这份资产有哪几条来源 URL | 同一份 `coverage` 的 `pages[].sourceId` 去重（`source-01`……） |
 * | 某个 variant 该用哪条页壳 | `patterns/index.yaml` 的 `chrome` 挂载点，按 `variants[].hosts` 配 |
 *
 * **variant 是采集侧按子域算出来的**（主 URL 得空串、`agentorchard.huaweicloud.com` 得
 * `agentorchard`），所以词表与 `hosts` 之间有一条真实的桥：一个 variant 的 hosts，就是
 * `coverage.pages[]` 里挂着这个 variant 名的那几页的 host。本模块靠这条桥把「声明的名字」
 * 翻成「该用哪条页壳」，不写任何站名、不写任何前缀黑名单。
 *
 * **词表里没有的名字一律算未知**，哪怕它读起来很像一套设计语言（现役华为云资产的
 * about / news / 合规中心三页同在 `www` 上，采集侧给的 variant 就是空串——它们的差异
 * 记在 `cohesion.suggestedSplit` 里，出路是拆资产，不是给 `target_variant` 编第三个名字）。
 * 放行编出来的名字，等于让「必须显式」退化成一句咒语：随手打一个词就满足了。
 *
 * 抓不住什么：
 *
 * - 资产没有 `coverage` 那份 yaml 时（手写资产、冻结夹具），判不出体检结论，`variant-undeclared`
 *   不开口——判不出不等于判为 `mixed-suspected`。此时词表为空，任何非空声明都算未知。
 * - 来源词表为空时 `source-id-undeclared` / `source-id-unknown` 都不开口：没有权威集合就既判不出
 *   「符不符」，也没有可指名的东西可缺。**这与 variant 那半边不同**——variant 词表为空意味着
 *   这份资产只有 default，是一个确定的答案；来源词表为空只意味着这份 coverage 没记 `sourceId`。
 * - 页壳只在**整页**产物里出现，单个楼层与组件本来就不读 `chrome.yaml`，那一半不开口。
 * - 只认页壳条目的 `data-pattern`。产物把顶栏写成一段没有层根标记的 HTML 时本门零信号，
 *   那与 `paint-consistency` 认层根的口径同一条，不另造第二套识别。
 */

import fs from 'node:fs'
import path from 'node:path'
import { parseYaml } from '../vendor/page-theme-core/index.mjs'

/** 体检闭集只有两档（`cohesive` / `mixed-suspected`），本模块只需要认出后者。 */
export const MIXED_COHESION = 'mixed-suspected'

export class VariantSourceError extends Error {
	constructor(code, message) {
		super(message)
		this.name = 'VariantSourceError'
		this.code = code
	}
}

/**
 * 抠出 `README.md` 里的 yaml 围栏块。
 *
 * 不按小节标题找（标题是散文，翻译一下这道门就哑了），只找围栏并挑出带 `coverage` 键的
 * 那一份。前置的 front matter 由 `---` 界定、不是围栏块，天然不会被误取。
 */
function fencedYamlBlocks(md) {
	const fence = '`'.repeat(3)
	const re = new RegExp(`^${fence}yaml\\r?\\n([\\s\\S]*?)^${fence}`, 'gm')
	return [...String(md).matchAll(re)].map((m) => m[1])
}

/** 读资产 README 里那份 `coverage`。资产没有这一份时返回 `null`，不编一个空壳。 */
export function readCoverage(assetDir) {
	const file = path.join(assetDir, 'README.md')
	let md
	try {
		md = fs.readFileSync(file, 'utf8')
	} catch (e) {
		throw new VariantSourceError('readme-unreadable', `读不出 ${file}：${e.message}`)
	}
	for (const block of fencedYamlBlocks(md)) {
		// 解不开的块只有在**看得出它就是那一份 coverage** 时才抛：README 里允许有别的 yaml
		// 示例块，逐块抛会让一段无关示例把整道门变成红的。但反过来，把「coverage 块坏了」
		// 静默当成「这份资产没有 coverage」，等于改坏一行缩进就能让体检结论消失。
		const looksLikeCoverage = /^coverage\s*:/m.test(block)
		let doc
		try {
			doc = parseYaml(block)
		} catch (e) {
			if (looksLikeCoverage) throw new VariantSourceError('coverage-unparseable', `${file} 里那份 coverage yaml 解不开：${e.message}`)
			continue
		}
		if (doc && typeof doc === 'object' && doc.coverage && typeof doc.coverage === 'object') return doc.coverage
	}
	return null
}

/** 词表 = `coverage.pages[].variant` 的非空去重集合。空串是 default，不是一个 variant 名。 */
export function variantVocabulary(coverage) {
	const out = new Set()
	for (const page of coverage?.pages ?? []) {
		const name = String(page?.variant ?? '').trim()
		if (name) out.add(name)
	}
	return out
}

/**
 * 来源词表 = `coverage.pages[].sourceId` 的非空去重集合。
 *
 * `sourceId` 是采集侧按本次 URL 列表首次出现顺序编的号（`source-01`……），`coverage.pages[]`
 * 是它在 style-set 里的**唯一权威落点**——不另开 manifest，也不从 `run-meta.json` 读（那份是
 * 快照，README 那份才是权威）。空集合是一句有信息的话：这份资产没有可指名的来源。
 */
export function sourceVocabulary(coverage) {
	const out = new Set()
	for (const page of coverage?.pages ?? []) {
		const id = String(page?.sourceId ?? '').trim()
		if (id) out.add(id)
	}
	return out
}

const hostOf = (url) => {
	try {
		return new URL(String(url)).hostname.toLowerCase()
	} catch {
		return ''
	}
}

/** 某个 variant 名底下那几页的 host。`finalUrl` 优先——重定向之后那个才是真正采到的域。 */
export function hostsOfVariant(coverage, name) {
	const want = String(name ?? '').trim()
	const out = new Set()
	for (const page of coverage?.pages ?? []) {
		if (String(page?.variant ?? '').trim() !== want) continue
		const host = hostOf(page?.finalUrl ?? page?.url)
		if (host) out.add(host)
	}
	return out
}

/**
 * 读 `patterns/index.yaml` 的页壳挂载点。
 *
 * 挂载点有两种写法：一个裸型 id（该挂载点不分 variant，对谁都是同一条），或
 * `{default, variants: [{hosts, pattern}]}`。写成 `null` 的挂载点本站没有，不进结果。
 */
export function readChromeMounts(assetDir) {
	const file = path.join(assetDir, 'patterns', 'index.yaml')
	let doc
	try {
		doc = parseYaml(fs.readFileSync(file, 'utf8'))
	} catch (e) {
		throw new VariantSourceError('index-unreadable', `读不出 ${file}：${e.message}`)
	}
	const out = []
	for (const [mount, value] of Object.entries(doc?.chrome ?? {})) {
		if (value == null) continue
		if (typeof value === 'string') {
			out.push({ mount, defaultPattern: value, variants: [], candidates: new Set([value]) })
			continue
		}
		const variants = (Array.isArray(value.variants) ? value.variants : [])
			.filter((v) => v && v.pattern)
			.map((v) => ({ hosts: (Array.isArray(v.hosts) ? v.hosts : []).map((h) => String(h).toLowerCase()), pattern: String(v.pattern) }))
		const defaultPattern = value.default == null ? null : String(value.default)
		const candidates = new Set(variants.map((v) => v.pattern))
		if (defaultPattern) candidates.add(defaultPattern)
		out.push({ mount, defaultPattern, variants, candidates })
	}
	return out
}

/**
 * 这个挂载点在这组 host 底下该用哪条。
 *
 * **无匹配回退 `default`**，与生成规程 §1 同一条：一个 variant 不必给每个挂载点都单独出
 * 一条页壳，没单独出的那些就跟主站同款。回退不是兜底，是资产的正当表达。
 */
export function resolveMountPattern(mount, hosts) {
	for (const v of mount.variants) {
		if (v.hosts.some((h) => hosts.has(h))) return v.pattern
	}
	return mount.defaultPattern
}

/** 一次读齐本门要的三样。任一份读不开都抛，交由门去报——判不出就不放行。 */
export function readVariantSources(assetDir) {
	const coverage = readCoverage(assetDir)
	return {
		coverage,
		vocabulary: variantVocabulary(coverage),
		sourceIds: sourceVocabulary(coverage),
		cohesionVerdict: String(coverage?.cohesion?.verdict ?? ''),
		mounts: readChromeMounts(assetDir),
	}
}
