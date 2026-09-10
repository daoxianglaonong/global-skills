/**
 * 门 `layout-envelope` 的判据源：把资产 `layout-envelope.json` 的**阻断层**落成一道门。
 *
 * 本文件在 page-theme-generate 与 page-theme-audit 两侧**逐字节相同**（跨包 import 被禁，
 * 只能整文件拷贝）。同源设计的固有成本是改一处要同步两处，`copied-*` 那两条逐字节锁不是
 * 可选项：判据一分叉，「同一份越界产物两侧同样退 1」当场失效，而分叉不会有任何一侧报错。
 * 只在生成侧跑等于自由构图自产自检——三包分权要防的正是这件事。
 *
 * ## 只吃阻断层
 *
 * · `blocking` —— 反例为零的规律，是硬约束。本门逐条把它翻译成产物侧判据。
 * · `advisory` —— **观测集合的如实投影，不是阈值**。本门一个字都不读：不做判定、不参与
 *   退出码、不阻断任何东西。谁把它读成阈值、或拿它去阻断，就是越界。它的去处是布局表。
 * · `demoted` —— 出现过反例、已被投影脚本降级的规律。**同样不判**：层籍由数据定不由人定，
 *   本门跟着包络走，不把降级项捞回来当门。
 *
 * 因此本门的判据集合是**跟着资产走的**：包络里有几条 blocking 就判几维。包络里出现本门没有
 * 实现的规律 id 时报 `envelope-rule-unimplemented`——判不出就不放行，不静默少判一维。
 *
 * ## 七维怎么落到产物侧
 *
 * 产物侧只有两样东西：`data-pattern` 层根的**次序**，与产物 CSS 的**声明**。型级四维靠层根
 * 把产物连回资产 `floor-index.json` 的那一行（与 `paint-consistency` / `variant-lock` 认层根
 * 同一条口径），页级三维判产物自己排出来的那条序列。
 *
 * | 包络阻断层规律 | 本门 code | 产物侧判据 | 一条会挂的输入 |
 * | --- | --- | --- | --- |
 * | `container-mode-closed-set` | `container-mode-out-of-envelope` | 产物用到的型，其 `container.mode` 不在包络 `detail.byMode` 列出的模式内（缺 `container` 同判） | 资产把某型 mode 改成 `breakout`，产物照用 |
 * | `contained-has-enumerated-max-width` | `container-width-out-of-envelope` | `contained` 的型缺 `maxWidthPx`，或 `full-bleed` 的型带了 `maxWidthPx` | 删掉产物用到那型的 `maxWidthPx` |
 * | `merge-spacing-with-prev-always-false` | `merge-spacing-with-prev` | 层根自己的顶外边距是负值——把本层并进上一层 | `.pt-feature-grid--muted { margin-top: -24px }` |
 * | `page-sequence-navbar-first-footer-last` | `page-shell-out-of-order` | 在场的 `navbar` 型层根不在首位、或 `footer` 型层根不在末位 | 把顶栏插到首屏后面 |
 * | 同上（两码，见下） | `page-shell-ends-missing` | trace 声明 `artifact.kind: "page"`，首层 taxonomy 不是 `navbar`、或末层不是 `footer` | 整页忘了写页脚 |
 * | 同上（判不出粒度） | `artifact-kind-missing` | 给了 trace，`artifact.kind` 缺席或不在 `page`/`floor`/`component` 内 | trace 的 `artifact` 只写 html / css 文件名 |
 * | `float-widget-never-in-sequence` | `float-widget-in-sequence` | 层根是 `float-widget` 型（taxonomy 或包络点名的 id） | 页里插一层 `data-pattern="float-widget.service-rail"` |
 * | `body-starts-with-hero-or-page-header` | `body-start-out-of-envelope` | 跳过 `role ∈ chrome/overlay` 之后的第一个层根，taxonomy 不在包络 `detail.byTaxonomy` 列出的开场型内 | cta 打头的那条序列 |
 * | `paint-skip-membership` | `paint-skip-out-of-envelope` | 产物用到的型，按包络三个跳过集合重算出的「跳不跳」与资产 `paint.participatesInCount` 记的不一致 | 把 hero 那行的 `participatesInCount` 改成 `true` |
 *
 * **第二维只判方向，不判集合。** 包络自己写着「集合本身是观测，两条方向性判断才是判据」，
 * 所以 `maxWidthPx` 落不落在 `{1200,1280,1367,1600}` 里本门一个字不问——把观测到的宽度集合
 * 读成允许值清单，就是把报警口径偷偷塞进阻断层。
 *
 * ## 抓不住什么，逐条明写
 *
 * - **单层内部几何一概不判**：列数、排列方向、模块顺序、间距大小都归 `generate.md` §5 第 1 条
 *   的自由度。本门只判「用了哪些型、排成什么序、容器怎么声明」。
 * - **产物粒度只信 trace 的声明，不按层根数猜。** 开场（维六）与首末（维四第二码）只在
 *   `artifact.kind === 'page'` 时判：1 个层根的页照判，5 个层根的楼层片段一条都不开。缺席或不在
 *   闭集内即 `artifact-kind-missing`，**没有 fallback**——层根数当粒度两头都错：多层片段挨
 *   `ends-missing`，只有一层的页漏网。首末那一维必须在本门判，因为布局表拿同一句包络反例
 *   （「首层不是 navbar 或末层不是 footer 的页（空序列也算）」）出阻断行，同一句话两种翻译就是
 *   门与表分家。
 * - **没给 trace 时页级两维整块不判**，写 `no-input` 语义：不开口，也不退 1。`--trace` 是两侧
 *   既有的可选旗标，把「没给」读成「越界」等于把它改成必填。代价明写：**不带 trace 的整页忘了
 *   写页脚，本门抓不到**。
 * - **声明与产物打架不判**：`kind: 'floor'` 写在 5 层整页上、`kind: 'page'` 写在 0 层根上，本门
 *   今天都没有码。粒度以声明为准，写错声明换来的是别的维不判，不是本门报错。
 * - **首末两个码不合并**：「在场的页壳排错位」修法是重排，「整页压根没有页壳」修法是补层。
 *   同码会让下游分不开这两件事（`R4-07`：「没投影过」与「被改坏了」不许长得一样）。
 * - **`data-pattern` 层根一律视为序列步**（与 `paint-consistency` 的 `floor-not-in-sequence`
 *   同一条口径）。真要挂浮层，它不该带层根标记。
 * - **顶外边距只认层根自己的类选择器与 `[data-pattern]`**。内联 `style=` 抓不住（`scanHtml`
 *   给内联声明的选择器是 `<section inline>`，N 层长得一样，无从归属，与 `surface-unreadable`
 *   同一条盲区）；后代选择器、`:where()` 不算命中；`position: absolute`、
 *   `transform: translateY(-…)`、上一层的负 `margin-bottom` 造成的重叠也一概不算。
 * - **型级四维的反例只可能来自资产漂移**：型记录出自资产，产物只能引用它。所以这四维挡的是
 *   「包络与 `floor-index.json` 已经对不上了，产物还在照用那几型」，不是「产物自己写错了 mode」。
 *   资产内部那份对不上归采集侧的 `envelope-out-of-sync`，本门是消费侧的第二道。
 * - **`patterns/{id}.yaml` 不读**。第三维因此不查资产字段 `rhythm.merge_spacing_with_prev`，
 *   改判产物侧的负顶外边距——两者说的是同一件事（本层的间距并进上一层），但一个是资产事实、
 *   一个是产物事实，本门只判得了后者。
 *
 * ## 读面
 *
 * 资产侧只读两份机器投影：`layout-envelope.json`（判据）与 `floor-index.json`（层根 → 型记录）。
 * 自由文本一个字节都不读——因此两侧看到的输入完全一样。
 *
 * trace 的读面只有两处机读结构，一个自由文本字段都不读：合成型（`synth:` 前缀）层根靠
 * `trace.floors[].unobservedBreakpoints[].inheritFrom` 连回真实型记录（`R4-08`），产物粒度靠
 * `trace.artifact.kind` 这个三值闭集枚举。所以 `trace` 是可选
 * 入参，而**两侧必须同样传**：判据字节相同、入参少一个，同一份合成型页照样一侧过门一侧退
 * `synth-inherit-unreadable`（`R4-14` 修的就是 audit 侧漏传）。audit 侧那份走 trace 白名单，取的正是
 * 这一个键，不新开读面也不新增旗标；接线由 `copied-layout-envelope-wiring.test.mjs` 锁着。
 * **包络不存在时整门不开口**（`no-input`），这不是「容忍缺席」——包络自 `R4-10` 起是准入必交件
 * （`admit-asset.mjs` 的 `REQUIRED_FILES`），缺它即 `incomplete` / `reject`。生成侧 `lint-floor` 的
 * 前提是准入退 0，所以**真实链路走不到这一支**；留着只为本门被直调时（单元用例、被别的工具内嵌）
 * 不在门里私造第二套准入——「资产够不够开工」归准入判，一处判就够。验证侧不跑准入（资产合不合格
 * 归采集侧校验器），但缺包络在那一侧由布局表那条链路退 1：`layout-map.mjs` 报
 * `layout-envelope-missing`，`nextAction` 指着 `build-envelope.mjs`。所以三处口径一致——缺包络没有
 * 任何一条链路会把它读成「没问题」，只有本门这一行写 `no-input` 而不是 `findings: 0`。
 * 包络在而解不开、或形状不对，则报 `envelope-unreadable` 阻断：判不出就不放行。
 */

