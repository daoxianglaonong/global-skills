/**
 * 门十 `layout-envelope`：把资产 `layout-envelope.json` 的**阻断层**落成验证侧的判据。
 *
 * 判据整份在 `lib/layout-envelope-gate.mjs`，与 page-theme-generate 那份逐字节相同
 * （`copied-helpers.test.mjs` 锁着字节，generate 侧 `copied-layout-envelope.test.mjs` 再锁行为）。
 * 因此本文件**不重验七维的判据细节**——那些在 generate 侧逐维断言过，两处各抄一遍只会在改判据
 * 时漏同步一半。本文件验的是本包这一侧独有的三件事：
 *
 * 1. **接线**：`gates[]` 十行恒在，第十行是本门；包络缺席时写 `no-input` 而不是 `findings: 0`。
 * 2. **同一份越界产物两侧同样退 1**：七维九码各跑一遍（维四两码见 `R4-13`，粒度声明缺席另占
 *    一码），验 audit 侧真的阻断到同一个 code 上。
 *    这是「只在生成侧跑等于自由构图自产自检」那条理由的兑现处。
 * 3. **不新增读面**：本门读 `layout-envelope.json` 与 `floor-index.json` 两份机器投影；层根是
 *    合成型（`synth:` 前缀）时另取 trace 白名单里的 `unobservedBreakpoints`（`R4-08` / `R4-14`），
 *    自由文本一个字段都不读，`--trace` 本来就收、旗标一个没多，判据阈值也一个都没升成 CLI 参数。
 *    接线本身另有 `copied-layout-envelope-wiring.test.mjs` 锁着两侧入参。
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { lintArtifact } from '../scripts/lint-artifact.mjs'
import { GATE_ORDER } from '../scripts/lib/gates.mjs'
import { FIXTURE_ASSET, SCRIPTS_DIR, copyFixtureAsset, goodCss, goodHtml, kindTrace, patchFloorIndex, writeLayoutEnvelope } from './helpers.mjs'

/** 页级产物：合格楼层前后各补一层页壳，起手是 hero。空壳不带声明，不惊动语法那几道门。 */
const NAVBAR = '<header class="pt-navbar" data-pattern="navbar.utility-left"></header>'
const HERO = '<section class="pt-hero" data-pattern="hero.centered-pitch"></section>'
const FOOTER = '<footer class="pt-footer" data-pattern="footer.compact-three"></footer>'
const pageHtml = (body = goodHtml()) => `${NAVBAR}\n${HERO}\n${body}\n${FOOTER}\n`

function assetWithEnvelope(t, { floorIndex, envelope } = {}) {
	const dir = copyFixtureAsset(t)
	writeLayoutEnvelope(dir, envelope)
	if (floorIndex) patchFloorIndex(dir, floorIndex)
	return dir
}

/**
 * 默认带一份「声明 page」的最小 trace：页级两维自 `R4-15` 起只判 `artifact.kind === 'page'` 的
 * 产物，不带声明就等于把 `DIMENSIONS` 里那两条验成空气。要验「不给 trace」那一支，显式传 `null`。
 */
const lint = (assetDir, { html = pageHtml(), css = goodCss(), trace = kindTrace('page') } = {}) =>
	lintArtifact({
		assetDir,
		files: [
			{ file: 'page.html', text: html },
			{ file: 'page.css', text: css },
		],
		trace,
		hasTrace: trace !== null,
	})

const row = (r) => r.gates.find((g) => g.gate === 'layout-envelope')
const layoutCodes = (r) => r.findings.filter((f) => f.gate === 'layout-envelope').map((f) => f.code).sort()

/* ---------------------------------------------------------------- */
/* 接线                                                              */
/* ---------------------------------------------------------------- */

test('gates[] 十行恒在，第十行是 layout-envelope', () => {
	assert.equal(GATE_ORDER.length, 10)
	assert.equal(GATE_ORDER[9], 'layout-envelope')
	assert.equal(lint(FIXTURE_ASSET).gates.length, 10)
})

test('包络缺席：那一行写 no-input，不是 findings: 0', (t) => {
	// `findings: 0` 与「这道门根本没跑」在报告里长得一模一样，区分它们正是 `no-input` 存在的理由。
	// 缺席不等于合规：包络自 `R4-10` 起是生成侧准入必交件，本包不跑准入，缺它由布局表那条链路
	// 退 1（`layout-map.test.mjs` 的 `layout-envelope-missing`）。本门这一行只负责如实写「没跑」。
	const dir = copyFixtureAsset(t)
	fs.rmSync(path.join(dir, 'layout-envelope.json'))
	const r = lint(dir)
	assert.deepEqual(row(r), { gate: 'layout-envelope', status: 'no-input', findings: 0 })
	assert.equal(r.verdict, 'pass')
})

