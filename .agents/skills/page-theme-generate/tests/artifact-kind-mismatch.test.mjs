/**
 * `artifact-kind-mismatch`：声明与产物打架（`R5-B1`）。
 *
 * `R4-15` 把粒度从「按层根数猜」换成「读 `trace.artifact.kind`」，误伤没了，谎报空间是新开的：
 * 把 `kind: "floor"` 写在整页上，页级两维（`page-sequence-missing`、`page-shell-ends-missing` /
 * `body-start-out-of-envelope`）整块闭嘴，门一声不响。本码只补这一个口子。
 *
 * **本码不是把启发式请回来当粒度判据。** 声明仍是唯一信源：本码一次都不推断 kind，只在声明说
 * 「不是页」而产物两端各挂着一件页壳时报。判据里没有层根数阈值——`roots.length >= 2` 只是
 * 「一个层根不能同时是首也是末」这个退化保护（降到 1 结论不变，升上去只会少判）。下面
 * 「不按层根数猜」两条钉的就是这件事：4 层片段放行、2 层页壳照报，层数不是判据。
 *
 * 反向（声明 `page` 而产物只有一层 / 没有页壳）**有意不判**，三条理由在末段那条用例里。
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { lintFloor } from '../scripts/lint-floor.mjs'
import { gateLayoutEnvelope, gatePaintConsistency } from '../scripts/lib/gates.mjs'
import { checkArtifactKindMismatch } from '../scripts/lib/artifact-kind.mjs'
import { parseFloorRoots } from '../scripts/lib/paint-floors.mjs'
import { scanArtifact } from '../scripts/lib/css-scan.mjs'
import { loadClosedSet } from '../scripts/lib/closed-set.mjs'
import { FIXTURE_ASSET, goodCss, goodHtml, goodPageCss, goodPageHtml, goodTrace, ctaFirstCss, ctaFirstHtml, kindTrace, mutatePageTrace } from './helpers.mjs'

const codesOf = (findings) => findings.map((f) => f.code)

const paint = (html, css, trace, assetDir = FIXTURE_ASSET) => {
	const closedSet = loadClosedSet(assetDir)
	const { declarations } = scanArtifact({ html, htmlFile: 'page.html', css: [{ file: 'page.css', text: css }] })
	return gatePaintConsistency({ html, declarations, closedSet, trace, assetDir })
}

const lintPage = (html, css, trace, assetDir = FIXTURE_ASSET) => lintFloor({ assetDir, html, css: [{ file: 'page.css', text: css }], trace })

const stripNavbar = (html) => html.replace(/<header class="pt-navbar"[\s\S]*?<\/header>\s*/, '')
const stripFooter = (html) => html.replace(/<footer class="pt-footer"[\s\S]*?<\/footer>\s*/, '')

const NAVBAR = '<header class="pt-navbar" data-pattern="navbar.utility-left"></header>\n'
const FOOTER = '<footer class="pt-footer" data-pattern="footer.compact-three"></footer>\n'
const HERO = '<section class="pt-hero" data-pattern="hero.centered-pitch"></section>\n'

/* ── 主判据：声明不是页，产物两端各挂一件页壳 ───────────────────────────────── */

test('声明 floor 的 5 层整页：报 artifact-kind-mismatch', () => {
	const findings = paint(goodPageHtml(), goodPageCss(), kindTrace('floor'))

	assert.deepEqual(codesOf(findings), ['artifact-kind-mismatch'])
	assert.equal(findings[0].gate, 'paint-consistency')
	assert.equal(findings[0].level, 'block')
	assert.equal(findings[0].kind, 'floor')
	assert.deepEqual(findings[0].shell, { first: 'navbar.utility-left', last: 'footer.compact-three' })
})

test('声明 component 与声明 floor 同判：两个非页粒度都在射程内', () => {
	assert.deepEqual(codesOf(paint(goodPageHtml(), goodPageCss(), kindTrace('component'))), ['artifact-kind-mismatch'])
})

