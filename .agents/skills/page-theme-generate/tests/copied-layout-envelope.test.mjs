/**
 * 包络门两侧**逐字同源**的对照锁。写法照 `copied-value-rows.test.mjs`，但多锁一层。
 *
 * 只锁字节不够：两份判据字节相同、喂进去的包络夹具不同，同一份产物照样能一侧红一侧绿；
 * 只锁行为也不够：两份实现各写各的、碰巧在这几条输入上一致，下一条输入就分家。所以三样都锁——
 * **判据字节相同 · 包络夹具字节相同 · 同一批输入上产出逐字相同**，最后一条还必须在**非空**
 * findings 上成立，否则「两边都返回空数组」也能算通过，锁等于没上。
 *
 * 同源设计的固有成本就是改一处要同步两处。这个测试不是可选项：判据一分叉，票面那句
 * 「同一份越界产物两侧同样退 1」当场失效，而分叉不会有任何一侧报错。
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { scanArtifact } from '../scripts/lib/css-scan.mjs'
import { checkLayoutEnvelope as ours } from '../scripts/lib/layout-envelope-gate.mjs'
import { SCRIPTS_DIR, copyFixtureAsset, ctaFirstCss, ctaFirstHtml, goodPageCss, goodPageHtml, kindTrace, patchFloorIndex, writeLayoutEnvelope } from './helpers.mjs'

const GENERATE_LIB = path.join(SCRIPTS_DIR, 'lib')
const AUDIT_ROOT = path.resolve(import.meta.dirname, '..', '..', 'page-theme-audit')
const AUDIT_LIB = path.join(AUDIT_ROOT, 'scripts', 'lib')
const COPIED = ['layout-envelope-gate.mjs', 'paint-floors.mjs']

const theirs = (await import(pathToFileURL(path.join(AUDIT_LIB, 'layout-envelope-gate.mjs')).href)).checkLayoutEnvelope

test('判据与层根解析与 page-theme-audit 那两份逐字节相同', () => {
	for (const name of COPIED) {
		const a = fs.readFileSync(path.join(GENERATE_LIB, name))
		const b = fs.readFileSync(path.join(AUDIT_LIB, name))
		assert.ok(a.equals(b), `${name} 与 audit 不一致（generate=${a.length} audit=${b.length}）`)
	}
})

test('包络夹具与 page-theme-audit 那份逐字节相同', () => {
	const a = fs.readFileSync(path.join(import.meta.dirname, 'fixtures', 'layout-envelope.fixture.json'))
	const b = fs.readFileSync(path.join(AUDIT_ROOT, 'tests', 'fixtures', 'layout-envelope.fixture.json'))
	assert.ok(a.equals(b), '两侧判据相同但喂的包络不同，仍然验不出同源')
})

/** 摘掉页脚层根。摘不掉就抛：静默摘不掉会让「整页缺页壳」那一案退化成第二份合格页。 */
function stripFooter(html) {
	const out = html.replace(/<footer class="pt-footer"[\s\S]*?<\/footer>\s*/, '')
	if (out === html) throw new Error('页级夹具里摘不掉页脚层根，缺页壳那一案造不出来')
	return out
}

/**
 * 七维九码各一条会挂的输入（维四两码见 `R4-13`，粒度声明那码见 `R4-15`）+ 一条合格输入
 * + 两条读不动的输入 + 一条「声明 floor 的多层片段」的对照。
 *
 * 每一案都带 `trace`：粒度自 `R4-15` 起由 `artifact.kind` 定，不带声明的输入两侧都会先挨
 * `artifact-kind-missing`，那样后面几维验的就不是它们自己了。
 */
