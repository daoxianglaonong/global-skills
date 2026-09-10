/**
 * 验证侧十道门。各自独立成一个函数，各自能被单独喂一份会挂的输入。
 *
 * 前六道判据从 page-theme-generate 整段照搬（`sequence-approval` 整段不带走：本包不承接它）。
 * 中三道在 `gates-asset.mjs`：判产物与资产文档之间的对账。第十道 `layout-envelope` 的判据整份
 * 在 `layout-envelope-gate.mjs`，**与生成侧逐字节相同**——只在生成侧跑等于自由构图自产自检，
 * 而本包为出布局表本来就要读那份包络，多跑一道门不新增读面。
 *
 * | 门 | 判什么 | 一条会挂的输入 | 抓不住什么 |
 * | --- | --- | --- | --- |
 * | `color-literal` | 写死了色值：hex、颜色函数、命名色，含复合值内嵌 | `border: 1px solid #fff` | 自定义属性声明右侧的字面量（`--x: #fff`）不进射程 |
 * | `font-stack-literal` | 字体族不在资产已声明的字体栈内 | `font-family: var(--fontFamily-sans), "Comic Sans MS"` | 不判字重、字号、行高对不对 |
 * | `var-not-in-closed-set` | 引用了本资产闭集里没有的变量 | `var(--color-brand-primary)` | 不求值、不判环引用（本包没有 `var()` 求值器） |
 * | `primitive-leak` | 颜色跳过 semantic 直引 primitive | `var(--color-neutral-1)` | 改名成 `--brand-bg` 就溜了，须与下一道同时关上 |
 * | `unresolved-var` | 变量名反解不出 token 路径 | `var(--foo-bar-baz)` | 规规矩矩引 `--color-neutral-1` 就溜了，须与上一道同时关上 |
 * | `image-evidence` | trace 声称读图确认，图却指不出或解不开 | 指名一张资产里不存在的图 | 不证明你真看了图，只验声称与实物对不对得上 |
 * | `design-dont-section-missing` | 资产有未上屏项，`DESIGN.md` 却没有 §8 Don't 节 | 一份删掉 `## 8. Do's and Don'ts` 整节的资产 | 不判缺 `DESIGN.md`（归采集侧），不判节里写得对不对 |
 * | `primitive-dont-id` | `observed: false` 的 primitive 色阶缺 `dontId`，或其 `dontId` 在 `DESIGN.md` 里对不上 | 删掉 fixture 里 `color.orange.1` 的 `dontId`；或把它改成 `DESIGN.md` 里没有的 id | 不判 `DESIGN.md` 那一行的文字是否真点到这条色阶；non-primitive 那一半归采集侧 |
 * | `voice-forbidden-term` | 产物文案命中 `voice.md` §V3 的 `avoid` / `forbidden_topics` | 正文里写「一站式」，而 §V3 的 `avoid` 表里有它 | 只按字面匹配，不判语义；图里的字、JS 拼出的文案抓不住 |
 * | `layout-envelope` | 产物用的型或排的序踩了资产 `layout-envelope.json` 的**阻断层** | cta 打头的页级序列 | 报警层一个字不读；单层内部几何不判；射程逐条见该模块头 |
 *
 * `primitive-leak` 与 `unresolved-var` 是双闸门，必须同时关上。射程与豁免三条与生成侧逐字同一套：
 * 只有 `currentColor` 与 `transparent` 免检；`data-pt-widget="third-party"` 子树内部色与字体不归本
 * 站主题管，读不到那个标记就不豁免；不扫自定义属性声明。
 *
 * `forbidden_topics` 的条目是主题（「竞品点名贬低」），本门当字面词处理。真在贬低竞品却没写
 * 那几个字，本门抓不住——那是人读的事，不许让门看起来比射程大。
 *
 * 资产目录是必给项：缺了由调用方硬失败，本模块的 `runAllGates` 不再像生成侧那样在
 * `assetDir` 为空时静默跳过读图门。不给 trace 时 `image-evidence` 写 `status: "no-input"`。
 */

