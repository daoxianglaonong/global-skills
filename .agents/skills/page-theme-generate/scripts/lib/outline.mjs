/**
 * 大纲阶段的判据：序列从哪来、三列怎么填、什么样的排法不合法。
 *
 * 为什么大纲要单独一个阶段：楼层单个都对、变量全查了表，序列仍可能排成
 * hero → feature → feature → feature → cta 那张 AI 模板脸。那不是门能判的事——它可以是
 * 故意的。所以把序列摊成一份人能一眼扫完的三列表，让拍板的人裁，而不是让门替他裁。
 *
 * 大纲阶段读两份文件，各有明确的取用面：
 *
 * - `floor-index.json`：型目录（三列的中文标签与关键内容点）、骨架型库、涂色节奏。
 * - `patterns/index.yaml`：只取 `taxonomy_layers`（词表闭集）与 `pages.*.sequence` 的
 *   **taxonomy 那一列**（已采页序列与共现统计）。不取 variant / slots / container 等构图字段
 *   ——那些在 `floor-index.json` 里已经有，重复读一遍等于把整站构图灌进上下文。
 *
 * 一份都不逐篇打开 `patterns/{id}.yaml`。
 *
 * 「大纲阶段只读 `floor-index.json`」这句话不成立，写在这里免得下一个人照它去实现：
 * 页级序列与共现统计只存在于 `patterns/index.yaml` 的 `pages.*.sequence`，投影函数不投
 * `pages`，而 `FLOOR_INDEX_SHAPE` 禁止未知键，所以也不能私自补进去。骨架型库两边键名不同：
 * 采集侧叫 `page_skeletons`，投影后叫 `skeletons`，形状同构（`observed_on` 投影时丢掉）。
 * 消费侧一律读 `skeletons`。
 */

import fs from 'node:fs'
import path from 'node:path'
import { ENUMS, parseYaml } from '../vendor/page-theme-core/index.mjs'

export class OutlineError extends Error {
	constructor(code, message) {
		super(message)
		this.name = 'OutlineError'
		this.code = code
	}
}

const TAXONOMY_TABLES = { L1: ENUMS.TAXONOMY_L1, L2: ENUMS.TAXONOMY_L2, L3: ENUMS.TAXONOMY_L3 }

/**
 * 词表闭集 = 资产 `taxonomy_layers` 启用的那几层的并集。
 *
 * 这是查表，不是派生：层名与词表都从 core 的枚举取，本模块不造词。资产没启用 L3 时
 * `product-list` 这类词就在闭集外——不是「本站没有这种楼层」，是「本站的词表里没有这个词」。
 */
export function taxonomyVocabulary(layers) {
	const out = new Set()
	for (const layer of layers ?? []) {
		const table = TAXONOMY_TABLES[layer]
		if (!table) throw new OutlineError('taxonomy-layer-unknown', `资产声明了未知的 taxonomy 层 \`${layer}\`，可选 ${Object.keys(TAXONOMY_TABLES).join(' / ')}`)
		for (const name of Object.keys(table)) out.add(name)
	}
	if (!out.size) throw new OutlineError('taxonomy-layer-empty', '资产没有声明任何 taxonomy 层，词表闭集是空的，大纲无从判合法性')
	return out
}

/**
 * 读齐大纲阶段要的素材。
 *
 * `available` 与 `content` 是两个不同的集合，别混：前者是「本资产有型可用的 taxonomy」，
 * 后者只留内容楼层。chrome 类楼层（顶栏、页脚）按资产的 `chrome` 挂载自动补，不进序列提案
 * ——把它们放进提案会让每条建议序列都以「顶栏」开头，那一行不承载任何决策。
 */