import fs from 'node:fs'
import path from 'node:path'
import { parseYaml } from '../vendor/page-theme-core/index.mjs'
import { parseFloorRoots } from './paint-floors.mjs'

export const GATE = 'layout-envelope'
export const LAYOUT_ENVELOPE_FILE = 'layout-envelope.json'
export const FLOOR_INDEX_FILE = 'floor-index.json'

/**
 * 三个词表常量。它们是**闭集词条**不是阈值：`role` 的 L0 闭集与两个页壳 taxonomy 由资产合同
 * §4.1 定死，写死在这里是有意的——从观测集合里现取会让判据变成「等于观测到的那些」，即空断言。
 * 阈值一个都没有，也因此没有任何一个可以升成 CLI 参数。
 */
const CHROME_ROLES = ['chrome', 'overlay']
const SHELL_FIRST_TAXONOMY = 'navbar'
const SHELL_LAST_TAXONOMY = 'footer'
const FLOAT_WIDGET_TAXONOMY = 'float-widget'

/** 顶外边距三个 prop。`margin-block` 一族不收，是已知宽度，不为它另立一套逻辑属性映射。 */
const TOP_MARGIN_PROPS = new Set(['margin', 'margin-top', 'margin-block-start'])

/** 报告里 findings 的定序。两侧同一份，与包络里规律的排布无关，改包络不改报告顺序。 */
const CODE_ORDER = [
	'envelope-unreadable',
	'envelope-rule-unimplemented',
	'floor-index-unreadable',
	'floor-pattern-unknown',
	'synth-inherit-unreadable',
	'artifact-kind-missing',
	'container-mode-out-of-envelope',
	'container-width-out-of-envelope',
	'merge-spacing-with-prev',
	'page-shell-out-of-order',
	'page-shell-ends-missing',
	'float-widget-in-sequence',
	'body-start-out-of-envelope',
	'paint-skip-out-of-envelope',
]

