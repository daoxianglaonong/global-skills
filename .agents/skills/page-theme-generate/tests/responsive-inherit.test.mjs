/**
 * 第十道门 `responsive-inheritance`：缺观测的档必须在 trace 上声明，缺席即阻断。
 *
 * 冻结夹具三档全有实测，所以坏用例一律从**它的拷贝**派生：把某一档改成
 * `grid: { observed: false }`，一处改动就是一条会挂的输入。现役资产一个字节不动。
 *
 * 末尾两条是**接线**用例：只单独调门函数不算把门装上，从 `runAllGates` 摘掉那一行，
 * 前面所有用例照样全绿。
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { BreakpointMapError, checkResponsiveInheritance, mediaWidthPixels, readBreakpointMap, readPatternResponsive, unobservedBreakpointsOf } from '../scripts/lib/responsive-inherit.mjs'
import { gateResponsiveInheritance, runAllGates } from '../scripts/lib/gates.mjs'
import { lintFloor } from '../scripts/lint-floor.mjs'
import { loadClosedSet } from '../scripts/lib/closed-set.mjs'
import { scanArtifact } from '../scripts/lib/css-scan.mjs'
import { FIXTURE_ASSET, copyFixtureAsset, goodCss, goodHtml, goodTrace, mutateCss } from './helpers.mjs'

const FLOOR = 'feature.grid-3-cards'

/** 把夹具拷贝里某几档改成「没有实测几何」。一处改动 = 一条会挂的输入。 */
function assetWithUnobserved(t, breakpoints) {
	const dir = copyFixtureAsset(t)
	const file = path.join(dir, 'patterns', `${FLOOR}.yaml`)
	let text = fs.readFileSync(file, 'utf8')
	for (const bp of breakpoints) {
		const re = new RegExp(`^  ${bp}:.*$`, 'm')
		if (!re.test(text)) throw new Error(`夹具 pattern 里找不到 ${bp} 档，坏用例造不出来`)
		text = text.replace(re, `  ${bp}: { columns: 1, grid: { observed: false, confidence: low } }`)
	}
	fs.writeFileSync(file, text)
	return dir
}

/** 从合格 trace 派生：给那一层挂上缺测档声明，不手写第二份 trace。 */
function traceDeclaring(list, floorId = FLOOR) {
	const trace = structuredClone(goodTrace())
	const floor = trace.floors.find((f) => f.id === floorId) ?? { id: floorId, fields: [] }
	floor.unobservedBreakpoints = list
	if (!trace.floors.includes(floor)) trace.floors.push(floor)
	return trace
}

const check = (assetDir, trace, html = goodHtml()) => checkResponsiveInheritance({ html, trace, assetDir })
const codesOf = (findings) => findings.map((f) => f.code)

test('readPatternResponsive：内容楼层查 patterns/<id>.yaml，页壳查 chrome.yaml，未知型返回 null', () => {
	assert.equal(readPatternResponsive(FIXTURE_ASSET, FLOOR).pc.grid.columns, 3)
	assert.equal(readPatternResponsive(FIXTURE_ASSET, 'navbar.utility-left').mobile.grid.columns, 2)
	assert.equal(readPatternResponsive(FIXTURE_ASSET, 'pricing.table-3'), null)
})

test('unobservedBreakpointsOf 只认显式的 grid.observed: false', () => {
	assert.deepEqual([...unobservedBreakpointsOf(readPatternResponsive(FIXTURE_ASSET, FLOOR))], [])
	assert.deepEqual([...unobservedBreakpointsOf({ tablet: { grid: { observed: false } }, mobile: { grid: { columns: 1 } } })], ['tablet'])
})

test('三档全有实测时本门不开口', () => {
	assert.deepEqual(check(FIXTURE_ASSET, goodTrace()), [])
})

test('inherit-undeclared：tablet / mobile 缺测而 trace 一条都没登', (t) => {
	const dir = assetWithUnobserved(t, ['tablet', 'mobile'])
	const findings = check(dir, goodTrace())

	assert.deepEqual(codesOf(findings), ['inherit-undeclared', 'inherit-undeclared'])
	assert.deepEqual(
		findings.map((f) => f.breakpoint),
		['tablet', 'mobile'],
	)
	assert.equal(findings[0].pattern, FLOOR)
})

