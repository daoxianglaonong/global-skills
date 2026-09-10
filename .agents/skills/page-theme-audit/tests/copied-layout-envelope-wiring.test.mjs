/**
 * 包络门**接线**同源的对照锁（`R4-14`）。`copied-helpers.test.mjs` 锁的是判据字节与包络夹具
 * 字节，这一份锁的是**入参**。
 *
 * 立此锁的事故就在眼前：`R4-08` 给判据加了可选 `trace` 入参，生成侧 `gates.mjs` 传了、本包
 * `gates.mjs` 没传，于是同一份合成型页在生成侧过门、在本包报 `synth-inherit-unreadable`。判据
 * SHA256 逐字节相同，夹具逐字节相同，三层字节锁**全绿**——分家一次都不需要碰判据，漏传一个
 * 入参就够。
 *
 * 两层都得有：
 * 1. **静态**：两侧调 `checkLayoutEnvelope` 时那个对象字面量的键集合必须相同，且必须是那四个。
 *    下一个人再少传一个入参，这一条当场红。它挡不住「键在值没了」（`trace: null`）。
 * 2. **行为**：同一份资产 / 产物 / trace，各走**两侧自己的公开入口**（`lintFloor` 与
 *    `lintArtifact`，后者含本包那道 trace 白名单），`layout-envelope` 这一门的 findings 逐字
 *    相同，且每条输入的 code 是钉死的。白名单若把 `unobservedBreakpoints` 剥掉、或哪一侧把
 *    `trace` 传成 `null`，只有跑起来才看得见。
 *
 * 只有静态层：白名单一剥就分家而静态层全绿。只有行为层：两侧碰巧在这几条输入上一致，第五条
 * 输入就分。两层各挡一半。
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { lintArtifact } from '../scripts/lint-artifact.mjs'
import { AUDIT_LIB, GENERATE_LIB, copyFixtureAsset, goodTrace, kindTrace, writeLayoutEnvelope } from './helpers.mjs'

const GENERATE_ROOT = path.resolve(GENERATE_LIB, '..', '..')
const lintFloor = (await import(pathToFileURL(path.join(GENERATE_ROOT, 'scripts', 'lint-floor.mjs')).href)).lintFloor

/**
 * 产物取**生成侧**那份夹具，两侧喂同一批字节。
 *
 * 不用本包的 `artifact-good.css`：它里面有 `gap: 24px` 这类长度字面量，生成侧门十一
 * `type-literal`（本包没有这道门）会挂三条，于是「两侧同样退 1」那条断言恒真而与包络无关，
 * 锁就废了。层根解析与包络门吃的东西两份夹具没有差别。
 */
const readFixture = (name) => fs.readFileSync(path.join(GENERATE_ROOT, 'tests', 'fixtures', name), 'utf8')
const goodHtml = () => readFixture('floor-good.html')
const goodCss = () => readFixture('floor-good.css')

const SYNTH = 'synth:pricing.table-3'
const SOURCE = 'feature.grid-3-cards'
const BREAKPOINTS = ['pc', 'tablet', 'mobile']

/* ── 第一层：入参键集合 ────────────────────────────────────────────────────── */

/** 抠出 `checkLayoutEnvelope({ … })` 那个对象字面量的顶层键。嵌套里的键与逗号不算。 */
function envelopeCallKeys(file) {
	const src = fs.readFileSync(file, 'utf8')
	const at = src.indexOf('checkLayoutEnvelope({')
	assert.notEqual(at, -1, `${file} 里找不到 checkLayoutEnvelope 的调用点`)
	const open = src.indexOf('{', at)
	let depth = 0
	let end = -1
	for (let i = open; i < src.length; i++) {
		const c = src[i]
		if (c === '{' || c === '[' || c === '(') depth += 1
		else if (c === '}' || c === ']' || c === ')') {
			depth -= 1
			if (depth === 0) {
				end = i
				break
			}
		}
	}
	assert.ok(end > 0, `${file} 里 checkLayoutEnvelope 的入参括号不配对`)

	const keys = []
	let part = ''
	depth = 0
	for (let i = open + 1; i < end; i++) {
		const c = src[i]
		if (c === '{' || c === '[' || c === '(') depth += 1
		else if (c === '}' || c === ']' || c === ')') depth -= 1
		if (c === ',' && depth === 0) {
			keys.push(part)
			part = ''
		} else part += c
	}
	keys.push(part)
	return keys
		.map((p) => /^\s*([A-Za-z_$][\w$]*)/.exec(p)?.[1])
		.filter(Boolean)
		.sort()
}