/** 需要把层根解析成型记录的那几维。只有它们在场时才去读 `floor-index.json`。 */
const RULES_NEEDING_FLOOR_INDEX = new Set([
	'container-mode-closed-set',
	'contained-has-enumerated-max-width',
	'page-sequence-navbar-first-footer-last',
	'float-widget-never-in-sequence',
	'body-starts-with-hero-or-page-header',
	'paint-skip-membership',
])

/** 本门实现了判据的规律 id。包络里出现别的 id 一律报 `envelope-rule-unimplemented`。 */
const KNOWN_RULES = new Set([...RULES_NEEDING_FLOOR_INDEX, 'merge-spacing-with-prev-always-false'])

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v)
const finding = (detail) => ({ gate: GATE, level: 'block', ...detail })
const strings = (v) => (Array.isArray(v) && v.every((s) => typeof s === 'string') ? v : null)

/**
 * 产物粒度的取值闭集。`page` 整页 · `floor` 楼层片段 · `component` 组件，没有第四个值。
 *
 * 闭集写死在这里而不是「见着什么算什么」：粒度决定要不要判页级两维，可扩展的粒度等于可以
 * 随手编一个值让门闭嘴。写声明的是生成 agent，判声明的是门，两边都不许现造词条。
 */
export const ARTIFACT_KINDS = ['page', 'floor', 'component']

/**
 * 读 trace 上的产物粒度声明。**三种返回对应三种处置，不许合并成两种。**
 *
 * · `undefined` —— 压根没给 trace。页级两维整块不判（`no-input` 语义），不开口也不退 1。
 * · `null` —— 给了 trace 却没有闭集内的 `artifact.kind`。调用方报 `artifact-kind-missing`。
 * · 闭集里那个字符串 —— 按它判。
 *
 * 中间这一档不许退回「按层根数猜」：留一条 fallback 就等于门有两套粒度口径，而分家从来不报错。
 * 头一档也不许并进中间那档：`--trace` 是既有可选旗标，把「没给」判成越界是改契约。
 */
export function readArtifactKind(trace) {
	if (trace === null || trace === undefined) return undefined
	const artifact = isObj(trace) ? trace.artifact : null
	if (!isObj(artifact)) return null
	return ARTIFACT_KINDS.includes(artifact.kind) ? artifact.kind : null
}

/** 从 `[{ <key>: string, … }]` 这类计数行里取那一列，取不到（形状不对）返回 `null`。 */
function column(rows, key) {
	if (!Array.isArray(rows) || rows.length === 0) return null
	const out = []
	for (const row of rows) {
		if (!isObj(row) || typeof row[key] !== 'string') return null
		out.push(row[key])
	}
	return new Set(out)
}

/**
 * 读 `floor-index.json` 的 `floors[]`，按 id 建表。读不出返回 `null`——调用方据此报
 * `floor-index-unreadable`，不静默把四维判成全绿。
 */
export function readFloorRecords(assetDir) {
	let doc
	try {
		doc = JSON.parse(fs.readFileSync(path.join(assetDir, FLOOR_INDEX_FILE), 'utf8'))
	} catch {
		return null
	}
	if (!isObj(doc) || !Array.isArray(doc.floors)) return null
	const byId = new Map()
	for (const f of doc.floors) {
		if (isObj(f) && typeof f.id === 'string') byId.set(f.id, f)
	}
	return byId
}

/**
 * 顶外边距是不是负的。
 *
 * 先抹掉自定义属性名再判：`var(--dimension-spacing-2)` 尾巴上那个 `-2` 不是负号，不抹会把每
 * 一条规规矩矩引 token 的间距都判成越界——一道爱误报的门，用不了几次就会被整体关掉。抹法与
 * `colorLiterals` 里那条同一个理由。`calc(-1 * var(…))` 与 `calc(var(…) * -1)` 两种写法都算负。
 */
