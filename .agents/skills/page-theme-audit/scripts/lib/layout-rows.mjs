/**
 * 布局映射：色表（`value-rows.mjs`）与非色表（`type-rows.mjs`）之外**第三张**表，
 * 决策单元是「源布局 × 用途」。
 *
 * 读面只有两处：**产物**（HTML + CSS）与资产的 `layout-envelope.json`（外加 `tokens.json`
 * 的 `breakpoints` 组）。**不读 trace 的任何一个字节**——读了会当场撞
 * `tests/prose-invariance.test.mjs` 那四条断言；本表另附一条同形断言（两份只在 trace
 * 自由文本上不同的输入，双份产出字节相同）。
 *
 * ## 为什么又是一张新表，不是给那两张加列
 *
 * - 两张既有表的行都是**一个可替换的字面量**：色值换成 `var(--color-…)`、维度换成
 *   `var(--dimension-…)`，候选是闭集里的 token，`accept` 的落点是一个变量名。布局越界
 *   没有这个形状：7 列换不成一个 token，断点 900px 换不成一个 token，「首层不是 navbar」
 *   压根不是一个值。候选来源也不是闭集而是**包络**，`acceptedValue` 存的是一个数或一个
 *   层名，不是 `cssVar`。硬塞进那两张表要把 `acceptedCssVar` 那一列的语义拆成两种。
 * - 本表多两列是那两张表不需要的：**档位**（阻断层 / 报警层 / 不在包络）与**建议**
 *   （这一条优化模式做不做得到）。档位这一列是本表存在的主要理由，见下。
 * - `value-rows.mjs` / `type-rows.mjs` 与生成侧有逐字同源锁（`copied-value-rows.test.mjs`
 *   / `copied-type-rows.test.mjs`），碰一下要同步改两处。本表**一个字节都不动那两份**。
 *
 * 于是：id 前缀 `lm-` 与 `vm-` / `tm-` 三家分立，`schemaVersion` 自己从 1 起，文档带
 * `mapKind: 'layout'`。
 *
 * ## 档位三档，硬度不同，不许混读
 *
 * | 档位 | 意思 | 硬度 |
 * | --- | --- | --- |
 * | `blocking`（阻断层） | 撞包络 `blocking[]` 某条的 `counterexampleRule` | 硬。门在 `lint-artifact`，本表只列不判 |
 * | `advisory`（报警层） | 落在观测集合之外 | **不是违规**。报警层是观测的如实投影：不做判定、不参与退出码、不阻断任何东西 |
 * | `outside-envelope`（不在包络） | 该维包络根本没投影 | 判据在资产 `tokens.json` 的 `breakpoints` 组与生成侧 `breakpoint-lock`，不是本表在裁 |
 *
 * 第三档不是为了凑数：断点这一维**包络里一条都没有**（`blocking` 七条 + `advisory` 八条
 * 逐条查过，没有断点）。把它写成 `advisory` 等于说「不阻断」，而 `breakpoint-lock` 无豁免；
 * 写成 `blocking` 等于给它安一个包络里不存在的依据。两种都是假话，所以另立一档并在行上
 * 写清判据到底在哪儿。
 *
 * **`container-width` 判成报警档是照包络原文来的**，不是本模块放宽。它的取值集合出自
 * `blocking:contained-has-enumerated-max-width`，但那一条的 `counterexampleRule` 原文写着
 * 「集合本身是观测，两条方向性判断才是本条的判据」——判据只有「contained 必有宽 /
 * full-bleed 必无」，而这两条要先知道该层是哪种容器模式，产物侧读不出来。所以集合外的宽度
 * 只能记成报警档，行上的 `layerBasis` 把这句原文带着走。
 *
 * ## 射程（写死，不许让表看起来比射程大）
 *
 * 六个用途，序固定，逐个绑一处包络依据：
 *
 * | 用途 | 源布局从哪来 | 依据 | 档位 |
 * | --- | --- | --- | --- |
 * | `breakpoint` | CSS `@media` 的宽度特性 px 值 | 资产 `tokens.json` 的 `breakpoints` 组 | 不在包络 |
 * | `container-width` | `@media` **之外**的 CSS `max-width` px 值 | `blocking:contained-has-enumerated-max-width` 内的观测集合 | 报警层 |
 * | `columns` | `grid-template-columns` 的轨道数、`column-count` | `advisory:columns-pc` / `-tablet` / `-mobile` 三档并集 | 报警层 |
 * | `sequence-first` | 页级产物第一个 `data-pattern` 层根 | `blocking:page-sequence-navbar-first-footer-last` | 阻断层 |
 * | `sequence-last` | 页级产物最后一个 `data-pattern` 层根 | 同上 | 阻断层 |
 * | `sequence-float-widget` | 序列里出现的 `float-widget.*` 层根 | `blocking:float-widget-never-in-sequence` | 阻断层 |
 *
 * 不收的与为什么：
 *
 * - **`@media` 里的 `max-width` 不算容器宽。** 那是该档的**内容宽**（pattern 的
 *   `responsive.*.content_width`），容器宽是 `container.max_width_px`，两者是资产里两个字段。
 *   混用会把每一条降档规则都报成越界——冻结夹具那份**合格**产物就有 `704px` / `344px` 两条。
 *   它们记进 `summary.outOfScopeValues` 的 `@media 内的 max-width` 一栏，看得见但不进表。
 * - **`@media` 不用来给列数分档。** 从 `(max-width: 900px)` 反推 pc / tablet / mobile 需要一个
 *   阈值，而本轮硬约束写死「几何数字禁止人眼改，派生物同样禁止」，拍一个阈值出来更是越界。
 *   所以列数行拿**三档观测的并集**比对，行的「资产侧取值」把逐档观测原样列出来，分档由人看。
 * - **断点不设容差，改查资产自己声明的 `aliases`。** `tokens.json` 的 `breakpoints` 组每档
 *   带一列 `aliases`——那是采集侧把原始声明值聚桶时并进来的写法（现役华为云资产 `1024` 档
 *   的 `aliases` 是 `[1023, 1024, 1025]`），所以 `(max-width: 1023px)` 这种「整数补」写法
 *   **由资产自己认领**，不是本模块放宽。判据是「落在代表值 ∪ aliases 里」，一个数都不猜：
 *   `900px` 与 `901px` 照样各自不匹配。资产没有 `breakpoints` 组时这一维零观测，如实写。
 * - **不判容器模式（contained / full-bleed / breakout）、不判 `merge_spacing_with_prev`、
 *   不判涂色跳过、不判正文起手。** 前三者产物侧读不出来（模式与合并间距不是 CSS 声明，
 *   涂色跳过要 `role` / `ownSurface`），第四者要先知道哪些层是 `role: chrome`，而 `role`
 *   同样不在产物里。**读不出来就不出行**，不靠型名猜。这四维归 `R4-06` 的包络阻断门，
 *   那道门读的是生成侧递进来的层信息，不是本表这条只读产物的路。
 * - `%` / `em` / `vw` 等非 px 长度、`var()` / `calc()` / `min()`、`repeat(auto-fill, …)`
 *   这类列数由视口定的写法，**一律不进表也不静默丢**：落进 `summary.outOfScopeValues`，
 *   Markdown 里单列一节。
 *
 * ## 候选：只从包络取，取不到就写「无候选」
 *
 * 候选一律出自 `layout-envelope.json`，一个值都不编。取不到候选的两种情况都如实写：
 *
 * - `breakpoint`：包络没有这一维 → 恒零候选。行上另有「资产侧取值」列着那 5 个断点，
 *   但那不是候选——本模式改不动 `@media`。
 * - `sequence-float-widget`：这一条的出路是**把它从序列里摘出去**，不是换一个值 → 零候选。
 *
 * `sequence-first` / `sequence-last` 的候选取自 `advisory:slot-combinations` 的
 * `detail.combinations[].floorIds`：那一条 `sample` 是 51/51，是包络内**唯一一份完整层名册**。
 * 只取层名，不取该条目的任何观测数字，所以借的是名册不是报警层的结论。
 *
 * ## 本表不判对错，也不因任何一行退 1
 *
 * 阻断层的门是 `lint-artifact`（`R4-06`），本表只把越界写出来。退 1 只有两条路，都在
 * `layout-map.mjs`：收不到产物、读不开包络。**报警层越界不得让本表退 1**，阻断层越界在
 * 出表这一半同样不退——与色表 / 非色表 `--out` 恒退 0 同构。
 *
 * ## 裁决回灌（`--read-back`，`R4-09`）
 *
 * 出表把「选中值」「裁决」两格留空（Markdown 第 9 / 10 格），人填完由 `readBackLayoutMap()`
 * 读回。**回灌那一半可以退 1**，但退的是「这份裁决自己不成立」，不是「这份产物越界」：
 * 越界仍由 `lint-artifact` 判。报警一律落 `warnings[]`，**不进 `findings`、不影响退出码**
 * ——三档行数都非零、每档都有报警，只要裁决合法就仍退 0。
 *
 * 裁决四值见 `LAYOUT_VERDICTS`，多出来的那一档是 `recreate`。它存在的理由与「本模式做不到」
 * 那句建议是同一件事：**让那条建议成为一条可执行指令，而不是一个死胡同。**
 */