import { isColorPrimitiveLeak, isUnresolvedVar, classifyCssVar } from '../vendor/page-theme-core/index.mjs'
import { varReferences } from './closed-set.mjs'
import { probeImageFile, ImageProbeError } from './image-probe.mjs'
import { checkLayoutEnvelope } from './layout-envelope-gate.mjs'
import {
	collectUnobserved,
	extractVoiceTerms,
	gateDesignDontSectionMissing,
	gatePrimitiveDontId,
	gateVoiceForbiddenTerm,
} from './gates-asset.mjs'
import fs from 'node:fs'
import path from 'node:path'

export {
	collectUnobserved,
	extractCopySurfaces,
	extractVoiceTerms,
	gateDesignDontSectionMissing,
	gatePrimitiveDontId,
	gateVoiceForbiddenTerm,
	hasDesignDontSection,
} from './gates-asset.mjs'

export const GATE_ORDER = [
	'color-literal',
	'font-stack-literal',
	'var-not-in-closed-set',
	'primitive-leak',
	'unresolved-var',
	'design-dont-section-missing',
	'primitive-dont-id',
	'voice-forbidden-term',
	'image-evidence',
	'layout-envelope',
]

const FINDING_SORT_KEYS = ['file', 'assetFile', 'tokenPath', 'selector', 'prop', 'floor', 'field', 'var', 'value', 'term', 'image']

export function sortFindings(findings) {
	return [...findings].sort((a, b) => {
		const ga = GATE_ORDER.indexOf(a.gate)
		const gb = GATE_ORDER.indexOf(b.gate)
		if (ga !== gb) return (ga < 0 ? 99 : ga) - (gb < 0 ? 99 : gb)
		for (const k of FINDING_SORT_KEYS) {
			const va = String(a[k] ?? '')
			const vb = String(b[k] ?? '')
			if (va < vb) return -1
			if (va > vb) return 1
		}
		return 0
	})
}

/**
 * trace 白名单：读面只有 `artifact.kind`、`floors[]` 的 `id` / `fields[]`（四项）/
 * `unobservedBreakpoints[]`。白名单之外的键一律不读，报告收录的 `trace` 就是这一份——读面与
 * 披露面同一个对象。
 *
 * `unobservedBreakpoints` 是 `R4-08` 给合成型的机读结构，包络门靠它把 `synth:` 层根连回真实型
 * 记录。`artifact.kind` 是 `R4-15` 的产物粒度声明，包络门靠它判要不要跑页级两维。两者都是逐
 * 字段重建、只留字符串：整条透传 `artifact` 会把 html / css 文件名连同任何人塞进去的散文一起
 * 放进报告，而 `prose-invariance` 那四条断言只盯 `fields[]`，透传进来的散文没人拦。形状不对即
 * 落成缺席（键不出现），与「压根没写」在门那边同判——`synth-inherit-unreadable` 与
 * `artifact-kind-missing`。**闭集校验在门里，不在这儿**：白名单只保「是个字符串」，把闭集抄成
 * 两份就又是一次 `R4-14` 式分家。
 *
 * 缺席时不落键：不带合成型、不带 `kind` 的 trace 报告字节因此一个不变。
 */
export function whitelistTrace(raw) {
	if (!raw || typeof raw !== 'object') return null
	return {
		artifact: raw.artifact !== null && typeof raw.artifact === 'object' && !Array.isArray(raw.artifact) ? { kind: onlyString(raw.artifact.kind) } : undefined,
		floors: Array.isArray(raw.floors)
			? raw.floors.map((floor) => ({
					id: floor?.id,
					fields: Array.isArray(floor?.fields)
						? floor.fields.map((field) => ({
								field: field?.field,
								image: field?.image,
								imageConfirmed: field?.imageConfirmed,
								confidence: field?.confidence,
							}))
						: [],
					unobservedBreakpoints: Array.isArray(floor?.unobservedBreakpoints)
						? floor.unobservedBreakpoints.map((entry) => ({
								breakpoint: onlyString(entry?.breakpoint),
								inheritFrom: onlyInheritSource(entry?.inheritFrom),
							}))
						: undefined,
				}))
			: [],
	}
}