const stripCustomPropertyNames = (s) => String(s).replace(/--[A-Za-z0-9_-]+/g, ' ')
const NEGATIVE_LENGTH = /(?:^|[\s(,*/+])-\s*(?:\d|\.|var\()/

/** 取 `margin` 简写的第一个分量（顶边）。按括号配平切，`calc(1px 之类)` 不会被空格撕开。 */
function firstComponent(value) {
	const src = String(value).trim()
	let depth = 0
	let out = ''
	for (const c of src) {
		if (c === '(') depth += 1
		else if (c === ')') depth -= 1
		else if (depth === 0 && /\s/.test(c)) break
		out += c
	}
	return out
}

export function hasNegativeTopMargin(prop, value) {
	if (!TOP_MARGIN_PROPS.has(prop)) return false
	const top = prop === 'margin' ? firstComponent(value) : String(value)
	return NEGATIVE_LENGTH.test(stripCustomPropertyNames(top))
}

/** 层根自己的选择器：它的每个类，加 `[data-pattern="<id>"]`。与 §4 底色反查同一条命中口径。 */
function rootSelectors(roots) {
	const bySelector = new Map()
	for (const root of roots) {
		const keys = [...root.classes.map((c) => `.${c}`), `[data-pattern="${root.pattern}"]`]
		for (const key of keys) {
			if (!bySelector.has(key)) bySelector.set(key, root.pattern)
		}
	}
	return bySelector
}

const wrap = (findings) => ({ status: findings.length ? 'blocked' : 'pass', findings: sortLayoutFindings(findings) })
const noInput = () => ({ status: 'no-input', findings: [] })

export function sortLayoutFindings(findings) {
	return [...findings].sort((a, b) => {
		const ca = CODE_ORDER.indexOf(a.code)
		const cb = CODE_ORDER.indexOf(b.code)
		if (ca !== cb) return (ca < 0 ? 99 : ca) - (cb < 0 ? 99 : cb)
		for (const k of ['file', 'pattern', 'selector', 'prop', 'at']) {
			const va = String(a[k] ?? '')
			const vb = String(b[k] ?? '')
			if (va < vb) return -1
			if (va > vb) return 1
		}
		return 0
	})
}

/**
 * 跑本门。
 *
 * @param {{ htmlFiles?: Array<{ file?: string|null, text?: string }>, declarations?: Array<object>, assetDir?: string|null, trace?: object|null }} input
 * @returns {{ status: 'no-input'|'pass'|'blocked', findings: Array<object> }}
 */
export function checkLayoutEnvelope({ htmlFiles = [], declarations = [], assetDir = null, trace = null } = {}) {
	if (!assetDir) return noInput()
	const envelopeFile = path.join(assetDir, LAYOUT_ENVELOPE_FILE)
	if (!fs.existsSync(envelopeFile)) return noInput() // 准入已挡在前面（R4-10），本门不私造第二套准入

	let doc
	try {
		doc = JSON.parse(fs.readFileSync(envelopeFile, 'utf8'))
	} catch (e) {
		return wrap([finding({ code: 'envelope-unreadable', at: LAYOUT_ENVELOPE_FILE, reason: `资产的 ${LAYOUT_ENVELOPE_FILE} 解不开（${e.message}）：判不出就不放行——静默当作全绿，等于这道门只在包络完好时存在` })])
	}
	if (!isObj(doc) || !Array.isArray(doc.blocking)) {
		return wrap([finding({ code: 'envelope-unreadable', at: LAYOUT_ENVELOPE_FILE, reason: `资产的 ${LAYOUT_ENVELOPE_FILE} 里没有数组形状的 blocking：本门只吃阻断层，读不到它就一维都判不出` })])
	}

	const findings = []
	const kind = readArtifactKind(trace)
	if (kind === null) {
		findings.push(
			finding({
				code: 'artifact-kind-missing',
				at: 'trace.artifact.kind',
				reason: `trace 里读不到闭集内的 artifact.kind（只认 ${ARTIFACT_KINDS.map((k) => `\`${k}\``).join(' / ')}）：页级两维判的是「整页该有的东西缺没缺」，粒度判不出就一维都不敢判，也不许按层根数猜回来`,
			}),
		)
	}
	const claimed = new Map()
	for (const rule of doc.blocking) {
		const id = isObj(rule) && typeof rule.id === 'string' ? rule.id : null
		if (!id || !KNOWN_RULES.has(id)) {
			findings.push(finding({ code: 'envelope-rule-unimplemented', rule: id, reason: `包络阻断层里有本门没有判据的规律 \`${id ?? '<无 id>'}\`：阻断层每一条都必须有一维门，多出来的这条今天没人判——不静默少判一维，判据补上或把它降级` }))
			continue
		}
		claimed.set(id, isObj(rule.detail) ? rule.detail : {})
	}

	const pages = htmlFiles
		.filter((f) => isObj(f) && typeof f.text === 'string')
		.map((f) => ({ file: f.file ?? null, roots: parseFloorRoots(f.text) }))

	// 第三维不查资产、只查产物声明，所以它与型记录读不读得出无关，先跑。
	if (claimed.has('merge-spacing-with-prev-always-false')) {
		findings.push(...checkMergeSpacing(pages, declarations))
	}

	const needsFloors = [...claimed.keys()].some((id) => RULES_NEEDING_FLOOR_INDEX.has(id))
	const usedIds = []
	for (const page of pages) {
		for (const root of page.roots) {
			if (!usedIds.includes(root.pattern)) usedIds.push(root.pattern)
		}
	}
	if (!needsFloors || usedIds.length === 0) return wrap(findings)

	const floors = readFloorRecords(assetDir)
	if (!floors) {
		findings.push(finding({ code: 'floor-index-unreadable', at: FLOOR_INDEX_FILE, reason: `包络有需要型记录才判得动的阻断规律，而资产的 ${FLOOR_INDEX_FILE} 读不出 floors[]：判不出就不放行` }))
		return wrap(findings)
	}
	const floorsById = floors
	for (const id of usedIds) {
		if (floors.has(id)) continue
		if (isSynthPattern(id)) {
			if (!trace) {
				findings.push(
					finding({
						code: 'synth-inherit-unreadable',
						pattern: id,
						reason: `产物层根 \`${id}\` 是合成型，包络门需要 trace 上的继承源才能把型级四维连回真实型记录：没传 trace 就判不出，不放行`,
					}),
				)
				continue
			}
			const source = primaryInheritSource(trace, id)
			if (!source) {
				findings.push(
					finding({
						code: 'synth-inherit-unreadable',
						pattern: id,
						reason: `合成型 \`${id}\` 在 trace.floors[] 里取不到 \`inheritFrom: { pattern, breakpoint }\` 继承源：型级四维判不出，不放行`,
					}),
				)
				continue
			}
			const validated = validateInheritSource(assetDir, source, floorsById)
			if (!validated.ok) {
				findings.push(
					finding({
						code: 'synth-inherit-unreadable',
						pattern: id,
						inheritFrom: source,
						reason: `合成型 \`${id}\` 的继承源 \`${source.pattern}@${source.breakpoint}\` 那一档在资产里是 grid.observed: false（没有实测几何）：只能指名有实测的真实型档位`,
					}),
				)
				continue
			}
			const resolved = resolveSynthFloorRecord(trace, id, assetDir, floorsById)
			if (!resolved) {
				findings.push(
					finding({
						code: 'synth-inherit-unreadable',
						pattern: id,
						reason: `合成型 \`${id}\` 的继承源在 floor-index.json 里取不到型记录：判不出容器与跳过归属，不放行`,
					}),
				)
			}
			continue
		}
		findings.push(finding({ code: 'floor-pattern-unknown', pattern: id, reason: `产物层根 \`${id}\` 在资产 ${FLOOR_INDEX_FILE} 的 floors[] 里查不到：型记录取不到就判不出容器、跳过归属这几维，不放行` }))
	}

	const floorLookup = (id) => {
		if (floors.has(id)) return floors.get(id)
		if (isSynthPattern(id) && trace) return resolveSynthFloorRecord(trace, id, assetDir, floorsById)
		return null
	}

	if (claimed.has('container-mode-closed-set')) {
		findings.push(...checkContainerMode(usedIds, floorLookup, claimed.get('container-mode-closed-set')))
	}
	if (claimed.has('contained-has-enumerated-max-width')) {
		findings.push(...checkContainerWidth(usedIds, floorLookup))
	}
	if (claimed.has('paint-skip-membership')) {
		findings.push(...checkPaintSkip(usedIds, floorLookup, claimed.get('paint-skip-membership')))
	}
	if (claimed.has('page-sequence-navbar-first-footer-last')) {
		findings.push(...checkShellEnds(pages, floorLookup, kind))
	}
	if (claimed.has('float-widget-never-in-sequence')) {
		findings.push(...checkFloatWidget(pages, floorLookup, claimed.get('float-widget-never-in-sequence')))
	}
	if (claimed.has('body-starts-with-hero-or-page-header')) {
		findings.push(...checkBodyStart(pages, floorLookup, claimed.get('body-starts-with-hero-or-page-header'), kind))
	}
	return wrap(findings)
}