function cases(t) {
	const make = ({ floorIndex, envelope } = {}) => {
		const dir = copyFixtureAsset(t)
		writeLayoutEnvelope(dir, envelope)
		if (floorIndex) patchFloorIndex(dir, floorIndex)
		return dir
	}
	const page = { html: goodPageHtml(), css: goodPageCss(), trace: kindTrace('page') }
	const broken = make()
	fs.writeFileSync(path.join(broken, 'layout-envelope.json'), '{')
	const noIndex = make()
	fs.writeFileSync(path.join(noIndex, 'floor-index.json'), '{')

	return [
		{ label: '合格页', assetDir: make(), ...page },
		{ label: '维一 容器模式', assetDir: make({ floorIndex: (d, by) => { by.get('feature.grid-3-cards').container.mode = 'breakout' } }), ...page },
		{ label: '维二 容器宽', assetDir: make({ floorIndex: (d, by) => { delete by.get('feature.grid-3-cards').container.maxWidthPx } }), ...page },
		{ label: '维三 并层间距', assetDir: make(), html: page.html, css: `${page.css}\n.pt-feature-grid--muted {\n\tmargin-top: -24px;\n}\n`, trace: page.trace },
		{
			label: '维四 页壳错位',
			assetDir: make(),
			html: page.html.replace('<section class="pt-feature-grid pt-feature-grid--default"', '<header class="pt-navbar" data-pattern="navbar.utility-left"></header>\n<section class="pt-feature-grid pt-feature-grid--default"'),
			css: page.css,
			trace: page.trace,
		},
		{
			// `R4-13` 新增的一案：维四第二个 code。缺页壳与页壳错位是两种缺陷，两侧都得同样判得出来，
			// 光靠上一案（错位）过不了这一条——所以行为层多这一案，`blockedCases` 由 9 变 10。
			label: '维四 整页缺页壳',
			assetDir: make(),
			html: stripFooter(page.html),
			css: page.css,
			trace: page.trace,
		},
		{
			label: '维五 浮层进序列',
			assetDir: make({ floorIndex: (d, by) => d.floors.push({ ...JSON.parse(JSON.stringify(by.get('navbar.utility-left'))), id: 'float-widget.service-rail', taxonomy: 'float-widget' }) }),
			html: page.html.replace('<footer class="pt-footer"', '<aside class="pt-rail" data-pattern="float-widget.service-rail"></aside>\n<footer class="pt-footer"'),
			css: page.css,
			trace: page.trace,
		},
		{ label: '维六 正文起手', assetDir: make(), html: ctaFirstHtml(), css: ctaFirstCss(), trace: page.trace },
		{ label: '维七 跳过归属', assetDir: make({ floorIndex: (d, by) => { by.get('hero.centered-pitch').paint.participatesInCount = true } }), ...page },
		{
			// `R4-15` 新增：给了 trace 却没有闭集内的 `artifact.kind`。两侧都必须判不出粒度就不放行，
			// 一侧退回「按层根数猜」就是又一次分家，而分家不会有任何一侧报错。
			label: '粒度声明缺席',
			assetDir: make(),
			html: page.html,
			css: page.css,
			trace: kindTrace(null),
		},
		{
			// `R4-15` 的对照案（票面代价段点名要加）：同一份多层片段声明 floor，两侧都必须闭嘴。
			// 上面「维四 整页缺页壳」与这一案的 HTML 差别只在页脚，判定差别却来自声明——这一对
			// 并排才证明粒度真的读了 `kind`，不是碰巧两侧都不开口。
			label: '声明 floor 的多层片段',
			assetDir: make(),
			html: stripFooter(page.html),
			css: page.css,
			trace: kindTrace('floor'),
			pass: true,
		},
		{ label: '包络解不开', assetDir: broken, ...page },
		{ label: 'floor-index 读不出', assetDir: noIndex, ...page },
	]
}

test('同一批输入上两侧产出逐字相同，且确实判出了东西', (t) => {
	let blockedCases = 0
	let totalFindings = 0
	for (const c of cases(t)) {
		const { declarations } = scanArtifact({ html: c.html, htmlFile: 'page.html', css: [{ file: 'page.css', text: c.css }] })
		const input = { htmlFiles: [{ file: 'page.html', text: c.html }], declarations, assetDir: c.assetDir, trace: c.trace }
		const a = ours(input)
		const b = theirs(input)
		assert.equal(JSON.stringify(a), JSON.stringify(b), `${c.label}：两侧判据已经分叉`)
		if (a.status === 'blocked') blockedCases += 1
		totalFindings += a.findings.length
	}
	// 10 → 11 是 `R4-15` 加了「粒度声明缺席」那一案。同趟还加了「声明 floor 的多层片段」，它是
	// **第二条 pass**：十三条输入里 pass 的是「合格页」与它，其余十一条阻断。两条 pass 都不是
	// 「两边都返回空数组」的空转——前者是整页合规，后者是同一份缺页脚 HTML 换个声明就该闭嘴，
	// 与「维四 整页缺页壳」那一案 HTML 相同、判定相反。
	assert.equal(blockedCases, 11, '十三条输入里该有十一条是阻断的')
	assert.ok(totalFindings >= 11)
})
