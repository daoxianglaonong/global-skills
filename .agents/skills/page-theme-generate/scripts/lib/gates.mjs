/**
 * 生成侧自检门。十二道，各自独立成一个函数，各自能被单独喂一份会挂的输入。
 *
 * 拆成十个而不是一个大 `lint()`，是因为「双闸门必须配两条独立失败用例」这条要求本身
 * 就在说：合并计数的门验不出「换个绕法就能溜过去」。既然计数要分列，判据也就该分列。
 *
 * | 门 | 判什么 | 独立会挂的输入 |
 * | --- | --- | --- |
 * | `color-literal` | 产物里写死了色值（含复合值内嵌） | `border: 1px solid #fff` |
 * | `font-stack-literal` | 字体族不在资产已声明字体栈内 | `font-family: "Comic Sans MS"` |
 * | `var-not-in-closed-set` | 引用了本资产闭集里没有的变量 | `var(--color-brand-primary)` |
 * | `primitive-leak` | 颜色跳过 semantic 直引 primitive | `var(--color-neutral-1)` |
 * | `unresolved-var` | 变量名反解不出 token 路径 | `var(--foo-bar-baz)` |
 * | `image-evidence` | trace 声称读图确认，但图指不出或解不开 | 指名一张资产里不存在的图 |
 * | `sequence-approval` | 候选序列没经用户拍板就出页，或把候选写成已采页 | `sequence.source: "skeleton"` 却没有 `approvedBy` |
 * | `paint-consistency` | 楼层底色与按本次序列重算的结果不一致，或对不上是哪一层 | cta 打头却照抄 `ownSurface: muted` |
 * | `variant-lock` | 体检判疑似多套设计语言却没点名 variant、点了个词表外的名字、没点名或点错来源 `sourceId`、页壳条目跨了 variant | 体检 `mixed-suspected` 而 trace 的 `targetVariant` 留空 |
 * | `responsive-inheritance` | 产物用到某型缺实测几何的档，trace 没声明这一档无实测、数值继承自哪一档 | 该型 tablet 档 `grid.observed: false`，trace 不写 `unobservedBreakpoints` |
 * | `type-literal` | 圆角 / 间距 / 描边宽写死了 px 数值 | `border-radius: 12px` |
 * | `layout-envelope` | 产物用的型或排的序踩出资产 `layout-envelope.json` 的**阻断层** | cta 打头的页级序列 |
 *
 * `paint-consistency` 抓不住什么：只认 `var(--color-surface-*)` 写法；比对仍只认类选择器 /
 * `[data-pattern]`；`data-pattern` 只保证对得上层不保证 DOM 形状；三处停手吞噬范围不同
 * （未知型只停该步及之后，同型次数只停该型，重算失败整条停）。同一层根多个底色候选报
 * `surface-ambiguous`。**html 未传写 `no-input`，不与「层根缺属性」混**；空串是空文档。
 * 完整射程边界在 `paint-check.mjs` 模块头；解析层根 / 反查底色 / 重算拆在
 * `paint-floors.mjs` / `paint-surface.mjs` / `paint-recompute.mjs`。
 *
 * `primitive-leak` 与 `unresolved-var` 是「双闸门」。它们**有意**在一类输入上重叠（顶层是
 * `color` 却既非色相族也不在角色词表内，如 `--color-brand-primary`，两门同时亮），但各自都有
 * 对方判不到的射程：只查 primitive-leak 时，把变量改名成 `--foo-bar-baz` 就溜过去了；只查
 * unresolved-var 时，规规矩矩引用 `--color-neutral-1` 也溜过去了。两门必须同时关上才算关上。
 */