test('两档都登齐了就放行：一档继承 pc、一档声明不继承', (t) => {
	const dir = assetWithUnobserved(t, ['tablet', 'mobile'])
	const trace = traceDeclaring([
		{ breakpoint: 'tablet', inheritFrom: 'pc' },
		{ breakpoint: 'mobile', inheritFrom: null },
	])
	assert.deepEqual(check(dir, trace), [])
})

test('inherit-undeclared：只登了一档，另一档照挂', (t) => {
	const dir = assetWithUnobserved(t, ['tablet', 'mobile'])
	const findings = check(dir, traceDeclaring([{ breakpoint: 'tablet', inheritFrom: 'pc' }]))

	assert.deepEqual(codesOf(findings), ['inherit-undeclared'])
	assert.equal(findings[0].breakpoint, 'mobile')
})

test('inherit-source-invalid：来源档同样缺测', (t) => {
	const dir = assetWithUnobserved(t, ['tablet', 'mobile'])
	const trace = traceDeclaring([
		{ breakpoint: 'tablet', inheritFrom: 'pc' },
		{ breakpoint: 'mobile', inheritFrom: 'tablet' },
	])
	const findings = check(dir, trace)

	assert.deepEqual(codesOf(findings), ['inherit-source-invalid'])
	assert.equal(findings[0].breakpoint, 'mobile')
	assert.equal(findings[0].inheritFrom, 'tablet')
})

test('inherit-source-invalid：键缺席、指向自己、非三档名，三种同判', (t) => {
	const dir = assetWithUnobserved(t, ['mobile'])
	const one = (entry) => codesOf(check(dir, traceDeclaring([entry])))

	assert.deepEqual(one({ breakpoint: 'mobile' }), ['inherit-source-invalid'], 'inheritFrom 键缺席不等于 null：选填字段等于没有字段')
	assert.deepEqual(one({ breakpoint: 'mobile', inheritFrom: 'mobile' }), ['inherit-source-invalid'])
	assert.deepEqual(one({ breakpoint: 'mobile', inheritFrom: 'desktop' }), ['inherit-source-invalid'])
	assert.deepEqual(one({ breakpoint: 'mobile', inheritFrom: null }), [], 'null 是「不继承」的正当写法')
})

test('inherit-breakpoint-observed：给一个有实测的档登无实测，挡下「三档全登一遍」', () => {
	const findings = check(FIXTURE_ASSET, traceDeclaring([{ breakpoint: 'tablet', inheritFrom: 'pc' }]))

	assert.deepEqual(codesOf(findings), ['inherit-breakpoint-observed'])
	assert.equal(findings[0].breakpoint, 'tablet')
})

test('inherit-breakpoint-observed：三档外的名字同判', () => {
	assert.deepEqual(codesOf(check(FIXTURE_ASSET, traceDeclaring([{ breakpoint: 'wide', inheritFrom: 'pc' }]))), ['inherit-breakpoint-observed'])
})

test('inherit-floor-absent：登的那一层不在产物里', (t) => {
	const dir = assetWithUnobserved(t, ['mobile'])
	const trace = traceDeclaring([{ breakpoint: 'mobile', inheritFrom: 'pc' }])
	trace.floors.push({ id: 'cta.centered-band', fields: [], unobservedBreakpoints: [{ breakpoint: 'mobile', inheritFrom: 'pc' }] })

	const findings = check(dir, trace)
	assert.deepEqual(codesOf(findings), ['inherit-floor-absent'])
	assert.equal(findings[0].pattern, 'cta.centered-band')
})

test('inherit-pattern-unreadable：产物层根写了一个资产里没有的型', () => {
	const html = `${goodHtml()}\n<section data-pattern="pricing.table-3"></section>\n`
	const findings = check(FIXTURE_ASSET, goodTrace(), html)

	assert.deepEqual(codesOf(findings), ['inherit-pattern-unreadable'])
	assert.equal(findings[0].pattern, 'pricing.table-3')
})

test('no-input：漏传 html 不得伪装成「没声明」', () => {
	assert.deepEqual(codesOf(gateResponsiveInheritance({ trace: goodTrace(), assetDir: FIXTURE_ASSET })), ['no-input'])
})

