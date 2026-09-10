/**
 * 门八：混搭一致性。楼层底色是整条序列的函数，不许照抄 yaml 自带的 surface。
 *
 * 原 14 个 code 各一条独立会挂的输入，另补页级无 sequence / html 未传 / paint 段
 * 写出算法输出。坏用例一律从合格页 / cta 打头夹具派生。
 * 末尾接线走 lintFloor：只单独调门函数不算把门装上。
 * 再往后是射程锁：trace 里的 custom 关不掉门、资产 custom 必须比对观测值、
 * 无同名 data-pattern 的 wrapper 不错位、
 * 三处停手的吞噬范围（未知型只停该步及之后；同型次数只停该型；重算失败整条停）、
 * 级联收口（同一层根多个 --color-surface-* 候选报 ambiguous，四种来源各一条）。
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { lintFloor } from '../scripts/lint-floor.mjs'
import { gatePaintConsistency, runAllGates } from '../scripts/lib/gates.mjs'
import { checkPaintConsistency } from '../scripts/lib/paint-check.mjs'
import { scanArtifact } from '../scripts/lib/css-scan.mjs'
import { loadClosedSet } from '../scripts/lib/closed-set.mjs'
import {
	FIXTURE_ASSET,
	goodHtml,
	goodCss,
	goodTrace,
	goodPageHtml,
	goodPageCss,
	goodPageTrace,
	ctaFirstHtml,
	ctaFirstCss,
	ctaFirstTrace,
	kindTrace,
	mutatePageHtml,
	mutatePageCss,
	mutateCtaFirstCss,
	mutateCtaFirstHtml,
	mutatePageTrace,
	mutateCtaFirstTrace,
	copyFixtureAsset,
} from './helpers.mjs'

const codesOf = (findings) => findings.map((f) => f.code)

const paint = (html, css, trace, assetDir = FIXTURE_ASSET) => {
	const closedSet = loadClosedSet(assetDir)
	const { declarations } = scanArtifact({ html, htmlFile: 'page.html', css: [{ file: 'page.css', text: css }] })
	return gatePaintConsistency({ html, declarations, closedSet, trace, assetDir })
}

const lintPage = (html, css, trace, assetDir = FIXTURE_ASSET) =>
	lintFloor({ assetDir, html, css: [{ file: 'page.css', text: css }], trace })

/**
 * 从页级夹具派生「只有一层的页」：摘掉两端页壳与两层 feature，只留 hero。
 *
 * 页级夹具自 `R4-13` 起是 navbar + hero + feature×2 + footer 的整页（包络门维四补齐后，
 * 原先那份三层无页壳序列在门上转红），所以派生单层要连页壳一起摘。用它的两条用例各自还带着
 * 「必须只剩一层」的计数断言，摘漏了会当场红，不会静默变成「验的不是盲区」。
 */