test('合格页级产物 + 包络：那一行 pass，整体退 0', (t) => {
	const r = lint(assetWithEnvelope(t))
	assert.equal(r.verdict, 'pass', `合格产物不该挂：\n${r.findings.map((f) => `[${f.gate}] ${f.code ?? ''} ${f.reason}`).join('\n')}`)
	assert.deepEqual(row(r), { gate: 'layout-envelope', status: 'pass', findings: 0 })
})

/* ---------------------------------------------------------------- */
/* 七维在本侧同样退 1                                                 */
/* ---------------------------------------------------------------- */

const DIMENSIONS = [
	{
		label: '维一 容器模式',
		code: 'container-mode-out-of-envelope',
		asset: { floorIndex: (d, by) => { by.get('feature.grid-3-cards').container.mode = 'breakout' } },
	},
	{
		label: '维二 容器宽',
		code: 'container-width-out-of-envelope',
		asset: { floorIndex: (d, by) => { delete by.get('feature.grid-3-cards').container.maxWidthPx } },
	},
	{
		label: '维三 并层间距',
		code: 'merge-spacing-with-prev',
		artifact: () => ({ css: `${goodCss()}\n.pt-feature-grid {\n\tmargin-top: calc(-1 * var(--dimension-spacing-2));\n}\n` }),
	},
	{
		// 错位那一半用「整页首末都合规、但页里多一个排在中间的顶栏」：`R4-13` 之后首层不是 navbar
		// 会独立开 `page-shell-ends-missing`，原先的 `HERO NAVBAR …` 会同时点亮两个 code。
		label: '维四 页壳错位',
		code: 'page-shell-out-of-order',
		artifact: () => ({ html: `${NAVBAR}\n${HERO}\n${NAVBAR}\n${goodHtml()}\n${FOOTER}\n` }),
	},
	{
		// 维四第二码（`R4-13` 立）：声明 `page` 的产物缺页壳。只缺末层，好让本条恰好一个 finding。
		label: '维四 整页缺页壳',
		code: 'page-shell-ends-missing',
		artifact: () => ({ html: `${NAVBAR}\n${HERO}\n${goodHtml()}\n` }),
	},
	{
		label: '维五 浮层进序列',
		code: 'float-widget-in-sequence',
		asset: { floorIndex: (d, by) => d.floors.push({ ...JSON.parse(JSON.stringify(by.get('navbar.utility-left'))), id: 'float-widget.service-rail', taxonomy: 'float-widget' }) },
		artifact: () => ({ html: pageHtml(`${goodHtml()}\n<aside class="pt-rail" data-pattern="float-widget.service-rail"></aside>`) }),
	},
	{
		label: '维六 正文起手',
		code: 'body-start-out-of-envelope',
		artifact: () => ({ html: `${NAVBAR}\n${goodHtml()}\n${FOOTER}\n` }),
	},
	{
		label: '维七 跳过归属',
		code: 'paint-skip-out-of-envelope',
		asset: { floorIndex: (d, by) => { by.get('hero.centered-pitch').paint.participatesInCount = true } },
	},
]

const KIND_DIMENSION = {
	// `R4-15`：粒度声明缺席。判不出粒度就不放行，不许退回「按层根数猜」。
	label: '粒度声明缺席',
	code: 'artifact-kind-missing',
	artifact: () => ({ trace: kindTrace(null) }),
}

for (const dim of [...DIMENSIONS, KIND_DIMENSION]) {
	test(`${dim.label}：audit 侧同样退 1，且只挂本门这一个 code`, (t) => {
		const r = lint(assetWithEnvelope(t, dim.asset), dim.artifact ? dim.artifact() : {})
		assert.equal(r.verdict, 'blocked')
		assert.deepEqual(layoutCodes(r), [dim.code])
		assert.equal(row(r).status, 'blocked')
	})
}

test('九条输入互不遮蔽：各自只点亮一个 code，合起来覆盖九个不同的 code', () => {
	// 七维九码：`R4-13` 把维四拆成「页壳错位」（重排）与「整页缺页壳」（补层）两个 code，
	// 因为同码会让下游分不开这两种修法；`R4-15` 再加「粒度判不出」这一码。所以这里断言的是
	// code 数而不是维数。
	assert.equal(new Set([...DIMENSIONS, KIND_DIMENSION].map((d) => d.code)).size, 9, '九条输入必须落在九个不同的 code 上，合并计数的门验不出「换个绕法就能溜过去」')
})