export function readOutlineSources(assetDir) {
	const floorIndexFile = path.join(assetDir, 'floor-index.json')
	const indexFile = path.join(assetDir, 'patterns', 'index.yaml')
	let floorIndex
	let index
	try {
		floorIndex = JSON.parse(fs.readFileSync(floorIndexFile, 'utf8'))
	} catch (e) {
		throw new OutlineError('floor-index-unreadable', `读不出 ${floorIndexFile}：${e.message}`)
	}
	try {
		index = parseYaml(fs.readFileSync(indexFile, 'utf8'))
	} catch (e) {
		throw new OutlineError('index-unreadable', `读不出 ${indexFile}：${e.message}`)
	}

	const floors = floorIndex.floors ?? []
	return {
		styleSetId: floorIndex.styleSetId,
		floors,
		byPattern: new Map(floors.map((f) => [f.id, f])),
		skeletons: floorIndex.skeletons ?? [],
		rhythm: floorIndex.rhythm,
		vocabulary: taxonomyVocabulary(index.taxonomy_layers),
		available: new Set(floors.map((f) => f.taxonomy)),
		content: new Set(floors.filter((f) => f.source === 'pattern').map((f) => f.taxonomy)),
		pages: Object.entries(index.pages ?? {}).map(([id, page]) => ({
			id,
			taxonomies: (page.sequence ?? []).map((s) => s.taxonomy).filter(Boolean),
		})),
	}
}

/**
 * taxonomy 共现统计：哪些类曾同页出现、各类的平均序位。
 *
 * 只用 `pages.*.sequence` 的 taxonomy 一列。共现回答「选谁」，平均序位回答「排在哪」——
 * 两个问题都不能靠骨架型的 `steps` 回答：`steps` 是型模板，写着「允许出现」的类，而不是
 * 「实际同页出现过」的类。真实资产里 `gallery` 只活在某个骨架的 steps 里，任何页都没有它，
 * 拿 steps 冒充共现就会把这种「型上允许、页上绝迹」的类算进建议。
 */
export function cooccurrence(pages) {
	const solo = new Map()
	const pairs = new Map()
	const positionSum = new Map()
	for (const page of pages) {
		const seen = [...new Set(page.taxonomies)]
		for (const t of seen) solo.set(t, (solo.get(t) ?? 0) + 1)
		for (let i = 0; i < seen.length; i++) {
			for (let j = i + 1; j < seen.length; j++) {
				pairs.set(pairKey(seen[i], seen[j]), (pairs.get(pairKey(seen[i], seen[j])) ?? 0) + 1)
			}
		}
		const span = Math.max(page.taxonomies.length - 1, 1)
		page.taxonomies.forEach((t, at) => {
			const acc = positionSum.get(t) ?? { sum: 0, n: 0 }
			positionSum.set(t, { sum: acc.sum + at / span, n: acc.n + 1 })
		})
	}
	const position = new Map([...positionSum].map(([t, { sum, n }]) => [t, sum / n]))
	return { pageCount: pages.length, solo, pairs, position }
}

const pairKey = (a, b) => (a < b ? `${a}|${b}` : `${b}|${a}`)

/** 两类的同页共现次数。 */
export const coCount = (stats, a, b) => (a === b ? 0 : (stats.pairs.get(pairKey(a, b)) ?? 0))

/**
 * 骨架型能不能装下这批想要的 taxonomy。
 *
 * 「无对应型」是个机械判定，不是感觉：想要的类里有任何一个不在该型的 `steps` 里，这型就装不下。
 * 全部型都装不下才走共现回退——所以回退不是「选型选累了」，而是有据可查的一步。
 */
export function matchSkeletons(skeletons, wanted) {
	const want = [...new Set(wanted)]
	return skeletons.map((sk) => {
		const steps = new Set((sk.steps ?? []).map((s) => s.taxonomy))
		const missing = want.filter((t) => !steps.has(t))
		return { id: sk.id, labelZh: sk.labelZh, steps: sk.steps ?? [], confidence: sk.confidence, fits: missing.length === 0, missing }
	})
}

