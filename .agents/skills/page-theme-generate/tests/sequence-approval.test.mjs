/**
 * 门七（sequence-approval）：候选序列没经用户拍板，不许出页。
 *
 * 这道门的存在理由是「跳过大纲直接产页」这一步在纸面上看不出来——产物本身合法、变量全查了
 * 表、颜色一处不越界，唯独那条序列是谁都没看过的。所以它判的不是产物，是产物的出处声明。
 *
 * 末尾两条是**接线**用例：只单独调 `gateSequenceApproval` 不算把门装上，从 `runAllGates`
 * 里摘掉那一行，前面所有用例照样全绿。所以必须有一条真的走 `lintFloor` 的。
 *
 * 接线走页级合格夹具（不是单层 floor-good）：页级产物带 sequence 时门八也会开口，
 * 单层 HTML 配三条序列会同时亮 paint-consistency，验不出「只该亮门七」。
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { lintFloor } from '../scripts/lint-floor.mjs'
import { gateSequenceApproval } from '../scripts/lib/gates.mjs'
import { FIXTURE_ASSET, goodTrace, goodPageHtml, goodPageCss, goodPageTrace } from './helpers.mjs'

const STEPS = [{ pattern: 'hero.centered-pitch' }, { pattern: 'feature.grid-3-cards' }, { pattern: 'cta.centered-band' }]
const traceWith = (sequence) => ({ ...goodTrace(), sequence })

test('单层楼层产物没有序列块，本门不开口', () => {
	assert.deepEqual(gateSequenceApproval(goodTrace()), [])
	assert.deepEqual(gateSequenceApproval(null), [])
})

const HOME_STEPS = [
	{ pattern: 'navbar.utility-left' },
	{ pattern: 'hero.centered-pitch' },
	{ pattern: 'feature.grid-3-cards' },
	{ pattern: 'cta.centered-band' },
	{ pattern: 'footer.compact-three' },
]

test('已采页的实测序列是权威的，不需要拍板', () => {
	assert.deepEqual(gateSequenceApproval(traceWith({ source: 'page-sequence', page: 'home', steps: HOME_STEPS }), FIXTURE_ASSET), [])
})

test('权威档要核对，不能只凭声明：没指名哪一页就挂', () => {
	// 不核对的话，「把候选序列写成 page-sequence」就是一句免拍板咒语，比打错来源名还省事。
	const findings = gateSequenceApproval(traceWith({ source: 'page-sequence', steps: STEPS }), FIXTURE_ASSET)

	assert.deepEqual(
		findings.map((f) => f.code),
		['page-unnamed'],
	)
})

test('权威档要核对：指一个资产里没有的页就挂', () => {
	const findings = gateSequenceApproval(traceWith({ source: 'page-sequence', page: 'invented', steps: HOME_STEPS }), FIXTURE_ASSET)

	assert.deepEqual(
		findings.map((f) => f.code),
		['page-not-in-asset'],
	)
})

test('权威档要核对：序列与那一页的实测记录对不上就挂', () => {
	// 改过的序列不再是观测记录，而是一条候选：加一层、删一层、换顺序都得走拍板。
	const findings = gateSequenceApproval(traceWith({ source: 'page-sequence', page: 'home', steps: HOME_STEPS.slice(0, 3) }), FIXTURE_ASSET)

	assert.deepEqual(
		findings.map((f) => f.code),
		['page-sequence-mismatch'],
	)
	assert.match(findings[0].reason, /该页 5 层、产物 3 层/)
})

test('跳过大纲直接产页会挂：骨架选型产出的是候选序列', () => {
	const findings = gateSequenceApproval(traceWith({ source: 'skeleton', skeleton: 'sk-landing', steps: STEPS }))

	assert.deepEqual(
		findings.map((f) => [f.gate, f.code]),
		[['sequence-approval', 'approval-missing']],
	)
	assert.match(findings[0].reason, /跳过大纲直接产页不放行/)
})

test('跳过大纲直接产页会挂：共现回退产出的也是候选序列', () => {
	const findings = gateSequenceApproval(traceWith({ source: 'cooccurrence', steps: STEPS }))

	assert.deepEqual(
		findings.map((f) => f.code),
		['approval-missing'],
	)
})

test('拍板过的候选序列放行', () => {
	assert.deepEqual(gateSequenceApproval(traceWith({ source: 'skeleton', skeleton: 'sk-landing', steps: STEPS, approvedBy: 'user', approvedSteps: STEPS })), [])
})

test('拍了一条、交了另一条会挂', () => {
	// 拍板管的是这一条序列。少一层、多一层、换个型，都是「用户没看过的那一页」。
	const findings = gateSequenceApproval(traceWith({ source: 'skeleton', steps: STEPS, approvedBy: 'user', approvedSteps: STEPS.slice(0, 2) }))

	assert.deepEqual(
		findings.map((f) => f.code),
		['approval-mismatch'],
	)
	assert.match(findings[0].reason, /拍板 2 步、产物 3 步/)
})

test('声称拍过但没给出被拍板的序列会挂', () => {
	const findings = gateSequenceApproval(traceWith({ source: 'skeleton', steps: STEPS, approvedBy: 'user' }))

	assert.deepEqual(
		findings.map((f) => f.code),
		['approval-mismatch'],
	)
})

test('来源写成本门不认识的值会挂，不静默放行', () => {
	// 白名单而不是黑名单：来源打错一个字就绕过整道门，是这类「按声明判」的门最容易留的洞。
	const findings = gateSequenceApproval(traceWith({ source: 'skeletons', steps: STEPS }))

	assert.deepEqual(
		findings.map((f) => f.code),
		['source-unknown'],
	)
})

test('接线：合格产物配一条没拍板的候选序列，lintFloor 整趟就红', () => {
	const trace = goodPageTrace()
	delete trace.sequence.approvedBy
	delete trace.sequence.approvedSteps
	const r = lintFloor({ assetDir: FIXTURE_ASSET, html: goodPageHtml(), css: [{ file: 'page.css', text: goodPageCss() }], trace })

	assert.equal(r.verdict, 'blocked')
	assert.deepEqual([...new Set(r.findings.map((f) => f.gate))], ['sequence-approval'], '产物本身合格，只该亮门七（sequence-approval）')
})

test('接线：拍板过的同一条序列，lintFloor 全绿', () => {
	assert.equal(lintFloor({ assetDir: FIXTURE_ASSET, html: goodPageHtml(), css: [{ file: 'page.css', text: goodPageCss() }], trace: goodPageTrace() }).verdict, 'pass')
})