test('两侧喂给包络门的入参键集合相同，且 trace 在内', () => {
	// 恰好这四个。`R4-15` 的产物粒度从**已有的 `trace`** 里读 `artifact.kind`，不新增第五个入参：
	// 多一个顶层键就多一处两侧可以漏传的地方，而漏传不会有任何一侧报错。
	const expected = ['assetDir', 'declarations', 'htmlFiles', 'trace']
	const ours = envelopeCallKeys(path.join(AUDIT_LIB, 'gates.mjs'))
	const theirs = envelopeCallKeys(path.join(GENERATE_LIB, 'gates.mjs'))
	assert.deepEqual(ours, theirs, '两侧判据字节相同也没用：入参不同就是两套门')
	assert.deepEqual(ours, expected, `包络门的入参是这四个；少一个就有一类产物在两侧判定不同（${expected.join(' / ')}）`)
})

/* ── 第二层：同一份输入走两侧各自的公开入口 ──────────────────────────────── */

const synthHtml = () => goodHtml().replace(`data-pattern="${SOURCE}"`, `data-pattern="${SYNTH}"`)

const inheritAllFrom = (pattern) => BREAKPOINTS.map((breakpoint) => ({ breakpoint, inheritFrom: { pattern, breakpoint } }))

function synthTrace(unobservedBreakpoints = inheritAllFrom(SOURCE)) {
	const trace = structuredClone(goodTrace())
	trace.floors = [
		{
			id: SYNTH,
			pattern: null,
			skeleton: null,
			fields: [{ field: 'variant.columns', value: 3, confidence: 'medium', imageConfirmed: false }],
			unobservedBreakpoints,
		},
	]
	return trace
}

const NEGATIVE_MARGIN = '\n.pt-feature-grid {\n\tmargin-top: calc(-1 * var(--dimension-spacing-2));\n}\n'

/** 两个层根的楼层片段。空壳不带声明，只惊动认层根那一步，不惊动语法那几道门。 */
const MULTI_ROOT_FRAGMENT = '<section class="pt-feature-grid" data-pattern="feature.grid-3-cards"></section>\n<section class="pt-cta" data-pattern="cta.centered-band"></section>\n'

/** 只取包络那一门的 findings：其余十一 / 九道门两侧本就不是同一套，不在本锁射程内。 */
const layoutFindings = (findings) => findings.filter((f) => f.gate === 'layout-envelope')

function cases(t) {
	const asset = () => {
		const dir = copyFixtureAsset(t)
		writeLayoutEnvelope(dir)
		return dir
	}
	return [
		{ label: '合格 synth（三档继承源齐）', assetDir: asset(), html: synthHtml(), css: goodCss(), trace: synthTrace(), codes: [], verdict: 'pass' },
		{ label: '真实型合格页（对照组）', assetDir: asset(), html: goodHtml(), css: goodCss(), trace: goodTrace(), codes: [], verdict: 'pass' },
		{
			label: 'synth 缺继承源',
			assetDir: asset(),
			html: synthHtml(),
			css: goodCss(),
			trace: synthTrace([{ breakpoint: 'pc' }]),
			codes: ['synth-inherit-unreadable'],
			verdict: 'blocked',
		},
		{
			label: 'synth 继承源不在 floor-index 里',
			assetDir: asset(),
			html: synthHtml(),
			css: goodCss(),
			trace: synthTrace([{ breakpoint: 'pc', inheritFrom: { pattern: 'pricing.table-3', breakpoint: 'pc' } }]),
			codes: ['synth-inherit-unreadable'],
			verdict: 'blocked',
		},
		{ label: 'synth 但整份 trace 缺席', assetDir: asset(), html: synthHtml(), css: goodCss(), trace: null, codes: ['synth-inherit-unreadable'], verdict: 'blocked' },
		{
			// `R4-15` 票面代价段点名要加的一案：多层片段声明 `floor`，两侧都必须闭嘴。判据靠层根数猜
			// 粒度时，这两个层根会被当成整页，首末两维各误伤一条 `page-shell-ends-missing`。
			label: '声明 floor 的多层片段',
			assetDir: asset(),
			html: MULTI_ROOT_FRAGMENT,
			css: goodCss(),
			trace: kindTrace('floor'),
			codes: [],
			verdict: 'pass',
		},
		{
			// 同一份多层片段，只把声明拿掉。两侧都必须报判不出粒度，不许有一侧退回按层根数猜。
			label: '粒度声明缺席',
			assetDir: asset(),
			html: MULTI_ROOT_FRAGMENT,
			css: goodCss(),
			trace: kindTrace(null),
			codes: ['artifact-kind-missing'],
			verdict: 'blocked',
		},
		{
			label: 'synth 越包络阻断层（负顶外边距）',
			assetDir: asset(),
			html: synthHtml(),
			css: goodCss() + NEGATIVE_MARGIN,
			trace: synthTrace(),
			codes: ['merge-spacing-with-prev'],
			verdict: 'blocked',
		},
	]
}