const heroOnlyPage = () =>
	goodPageHtml()
		.replace(/<header class="pt-navbar"[\s\S]*?<\/header>\s*/, '')
		.replace(/<footer class="pt-footer"[\s\S]*?<\/footer>\s*/, '')
		.replace(/<section class="pt-feature-grid[\s\S]*?<\/section>\s*/g, '')

test('floor-pattern-attr-missing：合格页删掉 hero 的 data-pattern', () => {
	const html = mutatePageHtml(' data-pattern="hero.centered-pitch"', '')
	const findings = paint(html, goodPageCss(), goodPageTrace())

	assert.deepEqual(codesOf(findings), ['floor-pattern-attr-missing'])
	assert.equal(findings[0].pattern, 'hero.centered-pitch')
})

test('floor-pattern-attr-count：序列两个 feature，产物只留一层', () => {
	const html = mutatePageHtml(
		`<section class="pt-feature-grid pt-feature-grid--muted" data-pattern="feature.grid-3-cards">`,
		`<section class="pt-feature-grid pt-feature-grid--muted">`,
	)
	const findings = paint(html, goodPageCss(), goodPageTrace())

	assert.deepEqual(codesOf(findings), ['floor-pattern-attr-count'])
	assert.equal(findings[0].pattern, 'feature.grid-3-cards')
})

test('floor-not-in-sequence：序列没有 cta，产物多插一层', () => {
	const html = `${goodPageHtml()}\n<section class="pt-cta" data-pattern="cta.centered-band"><h2>多出来的一层</h2></section>\n`
	const findings = paint(html, goodPageCss(), goodPageTrace())

	assert.deepEqual(codesOf(findings), ['floor-not-in-sequence'])
	assert.equal(findings[0].pattern, 'cta.centered-band')
})

test('step-surface-handwritten：已对齐的某一步上出现 surface 键', () => {
	// 下标 2 = 第一层 feature。页级夹具自 `R4-13` 起首层是 navbar，故 hero 在 1、feature 在 2 / 3。
	const trace = mutatePageTrace((t) => {
		t.sequence.steps[2].surface = 'default'
	})
	const findings = paint(goodPageHtml(), goodPageCss(), trace)

	assert.deepEqual(codesOf(findings), ['step-surface-handwritten'])
	assert.equal(findings[0].pattern, 'feature.grid-3-cards')
})

test('丢掉手写 surface：硬跳过值不得改变后续层 n', () => {
	const trace = mutatePageTrace((t) => {
		t.sequence.steps[2].surface = 'image'
	})
	const findings = paint(goodPageHtml(), goodPageCss(), trace)

	assert.deepEqual(codesOf(findings), ['step-surface-handwritten'], '原样传进 paintSequence 会让第一层 feature 硬跳过、第二层 n 左移，多亮 surface-mismatch / paint-skip-mismatch')
	assert.equal(findings[0].pattern, 'feature.grid-3-cards')
})

test('step-pattern-not-in-asset：序列写 pricing.table-3，HTML 带同名 data-pattern', () => {
	const html = `${goodPageHtml()}\n<section data-pattern="pricing.table-3"></section>\n`
	const extra = { id: 's4', pattern: 'pricing.table-3' }
	const trace = mutatePageTrace((t) => {
		t.sequence.steps.push(extra)
		t.sequence.approvedSteps.push(extra)
		t.paint.steps.push({ pattern: 'pricing.table-3', ownSurface: null, skippedBy: null })
	})
	const findings = paint(html, goodPageCss(), trace)

	assert.deepEqual(codesOf(findings), ['step-pattern-not-in-asset'])
	assert.equal(findings[0].pattern, 'pricing.table-3')
})

test('paint-recompute-failed：合成资产 surfaces 为空', (t) => {
	const dir = copyFixtureAsset(t)
	const file = path.join(dir, 'floor-index.json')
	const index = JSON.parse(fs.readFileSync(file, 'utf8'))
	index.rhythm.surfaces = []
	fs.writeFileSync(file, JSON.stringify(index, null, 2))
	const trace = mutatePageTrace((tr) => {
		tr.paint.rhythm.surfaces = []
	})
	const findings = paint(goodPageHtml(), goodPageCss(), trace, dir)

	assert.deepEqual(codesOf(findings), ['paint-recompute-failed'])
	assert.equal(findings[0].paintError, 'surfaces-empty')
})

test('surface-mismatch：cta 打头却照抄 ownSurface muted', () => {
	const css = mutateCtaFirstCss(
		'background-color: var(--color-surface-default); /* floor-surface:cta */',
		'background-color: var(--color-surface-muted); /* floor-surface:cta */',
	)
	const findings = paint(ctaFirstHtml(), css, ctaFirstTrace())

	assert.deepEqual(codesOf(findings), ['surface-mismatch'])
	assert.equal(findings[0].pattern, 'cta.centered-band')
	assert.equal(findings[0].expected, 'default')
	assert.equal(findings[0].actual, 'muted')
})

test('surface-unreadable：cta 底色只写在内联 style 上', () => {
	const html = mutateCtaFirstHtml(
		'<section class="pt-cta" data-pattern="cta.centered-band">',
		'<section class="pt-cta" data-pattern="cta.centered-band" style="background-color: var(--color-surface-default)">',
	)
	const css = mutateCtaFirstCss('background-color: var(--color-surface-default); /* floor-surface:cta */', '')
	const findings = paint(html, css, ctaFirstTrace())

	assert.deepEqual(codesOf(findings), ['surface-unreadable'])
	assert.equal(findings[0].pattern, 'cta.centered-band')
})

test('surface-ambiguous：cta 根挂两个类、涂了两个不同底色', () => {
	const html = mutateCtaFirstHtml('class="pt-cta"', 'class="pt-cta pt-band"')
	const css = `${ctaFirstCss()}\n.pt-band {\n\tbackground-color: var(--color-surface-muted);\n}\n`
	const findings = paint(html, css, ctaFirstTrace())

	assert.deepEqual(codesOf(findings), ['surface-ambiguous'])
	assert.equal(findings[0].pattern, 'cta.centered-band')
})

test('surface-ambiguous：更具体选择器把对的类选择器盖成 muted', () => {
	const css = `${ctaFirstCss()}\nsection.pt-cta {\n\tbackground-color: var(--color-surface-muted);\n}\n`
	const findings = paint(ctaFirstHtml(), css, ctaFirstTrace())

	assert.deepEqual(codesOf(findings), ['surface-ambiguous'])
	assert.equal(findings[0].pattern, 'cta.centered-band')
	assert.deepEqual(findings[0].actual, ['default', 'muted'])
})

test('内联 style 含引号内分号仍抽得到底色：与类选择器不同则 ambiguous', () => {
	const html = mutateCtaFirstHtml(
		'<section class="pt-cta" data-pattern="cta.centered-band">',
		`<section class="pt-cta" data-pattern="cta.centered-band" style="background: url('x;y') var(--color-surface-muted)">`,
	)
	const findings = paint(html, ctaFirstCss(), ctaFirstTrace())

	assert.deepEqual(codesOf(findings), ['surface-ambiguous'])
	assert.deepEqual(findings[0].actual, ['default', 'muted'])
})

test('surface-ambiguous：内联 style 把对的类选择器盖成 muted', () => {
	const html = mutateCtaFirstHtml(
		'<section class="pt-cta" data-pattern="cta.centered-band">',
		'<section class="pt-cta" data-pattern="cta.centered-band" style="background-color: var(--color-surface-muted)">',
	)
	const findings = paint(html, ctaFirstCss(), ctaFirstTrace())

	assert.deepEqual(codesOf(findings), ['surface-ambiguous'])
	assert.equal(findings[0].pattern, 'cta.centered-band')
	assert.deepEqual(findings[0].actual, ['default', 'muted'])
})

test('surface-ambiguous：@media 块把对的类选择器盖成 muted', () => {
	const css = `${ctaFirstCss()}\n@media (max-width: 767px) {\n\t.pt-cta {\n\t\tbackground-color: var(--color-surface-muted);\n\t}\n}\n`
	const findings = paint(ctaFirstHtml(), css, ctaFirstTrace())

	assert.deepEqual(codesOf(findings), ['surface-ambiguous'])
	assert.equal(findings[0].pattern, 'cta.centered-band')
	assert.deepEqual(findings[0].actual, ['default', 'muted'])
})

test('cta 打头合格序列全绿（feature 从 page-good 派生）', () => {
	assert.deepEqual(paint(ctaFirstHtml(), ctaFirstCss(), ctaFirstTrace()), [])
})

test('合格页每层只有一个底色声明，paint-consistency 全绿', () => {
	assert.deepEqual(paint(goodPageHtml(), goodPageCss(), goodPageTrace()), [])
	const r = lintPage(goodPageHtml(), goodPageCss(), goodPageTrace())
	assert.equal(r.verdict, 'pass', `合格页不该被级联收口误伤：\n${r.findings.map((f) => `[${f.gate}] ${f.code ?? ''} ${f.reason}`).join('\n')}`)
})

test('paint-record-output-field：paint.steps 写出 surface', () => {
	const trace = mutatePageTrace((t) => {
		t.paint.steps[0].surface = 'default'
	})
	const findings = paint(goodPageHtml(), goodPageCss(), trace)

	assert.deepEqual(codesOf(findings), ['paint-record-output-field'])
	assert.equal(findings[0].field, 'surface')
})

test('paint-record-output-field：paint.steps 写出 n 或 decidedBy 同样阻断', () => {
	const n = paint(
		goodPageHtml(),
		goodPageCss(),
		mutatePageTrace((t) => {
			t.paint.steps[1].n = 0
		}),
	)
	assert.deepEqual(codesOf(n), ['paint-record-output-field'])
	assert.equal(n[0].field, 'n')

	const decided = paint(
		goodPageHtml(),
		goodPageCss(),
		mutatePageTrace((t) => {
			t.paint.steps[1].decidedBy = 'alternate'
		}),
	)
	assert.deepEqual(codesOf(decided), ['paint-record-output-field'])
	assert.equal(decided[0].field, 'decidedBy')
})

test('paint-record-missing：sequence 在、paint 整块不在', () => {
	const trace = mutatePageTrace((t) => {
		delete t.paint
	})
	const findings = paint(goodPageHtml(), goodPageCss(), trace)

	assert.deepEqual(codesOf(findings), ['paint-record-missing'])
})

test('paint-steps-misaligned：paint.steps 少最后一条', () => {
	const trace = mutatePageTrace((t) => {
		t.paint.steps.pop()
	})
	const findings = paint(goodPageHtml(), goodPageCss(), trace)

	assert.deepEqual(codesOf(findings), ['paint-steps-misaligned'])
})

test('paint-rhythm-mismatch：skipTaxonomies 丢掉 footer', () => {
	const trace = mutatePageTrace((t) => {
		t.paint.rhythm.skipTaxonomies = ['hero']
	})
	const findings = paint(goodPageHtml(), goodPageCss(), trace)

	assert.deepEqual(codesOf(findings), ['paint-rhythm-mismatch'])
})

test('paint-own-surface-mismatch：cta 那条写 default，资产是 muted', () => {
	const trace = mutateCtaFirstTrace((t) => {
		t.paint.steps[0].ownSurface = 'default'
	})
	const findings = paint(ctaFirstHtml(), ctaFirstCss(), trace)

	assert.deepEqual(codesOf(findings), ['paint-own-surface-mismatch'])
	assert.equal(findings[0].pattern, 'cta.centered-band')
})

test('paint-skip-mismatch：hero 写 null，重算是 taxonomy', () => {
	const trace = mutatePageTrace((t) => {
		t.paint.steps[1].skippedBy = null
	})
	const findings = paint(goodPageHtml(), goodPageCss(), trace)

	assert.deepEqual(codesOf(findings), ['paint-skip-mismatch'])
	assert.equal(findings[0].pattern, 'hero.centered-pitch')
})

test('无 sequence 时本门不开口：单层夹具 + generate-trace.good.json 全绿', () => {
	assert.deepEqual(paint(goodHtml(), goodCss(), goodTrace()), [])
	const r = lintPage(goodHtml(), goodCss(), goodTrace())
	assert.equal(r.verdict, 'pass', `无 sequence 不该亮本门：\n${r.findings.map((f) => `[${f.gate}] ${f.code ?? ''} ${f.reason}`).join('\n')}`)
})

test('page-sequence-missing：声明 page 且无 sequence 阻断', () => {
	const findings = paint(goodPageHtml(), goodPageCss(), kindTrace('page'))

	assert.deepEqual(codesOf(findings), ['page-sequence-missing'])
})

test('接线：声明 page 的产物无 sequence，lintFloor 只亮 page-sequence-missing', () => {
	const r = lintPage(goodPageHtml(), goodPageCss(), kindTrace('page'))

	assert.equal(r.verdict, 'blocked')
	assert.deepEqual([...new Set(r.findings.map((f) => f.gate))], ['paint-consistency'])
	assert.deepEqual(codesOf(r.findings), ['page-sequence-missing'])
})

test('声明 floor / component 的产物无 sequence，不开口', () => {
	const html = '<article class="pt-card"><h3>一张能力卡</h3><p>没有 data-pattern，不是楼层根。</p></article>'
	assert.deepEqual(paint(html, '', kindTrace('component')), [])
	assert.deepEqual(paint(goodHtml(), goodCss(), goodTrace()), [], '单层楼层夹具自称 floor')
	// 多层片段：`R4-13` 的误伤本体在本门这一侧的同构——按层根数猜会要求它编一条页级序列。
	assert.deepEqual(paint(ctaFirstHtml(), ctaFirstCss(), kindTrace('floor')), [], '声明 floor 就不该被要求编页级序列，多少层都一样')
})

test('只有一层的页不再漏网：声明 page 的单层产物缺 sequence 照样阻断', () => {
	// `R4-15` 之前这一条是「已知盲区：只有一层的页无 sequence，会被当成单层放过」——判据只有层根数，
	// 1 个层根在纸面上分不出「单层楼层」与「只有一层的页」。粒度改读声明之后这个洞关上了。
	const html = heroOnlyPage()
	assert.equal((html.match(/data-pattern=/g) || []).length, 1, '派生后必须只剩一层，否则验的不是那个洞')
	assert.deepEqual(codesOf(paint(html, goodPageCss(), kindTrace('page'))), ['page-sequence-missing'])
	assert.deepEqual(codesOf(paint(html, goodPageCss(), kindTrace('floor'))), [], '同一份单层产物声明 floor 就不判')
})

test('artifact-kind-missing：给了 trace 却没有 artifact.kind，直调本门单独亮一条', () => {
	// 本门与包络门都会对同一份缺 kind 的 trace 开口（同码两条、不同 gate），这是有意的：合并成
	// 一条会让「直调 checkPaintConsistency」的判据没法被单独喂一份会挂的输入。
	assert.deepEqual(codesOf(paint(goodPageHtml(), goodPageCss(), kindTrace(null))), ['artifact-kind-missing'])
	assert.deepEqual(codesOf(checkPaintConsistency({ html: goodHtml(), trace: kindTrace(null), assetDir: FIXTURE_ASSET })), ['artifact-kind-missing'])

	const bad = kindTrace('page')
	bad.artifact.kind = 'section'
	assert.deepEqual(codesOf(paint(goodPageHtml(), goodPageCss(), bad)), ['artifact-kind-missing'], '闭集外的值与没写同判')
})

test('压根没给 trace：本门一条不开，也不退 1', () => {
	// 与「给了 trace 却没写 kind」分得开：前者是调用方没给输入，后者是 trace 本身不合格。
	assert.deepEqual(paint(goodPageHtml(), goodPageCss(), null), [])
	assert.equal(lintPage(goodPageHtml(), goodPageCss(), null).verdict, 'pass')
})

test('no-input：runAllGates 漏传 html 不得伪装成 floor-pattern-attr-missing', () => {
	const closedSet = loadClosedSet(FIXTURE_ASSET)
	const { declarations } = scanArtifact({ html: goodPageHtml(), htmlFile: 'page.html', css: [{ file: 'page.css', text: goodPageCss() }] })
	const findings = runAllGates({ declarations, closedSet, trace: goodPageTrace(), assetDir: FIXTURE_ASSET }).filter((f) => f.gate === 'paint-consistency')

	assert.deepEqual(codesOf(findings), ['no-input'])
	assert.ok(!codesOf(findings).includes('floor-pattern-attr-missing'), '缺输入不得读成缺属性')
})

test('no-input：直接调 gatePaintConsistency 不传 html，同样只亮 no-input', () => {
	const closedSet = loadClosedSet(FIXTURE_ASSET)
	const { declarations } = scanArtifact({ html: goodPageHtml(), htmlFile: 'page.html', css: [{ file: 'page.css', text: goodPageCss() }] })
	const findings = gatePaintConsistency({ declarations, closedSet, trace: goodPageTrace(), assetDir: FIXTURE_ASSET })

	assert.deepEqual(codesOf(findings), ['no-input'])
})

test('html 传了空串是空文档：报 floor-pattern-attr-missing，不是 no-input', () => {
	const findings = paint('', goodPageCss(), goodPageTrace())

	assert.ok(codesOf(findings).includes('floor-pattern-attr-missing'), `空文档应对不上层根：${codesOf(findings)}`)
	assert.ok(!codesOf(findings).includes('no-input'), `空串已提供，不得写成没传：${codesOf(findings)}`)
})

test('scheme: custom 仍按 n%2 涂第二层 feature → surface-mismatch', (t) => {
	const dir = copyFixtureAsset(t)
	const file = path.join(dir, 'floor-index.json')
	const index = JSON.parse(fs.readFileSync(file, 'utf8'))
	index.rhythm.scheme = 'custom'
	fs.writeFileSync(file, JSON.stringify(index, null, 2))
	const trace = mutatePageTrace((tr) => {
		tr.sequence.steps[2].surface = 'default'
		tr.sequence.steps[3].surface = 'default'
		tr.paint.rhythm.scheme = 'custom'
	})
	const findings = paint(goodPageHtml(), goodPageCss(), trace, dir)
	assert.deepEqual(codesOf(findings), ['surface-mismatch'])
	assert.equal(findings[0].pattern, 'feature.grid-3-cards')
	assert.equal(findings[0].expected, 'default')
	assert.equal(findings[0].actual, 'muted')
})

test('scheme: custom 手写观测与产物一致则不报 surface-mismatch', (t) => {
	const dir = copyFixtureAsset(t)
	const file = path.join(dir, 'floor-index.json')
	const index = JSON.parse(fs.readFileSync(file, 'utf8'))
	index.rhythm.scheme = 'custom'
	fs.writeFileSync(file, JSON.stringify(index, null, 2))
	const trace = mutatePageTrace((tr) => {
		tr.sequence.steps[2].surface = 'default'
		tr.sequence.steps[3].surface = 'muted'
		tr.paint.rhythm.scheme = 'custom'
	})
	assert.deepEqual(codesOf(paint(goodPageHtml(), goodPageCss(), trace, dir)), [])
})

test('scheme: custom 参与计数层缺手写 surface → paint-recompute-failed', (t) => {
	const dir = copyFixtureAsset(t)
	const file = path.join(dir, 'floor-index.json')
	const index = JSON.parse(fs.readFileSync(file, 'utf8'))
	index.rhythm.scheme = 'custom'
	fs.writeFileSync(file, JSON.stringify(index, null, 2))
	const trace = mutatePageTrace((tr) => {
		tr.paint.rhythm.scheme = 'custom'
	})
	const findings = paint(goodPageHtml(), goodPageCss(), trace, dir)
	assert.deepEqual(codesOf(findings), ['paint-recompute-failed'])
	assert.equal(findings[0].paintError, 'custom-surface-missing')
})

test('scheme: custom 手写 surface 不报 step-surface-handwritten', (t) => {
	const dir = copyFixtureAsset(t)
	const file = path.join(dir, 'floor-index.json')
	const index = JSON.parse(fs.readFileSync(file, 'utf8'))
	index.rhythm.scheme = 'custom'
	fs.writeFileSync(file, JSON.stringify(index, null, 2))
	const trace = mutatePageTrace((tr) => {
		tr.sequence.steps[2].surface = 'default'
		tr.sequence.steps[3].surface = 'muted'
		tr.paint.rhythm.scheme = 'custom'
	})
	assert.ok(!codesOf(paint(goodPageHtml(), goodPageCss(), trace, dir)).includes('step-surface-handwritten'))
})

test('接线：合格页 + 配套 trace，lintFloor 全绿', () => {
	const r = lintPage(goodPageHtml(), goodPageCss(), goodPageTrace())
	assert.equal(r.verdict, 'pass', `合格页不该挂：\n${r.findings.map((f) => `[${f.gate}] ${f.code ?? ''} ${f.reason}`).join('\n')}`)
})

test('接线：cta 打头照抄 muted，只亮 surface-mismatch 一条', () => {
	// 这份 cta 夹具是**两层的楼层片段**，trace 声明 `artifact.kind: "floor"`。`R4-13` 之后包络门按
	// 层根数猜粒度（≥ 2 即页级），于是首末两维各误伤一条 `page-shell-ends-missing`、维六再来一条，
	// 当时如实钉成三条并把出口记成 `R4-15`。`R4-15` 落地后粒度改读声明，这三条**应当清空**——
	// 改的是判据不是断言：同一份 HTML 声明 page 时那三条照旧亮（`layout-envelope.test.mjs` 钉着）。
	// paint 侧那条 surface-mismatch 一个字没动，误伤消失了、真问题还在。
	const css = mutateCtaFirstCss(
		'background-color: var(--color-surface-default); /* floor-surface:cta */',
		'background-color: var(--color-surface-muted); /* floor-surface:cta */',
	)
	const r = lintPage(ctaFirstHtml(), css, ctaFirstTrace())

	assert.equal(r.verdict, 'blocked')
	assert.deepEqual([...new Set(r.findings.map((f) => f.gate))].sort(), ['paint-consistency'])
	assert.deepEqual(codesOf(r.findings.filter((f) => f.gate === 'paint-consistency')), ['surface-mismatch'])
	assert.deepEqual(codesOf(r.findings.filter((f) => f.gate === 'layout-envelope')), [], '声明 floor 之后包络门在这份片段上一条都不该开')
})

test('scheme 只写在 trace 上的 custom 关不掉本门', () => {
	const css = mutateCtaFirstCss(
		'background-color: var(--color-surface-default); /* floor-surface:cta */',
		'background-color: var(--color-surface-muted); /* floor-surface:cta */',
	)
	const trace = mutateCtaFirstTrace((t) => {
		t.paint.rhythm.scheme = 'custom'
	})
	const findings = paint(ctaFirstHtml(), css, trace)

	assert.ok(codesOf(findings).includes('surface-mismatch'), `trace 里的 custom 不该让涂色比对闭嘴：${codesOf(findings)}`)
	assert.ok(codesOf(findings).includes('paint-rhythm-mismatch'))
})

test('没有同名 data-pattern 的 wrapper 不错位：第二层涂错仍报 surface-mismatch', () => {
	const html = goodPageHtml().replace(
		'<section class="pt-feature-grid pt-feature-grid--muted" data-pattern="feature.grid-3-cards">',
		'<div class="wrapper"><p>插一个 wrapper</p></div>\n<section class="pt-feature-grid pt-feature-grid--muted" data-pattern="feature.grid-3-cards">',
	)
	const css = mutatePageCss(
		'background-color: var(--color-surface-muted); /* floor-surface:feature-1 */',
		'background-color: var(--color-surface-default); /* floor-surface:feature-1 */',
	)
	const findings = paint(html, css, goodPageTrace())

	assert.deepEqual(codesOf(findings), ['surface-mismatch'])
	assert.equal(findings[0].at, 3, '第二层 feature 是序列第 3 步（0=navbar / 1=hero / 2,3=feature）')
	assert.equal(findings[0].expected, 'muted')
	assert.equal(findings[0].actual, 'default')
})

test('对位失败不比该型底色：删掉其中一个 feature 的 data-pattern 并涂错另一层，只报 attr-count', () => {
	const html = mutatePageHtml(
		`<section class="pt-feature-grid pt-feature-grid--muted" data-pattern="feature.grid-3-cards">`,
		`<section class="pt-feature-grid pt-feature-grid--muted">`,
	)
	const css = mutatePageCss(
		'background-color: var(--color-surface-default); /* floor-surface:feature-0 */',
		'background-color: var(--color-surface-muted); /* floor-surface:feature-0 */',
	)
	const findings = paint(html, css, goodPageTrace())

	assert.deepEqual(codesOf(findings), ['floor-pattern-attr-count'])
})

test('未知型之前的合法层仍比对：涂错则同时报 step-pattern-not-in-asset 与 surface-mismatch', () => {
	const html = `${goodPageHtml()}\n<section data-pattern="pricing.table-3"></section>\n`
	const extra = { id: 's4', pattern: 'pricing.table-3' }
	const trace = mutatePageTrace((t) => {
		t.sequence.steps.push(extra)
		t.sequence.approvedSteps.push(extra)
		t.paint.steps.push({ pattern: 'pricing.table-3', ownSurface: null, skippedBy: null })
	})
	const css = mutatePageCss(
		'background-color: var(--color-surface-default); /* floor-surface:feature-0 */',
		'background-color: var(--color-surface-muted); /* floor-surface:feature-0 */',
	)
	const findings = paint(html, css, trace)

	assert.deepEqual(codesOf(findings), ['surface-mismatch', 'step-pattern-not-in-asset'])
	assert.equal(findings.find((f) => f.code === 'surface-mismatch').at, 2, '第一层 feature 是序列第 2 步')
	assert.equal(findings.find((f) => f.code === 'step-pattern-not-in-asset').pattern, 'pricing.table-3')
})

test('未知型及其后的层不比对：后面涂错只报 step-pattern-not-in-asset', () => {
	const html = `${goodPageHtml()}\n<section data-pattern="pricing.table-3"></section>\n`
	const extra = { id: 's-unknown', pattern: 'pricing.table-3' }
	const trace = mutatePageTrace((t) => {
		t.sequence.steps.splice(1, 0, extra)
		t.sequence.approvedSteps.splice(1, 0, extra)
		t.paint.steps.splice(1, 0, { pattern: 'pricing.table-3', ownSurface: null, skippedBy: null })
	})
	const css = mutatePageCss(
		'background-color: var(--color-surface-default); /* floor-surface:feature-0 */',
		'background-color: var(--color-surface-muted); /* floor-surface:feature-0 */',
	)
	const findings = paint(html, css, trace)

	assert.deepEqual(codesOf(findings), ['step-pattern-not-in-asset'])
	assert.equal(findings[0].at, 1)
})

test('同型次数对不上只停该型：cta 涂错仍报 surface-mismatch', () => {
	const extra = { id: 's3', pattern: 'feature.grid-3-cards' }
	const trace = mutateCtaFirstTrace((t) => {
		t.sequence.steps.push(extra)
		t.sequence.approvedSteps.push(extra)
		t.paint.steps.push({ pattern: 'feature.grid-3-cards', ownSurface: 'default', skippedBy: null })
	})
	const css = mutateCtaFirstCss(
		'background-color: var(--color-surface-default); /* floor-surface:cta */',
		'background-color: var(--color-surface-muted); /* floor-surface:cta */',
	)
	const findings = paint(ctaFirstHtml(), css, trace)

	assert.deepEqual(codesOf(findings), ['surface-mismatch', 'floor-pattern-attr-count'])
	assert.equal(findings.find((f) => f.code === 'surface-mismatch').pattern, 'cta.centered-band')
	assert.equal(findings.find((f) => f.code === 'floor-pattern-attr-count').pattern, 'feature.grid-3-cards')
})

test('重算失败不比产物底色：surfaces 为空并涂错，只报 paint-recompute-failed', (t) => {
	const dir = copyFixtureAsset(t)
	const file = path.join(dir, 'floor-index.json')
	const index = JSON.parse(fs.readFileSync(file, 'utf8'))
	index.rhythm.surfaces = []
	fs.writeFileSync(file, JSON.stringify(index, null, 2))
	const trace = mutatePageTrace((tr) => {
		tr.paint.rhythm.surfaces = []
	})
	const css = mutatePageCss(
		'background-color: var(--color-surface-default); /* floor-surface:feature-0 */',
		'background-color: var(--color-surface-muted); /* floor-surface:feature-0 */',
	)
	const findings = paint(goodPageHtml(), css, trace, dir)

	assert.deepEqual(codesOf(findings), ['paint-recompute-failed'])
	assert.equal(findings[0].paintError, 'surfaces-empty')
})
