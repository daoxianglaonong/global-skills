/**
 * prose-invariance：同一份产物 + 同一份资产 + 两份仅在白名单外字段上不同的 trace，
 * 两次 lint-artifact.json 序列化后字节相同。
 *
 * 这是本包核心主张（不读生成侧说辞）的唯一证据。
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { lintArtifact, serializeReport } from '../scripts/lint-artifact.mjs'
import { whitelistTrace } from '../scripts/lib/gates.mjs'
import { FIXTURE_ASSET, goodHtml, goodCss, goodTrace } from './helpers.mjs'

function runWithTrace(trace) {
	return lintArtifact({
		assetDir: FIXTURE_ASSET,
		files: [
			{ file: 'floor.html', text: goodHtml() },
			{ file: 'floor.css', text: goodCss() },
		],
		trace,
		hasTrace: true,
	})
}

test('同一产物配两份只在自由文本上不同的 trace，输出字节相同', () => {
	const base = goodTrace()
	const a = structuredClone(base)
	const b = structuredClone(base)

	a.floors[0].fields[0].note = '本资产无采集运行，按 pattern 声明值直取'
	a.floors[0].fields[0].rationale = '我认为完全合规'
	a.assumptions = ['随便写的假设']
	a.reason = '生成侧自述过了'
	a.sequence = { source: 'skeleton', steps: [{ pattern: 'hero.centered-pitch' }], notes: '该拍板了' }

	b.floors[0].fields[0].note = '完全另一套措辞：我其实没看图，但数字是对的'
	b.floors[0].fields[0].rationale = '换一套更长的理由，还带 emoji ✅'
	b.assumptions = ['另一条假设', '再加一条']
	b.reason = '不一样的自述'
	b.sequence = { source: 'cooccurrence', steps: [{ pattern: 'cta.centered-band' }], approvedBy: 'user' }

	const ra = runWithTrace(a)
	const rb = runWithTrace(b)
	const sa = serializeReport(ra)
	const sb = serializeReport(rb)

	assert.equal(sa, sb, '白名单外字段不得进入输出')
	assert.ok(!sa.includes('我认为完全合规'), '不得泄漏 notes / rationale')
	assert.ok(!sa.includes('该拍板了'), '不得泄漏 sequence')
	assert.ok(!sa.includes('emoji'), '不得泄漏自由文本')
})

test('白名单内字段不同则输出可以不同', () => {
	const a = goodTrace()
	const b = structuredClone(a)
	b.floors[0].fields[0].imageConfirmed = true
	b.floors[0].fields[0].image = 'screenshots/missing.jpg'
	b.floors[0].fields[0].confidence = 'medium'

	const sa = serializeReport(runWithTrace(a))
	const sb = serializeReport(runWithTrace(b))
	assert.notEqual(sa, sb, '白名单内的 imageConfirmed / image 必须进判据')
})

test('同一份输入连跑两次序列化字节相同，且不得塞时间戳键', () => {
	const r1 = runWithTrace(goodTrace())
	const r2 = runWithTrace(goodTrace())
	const s1 = serializeReport(r1)
	const s2 = serializeReport(r2)
	assert.equal(s1, s2, '同一份输入的两次输出必须字节相同：serializeReport 里塞 Date.now / Math.random 会在这里挂')
	assert.deepEqual(Object.keys(r1).sort(), ['declarationCount', 'findings', 'gates', 'styleSetId', 'trace', 'verdict'])
	assert.ok(!/generatedAt|"timestamp"|elapsed/i.test(s1), '输出不得含时间戳 / 耗时键')
})

/**
 * 核心主张的可执行证据：白名单外的键若被读进判据或报告，序列化字节必变。
 *
 * 旧用例只改 note / rationale / assumptions / reason / sequence——这些键门面不读、
 * 报告根也不收，所以把 whitelistTrace 改成恒等，那条照样绿。本条改用：
 * 1. 与报告根字段同名的键（verdict / findings / gates / styleSetId）
 * 2. 一个白名单外、JSON.stringify 必吐出的标记键
 *
 * 报告收录白名单读面 `trace`：白名单生效时它只有 floors；拿掉白名单，标记键会进
 * `trace`，两次输出字节不再相同。
 */