import { isColorPrimitiveLeak, isUnresolvedVar, classifyCssVar } from '../vendor/page-theme-core/index.mjs'
import { varReferences } from './closed-set.mjs'
import { probeImageFile, ImageProbeError } from './image-probe.mjs'
import { checkLayoutEnvelope } from './layout-envelope-gate.mjs'
import { readOutlineSources } from './outline.mjs'
import { checkPaintConsistency } from './paint-check.mjs'
import { parseFloorRoots } from './paint-floors.mjs'
import { checkResponsiveInheritance } from './responsive-inherit.mjs'
import { entryTypeValue, typeLiteralsOf } from './type-rows.mjs'
import { MIXED_COHESION, VariantSourceError, hostsOfVariant, readVariantSources, resolveMountPattern } from './variant-lock.mjs'
import fs from 'node:fs'
import path from 'node:path'

/**
 * 色值 0 容忍的豁免清单，**只收抽取器真能抽出来的东西**。
 *
 * 这两个是货真价实的颜色（所以在射程内），但它们表达的是「跟着继承走」和「不上色」，
 * 没有任何 token 能替代；判成违例会逼生成侧去编一个假 token 来满足门。
 * `inherit` / `initial` / `none` / `0` 之类不是颜色，抽取器根本产不出它们——写进豁免
 * 清单只会让人以为它们被判过又被放了，那是一句永远不执行的安慰。
 */
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

/**
 * 门七：候选序列没经用户拍板，不许出页。
 *
 * 前六道判的都是产物自身的字面事实，这一道判的是产物的**出处声明**。理由是「跳过大纲直接
 * 产页」在纸面上看不出来：变量全查了表、颜色一处不越界、前六道全绿，唯独那条楼层序列是谁
 * 都没看过的。
 *
 * 候选与权威的分界不是本包发明的：楼层排列是语义判断，脚本不准给 `high` 档。已采页的实测
 * `sequence` 是观测记录，放行；骨架选型与共现回退都是归纳物，必须拿到拍板。
 *
 * 来源用**白名单**：打错一个字（`skeletons`）就整道门静默失效，是这类「按声明判」的门最容易
 * 留的洞。而**权威档要核对，不能只凭声明**：`page-sequence` 一旦免检，「把候选序列写成
 * page-sequence」就是一句免拍板咒语，比打错字更省事。所以那一档要指名哪一页，并与该页的实测
 * 记录逐位对上。
 *
 * 射程说明白：`sequence` 整块不写，本门不开口——单层与组件产物本来就没有序列这件事。
 * 「页级产物必须带 sequence」是拼页那一票的形状要求，不在本门。
 */
const AUTHORITATIVE_SEQUENCE_SOURCES = new Set(['page-sequence'])
const CANDIDATE_SEQUENCE_SOURCES = new Set(['skeleton', 'cooccurrence'])

export function gateSequenceApproval(trace, assetDir = null) {
	const seq = trace?.sequence
	if (!seq) return [] // 单个楼层 / 组件产物没有「序列」这件事，本门不开口
	const source = String(seq.source ?? '')
	if (AUTHORITATIVE_SEQUENCE_SOURCES.has(source)) return verifyPageSequence(seq, assetDir)
	if (!CANDIDATE_SEQUENCE_SOURCES.has(source)) {
		return [
			finding('sequence-approval', {
				code: 'source-unknown',
				source: seq.source ?? null,
				reason: `序列来源 \`${seq.source}\` 不在本门认识的取值内（page-sequence / skeleton / cooccurrence）：判不出档位就判不出这条序列要不要拍板，不静默放行`,
			}),
		]
	}
	const steps = stepPatterns(seq.steps)
	if (seq.approvedBy !== 'user') {
		return [
			finding('sequence-approval', {
				code: 'approval-missing',
				source,
				reason: `序列来源是 ${source}，那是候选不是实测记录：跳过大纲直接产页不放行。先出三列大纲让用户拍板，再把 approvedBy: "user" 与被拍板的 steps 写进 trace`,
			}),
		]
	}
	const approved = stepPatterns(seq.approvedSteps)
	if (approved.length !== steps.length || approved.some((p, i) => p !== steps[i])) {
		return [
			finding('sequence-approval', {
				code: 'approval-mismatch',
				source,
				reason: `声称拍板过，但被拍板的与交出来的不是同一条序列（拍板 ${approved.length} 步、产物 ${steps.length} 步）：拍板管的是这一条，少一层、多一层、换个型，都是用户没看过的那一页`,
			}),
		]
	}
	return []
}