const onlyString = (v) => (typeof v === 'string' ? v : undefined)

const onlyInheritSource = (v) =>
	v !== null && typeof v === 'object' && !Array.isArray(v) && typeof v.pattern === 'string' && typeof v.breakpoint === 'string'
		? { pattern: v.pattern, breakpoint: v.breakpoint }
		: undefined

const COLOR_EXEMPT = new Set(['transparent', 'currentcolor'])
const FONT_EXEMPT = new Set(['inherit', 'unset', 'initial', 'revert'])

/** CSS 命名色闭集。`color: white` 和 `color: #fff` 是同一件事，漏掉一整类等于门只关了一半。 */
// prettier-ignore
const CSS_NAMED_COLORS = new Set([
	'aliceblue','antiquewhite','aqua','aquamarine','azure','beige','bisque','black','blanchedalmond','blue',
	'blueviolet','brown','burlywood','cadetblue','chartreuse','chocolate','coral','cornflowerblue','cornsilk','crimson',
	'cyan','darkblue','darkcyan','darkgoldenrod','darkgray','darkgreen','darkgrey','darkkhaki','darkmagenta','darkolivegreen',
	'darkorange','darkorchid','darkred','darksalmon','darkseagreen','darkslateblue','darkslategray','darkslategrey','darkturquoise','darkviolet',
	'deeppink','deepskyblue','dimgray','dimgrey','dodgerblue','firebrick','floralwhite','forestgreen','fuchsia','gainsboro',
	'ghostwhite','gold','goldenrod','gray','green','greenyellow','grey','honeydew','hotpink','indianred',
	'indigo','ivory','khaki','lavender','lavenderblush','lawngreen','lemonchiffon','lightblue','lightcoral','lightcyan',
	'lightgoldenrodyellow','lightgray','lightgreen','lightgrey','lightpink','lightsalmon','lightseagreen','lightskyblue','lightslategray','lightslategrey',
	'lightsteelblue','lightyellow','lime','limegreen','linen','magenta','maroon','mediumaquamarine','mediumblue','mediumorchid',
	'mediumpurple','mediumseagreen','mediumslateblue','mediumspringgreen','mediumturquoise','mediumvioletred','midnightblue','mintcream','mistyrose','moccasin',
	'navajowhite','navy','oldlace','olive','olivedrab','orange','orangered','orchid','palegoldenrod','palegreen',
	'paleturquoise','palevioletred','papayawhip','peachpuff','peru','pink','plum','powderblue','purple','rebeccapurple',
	'red','rosybrown','royalblue','saddlebrown','salmon','sandybrown','seagreen','seashell','sienna','silver',
	'skyblue','slateblue','slategray','slategrey','snow','springgreen','steelblue','tan','teal','thistle',
	'tomato','turquoise','violet','wheat','white','whitesmoke','yellow','yellowgreen',
	'transparent','currentcolor',
])

/**
 * 抹掉「长得像色值但不是色值」的片段，再交给抽取器。
 *
 * `url(#grad)` 的 SVG 片段标识、`content: "#fff"` 的文本、以及自定义属性名里的色相词
 * （`--color-teal-2` 含 `teal`）都会被误认成色值。这三处不先抹掉，门会在完全正当的写法上
 * 亮红——一道爱误报的门，用不了几次就会被整体关掉。
 */