function poisonTrace(marker) {
	const t = goodTrace()
	t.verdict = 'blocked'
	t.findings = [{ gate: 'leaked', reason: marker }]
	t.styleSetId = marker
	t.declarationCount = 99999
	t.gates = [{ gate: 'leaked', status: 'blocked', findings: 1 }]
	t.prose = marker
	t.floors[0].fields[0].note = marker
	t.floors[0].fields[0].rationale = `理由 ${marker}`
	return t
}

test('白名单外的同名键与可序列化标记不得进入报告；读面只剩 floors', () => {
	const markA = 'WHITELIST-LEAK-MARKER-A'
	const markB = 'WHITELIST-LEAK-MARKER-B'
	const a = poisonTrace(markA)
	const b = poisonTrace(markB)

	assert.notEqual(JSON.stringify(a), JSON.stringify(b), '两份输入本身必须不同，否则本条验不出白名单')
	assert.ok(JSON.stringify(a).includes(markA))

	const ra = runWithTrace(a)
	const rb = runWithTrace(b)
	const sa = serializeReport(ra)
	const sb = serializeReport(rb)

	assert.ok(ra.trace, '报告必须收录白名单读面，否则拿掉白名单也看不见泄漏')
	assert.deepEqual(Object.keys(ra.trace).sort(), ['artifact', 'floors'])
	// `artifact` 这个键是 `R4-15` 加的，加的只有**一个受闭集约束的枚举字符串**。只断言键集合
	// 不够：后人写成 `artifact: raw.artifact` 时键集合照样是这两个，而 html / css 文件名与将来
	// 塞进去的散文会一起进报告。所以内层键与类型一起钉。
	assert.deepEqual(Object.keys(ra.trace.artifact), ['kind'])
	assert.equal(typeof ra.trace.artifact.kind, 'string')
	for (const field of ra.trace.floors.flatMap((f) => f.fields)) {
		assert.deepEqual(Object.keys(field).sort(), ['confidence', 'field', 'image', 'imageConfirmed'])
	}

	assert.equal(sa, sb, '白名单外字段不得进入输出')
	assert.ok(!sa.includes(markA) && !sa.includes(markB), '泄漏标记不得出现在 lint-artifact.json 里')
	assert.equal(ra.verdict, 'pass')
	assert.equal(ra.styleSetId, 'fixture-lanyuan-lab')

	const cleaned = whitelistTrace(a)
	assert.deepEqual(Object.keys(cleaned).sort(), ['artifact', 'floors'])
	assert.deepEqual(Object.keys(cleaned.artifact), ['kind'])
	assert.ok(!JSON.stringify(cleaned).includes(markA), 'whitelistTrace 必须剥掉标记，恒等函数会在这里挂')
	assert.equal(JSON.stringify(whitelistTrace(a)), JSON.stringify(whitelistTrace(b)))
})

test('artifact 只收 kind：文件名、散文、非字符串一律落成缺席', () => {
	// 白名单只保「是个字符串」，闭集校验在门里——把闭集抄成两份就又是一次 `R4-14` 式分家。
	const poison = { artifact: { kind: 'floor', html: 'a.html', css: ['a.css'], note: 'PROSE-LEAK-MARKER' }, floors: [] }
	assert.deepEqual(whitelistTrace(poison).artifact, { kind: 'floor' })
	assert.ok(!JSON.stringify(whitelistTrace(poison)).includes('PROSE-LEAK-MARKER'))

	assert.deepEqual(whitelistTrace({ artifact: { kind: 42 }, floors: [] }).artifact, { kind: undefined }, '非字符串落成缺席，与「没写」在门那边同判 artifact-kind-missing')
	assert.equal(whitelistTrace({ floors: [] }).artifact, undefined, 'artifact 整块不在时不落键，序列化后字节与 R4-15 之前一致')
	assert.equal(whitelistTrace({ artifact: ['page'], floors: [] }).artifact, undefined, '数组不是对象')
})