const stepPatterns = (steps) => (Array.isArray(steps) ? steps : []).map((s) => String(s?.pattern ?? s ?? ''))

/**
 * 声称「这条序列取自某页的实测记录」时，核对它真是那一页。
 *
 * 不核对的话，权威档就是免拍板的后门：写 `source: "page-sequence"` 比写对 `approvedBy` 省事，
 * 而它连打错字都不算——门会当成观测记录放行。核对分两级：页名缺了当场红（缺了就无从核对），
 * 有资产可读时再逐位比 taxonomy。没有资产可读时只验前者，并把这件事写在这里——`lintFloor`
 * 一定带资产，所以真实通路上两级都在。
 */
function verifyPageSequence(seq, assetDir) {
	if (!seq.page) {
		return [finding('sequence-approval', { code: 'page-unnamed', source: 'page-sequence', reason: '声称序列取自已采页，但没指名是哪一页：权威档凭的是「这条序列真是某页的实测记录」，页名缺了就无从核对，等于用一句声明免掉了拍板' })]
	}
	if (!assetDir) return []

	let sources
	try {
		sources = readOutlineSources(assetDir)
	} catch (e) {
		return [finding('sequence-approval', { code: 'page-sequence-unverifiable', source: 'page-sequence', reason: `声称取自已采页 \`${seq.page}\`，但读不出资产的页记录去核对：${e.message}` })]
	}
	const page = sources.pages.find((p) => p.id === seq.page)
	if (!page) {
		return [finding('sequence-approval', { code: 'page-not-in-asset', source: 'page-sequence', reason: `资产的 patterns/index.yaml 里没有页 \`${seq.page}\`：指一个不存在的页，这条序列就没有实测记录可依，按候选处置——先出大纲拍板` })]
	}
	const actual = (Array.isArray(seq.steps) ? seq.steps : []).map((s) => s?.taxonomy ?? sources.byPattern.get(s?.pattern)?.taxonomy ?? null)
	if (actual.length !== page.taxonomies.length || actual.some((t, i) => t !== page.taxonomies[i])) {
		return [
			finding('sequence-approval', {
				code: 'page-sequence-mismatch',
				source: 'page-sequence',
				reason: `与页 \`${seq.page}\` 的实测序列对不上（该页 ${page.taxonomies.length} 层、产物 ${actual.length} 层）：改过的序列不再是那一页的观测记录，而是一条候选——加一层、删一层、换顺序都得走拍板`,
			}),
		]
	}
	return []
}

/**
 * 门八薄壳：判据主体在 `paint-check.mjs` / `paint-floors.mjs` / `paint-surface.mjs` /
 * `paint-recompute.mjs`。
 *
 * 抓不住什么见 `paint-check.mjs` 模块头。本函数只转发，好让 `runAllGates` 多吃一个 `html` 而不去
 * 改前六道门的函数体（那几份被 audit 逐字锁着）。`html` 不得缺省成空串。
 */
export function gatePaintConsistency({ html, declarations = [], closedSet = null, trace = null, assetDir = null } = {}) {
	return checkPaintConsistency({ html, declarations, closedSet, trace, assetDir })
}

/**
 * 门九薄壳：判据源在 `variant-lock.mjs`。
 *
 * 五条 code，各判一件事：`variant-undeclared`（体检判疑似多套设计语言却没点名）、
 * `variant-unknown`（点了一个资产词表里没有的名字）、`source-id-undeclared`（资产 coverage 记着
 * 来源却没点名照着哪一条做）、`source-id-unknown`（点了一个来源词表里没有的号）、
 * `chrome-variant-mismatch`（产物里的页壳条目不是所声明那套的）。第六条
 * `variant-source-unreadable` 是判据源读不开——判不出就不放行，不静默当作全绿。
 *
 * `trace` 缺席时整门不开口：没有 trace 就没有「声明」这件事可判。这与
 * `sequence-approval` / `image-evidence` 是同一个射程限制（本门挡的是「过门」，不是「动笔」），
 * 不另开一条后门，也不假装它不存在。
 */