test('带 sequence 的整页把 kind 改成 floor：本码照开，涂色那一族仍全绿', () => {
	// 无 sequence 那一支走的是 `page-sequence-missing` 前面的早退路径，带 sequence 走的是主流程。
	// 两条都必须开口，否则「补一条 sequence」就成了关掉本码的办法。
	const trace = mutatePageTrace((t) => {
		t.artifact.kind = 'floor'
	})
	assert.deepEqual(codesOf(paint(goodPageHtml(), goodPageCss(), trace)), ['artifact-kind-mismatch'])
})

test('接线：lintFloor 上只亮这一条，粒度声明错换来的不再是「别的维不判」', () => {
	const r = lintPage(goodPageHtml(), goodPageCss(), kindTrace('floor'))

	assert.equal(r.verdict, 'blocked')
	assert.deepEqual(
		r.findings.map((f) => [f.gate, f.code]),
		[['paint-consistency', 'artifact-kind-mismatch']],
	)
})

test('只有页壳两件的产物同样算整页：navbar + footer 两个层根', () => {
	// 两端都是页壳、中间什么都没有，这不是楼层片段而是一张没写正文的页。
	assert.deepEqual(codesOf(paint(NAVBAR + FOOTER, '', kindTrace('floor'))), ['artifact-kind-mismatch'])
})

/* ── 不误伤：合法产物一条都不许报 ──────────────────────────────────────────── */

test('不按层根数猜（一）：4 层、navbar 打头但没有页脚的片段，声明 floor 放行', () => {
	// 这一份正是 `copied-layout-envelope.test.mjs` 里那条 `pass: true` 的对照案。只差一件页壳就
	// 放行，看着「漏」——但把它判红就得靠层根数，那正是 `R4-15` 删掉的那把尺。
	const html = stripFooter(goodPageHtml())
	assert.equal((html.match(/data-pattern=/g) || []).length, 4, '派生后必须还剩 4 层，否则验的不是「多层也放行」')
	assert.deepEqual(paint(html, goodPageCss(), kindTrace('floor')), [])
})

test('不按层根数猜（二）：4 层、footer 收尾但没有顶栏的片段，声明 floor 放行', () => {
	const html = stripNavbar(goodPageHtml())
	assert.equal((html.match(/data-pattern=/g) || []).length, 4)
	assert.deepEqual(paint(html, goodPageCss(), kindTrace('floor')), [])
})

test('单件页壳的楼层片段放行：只做一个 navbar、只做一个 footer 都是正当产物', () => {
	assert.deepEqual(paint(NAVBAR, '', kindTrace('floor')), [])
	assert.deepEqual(paint(FOOTER, '', kindTrace('floor')), [])
})

test('页壳排在中间不算两端：navbar 与 footer 都在，但产物首末不是它们', () => {
	// 首末两端才是判据。错位本身另有 `page-shell-out-of-order`（包络门）管，本码不抢它的活。
	assert.deepEqual(paint(HERO + NAVBAR + FOOTER + HERO, '', kindTrace('floor')), [])
})

test('现役合格夹具一条不报：单层 floor、两层 cta 片段、页级 trace', () => {
	assert.deepEqual(paint(goodHtml(), goodCss(), goodTrace()), [], '单层 feature 片段自称 floor')
	assert.deepEqual(paint(ctaFirstHtml(), ctaFirstCss(), kindTrace('floor')), [], 'cta + feature 两层片段，无页壳')
	assert.deepEqual(codesOf(paint(goodPageHtml(), goodPageCss(), kindTrace('page'))), ['page-sequence-missing'], '声明 page 的整页不进本码射程')
})

test('声明是唯一信源：没给 trace 时不推断粒度，也就没有可打架的声明', () => {
	assert.deepEqual(paint(goodPageHtml(), goodPageCss(), null), [])
})

test('粒度判不出时不比形态：闭集外的 kind 只报 artifact-kind-missing', () => {
	// 判不出粒度就没有「声明」可与产物对照。两条同时报会让人以为门知道它该是什么。
	const bad = kindTrace('page')
	bad.artifact.kind = 'section'
	assert.deepEqual(codesOf(paint(goodPageHtml(), goodPageCss(), bad)), ['artifact-kind-missing'])
	assert.deepEqual(codesOf(paint(goodPageHtml(), goodPageCss(), kindTrace(null))), ['artifact-kind-missing'])

	// 门那一侧「先报 missing 再早退」也会让上面两条绿，所以判据源要单独再问一遍：闸门本身
	// 必须是白名单（只放 floor / component 进射程），不能是「除了 page 都判」。
	const roots = parseFloorRoots(goodPageHtml())
	assert.equal(checkArtifactKindMismatch({ roots, trace: bad, assetDir: FIXTURE_ASSET }).length, 0, 'kind 在闭集外 → 判不出粒度，不比形态')
	assert.equal(checkArtifactKindMismatch({ roots, trace: null, assetDir: FIXTURE_ASSET }).length, 0, '压根没给 trace → 没有声明可打架')
})