import { createHash } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'

/** 用途在报告里的固定序。表的排序只认这个顺序，不认字典序。 */
export const LAYOUT_USAGE_ORDER = [
	'breakpoint',
	'container-width',
	'columns',
	'sequence-first',
	'sequence-last',
	'sequence-float-widget',
]

/** 档位三档。Markdown 里印中文，JSON 里存英文键，两边一一对应，不许只改一边。 */
export const LAYER_LABEL = {
	blocking: '阻断层',
	advisory: '报警层',
	'outside-envelope': '不在包络',
}

/**
 * 页级产物的层根下限。**本表按层根数猜粒度，是有意保留的，不是漏改。**
 *
 * 两道包络门的粒度判定读 `trace.artifact.kind`，门里没有这个常量；本表这一份**留下**，因为布局
 * 表的核心主张是「只读产物与包络、不读 trace」（`R4-07` 立，落成 `layout-map.test.mjs` 一强一弱
 * 两条断言，`R4-09` 回灌侧第三条，原文在 `references/audit.md` §11）。要让本表认 `kind`，得给
 * `layout-map.mjs` 加 `--trace`、让本文件读它——那是把主张推翻，没有授权。
 *
 * 代价照搬不打折：**只有一层的页在本表里分辨不出来**，会被当成单层楼层放过、不出 sequence 行；
 * **≥ 2 层的楼层片段**反过来会被当成页、照出 sequence 行。门那边这两条都不存在，所以门与表在
 * 这一维上口径不同——表是报表不是门，`layout-map.mjs` 的阻断层行仍退 0。
 */
export const PAGE_LEVEL_MIN_ROOTS = 2

/**
 * 每个用途一份定死的说明：档位、依据出处、建议、改得动改不动。
 *
 * `advice` 与 `modeRequired` 写死在这里而不是逐行现编，是为了让「本模式做不到」这句话
 * 在每一行上逐字相同——它要被人当指令读，措辞一行一个样就成了软话。
 */
const USAGE_SPEC = {
	breakpoint: {
		numeric: true,
		layer: 'outside-envelope',
		envelopeRefs: [],
		assetValuesSource: 'asset:tokens.json#breakpoints（代表值 ∪ 该资产自己声明的 aliases）',
		layerBasis:
			'包络 blocking 七条 + advisory 八条里没有断点这一维；判据在资产 tokens.json 的 breakpoints 组与生成侧 breakpoint-lock（无豁免）',
		modeRequired: 'create',
		advice:
			'本模式做不到：改 @media 撞 breakpoint-lock，该锁无豁免。要让本页断点与资产对齐，整页走创造模式重做，不要在优化模式里改这一处',
	},
	'container-width': {
		numeric: true,
		layer: 'advisory',
		envelopeRefs: ['blocking:contained-has-enumerated-max-width#detail.maxWidthPx'],
		assetValuesSource: 'envelope:blocking:contained-has-enumerated-max-width#detail.maxWidthPx',
		layerBasis:
			'取值集合出自阻断层条目 contained-has-enumerated-max-width，但该条 counterexampleRule 原文「集合本身是观测，两条方向性判断才是本条的判据」——集合外的宽度不是该条的反例，故记报警档',
		modeRequired: 'optimize',
		advice: '优化模式做得到：只动一个 max-width 数字，不动标签、不动文案序列、不动 @media',
	},
	columns: {
		numeric: true,
		layer: 'advisory',
		envelopeRefs: ['advisory:columns-pc', 'advisory:columns-tablet', 'advisory:columns-mobile'],
		assetValuesSource: 'envelope:advisory:columns-pc|columns-tablet|columns-mobile',
		layerBasis: '列数三档都在包络 advisory 里；报警层是观测的如实投影，不做判定、不阻断任何东西',
		modeRequired: 'create',
		advice:
			'本模式做不到：改列数会让内容条数不对（content-lock 锁着文案序列，3 列改 4 列就多一个空格），也牵连降列行为（breakpoint-lock 不许碰 @media）。该层须另起创造模式重做',
	},
	'sequence-first': {
		numeric: false,
		layer: 'blocking',
		envelopeRefs: ['blocking:page-sequence-navbar-first-footer-last'],
		assetValuesSource: 'envelope:advisory:slot-combinations#detail.combinations[].floorIds（taxonomy=navbar）',
		layerBasis: '撞阻断层 page-sequence-navbar-first-footer-last：该条反例判据是「首层不是 navbar 或末层不是 footer 的页」',
		modeRequired: 'create',
		advice:
			'本模式做不到：换首层动的是标签与文案，优化模式改不了。页序列首层须是 taxonomy 为 navbar 的层，整页走创造模式重做',
	},
	'sequence-last': {
		numeric: false,
		layer: 'blocking',
		envelopeRefs: ['blocking:page-sequence-navbar-first-footer-last'],
		assetValuesSource: 'envelope:advisory:slot-combinations#detail.combinations[].floorIds（taxonomy=footer）',
		layerBasis: '撞阻断层 page-sequence-navbar-first-footer-last：该条反例判据是「首层不是 navbar 或末层不是 footer 的页」',
		modeRequired: 'create',
		advice:
			'本模式做不到：换末层动的是标签与文案，优化模式改不了。页序列末层须是 taxonomy 为 footer 的层，整页走创造模式重做',
	},
	'sequence-float-widget': {
		numeric: false,
		layer: 'blocking',
		envelopeRefs: ['blocking:float-widget-never-in-sequence'],
		assetValuesSource: 'envelope:blocking:float-widget-never-in-sequence#detail.floatWidgetFloors',
		layerBasis: '撞阻断层 float-widget-never-in-sequence：该条反例判据是「页序列里引用了 float-widget 型的步」',
		modeRequired: 'create',
		advice:
			'把这一层从页序列里摘出去，挂到 index.yaml 的 chrome 挂载位上。不是换一个值，所以本行恒零候选',
	},
}