export function gateVariantLock({ trace = null, assetDir = null, html = '' } = {}) {
	if (!trace || !assetDir) return []
	let sources
	try {
		sources = readVariantSources(assetDir)
	} catch (e) {
		if (!(e instanceof VariantSourceError)) throw e
		return [finding('variant-lock', { code: 'variant-source-unreadable', reason: `读不出判定 variant 要用的那份资产文件：${e.message}。判不出就不放行——静默当作全绿，等于这道门只在资产完好时存在` })]
	}

	const declared = String(trace.targetVariant ?? '').trim()
	const out = []
	if (!declared && sources.cohesionVerdict === MIXED_COHESION) {
		out.push(
			finding('variant-lock', {
				code: 'variant-undeclared',
				reason: `资产体检判 \`${MIXED_COHESION}\`（疑似含多套设计语言），此时 trace 的 targetVariant 不得留空：缺省值在这里是任意的，取 default 等于替用户悄悄选了其中一套。词表见资产 README 的 coverage.pages[].variant`,
			}),
		)
	}
	if (declared && !sources.vocabulary.has(declared)) {
		const vocab = [...sources.vocabulary]
		out.push(
			finding('variant-lock', {
				code: 'variant-unknown',
				variant: declared,
				reason: `\`${declared}\` 不在本资产的 variant 词表内（${vocab.length ? vocab.map((v) => `\`${v}\``).join(' / ') : '本资产一个 variant 都没有，只有 default'}）：variant 由采集侧按子域算出，不是可以现编的标签。真要分家，出路是按 coverage.cohesion.suggestedSplit 拆资产`,
			}),
		)
	}

	// `sourceId` 是「本次照着哪条来源 URL 做的」。它与 targetVariant 是同一件事的两半：variant 说
	// 用哪套页壳，sourceId 说这套是从哪一页身上看来的，所以判据也挂同一道门、同一份 coverage。
	// 来源词表为空时整段不开口（见 `variant-lock.mjs` 模块头）。code 前缀是 `source-id-` 而不是
	// `source-`：`sequence-approval` 已经占了 `source-unknown`（那条判 `sequence.source` 三取一），
	// 本门自己的 `variant-source-unreadable` 里 source 又指判据源——同名两义会让按 code 过滤的报告读错门。
	const declaredSource = String(trace.sourceId ?? '').trim()
	if (sources.sourceIds.size) {
		const known = [...sources.sourceIds]
		if (!declaredSource) {
			out.push(
				finding('variant-lock', {
					code: 'source-id-undeclared',
					reason: `trace 没写 sourceId，而本资产的 coverage.pages[] 记着 ${known.length} 条来源（${known.map((s) => `\`${s}\``).join(' / ')}）：不点名照着哪一页做，「这页像不像那站」就无从复核——多页资产里各页本来就不一样`,
				}),
			)
		} else if (!sources.sourceIds.has(declaredSource)) {
			out.push(
				finding('variant-lock', {
					code: 'source-id-unknown',
					sourceId: declaredSource,
					reason: `\`${declaredSource}\` 不在本资产的来源词表内（${known.map((s) => `\`${s}\``).join(' / ')}）：sourceId 由采集侧按 URL 列表顺序编号，不是可以现编的标签。指不到的号等于没指`,
				}),
			)
		}
	}

	const used = new Set(parseFloorRoots(html ?? '').map((r) => r.pattern))
	const hosts = hostsOfVariant(sources.coverage, declared)
	for (const mount of sources.mounts) {
		const expected = resolveMountPattern(mount, hosts)
		for (const candidate of mount.candidates) {
			if (candidate === expected || !used.has(candidate)) continue
			out.push(
				finding('variant-lock', {
					code: 'chrome-variant-mismatch',
					mount: mount.mount,
					pattern: candidate,
					expected,
					variant: declared,
					reason: `产物在挂载点 \`${mount.mount}\` 上用了 \`${candidate}\`，而声明的 variant（${declared || 'default'}）在这个挂载点上解析出来的是 \`${expected}\`：一页之内不得混用多个 variant 的页壳条目——混出来的页壳在原站任何一个来源里都不存在`,
				}),
			)
		}
	}
	return out
}