const scrubNonColors = (s) =>
	String(s)
		.replace(/(["'])(?:\\.|(?!\1)[\s\S])*?\1/g, ' ')
		.replace(/\burl\([^)]*\)/gi, ' ')

/**
 * 抽色值字面量。必须自己扫而不能调 core 的 `parseCssColor`：那个函数只认「整串就是
 * 一个色」，`1px solid #fff` / `0 1px 2px rgba(0,0,0,.2)` / `linear-gradient(#fff,#000)`
 * 一律返回 null。而复合值里嵌的色恰恰是最常漏的一类——写 `color:` 时人人记得用变量，
 * 写 `border:` 简写时顺手就把 hex 打进去了。
 *
 * `named` 可关，是给 `font-family` 用的：`tan` / `linen` / `plum` 既是命名色也是字体名，
 * 在排印属性上按色判必然误报，那一侧另有 `font-stack-literal` 守着。
 */
export function colorLiterals(value, { named = true } = {}) {
	const src = scrubNonColors(value)
	const out = [
		...src.matchAll(/#[0-9a-fA-F]{3,8}\b|\brgba?\([^)]*\)|\bhsla?\([^)]*\)|\boklch\([^)]*\)|\boklab\([^)]*\)|\blab\([^)]*\)|\blch\([^)]*\)|\bcolor\(\s*[a-z]/gi),
	].map((m) => m[0])
	if (!named) return out
	// 命名色是裸词，先摘掉自定义属性名再扫，否则 `var(--color-teal-2)` 会被读成用了 teal。
	for (const w of src.replace(/--[A-Za-z0-9_-]+/g, ' ').matchAll(/[a-zA-Z]+/g)) {
		if (CSS_NAMED_COLORS.has(w[0].toLowerCase())) out.push(w[0])
	}
	return out
}

const finding = (gate, detail) => ({ gate, level: 'block', ...detail })

/**
 * 自定义属性声明（`--x: ...`）是否进色值门的射程。
 *
 * 不进。token 层本身就是「把资产的值写成 CSS 自定义属性」，那一片声明的右侧按定义全是
 * 字面量，扫它等于要求资产不许有值。放过它不留洞的理由在别处：任何 `var(--x)` 引用都要
 * 过 `var-not-in-closed-set`，所以就地自造一个 `--my-brand: #f00` 再引用它，会在引用处挂。
 *
 * 剩下一个本门不管的缺口：把闭集里已有的名字**覆写成别的值**（`--color-primary: #f00`）。
 * 那是「值对不对」不是「有没有绕过分层」，归 page-theme-audit 的值映射，不在本门射程。
 */
const isCustomPropertyDeclaration = (prop) => prop.startsWith('--')

/** 门一：色值字面量。 */
export function gateColorLiteral(declarations) {
	const out = []
	for (const d of declarations) {
		if (d.widget || isCustomPropertyDeclaration(d.prop)) continue
		for (const literal of colorLiterals(d.value, { named: !d.prop.startsWith('font') })) {
			if (COLOR_EXEMPT.has(literal.toLowerCase())) continue
			out.push(
				finding('color-literal', {
					file: d.file,
					selector: d.selector,
					prop: d.prop,
					value: literal,
					reason: '色值字面量：颜色一律走 var() 引用资产 token，命中某个 token 的值也不豁免（否则改一次资产就静默失配）',
				}),
			)
		}
	}
	return out
}

/** 从闭集里收出「资产声明过的字体族」。值形状按 DTCG 可能是串或串数组，两种都收。 */
export function declaredFontFamilies(closedSet) {
	const names = new Set()
	const eat = (v) => {
		if (typeof v === 'string') {
			for (const part of v.split(',')) {
				const n = normalizeFontName(part)
				if (n) names.add(n)
			}
		} else if (Array.isArray(v)) v.forEach(eat)
		else if (v && typeof v === 'object') Object.values(v).forEach(eat)
	}
	for (const entry of closedSet.entries) {
		if (entry.type !== 'fontFamily') continue
		eat(entry.value)
		eat(entry.resolved)
	}
	return names
}

const normalizeFontName = (s) =>
	String(s ?? '')
		.trim()
		.replace(/^["']|["']$/g, '')
		.trim()
		.toLowerCase()

/**
 * 按顶层逗号切字体栈。不能直接 `split(',')`：`var(--fontFamily-sans, "Noto Sans")`
 * 的 fallback 里有逗号，粗切会把一个 var() 引用撕成两半，判出来的族名全是残串。
 */
function splitTopLevelCommas(value) {
	const parts = []
	let depth = 0
	let quote = null
	let cur = ''
	for (let i = 0; i < value.length; i++) {
		const c = value[i]
		if (quote) {
			cur += c
			if (c === quote && value[i - 1] !== '\\') quote = null
			continue
		}
		if (c === '"' || c === "'") quote = c
		else if (c === '(') depth++
		else if (c === ')') depth--
		if (c === ',' && depth === 0) {
			parts.push(cur)
			cur = ''
			continue
		}
		cur += c
	}
	parts.push(cur)
	return parts.map((s) => s.trim()).filter(Boolean)
}

/**
 * 逐族查，不整串放行。
 *
 * 早先的写法是「整串以 `var(` 开头就跳过」，那正好放过了本门要抓的头号踩法：
 * `font-family: var(--fontFamily-sans), "Comic Sans MS"`——前半段规规矩矩引资产变量，
 * 后半段顺手补一个「更安全的系统字体兜底」，整串因此免检。var() **段**跳过是对的，
 * var() **打头**就整串跳过是漏。fallback 里的族名同样要查，那也是会真正生效的字体。
 */
function checkFontStack(value, declared, d, out) {
	for (const part of splitTopLevelCommas(value)) {
		const ref = /^var\(\s*--[A-Za-z0-9_-]+\s*(?:,([\s\S]*))?\)$/i.exec(part)
		if (ref) {
			if (ref[1]) checkFontStack(ref[1], declared, d, out)
			continue
		}
		const name = normalizeFontName(part)
		if (!name || FONT_EXEMPT.has(name)) continue
		if (declared.has(name)) continue
		out.push(
			finding('font-stack-literal', {
				file: d.file,
				selector: d.selector,
				prop: d.prop,
				value: name,
				reason: '字体族不在资产已声明的字体栈内：排印是品牌归属最强的信号之一，换一个族等于换一个站',
			}),
		)
	}
}

/** 门二：字体栈。字面字体族只有在资产已声明过它时才放行。 */
export function gateFontStack(declarations, closedSet) {
	const declared = declaredFontFamilies(closedSet)
	const out = []
	for (const d of declarations) {
		if (d.widget || d.prop !== 'font-family') continue
		const value = d.value.replace(/\s*!important$/i, '').trim()
		if (FONT_EXEMPT.has(value.toLowerCase())) continue
		checkFontStack(value, declared, d, out)
	}
	return out
}

/**
 * 门三：变量解析。产物引用的每个变量必须命中**本份资产**的闭集。
 *
 * 射程写明白：本门**不判变量求值**，也不判环引用（`--a: var(--b); --b: var(--a)`）。
 * 不是漏了——vendored core 里根本没有 `var()` 求值函数，环引用在它眼里既不挂也不抛也不
 * 返回 null，按「写不出会失败的用例就不准占一个门编号」这条硬约束，声称判环就是占了一个
 * 兑现不了的编号。要判环得先有求值器，那是另一张票。
 */
export function gateVarInClosedSet(declarations, closedSet) {
	const out = []
	for (const d of declarations) {
		if (d.widget) continue
		for (const name of varReferences(d.value)) {
			if (closedSet.has(name)) continue
			out.push(
				finding('var-not-in-closed-set', {
					file: d.file,
					selector: d.selector,
					prop: d.prop,
					var: name,
					reason: `变量名不在本资产 closed-set.json 里（styleSetId=${closedSet.styleSetId}）：生成侧不派生变量名，一律查表；查不到就是这份资产没有这个 token`,
				}),
			)
		}
	}
	return out
}

/** 双闸门 A：颜色跳过 semantic 直引 primitive。 */
export function gatePrimitiveLeak(declarations) {
	const out = []
	for (const d of declarations) {
		if (d.widget) continue
		for (const name of varReferences(d.value)) {
			if (!isColorPrimitiveLeak(name)) continue
			const cls = classifyCssVar(name)
			out.push(
				finding('primitive-leak', {
					file: d.file,
					selector: d.selector,
					prop: d.prop,
					var: name,
					layer: cls.layer,
					reason: `颜色直引 primitive 层（${cls.reason}）：色相族刻度是调色盘不是用色决策，越过 semantic 用它，换主题时这一处不会跟着变`,
				}),
			)
		}
	}
	return out
}

/** 双闸门 B：变量名反解不出 token 路径。 */
export function gateUnresolvedVar(declarations) {
	const out = []
	for (const d of declarations) {
		if (d.widget) continue
		for (const name of varReferences(d.value)) {
			if (!isUnresolvedVar(name)) continue
			const cls = classifyCssVar(name)
			out.push(
				finding('unresolved-var', {
					file: d.file,
					selector: d.selector,
					prop: d.prop,
					var: name,
					reason: `变量名反解不出 token 路径（${cls.reason}）：这道门与 primitive-leak 必须同时关上，否则把 --color-neutral-1 改名成 --brand-bg 就绕过了分层检查`,
				}),
			)
		}
	}
	return out
}

/**
 * 门六：读图 trace。非 `high` 档字段**若**声称读图确认过，必须指名具体字段 + 具体图像文件，
 * 且那张图必须真的在资产里、真的解得开。
 *
 * 只验声称与实物是否对得上，不假装能验 agent 真看了图——后者没有纸面办法验，写一道
 * 「我读了」的自述门只会把纪律变成咒语。本门抓的是另一类：随手写个路径充数。
 *
 * 图像引用只认随资产进 git 的那一份（`screenshots/index.json` 的 `thumb` 一列所指）。
 * 指向不随迁的本地原图属于采集期内部字段，资产搬走后必然指空，所以路径必须相对资产根。
 */
export function gateImageEvidence(trace, assetDir) {
	const out = []
	if (!trace || !Array.isArray(trace.floors)) return out
	for (const floor of trace.floors) {
		for (const field of floor.fields ?? []) {
			if (field.imageConfirmed !== true) continue
			if (String(field.confidence ?? '').toLowerCase() === 'high') continue
			const where = { floor: floor.id ?? '<未命名楼层>', field: field.field ?? null }
			if (!field.field) {
				out.push(finding('image-evidence', { ...where, reason: '声称读图确认，但没指名是哪个字段：一条笼统的「看过图了」无法被复核' }))
				continue
			}
			if (!field.image) {
				out.push(finding('image-evidence', { ...where, reason: '声称读图确认，但没指名是哪张图' }))
				continue
			}
			const resolved = path.resolve(assetDir, field.image)
			if (!resolved.startsWith(path.resolve(assetDir) + path.sep)) {
				out.push(finding('image-evidence', { ...where, image: field.image, reason: '图像引用指到资产目录之外：资产搬走后这条证据必然指空' }))
				continue
			}
			try {
				const probe = probeImageFile(resolved)
				out.push(...verifyShipped(resolved, assetDir, where, field))
				if (!probe.width || !probe.height) {
					out.push(finding('image-evidence', { ...where, image: field.image, reason: '图像解得开但取不到宽高' }))
				}
			} catch (e) {
				if (!(e instanceof ImageProbeError)) throw e
				out.push(finding('image-evidence', { ...where, image: field.image, code: e.code, reason: `trace 指名的图${e.code === 'image-missing' ? '不存在' : '解不开'}：${e.message}` }))
			}
		}
	}
	return out
}

/**
 * 指名的图必须是资产的 `screenshots/index.json` 里 `thumb` 那一列所指的那一份，且**随资产
 * 进 git**。两道都要过，因为它们挡的是两种指错：
 *
 * - 查 index 的 `thumb`：挡「指了 `path` 那一列」——那是采集期本地原图，不随迁，搬走即指空；
 *   也挡「随手拿资产里任意一张图充数」。
 * - 比 `screenshots/.gitignore`：挡 index 与随迁政策自己打架的资产。逐条比资产自带的政策，
 *   比在本包写死一张「哪些后缀算随迁」的表要诚实——政策跟着资产走，换份资产也照样准。
 */
function verifyShipped(resolved, assetDir, where, field) {
	const shotsRoot = path.join(assetDir, 'screenshots')
	const relToAsset = path.relative(assetDir, resolved).split(path.sep).join('/')
	if (!relToAsset.startsWith('screenshots/')) {
		return [finding('image-evidence', { ...where, image: field.image, code: 'image-outside-screenshots', reason: '图像引用不在资产的 screenshots/ 下：读图证据只能指采集截图，指别处的图等于没有证据' })]
	}

	const indexFile = path.join(shotsRoot, 'index.json')
	let items
	try {
		items = JSON.parse(fs.readFileSync(indexFile, 'utf8')).items
	} catch {
		return [finding('image-evidence', { ...where, image: field.image, code: 'screenshots-index-missing', reason: '资产没有可读的 screenshots/index.json：这份资产没有采集运行，任何「读图确认过」的声称都指不出实物' })]
	}
	const thumbs = new Set((Array.isArray(items) ? items : []).map((it) => String(it?.thumb ?? '')).filter(Boolean))
	if (!thumbs.has(relToAsset)) {
		return [finding('image-evidence', { ...where, image: field.image, code: 'image-not-in-index', reason: '指名的图不在 screenshots/index.json 的 thumb 一列内：thumb 是下游唯一可用的图像引用，path 那一列是不随迁的采集期原图' })]
	}

	let policy
	try {
		policy = fs.readFileSync(path.join(shotsRoot, '.gitignore'), 'utf8')
	} catch {
		return [] // index 已确认它是 thumb；没有随迁政策文件可比就不编一个，缺件归资产校验器
	}
	const rel = path.relative(shotsRoot, resolved).split(path.sep).join('/')
	const verdict = isIgnored(policy, rel)

	if (verdict.undecidable) {
		return [
			finding('image-evidence', {
				...where,
				image: field.image,
				code: 'ship-policy-undecidable',
				reason: `本资产的 screenshots/.gitignore 里有本门看不懂的规则（\`${verdict.rule}\`），判不出这张图随不随迁。判不出就不放行——静默当作随迁，等于让一条断掉的证据链跟着资产搬走`,
			}),
		]
	}
	if (verdict.ignored) {
		return [finding('image-evidence', { ...where, image: field.image, code: 'image-not-shipped', reason: `指名的图被本资产的 screenshots/.gitignore 排除（规则 \`${verdict.rule}\`），不随资产进 git，搬走后指空` })]
	}
	return []
}

/**
 * 按 gitignore 的**后匹配者胜**语义判一个相对路径的去留。
 *
 * 不能只扫一遍非 `!` 规则就下结论：真实资产里有 `*` 打头再逐条反选的黑名单写法
 * （`raw/.gitignore` 就是），只看非否定规则会把「全部忽略、只放行几份」读成「全部放行」，
 * 而那正是**不安全的那一侧**——一条早已不随迁的证据会被判成随迁。
 *
 * 支持的规则形状写在下面每个分支里。**看不懂的规则不猜**：返回 `undecidable`，由调用方
 * 报成一条指向政策本身的 finding。门要么回答，要么说自己答不了，不许静默回答「没问题」。
 */
export function isIgnored(policyText, relPath) {
	let ignored = false
	let rule = null
	for (const line of policyText.split(/\r?\n/)) {
		const raw = line.trim()
		if (!raw || raw.startsWith('#')) continue
		const negated = raw.startsWith('!')
		const pattern = (negated ? raw.slice(1) : raw).trim()
		const m = matchIgnoreRule(pattern, relPath)
		if (m === 'undecidable') return { undecidable: true, rule: raw }
		if (m) {
			ignored = !negated
			rule = raw
		}
	}
	return { ignored, rule }
}

/** 命中返回 `true`；不命中返回 `false`；形状不认识返回 `'undecidable'`。 */
function matchIgnoreRule(pattern, relPath) {
	const clean = pattern.replace(/^\/+/, '')
	const dirOnly = clean.endsWith('/')
	const body = dirOnly ? clean.slice(0, -1) : clean
	const segments = relPath.split('/')

	if (body === '*' || body === '**') return !dirOnly // `*/` 只指目录，被判的是文件，不命中
	if (body === '') return false

	// `**/name`：任意层级下的该名字。
	if (body.startsWith('**/')) {
		const tail = body.slice(3)
		if (tail.includes('*')) return tail.startsWith('*.') ? matchSuffix(tail, segments.at(-1)) : 'undecidable'
		return dirOnly ? segments.slice(0, -1).includes(tail) : segments.includes(tail)
	}
	// `*.ext`：按后缀。gitignore 里 `*` 不跨 `/`，但对后缀规则而言只需看末段。
	if (body.startsWith('*.') && !body.slice(2).includes('*')) return matchSuffix(body, segments.at(-1))
	// 无通配的字面路径或名字。
	if (!body.includes('*') && !body.includes('?') && !body.includes('[')) {
		if (body.includes('/')) return relPath === body || relPath.startsWith(`${body}/`)
		return dirOnly ? segments.slice(0, -1).includes(body) : segments.includes(body)
	}
	return 'undecidable'
}

const matchSuffix = (pattern, name) => String(name).toLowerCase().endsWith(pattern.slice(1).toLowerCase())

function wrapList(findings) {
	return { status: findings.length ? 'blocked' : 'pass', findings }
}

function wrapImage(trace, assetDir, hasTrace) {
	if (!hasTrace) return { status: 'no-input', findings: [] }
	return wrapList(gateImageEvidence(trace, assetDir))
}

/**
 * 门十薄壳。`checkLayoutEnvelope` 自己就给 `no-input`（资产没有 `layout-envelope.json`），本函数
 * 一个判断都不加：加了就是在本包私造第二套开口条件，而那正是逐字同源要防的分叉。包络自
 * `R4-10` 起是生成侧准入必交件，本包不跑准入（资产合不合格归采集侧校验器），缺包络在本包由
 * 布局表 `layout-map.mjs` 退 1（`layout-envelope-missing`）——不是本门放水，是分权。
 *
 * **四个入参与生成侧 `gateLayoutEnvelope` 逐个相同**，`trace` 也在内（`R4-14`）：判据字节相同
 * 而喂进去的入参少一个，同一份合成型页就会在生成侧过门、在本包报 `synth-inherit-unreadable`
 * ——分家不需要改判据，漏传一个入参就够。`copied-layout-envelope-wiring.test.mjs` 锁着这四个键。
 * 本包只从 `trace` 取白名单里的 `unobservedBreakpoints`，一个自由文本字段都不读。
 */
const wrapLayout = (htmlFiles, declarations, assetDir, trace) => checkLayoutEnvelope({ htmlFiles, declarations, assetDir, trace })

function asRow(gate, result) {
	return { gate, status: result.status, findings: result.findings.length }
}

/** 十道门一起跑。gates[] 十行恒在；没输入的门写 no-input 而不是 findings: 0。 */
export function runAllGates({
	declarations,
	closedSet,
	tokens,
	designText = '',
	voiceText = '',
	htmlFiles = [],
	trace = null,
	assetDir,
	hasTrace = false,
}) {
	const unobserved = collectUnobserved(tokens)
	const voiceTerms = extractVoiceTerms(voiceText)
	const rows = {
		'color-literal': wrapList(gateColorLiteral(declarations)),
		'font-stack-literal': wrapList(gateFontStack(declarations, closedSet)),
		'var-not-in-closed-set': wrapList(gateVarInClosedSet(declarations, closedSet)),
		'primitive-leak': wrapList(gatePrimitiveLeak(declarations)),
		'unresolved-var': wrapList(gateUnresolvedVar(declarations)),
		'design-dont-section-missing': gateDesignDontSectionMissing(unobserved, designText),
		'primitive-dont-id': gatePrimitiveDontId(unobserved, closedSet, designText),
		'voice-forbidden-term': gateVoiceForbiddenTerm(voiceTerms, htmlFiles),
		'image-evidence': wrapImage(trace, assetDir, hasTrace),
		'layout-envelope': wrapLayout(htmlFiles, declarations, assetDir, trace),
	}
	const gates = GATE_ORDER.map((g) => asRow(g, rows[g]))
	const findings = sortFindings(GATE_ORDER.flatMap((g) => rows[g].findings))
	return { gates, findings }
}

export { COLOR_EXEMPT }