/* ---------------------------------------------------------------- */
/* 产物粒度声明（`R4-15`）：两侧同一条口径                             */
/* ---------------------------------------------------------------- */

test('声明 floor 的多层片段：本侧一条不开，退 0', (t) => {
	// 与上面「维四 整页缺页壳」那一案的 HTML 逐字节相同，只换了声明。两条并排才证明粒度真读了
	// `artifact.kind`，不是碰巧闭嘴。
	const dir = assetWithEnvelope(t)
	const fragment = `${NAVBAR}\n${HERO}\n${goodHtml()}\n`
	assert.deepEqual(layoutCodes(lint(dir, { html: fragment, trace: kindTrace('page') })), ['page-shell-ends-missing'])
	const r = lint(dir, { html: fragment, trace: kindTrace('floor') })
	assert.deepEqual(layoutCodes(r), [])
	assert.equal(r.verdict, 'pass')
})

test('声明 page 的单层产物：首末照判——只有一层的页不再漏网', (t) => {
	const dir = assetWithEnvelope(t)
	const r = lint(dir, { html: `${HERO}\n`, trace: kindTrace('page') })
	assert.equal(r.verdict, 'blocked')
	assert.deepEqual(layoutCodes(r), ['page-shell-ends-missing', 'page-shell-ends-missing'])
})

test('不给 trace：页级两维整块不判，缺页脚的整页在本侧退 0', (t) => {
	// 已知代价（`R4-15` 拍板第 4 项）：`--trace` 是既有可选旗标，「没给」不等于「越界」。
	// 于是**不带 trace 的整页忘了写页脚，本门抓不到**——`R4-13` 之后按层根数猜时还抓得住。
	const dir = assetWithEnvelope(t)
	const r = lint(dir, { html: `${NAVBAR}\n${HERO}\n${goodHtml()}\n`, trace: null })
	assert.equal(r.trace, null)
	assert.deepEqual(layoutCodes(r), [])
	assert.equal(r.verdict, 'pass')
})

test('白名单把 artifact 剥到只剩 kind：html / css 文件名不进报告', (t) => {
	const dir = assetWithEnvelope(t)
	const trace = kindTrace('page')
	trace.artifact.html = 'PROSE-LEAK-MARKER.html'
	trace.artifact.note = 'PROSE-LEAK-MARKER：这一页我是照着首页那种感觉排的'
	const r = lint(dir, { trace })
	assert.deepEqual(Object.keys(r.trace.artifact), ['kind'])
	assert.equal(r.trace.artifact.kind, 'page')
	assert.ok(!JSON.stringify(r).includes('PROSE-LEAK-MARKER'), '整条透传 artifact 会把文件名与散文一起放进报告')
})

/* ---------------------------------------------------------------- */
/* 边界                                                              */
/* ---------------------------------------------------------------- */

test('报警层不进门：整块 advisory 删掉，结论一个字节都不差', (t) => {
	const withIt = lint(assetWithEnvelope(t))
	const without = lint(assetWithEnvelope(t, { envelope: (e) => { e.advisory = [] } }))
	assert.equal(JSON.stringify(withIt.gates), JSON.stringify(without.gates))
	assert.equal(withIt.findings.length + without.findings.length, 0)
})

test('包络解不开：报 envelope-unreadable 并阻断，不静默当全绿', (t) => {
	const dir = assetWithEnvelope(t)
	fs.writeFileSync(path.join(dir, 'layout-envelope.json'), '{')
	const r = lint(dir)
	assert.equal(r.verdict, 'blocked')
	assert.deepEqual(layoutCodes(r), ['envelope-unreadable'])
})

test('不新增读面：真实型那一路不碰 trace，不给也照样判', (t) => {
	// 越界产物在**不给 trace** 时照样退 1：合成型之外的七维一个字节的 trace 都不读。
	const dir = assetWithEnvelope(t, { floorIndex: (d, by) => { by.get('feature.grid-3-cards').container.mode = 'breakout' } })
	const r = lint(dir, { trace: null })
	assert.equal(r.trace, null)
	assert.deepEqual(layoutCodes(r), ['container-mode-out-of-envelope'])
})

test('判据阈值不得升为 CLI 参数：lint-artifact 的旗标一个都没多', () => {
	const src = fs.readFileSync(path.join(SCRIPTS_DIR, 'lint-artifact.mjs'), 'utf8')
	const flags = [...new Set([...src.matchAll(/'(--[a-z-]+)'/g)].map((m) => m[1]))].sort()
	assert.deepEqual(flags, ['--asset', '--artifact', '--json', '--trace'].sort())
	assert.ok(!/--envelope|--layout|--skip-/.test(src), '包络那道门不许有任何专属旗标')
})