/**
 * 门十薄壳：判据源在 `responsive-inherit.mjs`。
 *
 * 资产里 `responsive.<档>.grid.observed: false` 的档，产物用到该型时 trace 必须逐档声明
 * 「这一档无实测 + 数值继承自哪一档（或 `null`：不继承，本档没出任何断点相关的值）」。
 * 九条 code 见 `references/generate.md` §4.2。**本门不判继承得对不对**——那是语义判断，
 * 机器不接；它只判声明了没有、来源档存不存在、声明与产物对不对得上、产物里的 `@media`
 * 数值在不在资产的断点闭集里。
 *
 * `html` 与门八同一份，同样不得缺省成 `''`：漏传写 `no-input`。本门另吃 `css` 原文——
 * `declarations` 递归进 `@media` 时把条件丢掉了，断点数值只在原文里。
 */
export function gateResponsiveInheritance({ html, css = [], trace = null, assetDir = null } = {}) {
	return checkResponsiveInheritance({ html, css, trace, assetDir })
}

/**
 * 门十一：圆角 / 间距 / 描边宽写死了 px 数值。
 *
 * 这道门是补上来的。`SKILL.md` 的产出形状一直写着「色值 / 字体 / 间距都是 `var()`」，优化模式
 * 一直有 `type-accept-fulfillment` / `type-literal-backing` 管这三类，只有创造模式漏着——于是
 * `border-radius: 12px` / `gap: 24px` 过全部门，合格夹具本身就那么写。同一个包对同一件事两套
 * 标准，那本身就是 bug。
 *
 * 判据借 `type-rows.mjs` 的 `typeLiteralsOf` 与它的 prop 白名单，**不另写一份抽取器**：那份是
 * 优化模式出表与残余背书共用的那一份，另写一份等于把「表里看得见的字面量」与「门拦得住的
 * 字面量」重新分成两批，而这道门存在的理由正是不要两套标准。本门只取 radius / space / stroke
 * 三个类目（票面射程），`font-stack` 归门二，`font-size` 今天没人管。
 *
 * **「名字在闭集内」那一半不在本门**：门三 `var-not-in-closed-set` 扫每条声明里的每个 `var()`，
 * 这几个 prop 一个不漏。两半合起来才是「必须是 `var()` 且名字在闭集内」，本门不重复报一条。
 *
 * 抓不住什么——与非色表的 `summary.outOfScopeValues` 同一条口径，不是漏：
 * - `0` 与关键字（`auto` / `solid`）不是主题量，资产不会为它出 token。
 * - 非 px 长度（`1.5rem`）与函数值（`calc()` / `clamp()`）不进射程，`padding: 1.5rem` 本门放行。
 * - **复合简写不切开**：`border: 1px solid var(--color-border-default)` 里的 `1px` 不判。切开它会
 *   让 occurrence 的 `value` 不再是声明里那一串，与非色表反查两侧当场分歧。
 * - 轨道尺寸（`grid-template-columns` / `width` / `max-width`）是布局量不是主题量，压根不在白名单。
 *
 * 另一条不是盲区而是前提：资产该类目一条 token 都没有时，本门等于禁掉那个 prop。间距在闭集里
 * 常常只有 primitive、零角色，所以那不是假设——报错文案因此要点名「该类目无可引」，而不是
 * 让人以为自己没找对名字。
 */
const TYPE_LITERAL_KINDS = new Set(['radius', 'space', 'stroke'])