test('同一份合成型页两侧判定逐字相同，且 code 钉死', (t) => {
	let blocked = 0
	let total = 0
	for (const c of cases(t)) {
		const ourReport = lintArtifact({
			assetDir: c.assetDir,
			files: [
				{ file: 'floor.html', text: c.html },
				{ file: 'floor.css', text: c.css },
			],
			trace: c.trace,
			hasTrace: c.trace !== null,
		})
		const theirReport = lintFloor({
			assetDir: c.assetDir,
			html: c.html,
			htmlFile: 'floor.html',
			css: [{ file: 'floor.css', text: c.css }],
			trace: c.trace,
		})
		const mine = layoutFindings(ourReport.findings)
		const theirs = layoutFindings(theirReport.findings)
		assert.equal(JSON.stringify(mine), JSON.stringify(theirs), `${c.label}：两侧接线已经分家（audit=${mine.length} generate=${theirs.length}）`)
		// 退出码这一层也要对上：findings 相同而整份产物一侧退 0 一侧退 1，票面那句「两侧同样退 1」仍然是假的。
		assert.equal(ourReport.verdict, c.verdict, `${c.label}：audit 侧整份产物的 verdict 不是 ${c.verdict}`)
		assert.equal(theirReport.verdict, c.verdict, `${c.label}：generate 侧整份产物的 verdict 不是 ${c.verdict}`)
		assert.deepEqual(
			mine.map((f) => f.code),
			c.codes,
			`${c.label}：两侧一致但判错了——两边同时漏传 trace 也会「一致」`,
		)
		if (mine.length) blocked += 1
		total += mine.length
	}
	// 4 → 5 是 `R4-15` 加的「粒度声明缺席」。同趟加的「声明 floor 的多层片段」是第三条 pass，
	// 它与上一案 HTML 逐字节相同、只差一个声明——两条并排才证明粒度真读了 `artifact.kind`。
	assert.equal(blocked, 5, '八条输入里该有五条阻断；只剩「两边都返回空数组」的对照等于没上锁')
	assert.ok(total >= 5)
})

test('白名单只留两处机读结构（unobservedBreakpoints 与 artifact.kind），自由文本一个字段都不带', (t) => {
	const trace = synthTrace()
	trace.floors[0].unobservedBreakpoints[0].reason = 'PROSE-LEAK-MARKER：这一档我照着首页那种感觉写的'
	trace.floors[0].unobservedBreakpoints[0].inheritFrom.note = 'PROSE-LEAK-MARKER'
	trace.artifact.note = 'PROSE-LEAK-MARKER：这一层是照着首页那种感觉排的'
	const dir = copyFixtureAsset(t)
	writeLayoutEnvelope(dir)
	const report = lintArtifact({
		assetDir: dir,
		files: [
			{ file: 'floor.html', text: synthHtml() },
			{ file: 'floor.css', text: goodCss() },
		],
		trace,
		hasTrace: true,
	})
	assert.deepEqual(layoutFindings(report.findings), [], '继承源合格，门不该开口')
	const floor = report.trace.floors[0]
	assert.deepEqual(Object.keys(floor).sort(), ['fields', 'id', 'unobservedBreakpoints'])
	assert.deepEqual(Object.keys(floor.unobservedBreakpoints[0]).sort(), ['breakpoint', 'inheritFrom'])
	assert.deepEqual(Object.keys(floor.unobservedBreakpoints[0].inheritFrom).sort(), ['breakpoint', 'pattern'])
	// `artifact` 里只剩闭集枚举那一个键：html / css 文件名与任何塞进去的散文都不进读面。
	assert.deepEqual(Object.keys(report.trace.artifact), ['kind'])
	assert.equal(report.trace.artifact.kind, 'floor')
	assert.ok(!JSON.stringify(report).includes('PROSE-LEAK-MARKER'), '白名单外的字段进了读面')
})