/**
 * 共现回退：拿统计排出一条内容楼层序列。
 *
 * 分两步，各用一份数据：共现次数决定**选谁**（从 seed 出发贪心地加与已选集合共现最紧的类），
 * 已采页里的平均序位决定**排在哪**。被明确否决过的回退是「挑一个最接近的已采页 sequence 照抄」
 * ——那会把那一页的特异性整份带进新页，而当目标页与所有已采页都不像时，「最接近」本身是假的。
 * 统计不带单页特异性，这是它与照抄的区别。
 *
 * 页数太少时统计没有意义（两两共现全是 1，排不出高低）。本函数照样出结果，但把
 * `weak: true` 报出来——判「够不够」是调用方的事，不是这里静默兜住。
 *
 * 产出只有 taxonomy，没有型 id——统计是在 taxonomy 这一层做的。落到型由 `buildOutline` 查表
 * 完成，见那里的说明。
 */
export function sequenceFromCooccurrence(stats, { seed = [], content, size = 4 } = {}) {
	const pool = [...(content ?? new Set())]
	const picked = seed.filter((t) => pool.includes(t))
	while (picked.length < size) {
		const candidates = pool.filter((t) => !picked.includes(t))
		if (!candidates.length) break
		let best = null
		for (const t of candidates) {
			const score = picked.length ? picked.reduce((sum, p) => sum + coCount(stats, p, t), 0) : (stats.solo.get(t) ?? 0)
			if (score <= 0) continue
			if (!best || score > best.score) best = { t, score }
		}
		if (!best) break
		picked.push(best.t)
	}
	picked.sort((a, b) => (stats.position.get(a) ?? 1) - (stats.position.get(b) ?? 1))
	return { taxonomies: picked, weak: stats.pageCount < 3 }
}

/** 某个 taxonomy 在本资产里可用的型，内容楼层排在 chrome 挂载之前。 */
const typesFor = (sources, taxonomy) => {
	const all = taxonomy ? sources.floors.filter((f) => f.taxonomy === taxonomy) : []
	return [...all.filter((f) => f.source === 'pattern'), ...all.filter((f) => f.source !== 'pattern')]
}

/**
 * 一步只给了 taxonomy 时，替它把型查出来。
 *
 * 这一步不是便利功能，是三列保证的承重墙：共现回退产出的**只有 taxonomy**，如果只在给了
 * `pattern` 时才查三列，那条路上每一步都会落成「中文标签空着的缺口」，连本资产明明有型的
 * `hero` 也一样——门还会放它过去，因为「缺口写了理由」。于是「三列齐全」退化成一句纪律，
 * 而它本该是结构保证。
 *
 * 同一 taxonomy 有多个型时取型目录里的第一个内容型，并在提示里把其余候选列出来：这是个
 * 多选一，替人默默选掉不诚实，判成阻断又越权——大纲阶段的正解是把选择摊到桌面上。
 */
function resolvePattern(sources, taxonomy) {
	const candidates = typesFor(sources, taxonomy)
	return { pattern: candidates[0]?.id ?? null, alternatives: candidates.slice(1).map((f) => f.id) }
}

/**
 * 缺口理由算不算写了。
 *
 * 只 `trim` 后判非空是不够的：`?` 与 `.` 都能过，而一个标点不是理由，它只是把门关掉的最短
 * 写法。所以要求剥掉标点与空白之后还剩至少两个字——够写「无型」，不够写一个占位符。
 */
const meaningfulReason = (s) => {
	const trimmed = String(s ?? '').trim()
	return trimmed.replace(/[^\p{L}\p{N}]/gu, '').length >= 2 ? trimmed : null
}

/**
 * 把序列摊成大纲三列：pattern id、中文标签、关键内容点。
 *
 * 三列由资产查出来而不是由调用方填写，所以「三列齐全」是结构保证，不是纪律：只给 taxonomy 的
 * 步会先查型（见 `resolvePattern`），查到型就有中文标签与关键内容点；查不到型说明本资产压根
 * 没有这一类，那才是形态缺口，只能报出 taxonomy 与理由。
 */
export function buildOutline({ sources, steps }) {
	return steps.map((step, at) => {
		const resolved = step.pattern ? { pattern: step.pattern, alternatives: [] } : resolvePattern(sources, step.taxonomy)
		if (resolved.pattern) {
			const floor = sources.byPattern.get(resolved.pattern)
			return {
				at: at + 1,
				pattern: resolved.pattern,
				taxonomy: floor?.taxonomy ?? step.taxonomy ?? null,
				labelZh: floor?.labelZh ?? null,
				keyPoints: floor?.summary ?? null,
				resolvedFrom: step.pattern ? 'pattern' : 'taxonomy',
				alternatives: resolved.alternatives,
			}
		}
		return { at: at + 1, pattern: null, taxonomy: step.taxonomy ?? null, labelZh: null, keyPoints: meaningfulReason(step.gapReason), alternatives: [], gap: true }
	})
}