export function gateTypeLiteral(declarations, closedSet) {
	const out = []
	for (const d of declarations) {
		if (d.widget || isCustomPropertyDeclaration(d.prop)) continue
		const { kind, items } = typeLiteralsOf(d.prop, d.value)
		if (!TYPE_LITERAL_KINDS.has(kind)) continue
		for (const item of items) {
			out.push(
				finding('type-literal', {
					file: d.file,
					selector: d.selector,
					prop: d.prop,
					kind,
					value: item.literal,
					reason: `${d.prop} 写死了 ${item.literal}：圆角 / 间距 / 描边宽一律 var() 引用闭集，${closedSetTypeHint(closedSet, kind, item.normalizedValue)}`,
				}),
			)
		}
	}
	return out
}

/**
 * 报错要点名该引哪个名字。三句话，分的是三种处境：同值有 token（照抄那个名字）、该类目有
 * token 但没这个值（换一个值或另议）、该类目空（门等于禁掉这个 prop，别再找名字了）。
 * 名字按闭集里的原序给，两次跑同一份资产得同一句话。
 */
function closedSetTypeHint(closedSet, kind, normalizedValue) {
	const sameKind = []
	const sameValue = []
	for (const entry of closedSet?.entries ?? []) {
		const got = entryTypeValue(entry)
		if (got?.kind !== kind) continue
		sameKind.push(`\`${entry.cssVar}\`(${got.value})`)
		if (got.value === normalizedValue) sameValue.push(`\`${entry.cssVar}\``)
	}
	if (sameValue.length) return `本资产 ${kind} 类目同值可引 ${sameValue.join(' / ')}`
	if (!sameKind.length) return `而本资产 ${kind} 类目一条 token 都没有：改写成复合简写或不写这一处，不许现编一个名字`
	return `而本资产 ${kind} 类目没有 ${normalizedValue}，可引的是 ${sameKind.join(' / ')}`
}

/**
 * 门十二薄壳：判据源在 `layout-envelope-gate.mjs`，**那一份与 audit 逐字节相同**。
 *
 * 把阻断层落成门只在生成侧跑等于自由构图自产自检，所以判据整份拷进 audit，两侧同跑。薄壳留在
 * 这里的理由与门八同：`gates.mjs` 是 audit 逐字抠源文本的那份文件，越薄越不容易撞上那条锁。
 *
 * `html` 缺省（`undefined` / `null`）时整门不开口：没有产物就没有层根，也就没有序列可判；
 * 与门八 / 门十的 `no-input` 同一条口径，只是本门不为它单开一个 code。
 */
export function gateLayoutEnvelope({ htmlFile = null, html, declarations = [], assetDir = null, trace = null } = {}) {
	if (html === undefined || html === null) return []
	return checkLayoutEnvelope({ htmlFiles: [{ file: htmlFile, text: html }], declarations, assetDir, trace }).findings
}

/** 十二道门一起跑。返回扁平的 findings 数组，空数组即全绿。
 *  `html` 不得缺省成 `''`：空串兼作「未传」与「空文档」时，漏传会被门八 / 门十读成别的事。
 *  `css` 是产物 CSS 原文（`[{ file, text }]`），只有门十用：`@media` 的条件不在 `declarations` 里。
 *  `htmlFile` 只进门十二的 finding 里当出处标签，不参与任何判据。
 */
export function runAllGates({ declarations, closedSet, trace = null, assetDir = null, html, css = [], htmlFile = null }) {
	const findings = [
		...gateColorLiteral(declarations),
		...gateFontStack(declarations, closedSet),
		...gateVarInClosedSet(declarations, closedSet),
		...gatePrimitiveLeak(declarations),
		...gateUnresolvedVar(declarations),
		...gateSequenceApproval(trace, assetDir),
		...gatePaintConsistency({ html, declarations, closedSet, trace, assetDir }),
		...gateVariantLock({ trace, assetDir, html }),
		...gateResponsiveInheritance({ html, css, trace, assetDir }),
		...gateTypeLiteral(declarations, closedSet),
		...gateLayoutEnvelope({ htmlFile, html, declarations, assetDir, trace }),
	]
	if (assetDir) findings.push(...gateImageEvidence(trace, assetDir))
	return findings
}

export { COLOR_EXEMPT }