test('trace 或 assetDir 缺席时整门不开口', () => {
	assert.deepEqual(gateResponsiveInheritance({ html: goodHtml(), trace: null, assetDir: FIXTURE_ASSET }), [])
	assert.deepEqual(gateResponsiveInheritance({ html: goodHtml(), trace: goodTrace(), assetDir: null }), [])
})

test('接线：runAllGates 会带上 responsive-inheritance', (t) => {
	const dir = assetWithUnobserved(t, ['mobile'])
	const closedSet = loadClosedSet(dir)
	const { declarations } = scanArtifact({ html: goodHtml(), htmlFile: 'floor.html', css: [{ file: 'floor.css', text: goodCss() }] })
	const findings = runAllGates({ declarations, closedSet, trace: goodTrace(), assetDir: dir, html: goodHtml() })

	assert.deepEqual(
		findings.filter((f) => f.gate === 'responsive-inheritance').map((f) => f.code),
		['inherit-undeclared'],
	)
})

test('接线：lintFloor 整趟因缺声明而红，声明补齐后转绿', (t) => {
	const dir = assetWithUnobserved(t, ['mobile'])
	const artifact = { assetDir: dir, html: goodHtml(), css: [{ file: 'floor.css', text: goodCss() }] }

	const red = lintFloor({ ...artifact, trace: goodTrace() })
	assert.equal(red.verdict, 'blocked')
	assert.deepEqual(
		red.findings.map((f) => f.gate),
		['responsive-inheritance'],
	)

	const green = lintFloor({ ...artifact, trace: traceDeclaring([{ breakpoint: 'mobile', inheritFrom: 'pc' }]) })
	assert.equal(green.verdict, 'pass', JSON.stringify(green.findings))
})

/* ------------------------------------------------------------------ *
 * T6：断点声明值映射进 tokens.json 之后，本门多守的三件事               *
 * ------------------------------------------------------------------ */

/** 带 CSS 原文调门。合格夹具 CSS 有两条 `@media`（1023 / 767），数值那一半才开口。 */
const checkCss = (assetDir, cssText, trace = goodTrace(), html = goodHtml()) =>
	checkResponsiveInheritance({ html, css: [{ file: 'floor.css', text: cssText }], trace, assetDir })

/** 把夹具拷贝的 `breakpoints` 组整个摘掉：机读副本缺席的那一条会挂的输入。 */
function assetWithoutBreakpoints(t) {
	const dir = copyFixtureAsset(t)
	const file = path.join(dir, 'tokens.json')
	const doc = JSON.parse(fs.readFileSync(file, 'utf8'))
	if (!doc.breakpoints) throw new Error('夹具 tokens.json 里本就没有 breakpoints 组，坏用例造不出来')
	delete doc.breakpoints
	fs.writeFileSync(file, `${JSON.stringify(doc, null, 2)}\n`)
	return dir
}

test('readBreakpointMap：代表值与 aliases 同待遇，slots 跟着值走', () => {
	const map = readBreakpointMap(FIXTURE_ASSET)

	assert.deepEqual([...map.keys()].sort((a, b) => a - b), [767, 768, 1023, 1024])
	assert.deepEqual([...map.get(767).slots], ['mobile'], 'alias 767 与代表值 768 同一档')
	assert.deepEqual([...map.get(1024).slots], ['tablet'])
})

test('mediaWidthPixels：读得出 px 的记数，读不出的记 null 而不是丢掉', () => {
	const hits = mediaWidthPixels([{ file: 'a.css', text: '@media (max-width: 767px){a{color:red}}\n@media (max-width:47.9375em){a{color:red}}' }])

	assert.deepEqual(hits.map((h) => h.px), [767, null])
})

test('产物一条 `@media` 都没有时，数值那一半不开口', () => {
	assert.deepEqual(checkCss(FIXTURE_ASSET, '.a { color: var(--color-text-default); }'), [])
})

test('合格夹具 CSS 的两条 `@media` 都查得到表', () => {
	assert.deepEqual(checkCss(FIXTURE_ASSET, goodCss()), [])
})

test('breakpoint-map-unreadable：资产没有 breakpoints 组，判不出就不放行', (t) => {
	const dir = assetWithoutBreakpoints(t)
	const findings = checkCss(dir, goodCss())

	assert.deepEqual(codesOf(findings), ['breakpoint-map-unreadable'])
	assert.match(findings[0].reason, /breakpoints/)
	assert.throws(() => readBreakpointMap(dir), BreakpointMapError)
})