/**
 * 楼层合法性门（阻断）与序列形状提示（仅提示），一次算出来。
 *
 * **两档判据，两种后果**，这是本门的核心裁定：
 *
 * - taxonomy 不在**词表闭集**内 → 阻断。那是现场自造的词（`breadcrumb`、`x-foo`），没有出路：
 *   采集侧、`page-theme-audit`、涂色都不认识它。
 * - 在词表内、但本资产没有对应型（fixture 里的 `pricing`）→ **不阻断**，走形态缺口，但必须
 *   写一句理由。全库既有纪律是「型库无对应型不得硬失败」，把它判成阻断会让「本站没采到的
 *   正当楼层类一概不许做」，那不是这道门该管的事。理由不能省：缺口是要被下游看见的决定，
 *   静默的缺口和忘了写是一个样子。
 *
 * 形状提示另立一族，不进自检门。自检门判的都是可证伪的事实、没有报警档，而「三个 feature
 * 连着排」是程度问题——它可以是故意的。把程度问题做成阻断是越权：把它交给拍板的人，
 * 正是大纲这个阶段存在的理由。
 */
export function checkOutline({ sources, steps, skeleton = null }) {
	const blocking = []
	const gaps = []
	const outline = buildOutline({ sources, steps })

	for (const row of outline) {
		const where = `第 ${row.at} 步`
		if (row.pattern && !sources.byPattern.has(row.pattern)) {
			blocking.push({ code: 'pattern-not-in-asset', at: row.at, reason: `${where} 指的型 \`${row.pattern}\` 不在本资产的型目录里：型一律从 floor-index.json 的 floors 查，不自造 id` })
			continue
		}
		if (!row.taxonomy) {
			blocking.push({ code: 'taxonomy-missing', at: row.at, reason: `${where} 既没有 pattern 也没有 taxonomy，这一步说不出要放什么` })
			continue
		}
		if (!sources.vocabulary.has(row.taxonomy)) {
			blocking.push({ code: 'taxonomy-invented', at: row.at, reason: `${where} 的 taxonomy \`${row.taxonomy}\` 不在本资产启用的词表闭集内：那是现场自造的词，采集侧与涂色都不认识它` })
			continue
		}
		if (!sources.available.has(row.taxonomy)) {
			if (!row.keyPoints) {
				blocking.push({ code: 'gap-without-reason', at: row.at, reason: `${where} 的 \`${row.taxonomy}\` 在词表内但本资产没有对应型，这是形态缺口——不硬失败，但必须写一句理由（一个标点不算），否则下游看不出这是决定还是遗漏` })
				continue
			}
			gaps.push({ at: row.at, taxonomy: row.taxonomy, reason: row.keyPoints })
		}
	}

	if (skeleton) {
		const found = sources.skeletons.find((sk) => sk.id === skeleton)
		if (!found) {
			blocking.push({ code: 'skeleton-unknown', reason: `自称按骨架型 \`${skeleton}\` 排的，但本资产的 skeletons 里没有这个 id` })
		} else {
			blocking.push(...checkSkeletonRepeat(found, outline, sources))
		}
	}

	return { outline, blocking, gaps, hints: sequenceShapeHints(outline, sources) }
}

/**
 * 哪些 taxonomy 是本资产按 chrome 挂载的（顶栏、页脚这类）。
 *
 * 由资产查出来而不是写死一张名单：`footer` 的默认角色是 `section`，靠角色表分不出它其实是
 * chrome 挂载的，而写死名单就成了「在生成侧另存一份关于资产的知识」——与变量名同一条纪律，
 * 那份知识会和资产悄悄分叉。本资产有型可用、却不在内容楼层里的，就是 chrome 挂载的。
 *
 * 压根没有型的 taxonomy（形态缺口）不算 chrome：那是用户要的一个板块，只是本站没采到。
 */