const detailUnreadable = (rule, at, why) =>
	finding({ code: 'envelope-unreadable', rule, at: `blocking[${rule}].detail.${at}`, reason: `包络这条阻断规律的 ${at} 不是本门认得的形状（${why}）：读不出判据就不放行` })

/** 维一：容器模式。允许集合取包络实际投影出的那几种，不在本门写死。 */
function checkContainerMode(usedIds, floorLookup, detail) {
	const modes = column(detail.byMode, 'mode')
	if (!modes) return [detailUnreadable('container-mode-closed-set', 'byMode', '应当是 [{ mode: string, … }]')]
	const out = []
	for (const id of usedIds) {
		const floor = floorLookup(id)
		if (!floor) continue
		const mode = isObj(floor.container) ? floor.container.mode : undefined
		if (typeof mode === 'string' && modes.has(mode)) continue
		out.push(
			finding({
				code: 'container-mode-out-of-envelope',
				pattern: id,
				rule: 'container-mode-closed-set',
				mode: mode === undefined ? null : mode,
				reason: `型 \`${id}\` 的 container.mode 是 \`${mode ?? '<缺席>'}\`，不在包络列出的 ${[...modes].map((m) => `\`${m}\``).join(' / ')} 内：容器模式是闭集，第三种模式在原站一层都没有`,
			}),
		)
	}
	return out
}

/**
 * 维二：`contained` 必有宽、`full-bleed` 必无。
 *
 * **只判这两条方向，不判宽度值落不落在包络那几个数里**——包络自己写着「集合本身是观测」，
 * 拿观测集合当允许值清单，就是把报警口径塞进阻断层。
 */
function checkContainerWidth(usedIds, floorLookup) {
	const out = []
	for (const id of usedIds) {
		const floor = floorLookup(id)
		if (!floor) continue
		const container = isObj(floor.container) ? floor.container : {}
		const width = container.maxWidthPx
		if (container.mode === 'contained' && !Number.isInteger(width)) {
			out.push(finding({ code: 'container-width-out-of-envelope', pattern: id, rule: 'contained-has-enumerated-max-width', reason: `型 \`${id}\` 是 contained 却读不到整数 maxWidthPx：限宽容器不给宽度，这一层在产物里没有可对的边界` }))
		}
		if (container.mode === 'full-bleed' && width !== undefined && width !== null) {
			out.push(finding({ code: 'container-width-out-of-envelope', pattern: id, rule: 'contained-has-enumerated-max-width', maxWidthPx: width, reason: `型 \`${id}\` 是 full-bleed 却带着 maxWidthPx=${width}：通栏层不该有限宽，两个声明打架时产物照哪个做都说不清` }))
		}
	}
	return out
}