/** 读不开包络时抛这个，`layout-map.mjs` 把 `code` 原样印进 precheck 并退 1。 */
export class LayoutEnvelopeError extends Error {
	constructor(code, message) {
		super(message)
		this.name = 'LayoutEnvelopeError'
		this.code = code
	}
}

/**
 * 读一份资产的包络。三种读不开各有一个码，**不合并**：缺件、解不开、形状不对是三件事，
 * 合并成一个码会让「资产没投影过包络」与「包络被改坏了」在报告里长得一模一样。
 */
export function loadLayoutEnvelope(assetDir) {
	const file = path.join(assetDir, 'layout-envelope.json')
	let raw
	try {
		raw = fs.readFileSync(file, 'utf8')
	} catch {
		throw new LayoutEnvelopeError('layout-envelope-missing', `资产缺 layout-envelope.json：${file}`)
	}
	let doc
	try {
		doc = JSON.parse(raw)
	} catch (e) {
		throw new LayoutEnvelopeError('layout-envelope-unparseable', `layout-envelope.json 解不开：${e.message}`)
	}
	if (!doc || !Array.isArray(doc.blocking) || !Array.isArray(doc.advisory)) {
		throw new LayoutEnvelopeError('layout-envelope-shape', 'layout-envelope.json 缺 blocking / advisory 数组')
	}
	return doc
}

const envelopeEntry = (envelope, bucket, id) => (envelope?.[bucket] ?? []).find((e) => e && e.id === id) ?? null

/**
 * 资产声明的断点。**从 `tokens.json` 的 `breakpoints` 组读，不从闭集读**：闭集只留代表值
 * （`breakpoints.1024`），而认不认得 `(max-width: 1023px)` 全靠 `aliases` 那一列，闭集里没有它。
 *
 * 返回 `{ values, accepted, resolved }`：`values` 是升序代表值（进「资产侧取值」那一列），
 * `accepted` 是代表值 ∪ aliases 的判定集合，`resolved` 说这份资产到底有没有这个组
 * ——「资产没声明断点」与「声明了但对不上」在报告里必须分得开。
 */
export function assetBreakpoints(assetDir) {
	let doc
	try {
		doc = JSON.parse(fs.readFileSync(path.join(assetDir, 'tokens.json'), 'utf8'))
	} catch {
		return { values: [], accepted: new Set(), resolved: false }
	}
	const group = doc?.breakpoints
	if (!group || typeof group !== 'object') return { values: [], accepted: new Set(), resolved: false }
	const values = new Set()
	const accepted = new Set()
	for (const token of Object.values(group)) {
		const dim = token?.$value
		if (dim && typeof dim.value === 'number' && String(dim.unit).toLowerCase() === 'px') {
			values.add(dim.value)
			accepted.add(dim.value)
		}
		for (const alias of token?.$extensions?.['page-theme']?.breakpoint?.aliases ?? []) {
			if (typeof alias === 'number') accepted.add(alias)
		}
	}
	return { values: [...values].sort((a, b) => a - b), accepted, resolved: true }
}

/* ── 从包络取观测集合 ───────────────────────────────────────────────────────── */

/** `[{ value, floors }]`，条目缺席返回 `null`（缺席与空集合不是一回事）。 */
export function envelopeMaxWidths(envelope) {
	const entry = envelopeEntry(envelope, 'blocking', 'contained-has-enumerated-max-width')
	const values = entry?.detail?.maxWidthPx
	if (!Array.isArray(values)) return null
	return values
		.filter((v) => v && typeof v.value === 'number')
		.map((v) => ({ value: v.value, floors: typeof v.floors === 'number' ? v.floors : null }))
		.sort((a, b) => a.value - b.value)
}

const COLUMN_ENTRY_BY_BAND = { pc: 'columns-pc', tablet: 'columns-tablet', mobile: 'columns-mobile' }

/** `{ values: [{ value, bands: [{ band, floors }] }], resolved: [...], missing: [...] }`。 */
export function envelopeColumns(envelope) {
	const byValue = new Map()
	const resolved = []
	const missing = []
	for (const [band, id] of Object.entries(COLUMN_ENTRY_BY_BAND)) {
		const entry = envelopeEntry(envelope, 'advisory', id)
		if (!entry || !Array.isArray(entry.detail?.values)) {
			missing.push(`advisory:${id}`)
			continue
		}
		resolved.push(`advisory:${id}`)
		for (const v of entry.detail.values) {
			if (!v || typeof v.value !== 'number') continue
			if (!byValue.has(v.value)) byValue.set(v.value, [])
			byValue.get(v.value).push({ band, floors: typeof v.floors === 'number' ? v.floors : null })
		}
	}
	const values = [...byValue.entries()]
		.map(([value, bands]) => ({ value, bands }))
		.sort((a, b) => a.value - b.value)
	return { values, resolved, missing }
}

/**
 * 包络里的完整层名册。取 `advisory:slot-combinations` 的 `floorIds`——那一条 `sample`
 * 是 51/51，是包络内唯一一份覆盖全部层的名单。**只取名字，不取该条目的任何观测数字。**
 */
export function envelopeFloorIds(envelope) {
	const entry = envelopeEntry(envelope, 'advisory', 'slot-combinations')
	const combos = entry?.detail?.combinations
	if (!Array.isArray(combos)) return null
	const out = new Set()
	for (const c of combos) for (const id of c?.floorIds ?? []) if (typeof id === 'string') out.add(id)
	return [...out].sort()
}

/** `blocking:float-widget-never-in-sequence` 点名的 float-widget 型；条目缺席返回 `null`。 */
export function envelopeFloatWidgetFloors(envelope) {
	const entry = envelopeEntry(envelope, 'blocking', 'float-widget-never-in-sequence')
	const ids = entry?.detail?.floatWidgetFloors
	return Array.isArray(ids) ? [...ids].filter((s) => typeof s === 'string').sort() : null
}

/* ── 从产物抽源布局 ─────────────────────────────────────────────────────────── */