test('型记录取不到就不开口：层根不在资产 floors[] 里时误报方向偏放行', () => {
	const html = '<header data-pattern="navbar.not-in-asset"></header>\n' + FOOTER
	assert.deepEqual(paint(html, '', kindTrace('floor')), [])
})

test('反向不判：声明 page 的单层 / 无页壳产物，本码一条都不报', () => {
	// 三条理由：① `R4-15` 案 ⑤ 已钉死「只有一层的页」是合法形状，层根数证伪不了 page 声明；
	// ② 声明 page 而缺页壳已由 `page-shell-ends-missing` 接管，修法是补层，本码的修法是改声明，
	//    同一份缺陷发两个修法相反的码，下游分不开该做哪个（`R4-07`）；③ 0 层根的页由
	//    `floor-pattern-attr-missing` / `page-sequence-missing` 接管。
	for (const html of [HERO, ctaFirstHtml(), '']) {
		assert.equal(codesOf(paint(html, '', kindTrace('page'))).includes('artifact-kind-mismatch'), false, '声明 page 的产物形态不足，归别的码，不归本码')
	}
})

test('判据源可单独喂：checkArtifactKindMismatch 不经过门也能被判真假', () => {
	const roots = parseFloorRoots(goodPageHtml())
	assert.equal(checkArtifactKindMismatch({ roots, trace: kindTrace('floor'), assetDir: FIXTURE_ASSET }).length, 1)
	assert.equal(checkArtifactKindMismatch({ roots, trace: kindTrace('page'), assetDir: FIXTURE_ASSET }).length, 0)
	assert.equal(checkArtifactKindMismatch({ roots, trace: kindTrace('floor'), assetDir: null }).length, 0, '没有资产就查不到 taxonomy，不猜')
})

/* ── `artifact-kind-missing` 在 G1 的双开：裁定「保持双开」，两处谓词不同 ──────── */

test('双开裁决（一）：trace 带 sequence 却缺 kind 时，只有 layout-envelope 开口', () => {
	// 这是 CLI 真入口上就到得了的输入，也是「两处不是同一条判据打印两次」的直接证据：
	// `paint-consistency` 的谓词是「无 sequence ∧ kind 读不出」，带了 sequence 它按定义闭嘴。
	const trace = mutatePageTrace((t) => {
		delete t.artifact.kind
	})
	const r = lintPage(goodPageHtml(), goodPageCss(), trace)

	assert.deepEqual(
		r.findings.map((f) => [f.gate, f.code]),
		[['layout-envelope', 'artifact-kind-missing']],
	)
})

test('双开裁决（二）：无 sequence 又缺 kind 时两处各发一条，同码不同 gate', () => {
	const r = lintPage(goodPageHtml(), goodPageCss(), kindTrace(null))

	assert.deepEqual(new Set(codesOf(r.findings)), new Set(['artifact-kind-missing']))
	assert.deepEqual(
		r.findings.map((f) => f.gate).sort(),
		['layout-envelope', 'paint-consistency'],
	)
})

test('双开裁决（三）：html 未传时反过来只有 paint-consistency 开口', () => {
	// 合并（让 paint-check 闭嘴）之后这一路就再也喂不进一份会挂的输入——`page-sequence-missing`
	// 要 `kind === 'page'`、`surface-*` 一族要有 sequence，两条都绕开了「粒度判不出」这个分支。
	const trace = kindTrace(null)
	assert.deepEqual(codesOf(gatePaintConsistency({ html: undefined, trace, assetDir: FIXTURE_ASSET })), ['artifact-kind-missing'])
	assert.deepEqual(gateLayoutEnvelope({ html: undefined, trace, assetDir: FIXTURE_ASSET }), [])
})