/** 维三：层根不得用负顶外边距把自己并进上一层。 */
function checkMergeSpacing(pages, declarations) {
	const selectors = new Map()
	for (const page of pages) {
		for (const [selector, pattern] of rootSelectors(page.roots)) {
			if (!selectors.has(selector)) selectors.set(selector, pattern)
		}
	}
	if (selectors.size === 0) return []
	const out = []
	for (const d of declarations) {
		if (!isObj(d) || d.widget) continue
		const pattern = selectors.get(String(d.selector ?? ''))
		if (pattern === undefined) continue
		if (!hasNegativeTopMargin(String(d.prop ?? ''), String(d.value ?? ''))) continue
		out.push(
			finding({
				code: 'merge-spacing-with-prev',
				rule: 'merge-spacing-with-prev-always-false',
				file: d.file ?? null,
				selector: d.selector ?? null,
				prop: d.prop ?? null,
				pattern,
				value: d.value ?? null,
				reason: `层根 \`${d.selector}\` 用负的顶外边距把本层并进上一层：包络里 51 层无一例外都是 merge_spacing_with_prev: false，楼层之间不叠、不吃掉上一层的下边距`,
			}),
		)
	}
	return out
}

/**
 * 维四：页壳两端。**两个码**，因为是两种缺陷、两种修法。
 *
 * · `page-shell-out-of-order` —— 页壳型在场却排错位（重排即可）。**不看粒度**：单层片段里塞一个
 *   排在第二位的 navbar 也是错位：这一支判的是「在场的页壳站错了地方」，而 navbar 该在首位、
 *   footer 该在末位在片段里同样成立，与「整页该不该有页壳」不是同一个问题。
 *   一条会挂的输入：`kind: 'floor'` 的片段里第二个层根是 `navbar.utility-left`。
 * · `page-shell-ends-missing` —— **声明 `artifact.kind: "page"`** 的产物首层不是 navbar / 末层不是
 *   footer（补层才行）。这一条是把包络反例「首层不是 navbar 或末层不是 footer 的页（空序列
 *   也算）」原文落成判据，与布局表的 `sequence-first` / `sequence-last` 同一句翻译（`R4-13`）。
 *   1 个层根的页照判，5 个层根的 `floor` 片段一条不开。
 */