const isChromeMount = (sources, taxonomy) => sources.available.has(taxonomy) && !sources.content.has(taxonomy)

/**
 * 自称按某型排的，就得真落在该型的 `repeat` 区间内。
 *
 * 这条是阻断而不是提示：它判的不是「排得好不好」，而是「你自己声明的那件事成不成立」。
 * 声明与产物对不上是可证伪的矛盾，没有程度可言。
 */
function checkSkeletonRepeat(skeleton, outline, sources) {
	const counted = new Map()
	for (const row of outline) {
		if (row.taxonomy) counted.set(row.taxonomy, (counted.get(row.taxonomy) ?? 0) + 1)
	}
	const out = []
	for (const step of skeleton.steps ?? []) {
		const n = counted.get(step.taxonomy) ?? 0
		const { min, max } = step.repeat ?? {}
		if (n < (min ?? 0) || n > (max ?? Infinity)) {
			out.push({ code: 'skeleton-repeat-violation', reason: `骨架型 \`${skeleton.id}\` 要求 \`${step.taxonomy}\` 出现 ${min}–${max} 次，序列里有 ${n} 次` })
		}
	}
	for (const [taxonomy, n] of counted) {
		// 骨架型的 steps 只列内容楼层，chrome 挂载的层自动补，不算越出型外。
		if (!(skeleton.steps ?? []).some((s) => s.taxonomy === taxonomy) && !isChromeMount(sources, taxonomy)) {
			out.push({ code: 'skeleton-repeat-violation', reason: `骨架型 \`${skeleton.id}\` 的 steps 里没有 \`${taxonomy}\`，序列里却排了 ${n} 次` })
		}
	}
	return out
}

/**
 * 序列形状提示。只提示，不影响退出码。
 *
 * 判据取自一句早就写下的观察：楼层单个都对、token 全对，序列仍可能排成
 * hero → feature → feature → feature → cta 那张 AI 模板脸。所以提示钉的是「重复」这一类
 * 形态——而不是替人裁「这一页该有几层」。
 */
export function sequenceShapeHints(outline, sources) {
	const hints = []
	const taxonomies = outline.map((r) => r.taxonomy)

	let run = 1
	for (let i = 1; i <= taxonomies.length; i++) {
		if (taxonomies[i] && taxonomies[i] === taxonomies[i - 1]) {
			run++
			continue
		}
		if (run >= 3) hints.push({ code: 'repeated-taxonomy-run', reason: `\`${taxonomies[i - 1]}\` 连续排了 ${run} 层：这是模板脸最常见的形状，确认是刻意的再拍板` })
		run = 1
	}

	const perPattern = new Map()
	for (const row of outline) {
		if (row.pattern) perPattern.set(row.pattern, (perPattern.get(row.pattern) ?? 0) + 1)
	}
	for (const [pattern, n] of perPattern) {
		if (n >= 3) hints.push({ code: 'single-pattern-overuse', reason: `同一个型 \`${pattern}\` 用了 ${n} 次：构图会显得单薄，看看型目录里有没有别的同类型` })
	}

	for (const row of outline) {
		// 只给 taxonomy 的步是本包替你选的型。多选一必须让拍板的人看见，否则那次选择是静默的。
		if (row.resolvedFrom === 'taxonomy' && row.alternatives?.length) {
			hints.push({ code: 'taxonomy-multiple-types', reason: `第 ${row.at} 步只说了 \`${row.taxonomy}\`，本包按型目录取了 \`${row.pattern}\`；同类还有 ${row.alternatives.map((id) => `\`${id}\``).join(' / ')}，要换就在这一步写明型 id` })
		}
	}

	const content = outline.filter((r) => r.taxonomy && !isChromeMount(sources, r.taxonomy)).length
	if (content < 2) hints.push({ code: 'too-few-content-floors', reason: `只有 ${content} 层内容楼层：确认这是要的东西，不是序列写漏了` })

	return hints
}