const PX_TOKEN = /^-?(?:\d+\.?\d*|\.\d+)px$/i
const FUNCTIONAL = /(?:^|[^\w-])(?:var|calc|clamp|min|max|env|attr|fit-content)\(/i
const KEYWORD_ONLY = /^(?:none|auto|inherit|initial|unset|revert|revert-layer|subgrid|masonry|max-content|min-content)$/i

/** `max-width` 的 px 值；非 px / 函数式返回 `null`（调用方记进射程外）。 */
export function containerWidthPx(value) {
	const raw = String(value).trim()
	if (!PX_TOKEN.test(raw)) return null
	const n = Number.parseFloat(raw)
	return Number.isFinite(n) ? n : null
}

/** 按顶层空白切 token：括号与方括号里的空白不算分隔符（`minmax(0, 1fr)` 是一个轨道）。 */
function topLevelTokens(value) {
	const out = []
	let depth = 0
	let bracket = 0
	let quote = null
	let cur = ''
	for (const c of String(value)) {
		if (quote) {
			cur += c
			if (c === quote) quote = null
			continue
		}
		if (c === '"' || c === "'") quote = c
		else if (c === '(') depth++
		else if (c === ')') depth--
		else if (c === '[') bracket++
		else if (c === ']') bracket--
		if (/\s/.test(c) && depth === 0 && bracket === 0) {
			if (cur.trim()) out.push(cur.trim())
			cur = ''
			continue
		}
		cur += c
	}
	if (cur.trim()) out.push(cur.trim())
	return out
}

/**
 * `grid-template-columns` 数出几列。数不出来返回 `null`——**数不出来就不出行**：
 * `repeat(auto-fill, …)` 的列数由视口宽定，写进表等于本表在替浏览器算一个数。
 */
export function gridColumnCount(value) {
	const raw = String(value).trim()
	if (!raw || KEYWORD_ONLY.test(raw) || FUNCTIONAL.test(raw)) return null
	const repeat = /^repeat\(\s*([^,]+),([\s\S]*)\)\s*$/i.exec(raw)
	if (repeat) {
		const n = repeat[1].trim()
		if (!/^\d+$/.test(n)) return null
		const inner = gridColumnCount(repeat[2].trim())
		return inner == null ? null : Number(n) * inner
	}
	const tokens = topLevelTokens(raw).filter((t) => !t.startsWith('['))
	if (!tokens.length) return null
	let total = 0
	for (const t of tokens) {
		if (/^repeat\(/i.test(t)) {
			const c = gridColumnCount(t)
			if (c == null) return null
			total += c
			continue
		}
		total += 1
	}
	return total > 0 ? total : null
}

const WIDTH_FEATURE = /^\s*(?:(?:min|max)-)?(?:device-)?width\s*:\s*(.+?)\s*$/i
const WIDTH_RANGE = /^\s*(?:[\d.]+[a-z%]*\s*[<>]=?\s*)?width(?:\s*[<>]=?\s*[\d.]+[a-z%]*)?\s*$/i

/**
 * 从一条选择器里抽 `@media` 的宽度特性。
 *
 * `scanCss` 递归时把 at-rule 前缀接在选择器前面（`@media (max-width: 900px) .grid`），
 * 所以断点是从选择器里读的，不另扫一遍原文。只认宽度特性的语法本身，**不靠「括号里含
 * width 字样」**——`:not(.width-x)` 那种会被这条语法挡在外面。
 *
 * 返回 `[{ px, feature }]`；`px` 为 `null` 表示这是个宽度特性但不是 px（`48em`），
 * 调用方记进射程外。
 */
export function breakpointFeatures(selector) {
	const s = String(selector ?? '')
	if (!/@media/i.test(s)) return []
	const out = []
	for (const m of s.matchAll(/\(([^()]*)\)/g)) {
		const body = m[1]
		const named = WIDTH_FEATURE.exec(body)
		const ranged = !named && WIDTH_RANGE.test(body)
		if (!named && !ranged) continue
		const feature = `(${body.trim()})`
		const px = /(-?\d*\.?\d+)px/.exec(named ? named[1] : body)
		out.push({ px: px ? Number.parseFloat(px[1]) : null, feature })
	}
	return out
}

const VOID_TAGS = new Set(['img', 'br', 'hr', 'input', 'meta', 'link', 'source', 'area', 'base', 'col', 'embed', 'track', 'wbr'])

/**
 * 一份 HTML 里按文档序摊出 `data-pattern` 层根。
 *
 * 跳过 `<style>` / `<script>` 体：前者里的 `[data-pattern="x"]` 是选择器不是层根，后者里的
 * `a<b` 会被标签正则读成开标签。`synth:` 前缀（`R4-08` 的合成型身份）在算 taxonomy 时剥掉，
 * 层名本身原样留着。
 */
export function parseFloorRoots(html, file = '<html>') {
	const src = String(html)
	const roots = []
	const re = /<(\/?)([a-zA-Z][\w-]*)([^>]*?)(\/?)>/g
	let m
	while ((m = re.exec(src))) {
		const tag = m[2].toLowerCase()
		if (m[1] === '/') continue
		if ((tag === 'style' || tag === 'script') && m[4] !== '/') {
			const end = src.toLowerCase().indexOf(`</${tag}`, re.lastIndex)
			re.lastIndex = end < 0 ? src.length : end
			continue
		}
		if (VOID_TAGS.has(tag)) continue
		const attr = /data-pattern\s*=\s*(?:"([^"]*)"|'([^']*)')/i.exec(m[3] ?? '')
		if (!attr) continue
		const pattern = String(attr[1] ?? attr[2] ?? '').trim()
		if (!pattern) continue
		roots.push({ file, tag, pattern, index: roots.length, taxonomy: taxonomyOf(pattern) })
	}
	return roots.map((r, i) => ({ ...r, index: i }))
}

/** 型 id 的 taxonomy 段。`synth:pricing.table-3` → `pricing`。 */
export function taxonomyOf(pattern) {
	const bare = String(pattern).replace(/^synth:/i, '')
	const dot = bare.indexOf('.')
	return dot < 0 ? bare : bare.slice(0, dot)
}

/**
 * 序列读面的射程。页级才出 sequence 行，其余三种都不出，且在 summary 里如实写明是哪种
 * ——「没出行」与「这份产物压根不是页」必须分得开。
 */
export function sequenceScopeOf(floorRoots) {
	const files = [...new Set(floorRoots.map((r) => r.file))].sort()
	if (!floorRoots.length) return { scope: 'none', floorRoots: 0, files: [] }
	if (files.length > 1) return { scope: 'multi-file', floorRoots: floorRoots.length, files }
	if (floorRoots.length < PAGE_LEVEL_MIN_ROOTS) return { scope: 'floor', floorRoots: floorRoots.length, files }
	return { scope: 'page', floorRoots: floorRoots.length, files }
}

/* ── 出表 ───────────────────────────────────────────────────────────────────── */

function rowId(usage, normalizedValue) {
	const hex8 = createHash('sha256')
		.update(usage + '\u0000' + normalizedValue)
		.digest('hex')
		.slice(0, 8)
	return `lm-${usage}-${hex8}`
}

function cmpOcc(a, b) {
	for (const k of ['file', 'selector', 'prop', 'value']) {
		const va = String(a[k] ?? '')
		const vb = String(b[k] ?? '')
		if (va < vb) return -1
		if (va > vb) return 1
	}
	return 0
}

const num = (s) => Number.parseFloat(String(s))

/** 数值候选按 |差| 升序、同距按值升序；层名候选按名升序。两次跑出来的表要逐字节可比。 */
function sortNumericCandidates(list, source) {
	return list
		.map((c) => ({ ...c, delta: Math.round((c.value - source) * 1000) / 1000 }))
		.sort((a, b) => {
			const da = Math.abs(a.delta)
			const db = Math.abs(b.delta)
			if (da !== db) return da - db
			return a.value - b.value
		})
}

class Collector {
	constructor() {
		this.groups = new Map()
		this.outOfScope = new Map()
		this.scanned = new Map()
	}

	seen(usage) {
		if (!this.scanned.has(usage)) this.scanned.set(usage, { usage, distinctValues: new Set(), rowed: new Set(), notRowed: new Set() })
		return this.scanned.get(usage)
	}

	/** `within` = 对得上资产 / 包络那一侧，于是不进表。两个数都记，好让「零行」说得清是哪种零。 */
	count(usage, normalizedValue, within) {
		const s = this.seen(usage)
		s.distinctValues.add(normalizedValue)
		;(within ? s.notRowed : s.rowed).add(normalizedValue)
	}

	push(usage, normalizedValue, sourceValue, occurrence) {
		const key = `${usage}\u0000${normalizedValue}`
		if (!this.groups.has(key)) this.groups.set(key, { usage, normalizedValue, sourceValue, occurrences: [] })
		this.groups.get(key).occurrences.push(occurrence)
	}

	skip(prop, value) {
		this.outOfScope.set(`${prop}\u0000${value}`, { prop, value })
	}
}

export function buildLayoutMap({
	declarations = [],
	floorRoots = [],
	envelope,
	breakpoints = { values: [], accepted: new Set(), resolved: false },
	styleSetId,
	asset,
	artifactRoot,
}) {
	const col = new Collector()
	const missingRefs = []
	const resolvedRefs = []

	const maxWidths = envelopeMaxWidths(envelope)
	if (maxWidths) resolvedRefs.push('blocking:contained-has-enumerated-max-width')
	else missingRefs.push('blocking:contained-has-enumerated-max-width')

	const columns = envelopeColumns(envelope)
	resolvedRefs.push(...columns.resolved)
	missingRefs.push(...columns.missing)

	const floorIds = envelopeFloorIds(envelope)
	if (floorIds) resolvedRefs.push('advisory:slot-combinations')
	else missingRefs.push('advisory:slot-combinations')

	const floatWidgetFloors = envelopeFloatWidgetFloors(envelope)
	if (floatWidgetFloors) resolvedRefs.push('blocking:float-widget-never-in-sequence')
	else missingRefs.push('blocking:float-widget-never-in-sequence')

	if (breakpoints.resolved) resolvedRefs.push('asset:tokens.json#breakpoints')
	else missingRefs.push('asset:tokens.json#breakpoints')

	const breakpointSet = breakpoints.accepted ?? new Set()
	const maxWidthSet = new Set((maxWidths ?? []).map((v) => v.value))
	const columnSet = new Set(columns.values.map((v) => v.value))

	/* 断点：从选择器上的 @media 前缀读。 */
	const seenBreakpoint = new Set()
	for (const d of declarations) {
		if (d.widget) continue
		for (const f of breakpointFeatures(d.selector)) {
			if (f.px == null) {
				col.skip('@media', f.feature)
				continue
			}
			const normalizedValue = `${f.px}px`
			col.count('breakpoint', normalizedValue, breakpointSet.has(f.px))
			if (breakpointSet.has(f.px)) continue
			const occKey = `${d.file}\u0000${d.selector}\u0000${f.feature}`
			if (seenBreakpoint.has(occKey)) continue
			seenBreakpoint.add(occKey)
			col.push('breakpoint', normalizedValue, f.feature, { file: d.file, selector: d.selector, prop: '@media', value: f.feature })
		}
	}

	/* 容器宽与列数：逐条声明。 */
	for (const d of declarations) {
		if (d.widget || String(d.prop).startsWith('--')) continue
		const prop = String(d.prop).toLowerCase()
		if (prop === 'max-width') {
			// @media 里的 max-width 是**该档内容宽**（pattern 的 responsive.*.content_width），
			// 不是容器声明（container.max_width_px）。拿它去比容器宽集合会把每一条降档规则都
			// 报成越界——冻结夹具那份合格产物就有 704 / 344 两条。记进射程外，不进表。
			if (/@media/i.test(String(d.selector ?? ''))) {
				col.skip('@media 内的 max-width', String(d.value).trim())
				continue
			}
			const px = containerWidthPx(d.value)
			if (px == null) {
				col.skip(prop, String(d.value).trim())
				continue
			}
			const normalizedValue = `${px}px`
			col.count('container-width', normalizedValue, maxWidthSet.has(px))
			if (maxWidthSet.has(px)) continue
			col.push('container-width', normalizedValue, String(d.value).trim(), { file: d.file, selector: d.selector, prop, value: String(d.value).trim() })
			continue
		}
		if (prop === 'grid-template-columns' || prop === 'column-count') {
			const count = prop === 'column-count' ? (/^\d+$/.test(String(d.value).trim()) ? Number(String(d.value).trim()) : null) : gridColumnCount(d.value)
			if (count == null) {
				col.skip(prop, String(d.value).trim())
				continue
			}
			const normalizedValue = String(count)
			col.count('columns', normalizedValue, columnSet.has(count))
			if (columnSet.has(count)) continue
			col.push('columns', normalizedValue, String(d.value).trim(), { file: d.file, selector: d.selector, prop, value: String(d.value).trim() })
		}
	}

	/* 序列：只有页级产物出行。 */
	const sequence = sequenceScopeOf(floorRoots)
	if (sequence.scope === 'page') {
		const first = floorRoots[0]
		const last = floorRoots[floorRoots.length - 1]
		col.count('sequence-first', first.pattern, first.taxonomy === 'navbar')
		if (first.taxonomy !== 'navbar') {
			col.push('sequence-first', first.pattern, first.pattern, {
				file: first.file,
				selector: `第 1 个层根 <${first.tag}>`,
				prop: 'data-pattern',
				value: first.pattern,
			})
		}
		col.count('sequence-last', last.pattern, last.taxonomy === 'footer')
		if (last.taxonomy !== 'footer') {
			col.push('sequence-last', last.pattern, last.pattern, {
				file: last.file,
				selector: `第 ${floorRoots.length} 个层根 <${last.tag}>`,
				prop: 'data-pattern',
				value: last.pattern,
			})
		}
		for (const r of floorRoots) {
			col.count('sequence-float-widget', r.pattern, r.taxonomy !== 'float-widget')
			if (r.taxonomy !== 'float-widget') continue
			col.push('sequence-float-widget', r.pattern, r.pattern, {
				file: r.file,
				selector: `第 ${r.index + 1} 个层根 <${r.tag}>`,
				prop: 'data-pattern',
				value: r.pattern,
			})
		}
	}

	const rows = [...col.groups.values()].map((g) => {
		const spec = USAGE_SPEC[g.usage]
		const occurrences = [...g.occurrences].sort(cmpOcc)
		const { candidates, assetValues, assetValuesResolved } = candidatesFor(g, { maxWidths, columns, floorIds, floatWidgetFloors, breakpoints })
		return {
			id: rowId(g.usage, g.normalizedValue),
			usage: g.usage,
			layer: spec.layer,
			layerBasis: spec.layerBasis,
			envelopeRefs: spec.envelopeRefs,
			sourceValue: occurrences[0]?.value ?? g.sourceValue,
			normalizedValue: g.normalizedValue,
			assetValues,
			assetValuesResolved,
			assetValuesSource: spec.assetValuesSource,
			occurrenceCount: occurrences.length,
			occurrences,
			candidates,
			modeRequired: spec.modeRequired,
			advice: spec.advice,
			verdict: null,
			acceptedValue: null,
			note: candidates.length ? '' : noCandidateNote(g.usage),
		}
	})

	rows.sort((a, b) => {
		const ua = LAYOUT_USAGE_ORDER.indexOf(a.usage)
		const ub = LAYOUT_USAGE_ORDER.indexOf(b.usage)
		if (ua !== ub) return ua - ub
		if (USAGE_SPEC[a.usage].numeric) {
			const na = num(a.normalizedValue)
			const nb = num(b.normalizedValue)
			if (na !== nb) return na - nb
		} else if (a.normalizedValue !== b.normalizedValue) {
			return a.normalizedValue < b.normalizedValue ? -1 : 1
		}
		return a.id < b.id ? -1 : a.id > b.id ? 1 : 0
	})

	const scanned = LAYOUT_USAGE_ORDER.filter((u) => col.scanned.has(u)).map((u) => {
		const s = col.scanned.get(u)
		return { usage: u, distinctValues: s.distinctValues.size, rowed: s.rowed.size, notRowed: s.notRowed.size }
	})
	const outOfScopeValues = [...col.outOfScope.values()].sort((a, b) =>
		a.prop === b.prop ? (a.value < b.value ? -1 : a.value > b.value ? 1 : 0) : a.prop < b.prop ? -1 : 1,
	)
	const byLayer = { blocking: 0, advisory: 0, 'outside-envelope': 0 }
	for (const r of rows) byLayer[r.layer] += 1

	return {
		schemaVersion: 1,
		mapKind: 'layout',
		styleSetId,
		asset,
		artifactRoot,
		summary: {
			rows: rows.length,
			occurrences: rows.reduce((n, r) => n + r.occurrenceCount, 0),
			pending: rows.length,
			byLayer,
			scanned,
			sequence,
			envelopeRefs: { resolved: [...new Set(resolvedRefs)].sort(), missing: [...new Set(missingRefs)].sort() },
			outOfScopeValues,
		},
		rows,
	}
}

/** `--out` 预填的备注。只写机器算得出的事实，不替人写结论；没有任何门读这一格。 */
function noCandidateNote(usage) {
	if (usage === 'breakpoint') return '无候选：断点这一维包络没有投影，资产侧那几个值在「资产侧取值」列，但本模式改不动 @media'
	if (usage === 'sequence-float-widget') return '无候选：这一条的出路是把该层从序列里摘出去，不是换一个值'
	return '无候选'
}

function candidatesFor(group, { maxWidths, columns, floorIds, floatWidgetFloors, breakpoints }) {
	const { usage, normalizedValue } = group
	if (usage === 'breakpoint') {
		// 包络没有断点这一维，恒零候选。资产侧那几个值只列不当候选：本模式改不动 @media。
		return { candidates: [], assetValues: [...breakpoints.values], assetValuesResolved: breakpoints.resolved }
	}
	if (usage === 'container-width') {
		if (!maxWidths) return { candidates: [], assetValues: [], assetValuesResolved: false }
		const source = num(normalizedValue)
		const candidates = sortNumericCandidates(
			maxWidths.map((v) => ({
				value: v.value,
				floors: v.floors,
				source: 'blocking:contained-has-enumerated-max-width#detail.maxWidthPx',
			})),
			source,
		).map((c) => ({ value: c.value, deltaPx: c.delta, floors: c.floors, source: c.source }))
		return { candidates, assetValues: maxWidths.map((v) => v.value), assetValuesResolved: true }
	}
	if (usage === 'columns') {
		if (!columns.resolved.length) return { candidates: [], assetValues: [], assetValuesResolved: false }
		const source = num(normalizedValue)
		const candidates = sortNumericCandidates(
			columns.values.map((v) => ({ value: v.value, bands: v.bands, source: 'advisory:columns-pc|columns-tablet|columns-mobile' })),
			source,
		).map((c) => ({ value: c.value, deltaColumns: c.delta, bands: c.bands, source: c.source }))
		return { candidates, assetValues: columns.values.map((v) => v.value), assetValuesResolved: true }
	}
	if (usage === 'sequence-first' || usage === 'sequence-last') {
		const want = usage === 'sequence-first' ? 'navbar' : 'footer'
		if (!floorIds) return { candidates: [], assetValues: [], assetValuesResolved: false }
		const picked = floorIds.filter((id) => taxonomyOf(id) === want)
		return {
			candidates: picked.map((id) => ({ value: id, source: 'advisory:slot-combinations#detail.combinations[].floorIds' })),
			assetValues: picked,
			assetValuesResolved: true,
		}
	}
	// sequence-float-widget：出路是摘出去，不是换一个值。
	return { candidates: [], assetValues: floatWidgetFloors ?? [], assetValuesResolved: floatWidgetFloors != null }
}

/* ── Markdown ───────────────────────────────────────────────────────────────── */

const LEGEND = [
	'> **档位三档，硬度不同，不要混读。**',
	'> - **阻断层**：撞包络 `blocking` 某条的反例判据。硬。判它的门在 `lint-artifact`，本表只列不判。',
	'> - **报警层**：落在包络 `advisory` 的观测集合之外。**这不是违规**——报警层是观测的如实投影，不做判定、不参与退出码、不阻断任何东西。',
	'> - **不在包络**：该维包络根本没投影。判据在资产 `tokens.json` 的 `breakpoints` 组与生成侧 `breakpoint-lock`（无豁免），不是本表在裁。',
	'>',
	'> **裁决四值**：`accept`（换成候选里那个值）· `reject`（这一处刻意留着）· `defer`（这次不动，以后还会再来）· `recreate`（**须另起创造模式重做该层**）。裁决列留空即未裁，不是第五个枚举值。',
	'> - **`recreate` 是本表独有的一档，也是「建议」那一列写着「本模式做不到」的行唯一的出路。** 改列数会让内容条数不对（`content-lock` 锁着文案的有序序列，3 列改 4 列就多一个空格），也牵连降列行为（`breakpoint-lock` 不许碰 `@media`）；换首末层、把 `float-widget` 摘出序列动的是标签。这些优化模式都做不到，给这种行裁 `accept` 会在回灌时阻断（`accept-needs-recreate`）。',
	'> - **重做后整页跑 audit（`scripts/lint-artifact.mjs`），不是跑迁移门 `structure-lock`。** 那道门的前提是「这是一次主题迁移、结构本不该变」，拿它去验一次批准过的重做是用错了尺。',
	'> - 「重做的层真不真是那趟创造模式产出的」**没有纸面办法验**：与 `image-evidence` 同一档松紧，只验声称与实物对不对得上，本包不为它造新机制。',
	'> - **阻断层行不许裁 `reject`。** 报表这一侧的 reject 不是豁免章，`lint-artifact` 那道门照样退 1；出路是 `recreate`，或 `defer`（明说以后还会再来）。',
	'>',
	'> **出表这一半，本表不因任何一行退 1。** 退 1 只有两条路：收不到产物、读不开包络。回灌那一半按裁决自身的合法性判，十条阻断码与四条报警码分列，见 `references/audit.md` §8。',
	'',
]

const fmtCandidate = (c) => {
	if (c.deltaPx != null) return `\`${c.value}px\`（差 ${c.deltaPx}px${c.floors == null ? '' : ` · ${c.floors} 层`}）`
	if (c.deltaColumns != null) {
		const bands = (c.bands ?? []).map((b) => `${b.band} ${b.floors ?? '?'} 层`).join(' ')
		return `\`${c.value}\` 列（差 ${c.deltaColumns}${bands ? ` · ${bands}` : ''}）`
	}
	return `\`${c.value}\``
}

const fmtAssetValues = (r) => {
	if (!r.assetValuesResolved) return '（包络该条目缺席，本行只能零候选）'
	if (!r.assetValues.length) return '（资产侧这一维一个观测都没有）'
	const px = r.usage === 'breakpoint' || r.usage === 'container-width'
	return r.assetValues.map((v) => `\`${v}${px ? 'px' : ''}\``).join(' · ')
}

export function renderLayoutMapMarkdown(doc) {
	const lines = [
		...LEGEND,
		'| id | 源布局 | 用途 | 档位 | 处数 | 资产侧取值 | 候选 | 建议 | 选中值 | 裁决 | 备注 |',
		'| --- | --- | --- | --- | ---: | --- | --- | --- | --- | --- | --- |',
	]
	for (const r of doc.rows) {
		const cand = r.candidates.map(fmtCandidate).join('；')
		const accepted = r.acceptedValue == null || r.acceptedValue === '' ? '' : `\`${r.acceptedValue}\``
		lines.push(
			`| ${r.id} | \`${r.sourceValue}\` | ${r.usage} | ${LAYER_LABEL[r.layer]} | ${r.occurrenceCount} | ${fmtAssetValues(r)} | ${cand} | ${r.advice} | ${accepted} | ${r.verdict ?? ''} | ${r.note ?? ''} |`,
		)
	}

	lines.push('', '## 本次扫描（零行不等于没扫）', '')
	if (!doc.summary.scanned.length) {
		lines.push('- 六个用途一个源布局都没扫到：产物里既没有 `@media` / `max-width` / 栅格声明，也没有 `data-pattern` 层根。')
	} else {
		for (const s of doc.summary.scanned) {
			lines.push(`- \`${s.usage}\`：扫到 ${s.distinctValues} 个不同取值，进表 ${s.rowed} 个、对得上资产 / 包络因而未进表 ${s.notRowed} 个`)
		}
	}
	lines.push(
		'',
		`序列读面：\`${doc.summary.sequence.scope}\`（\`data-pattern\` 层根 ${doc.summary.sequence.floorRoots} 个）。` +
			'只有 `page` 才出 sequence 行；`floor` / `none` / `multi-file` 都不出，且这不是「没有越界」。',
	)

	if (doc.summary.envelopeRefs.missing.length) {
		lines.push('', '## 包络里取不到的条目（这些用途只能零候选）', '')
		for (const ref of doc.summary.envelopeRefs.missing) lines.push(`- \`${ref}\``)
	}

	if (doc.summary.outOfScopeValues.length) {
		lines.push('', '## 射程外的值（未进表）', '')
		for (const v of doc.summary.outOfScopeValues) lines.push(`- \`${v.prop}: ${v.value}\``)
	}

	return lines.join('\n') + '\n'
}

/* ── 裁决回灌 ───────────────────────────────────────────────────────────────── */

/**
 * 裁决四值，加 `null`（未裁用未填表达，不是第五个枚举值）。
 *
 * 前三值与既有两张表同义。第四值 `recreate` 是本表独有的：
 *
 * - **它不是「更狠的 reject」。** reject 说的是「这一处刻意留着」，recreate 说的是
 *   「这一层要另起一趟创造模式重做」——后者是一条指令，有执行者、有验法。
 * - **它是「建议」那一列写着「本模式做不到」的行唯一的出路。** 布局建议里「合并两层 /
 *   拆一层 / 包 wrapper / 改列数」这些动作要么动标签，要么牵连内容条数与断点：改列数会让
 *   内容条数不对（`content-lock` 锁着文案的有序序列，3 列改 4 列就多一个空格），也牵连降列
 *   行为（`breakpoint-lock` 不许碰 `@media`）。优化模式做不到。没有这一档，那条建议就是个
 *   死胡同——人只能在 defer 与「假装 accept」之间选，而后者会让执行侧去干一件做不到的事。
 * - **重做后整页跑 audit（`lint-artifact`），不是跑迁移门 `structure-lock`。** 那道门的前提是
 *   「这是一次主题迁移、结构本不该变」，拿它去验一次批准过的重做是用错了尺。这句话不只写在
 *   报告里：它逐字进 `recreateOrders[]` 的 `verifyBy` / `notVerifyBy` / `verifyReason` 三个字段。
 *
 * **本表没有 `omit`。** 非色表要它是因为「资产里根本没有这个值」是那张表的常态（间距常常一条
 * token 都没有），而布局这一侧的零候选行（`breakpoint` / `sequence-float-widget`）都不是缺口
 * 问题——它们的出路本来就是 recreate，不是承认缺口就地收工。
 */
export const LAYOUT_VERDICTS = new Set(['accept', 'reject', 'defer', 'recreate'])

/** 回灌只读三格：id（第 1 格）、选中值（第 9 格）、裁决（第 10 格），另捎上备注（第 11 格）。 */
function parseLayoutTable(md) {
	const rows = []
	for (const line of String(md).split(/\r?\n/)) {
		if (!/^\|/.test(line)) continue
		const cells = line.split('|').slice(1, -1).map((s) => s.trim())
		if (!cells.length) continue
		if (cells[0] === 'id' || /^:?-+:?$/.test(cells[0])) continue
		rows.push({ id: cells[0], valueRaw: cells[8] ?? '', verdictRaw: cells[9] ?? '', note: cells[10] ?? '' })
	}
	return rows
}

const stripCell = (raw) =>
	String(raw ?? '')
		.trim()
		.replace(/^`+|`+$/g, '')
		.trim()

const NUMERIC_CELL = /^-?(?:\d+\.?\d*|\.\d+)$/

/**
 * 「选中值」那一格。数值行只认数字本身，但 `1128` 与 `1128px`（列数行另收 `3 列`）两种写法
 * 都收——候选那一格印的就是带单位的写法，人是从那一格抄过来的，逼他把单位抠掉只会多出一种
 * 填错。单位由用途定死（`container-width` 恒 px、`columns` 恒列），收它不是猜。
 */
function parseAcceptedValue(usage, raw) {
	const s = stripCell(raw)
	if (s === '') return { filled: false, value: null }
	if (!USAGE_SPEC[usage].numeric) return { filled: true, value: s }
	const bare = s.replace(/px$/i, '').replace(/列$/, '').trim()
	if (!NUMERIC_CELL.test(bare)) return { filled: true, value: s, unparsed: true }
	return { filled: true, value: Number.parseFloat(bare) }
}

/**
 * 重做指令。**这是 `recreate` 这一档从「一个词」变成「一条可执行指令」的地方**：它把该层的
 * 源布局、包络给出的候选、那句建议，以及**重做后拿什么验**一起交出去。
 *
 * `verifyBy` / `notVerifyBy` 两个字段必须同时在：只写「跑 audit」的话，下一个人照旧会顺手
 * 跑迁移门——迁移门是主题迁移的现成把手，而它的前提（结构本不该变）与一次批准过的重做正好
 * 相反。把该跑的与不该跑的都写出来，才叫指令。
 */
function recreateOrder(row) {
	return {
		id: row.id,
		usage: row.usage,
		layer: row.layer,
		sourceValue: row.sourceValue,
		normalizedValue: row.normalizedValue,
		occurrences: row.occurrences,
		candidates: row.candidates,
		advice: row.advice,
		verifyBy: 'lint-artifact',
		notVerifyBy: 'structure-lock',
		verifyReason:
			'重做后整页跑 audit（scripts/lint-artifact.mjs）判它，不许拿迁移门 structure-lock 验：那道门的前提是「这是一次主题迁移、结构本不该变」，而这一层的结构变更是被批准过的，拿它去验是用错了尺',
	}
}

/**
 * 一行裁决的合法性。**同一行撞上多条时按病因取一条，不叠报**，取法与既有两张表同源：
 * 「这个裁决在这一行上压根不成立」先判，「选中值那一格填没填对」后判——填得对不对不改变
 * 前者的结论。
 *
 * 前三条判的是**裁决与这一行的属性对不上**，判据是行上已经写好的 `modeRequired` 与 `layer`
 * 两列，不是现编的：
 *
 * - `accept-needs-recreate`：`modeRequired: create` 的行裁 accept。这一条是 `recreate` 那一档
 *   的门牙——没有它，「本模式做不到」那句建议仍可以被一个 accept 盖过去。
 * - `recreate-not-required`：`modeRequired: optimize` 的行裁 recreate。反方向同样要挡：整层
 *   重做会动标签与文案，拿它去换一个 `max-width` 数字是代价换不回来的。
 * - `reject-on-blocking-layer`：阻断层行裁 reject。reject 声称「这一处刻意留着」，而阻断层
 *   那道门照样退 1，这个声称在这一行上不成立。`defer` 不挡——它明说以后还会再来。
 */
function applyLayoutVerdict(row, accepted, findings, warnings, orders) {
	const block = (code, reason) => {
		findings.push({ code, id: row.id, level: 'block', reason })
		row.acceptedValue = null
	}
	if (row.verdict === 'accept' && row.modeRequired === 'create') {
		block(
			'accept-needs-recreate',
			`这一行的建议写着「本模式做不到」（用途 ${row.usage}）：优化模式改不动它，accept 是承诺一件做不到的事。出路是 recreate——另起创造模式重做该层，重做后整页跑 audit（不是跑迁移门 structure-lock）`,
		)
		return
	}
	if (row.verdict === 'recreate' && row.modeRequired === 'optimize') {
		block(
			'recreate-not-required',
			'这一行优化模式做得到（只动一个数字，不动标签、不动文案序列、不动 @media）：升级成整层重做要动标签与文案，代价换不回来。出路是 accept 一个候选，或 defer',
		)
		return
	}
	if (row.verdict === 'reject' && row.layer === 'blocking') {
		block(
			'reject-on-blocking-layer',
			'reject 的意思是「这一处刻意留着」，而这一行撞的是包络阻断层：报表这一侧的 reject 不是豁免章，lint-artifact 那道门照样退 1。出路是 recreate，或 defer（明说以后还会再来）',
		)
		return
	}
	if (row.verdict === 'accept' && !row.candidates.length) {
		block('accept-without-candidate', '该行候选取自包络，一个都没有：承诺一件没有落点的事。无候选行的出路是 recreate 或 defer')
		return
	}
	if (row.verdict !== 'accept' && accepted.filled) {
		block('accepted-value-unexpected', '非 accept 行不得填选中值：那一格只给执行侧当依据，想记「以后换成这个」写备注')
		return
	}
	if (row.verdict === 'accept' && !accepted.filled) {
		block('accepted-value-missing', 'accept 必须绑定到具体候选：选中值空着，执行方只能猜，没有可对账的依据')
		return
	}
	if (row.verdict === 'accept') {
		const cand = accepted.unparsed ? null : row.candidates.find((c) => c.value === accepted.value)
		if (!cand) {
			block(
				'accepted-value-unknown',
				'选中值只认候选那一格里的那个数或那个层名（数值行 `1128` 与 `1128px` 都收，列数行另收 `3 列`）：填别的要么不在这份包络里，要么改的是另一个几何',
			)
			return
		}
		row.acceptedValue = cand.value
		const delta = cand.deltaPx ?? cand.deltaColumns
		if (delta) {
			warnings.push({
				code: 'accepted-value-delta',
				id: row.id,
				reason: `选中的候选与本页那个值差 ${delta}${cand.deltaPx != null ? 'px' : ' 列'}：这一步真改了几何，报表里记下来；不接受这笔改动就改判 defer`,
			})
		}
		return
	}
	if (row.verdict === 'recreate') {
		warnings.push({
			code: 'recreate-order-open',
			id: row.id,
			reason: `这一层要另起创造模式重做（用途 ${row.usage}）。重做后整页跑 audit（scripts/lint-artifact.mjs），不是跑迁移门 structure-lock：那道门的前提是「这是一次主题迁移、结构本不该变」，拿它去验一次批准过的重做是用错了尺`,
		})
		orders.push(recreateOrder(row))
	}
}

/**
 * 把人填过的 Markdown 读回成结论。**不回写那两份文件**，人填的那份是输入。
 *
 * @param {object} doc `buildLayoutMap()` 用同一份产物 + 同一份包络重算出来的表
 * @param {string} markdown 人填完的 `layout-map.md`
 */
export function readBackLayoutMap(doc, markdown) {
	const parsed = parseLayoutTable(markdown)
	const byId = new Map(
		doc.rows.map((r) => [r.id, { ...r, occurrences: [...r.occurrences], candidates: [...r.candidates], acceptedValue: null }]),
	)
	const findings = []
	const warnings = []
	const orders = []
	const seen = new Map()
	const values = new Map()

	for (const row of parsed) {
		if (!byId.has(row.id)) {
			findings.push({
				code: 'row-id-unknown',
				id: row.id,
				level: 'block',
				reason: 'id 认不出：产物或资产已变，这份裁决对的不是眼前这份产物',
			})
			continue
		}
		const raw = String(row.verdictRaw ?? '').trim()
		const verdict = raw === '' ? null : raw
		if (verdict !== null && !LAYOUT_VERDICTS.has(verdict)) {
			findings.push({
				code: 'verdict-unknown',
				id: row.id,
				level: 'block',
				reason: `读不懂裁决 \`${raw}\`：不猜，枚举只有 accept / reject / defer / recreate`,
			})
			continue
		}
		if (seen.has(row.id)) {
			if (seen.get(row.id) !== verdict) {
				findings.push({
					code: 'row-id-duplicate',
					id: row.id,
					level: 'block',
					reason: '同一 id 两行裁决不同：冲突没有合并规则，取任一条都是本包在裁',
				})
			} else {
				warnings.push({ code: 'row-id-repeated', id: row.id, reason: '同一 id 两行裁决逐字相同：复制粘贴一行没改内容不是分歧' })
			}
			continue
		}
		seen.set(row.id, verdict)
		values.set(row.id, row.valueRaw)
		byId.get(row.id).verdict = verdict
		if (row.note) byId.get(row.id).note = row.note
	}

	for (const r of doc.rows) {
		if (!seen.has(r.id)) {
			warnings.push({ code: 'row-missing', id: r.id, reason: '表里缺行，按未裁处理' })
		}
	}

	const rows = doc.rows.map((r) => byId.get(r.id))
	for (const r of rows) {
		if (!seen.has(r.id)) continue
		applyLayoutVerdict(r, parseAcceptedValue(r.usage, values.get(r.id) ?? ''), findings, warnings, orders)
	}

	const pending = rows.filter((r) => r.verdict == null).length
	const byVerdict = { accept: 0, reject: 0, defer: 0, recreate: 0 }
	for (const r of rows) if (r.verdict) byVerdict[r.verdict] += 1
	const byLayer = { blocking: 0, advisory: 0, 'outside-envelope': 0 }
	for (const r of rows) byLayer[r.layer] += 1

	return {
		verdict: findings.length ? 'blocked' : 'pass',
		mapKind: 'layout',
		summary: {
			rows: rows.length,
			occurrences: doc.summary.occurrences,
			pending,
			byLayer,
			byVerdict,
			recreateOrders: orders.length,
			scanned: doc.summary.scanned,
			sequence: doc.summary.sequence,
			envelopeRefs: doc.summary.envelopeRefs,
			outOfScopeValues: doc.summary.outOfScopeValues,
		},
		rows,
		recreateOrders: orders,
		warnings,
		findings,
	}
}