function checkShellEnds(pages, floorLookup, kind) {
	const out = []
	for (const page of pages) {
		const last = page.roots.length - 1
		page.roots.forEach((root, i) => {
			const taxonomy = taxonomyOf(floorLookup, root.pattern)
			if (taxonomy === SHELL_FIRST_TAXONOMY && i !== 0) {
				out.push(finding({ code: 'page-shell-out-of-order', file: page.file, pattern: root.pattern, rule: 'page-sequence-navbar-first-footer-last', at: `roots[${i}]`, reason: `顶栏型 \`${root.pattern}\` 排在第 ${i + 1} 个层根上，不是首位：包络里 10/10 页首层都是 navbar` }))
			}
			if (taxonomy === SHELL_LAST_TAXONOMY && i !== last) {
				out.push(finding({ code: 'page-shell-out-of-order', file: page.file, pattern: root.pattern, rule: 'page-sequence-navbar-first-footer-last', at: `roots[${i}]`, reason: `页脚型 \`${root.pattern}\` 排在第 ${i + 1} / ${last + 1} 个层根上，不是末位：包络里 10/10 页末层都是 footer` }))
			}
		})
		if (kind !== 'page' || page.roots.length === 0) continue
		const firstTaxonomy = taxonomyOf(floorLookup, page.roots[0].pattern)
		const lastTaxonomy = taxonomyOf(floorLookup, page.roots[last].pattern)
		if (firstTaxonomy !== SHELL_FIRST_TAXONOMY) {
			out.push(finding({ code: 'page-shell-ends-missing', file: page.file, pattern: page.roots[0].pattern, rule: 'page-sequence-navbar-first-footer-last', at: 'roots[0]', end: 'first', taxonomy: firstTaxonomy, reason: `页级产物首层是 \`${firstTaxonomy ?? '<型记录取不到>'}\`（型 \`${page.roots[0].pattern}\`）而不是 ${SHELL_FIRST_TAXONOMY}：包络阻断层的反例是「首层不是 navbar 的页」，缺顶栏与顶栏排错位是两件事，这一条要补一层不是重排` }))
		}
		if (lastTaxonomy !== SHELL_LAST_TAXONOMY) {
			out.push(finding({ code: 'page-shell-ends-missing', file: page.file, pattern: page.roots[last].pattern, rule: 'page-sequence-navbar-first-footer-last', at: `roots[${last}]`, end: 'last', taxonomy: lastTaxonomy, reason: `页级产物末层是 \`${lastTaxonomy ?? '<型记录取不到>'}\`（型 \`${page.roots[last].pattern}\`）而不是 ${SHELL_LAST_TAXONOMY}：包络阻断层的反例是「末层不是 footer 的页」，整页忘了写页脚由本码抓` }))
		}
	}
	return out
}

/** 维五：浮层不进序列。taxonomy 与包络点名的 id 取并集——改个 taxonomy 不该让它溜进来。 */
function checkFloatWidget(pages, floorLookup, detail) {
	const named = strings(detail.floatWidgetFloors)
	if (!named) return [detailUnreadable('float-widget-never-in-sequence', 'floatWidgetFloors', '应当是字符串数组')]
	const ids = new Set(named)
	const out = []
	for (const page of pages) {
		page.roots.forEach((root, i) => {
			if (taxonomyOf(floorLookup, root.pattern) !== FLOAT_WIDGET_TAXONOMY && !ids.has(root.pattern)) return
			out.push(finding({ code: 'float-widget-in-sequence', file: page.file, pattern: root.pattern, rule: 'float-widget-never-in-sequence', at: `roots[${i}]`, reason: `浮层型 \`${root.pattern}\` 出现在产物的层根序列里：包络扫过 84 步 0 命中，浮层只挂在 chrome 挂载位上。真要挂它，它不该带 data-pattern 层根标记` }))
		})
	}
	return out
}

/**
 * 维六：正文起手。开场型集合取包络投影出的那几个，`role` 闭集写死（见文件头）。
 *
 * 只判声明 `artifact.kind: "page"` 的产物：「跳过页壳之后的第一层」是页才有的位置，楼层片段的
 * 第一层就是它自己。一条会挂的输入：cta 打头的整页。
 */
function checkBodyStart(pages, floorLookup, detail, kind) {
	const allowed = column(detail.byTaxonomy, 'taxonomy')
	if (!allowed) return [detailUnreadable('body-starts-with-hero-or-page-header', 'byTaxonomy', '应当是 [{ taxonomy: string, … }]')]
	const out = []
	if (kind !== 'page') return out
	for (const page of pages) {
		const i = page.roots.findIndex((root) => !CHROME_ROLES.includes(roleOf(floorLookup, root.pattern)))
		if (i < 0) continue
		const root = page.roots[i]
		const taxonomy = taxonomyOf(floorLookup, root.pattern)
		if (taxonomy === null || allowed.has(taxonomy)) continue
		out.push(
			finding({
				code: 'body-start-out-of-envelope',
				file: page.file,
				pattern: root.pattern,
				rule: 'body-starts-with-hero-or-page-header',
				at: `roots[${i}]`,
				taxonomy,
				reason: `正文起手是 \`${taxonomy}\`（型 \`${root.pattern}\`），不在包络列出的开场型 ${[...allowed].map((t) => `\`${t}\``).join(' / ')} 内：跳过页壳之后的第一层，原站每一页都是开场型`,
			}),
		)
	}
	return out
}

/**
 * 维七：涂色**跳过谁**。
 *
 * 按包络的三个跳过集合重算「这一型跳不跳」，与资产 `floor-index.json` 的 `paint` 记录比。
 * **只判跳过归属这一维**：交替顺序、交替起点、`rhythm.scheme` 成不成立一概不投影也不判，
 * 「这一层涂了什么」归 `paint-consistency`。
 */
function checkPaintSkip(usedIds, floorLookup, detail) {
	const skipRoles = strings(detail.skipRoles)
	const skipTaxonomies = strings(detail.skipTaxonomies)
	const hardSkipSurfaces = strings(detail.hardSkipSurfaces)
	if (!skipRoles) return [detailUnreadable('paint-skip-membership', 'skipRoles', '应当是字符串数组')]
	if (!skipTaxonomies) return [detailUnreadable('paint-skip-membership', 'skipTaxonomies', '应当是字符串数组')]
	if (!hardSkipSurfaces) return [detailUnreadable('paint-skip-membership', 'hardSkipSurfaces', '应当是字符串数组')]

	const out = []
	for (const id of usedIds) {
		const floor = floorLookup(id)
		if (!floor) continue
		const paint = isObj(floor.paint) ? floor.paint : null
		if (!paint || typeof paint.participatesInCount !== 'boolean') {
			out.push(finding({ code: 'paint-skip-out-of-envelope', pattern: id, rule: 'paint-skip-membership', reason: `型 \`${id}\` 的 paint.participatesInCount 读不到布尔值：跳不跳判不出，不放行` }))
			continue
		}
		const hits = []
		if (skipRoles.includes(floor.role)) hits.push(`role=${floor.role}`)
		if (skipTaxonomies.includes(floor.taxonomy)) hits.push(`taxonomy=${floor.taxonomy}`)
		if (hardSkipSurfaces.includes(paint.ownSurface)) hits.push(`ownSurface=${paint.ownSurface}`)
		const expectSkip = hits.length > 0
		if (expectSkip !== !paint.participatesInCount) {
			out.push(
				finding({
					code: 'paint-skip-out-of-envelope',
					pattern: id,
					rule: 'paint-skip-membership',
					reason: expectSkip
						? `型 \`${id}\` 命中包络的跳过集（${hits.join(' · ')}），资产却记着它参与交替计数：两边对不上时整条序列的底色全错位`
						: `型 \`${id}\` 不命中包络的任何跳过集（role=${floor.role} · taxonomy=${floor.taxonomy} · ownSurface=${paint.ownSurface ?? '<缺席>'}），资产却记着它被跳过：两边对不上时整条序列的底色全错位`,
				}),
			)
		}
	}
	return out
}