test('breakpoint-value-unmapped：臆造一个站点没声明过的断点数字', () => {
	const findings = checkCss(FIXTURE_ASSET, mutateCss('@media (max-width: 1023px)', '@media (max-width: 900px)'))

	assert.deepEqual(codesOf(findings), ['breakpoint-value-unmapped'])
	assert.equal(findings[0].px, 900)
	assert.equal(findings[0].file, 'floor.css')
})

test('breakpoint-value-unmapped：换成 em 写同一处换档，不许免检', () => {
	const findings = checkCss(FIXTURE_ASSET, mutateCss('@media (max-width: 1023px)', '@media (max-width: 63.9375em)'))

	assert.deepEqual(codesOf(findings), ['breakpoint-value-unmapped'])
	assert.equal(findings[0].px, null)
})

test('inherit-null-media-written：声明这一档不出断点值，产物却给这一档写了 @media', (t) => {
	const dir = assetWithUnobserved(t, ['mobile'])
	const trace = traceDeclaring([{ breakpoint: 'mobile', inheritFrom: null }])
	const findings = checkCss(dir, goodCss(), trace)

	assert.deepEqual(codesOf(findings), ['inherit-null-media-written'])
	assert.equal(findings[0].breakpoint, 'mobile')
	assert.equal(findings[0].pattern, FLOOR)

	const inherited = checkCss(dir, goodCss(), traceDeclaring([{ breakpoint: 'mobile', inheritFrom: 'pc' }]))
	assert.deepEqual(inherited, [], '继承自 pc 与产物里有 mobile @media 不矛盾，本门不判继承得对不对')
})

test('inherit-null-media-written：产物删掉那一档的 @media 就转绿', (t) => {
	const dir = assetWithUnobserved(t, ['mobile'])
	const css = goodCss().slice(0, goodCss().indexOf('@media (max-width: 767px)'))

	assert.deepEqual(checkCss(dir, css, traceDeclaring([{ breakpoint: 'mobile', inheritFrom: null }])), [])
})

test('档映射有歧义时不判：同一个值划两档的，inherit-null-media-written 闭嘴', (t) => {
	const dir = assetWithUnobserved(t, ['mobile'])
	const file = path.join(dir, 'tokens.json')
	const doc = JSON.parse(fs.readFileSync(file, 'utf8'))
	doc.breakpoints['768'].$extensions['page-theme'].breakpoint.slots = ['mobile', 'tablet']
	fs.writeFileSync(file, `${JSON.stringify(doc, null, 2)}\n`)

	assert.deepEqual(checkCss(dir, goodCss(), traceDeclaring([{ breakpoint: 'mobile', inheritFrom: null }])), [])
})

test('接线：runAllGates 把 css 原文带给门十', (t) => {
	const dir = assetWithoutBreakpoints(t)
	const css = [{ file: 'floor.css', text: goodCss() }]
	const closedSet = loadClosedSet(dir)
	const { declarations } = scanArtifact({ html: goodHtml(), htmlFile: 'floor.html', css })
	const findings = runAllGates({ declarations, closedSet, trace: goodTrace(), assetDir: dir, html: goodHtml(), css })

	assert.deepEqual(
		findings.filter((f) => f.gate === 'responsive-inheritance').map((f) => f.code),
		['breakpoint-map-unreadable'],
	)
})

test('接线：lintFloor 整趟因臆造断点数字而红，改回资产声明值后转绿', () => {
	const artifact = { assetDir: FIXTURE_ASSET, html: goodHtml(), trace: goodTrace() }

	const red = lintFloor({ ...artifact, css: [{ file: 'floor.css', text: mutateCss('@media (max-width: 767px)', '@media (max-width: 640px)') }] })
	assert.equal(red.verdict, 'blocked')
	assert.deepEqual(
		red.findings.map((f) => f.code),
		['breakpoint-value-unmapped'],
	)

	const green = lintFloor({ ...artifact, css: [{ file: 'floor.css', text: goodCss() }] })
	assert.equal(green.verdict, 'pass', JSON.stringify(green.findings))
})