const isSynthPattern = (id) => typeof id === 'string' && /^synth:/i.test(id)

const synthTaxonomyFromId = (id) => {
	const bare = String(id).replace(/^synth:/i, '')
	const dot = bare.indexOf('.')
	return dot < 0 ? bare : bare.slice(0, dot)
}

const isInheritFromSource = (value) =>
	value !== null && typeof value === 'object' && !Array.isArray(value) && typeof value.pattern === 'string' && typeof value.breakpoint === 'string'

const ENVELOPE_BREAKPOINTS = ['pc', 'tablet', 'mobile']

const readYaml = (file) => {
	try {
		return parseYaml(fs.readFileSync(file, 'utf8'))
	} catch {
		return null
	}
}

/** 读真实型的 responsive（与 responsive-inherit 同口径，内联以便 audit 侧逐字同源）。 */
const readPatternResponsive = (assetDir, id) => {
	const own = readYaml(path.join(assetDir, 'patterns', `${id}.yaml`))
	if (own && typeof own === 'object') return own.responsive ?? {}
	const chrome = readYaml(path.join(assetDir, 'patterns', 'chrome.yaml'))
	const entry = chrome && typeof chrome === 'object' ? chrome[id] : null
	if (entry && typeof entry === 'object') return entry.responsive ?? {}
	return null
}

const validateInheritSource = (assetDir, source, floorIds) => {
	if (!isInheritFromSource(source)) return { ok: false }
	const pattern = source.pattern.trim()
	const breakpoint = source.breakpoint.trim()
	if (!pattern || isSynthPattern(pattern)) return { ok: false }
	if (!ENVELOPE_BREAKPOINTS.includes(breakpoint)) return { ok: false }
	if (floorIds && !floorIds.has(pattern)) return { ok: false }
	const responsive = readPatternResponsive(assetDir, pattern)
	if (!responsive) return { ok: false }
	if (responsive[breakpoint]?.grid?.observed === false) return { ok: false }
	return { ok: true, pattern, breakpoint }
}

const primaryInheritSource = (trace, synthId) => {
	const floor = (trace?.floors ?? []).find((f) => String(f?.id ?? '') === synthId)
	const entries = Array.isArray(floor?.unobservedBreakpoints) ? floor.unobservedBreakpoints : []
	const byBp = new Map(entries.map((e) => [String(e?.breakpoint ?? ''), e]))
	for (const bp of ENVELOPE_BREAKPOINTS) {
		const e = byBp.get(bp)
		if (e && isInheritFromSource(e.inheritFrom)) return e.inheritFrom
	}
	for (const e of entries) {
		if (isInheritFromSource(e.inheritFrom)) return e.inheritFrom
	}
	return null
}

const resolveSynthFloorRecord = (trace, synthId, assetDir, floorsById) => {
	const source = primaryInheritSource(trace, synthId)
	if (!source) return null
	const validated = validateInheritSource(assetDir, source, floorsById)
	if (!validated.ok) return null
	return floorsById.get(validated.pattern) ?? null
}

const taxonomyOf = (floorLookup, id) => {
	if (isSynthPattern(id)) return synthTaxonomyFromId(id)
	const floor = floorLookup(id)
	return floor && typeof floor.taxonomy === 'string' ? floor.taxonomy : null
}

const roleOf = (floorLookup, id) => {
	const floor = floorLookup(id)
	return floor && typeof floor.role === 'string' ? floor.role : null
}
