/**
 * 迁移门里**色值那两道**（`accept-fulfillment` / `literal-verdict-backing`）与 `content-lock`，
 * 外加色侧准入：每道正例 + 每个 code 一条真会挂的输入。不许有空门。
 *
 * 另两道非色门（`type-accept-fulfillment` / `type-literal-backing`）与 `--type-verdicts`
 * 那一串准入在 `migration-type.test.mjs`，`structure-lock` 在 `migration-structure.test.mjs`，
 * `breakpoint-lock` 与 `theme-api-lock` 各在 `migration-breakpoint.test.mjs` /
 * `migration-theme-api.test.mjs`。五份分开，是因为坏输入的造法不同：色侧改 hex，非色侧改
 * 维度与字体栈，结构侧改标签本身，断点侧只动 `@media` 前奏，主题 API 侧要同时动裁决记录与
 * 产物，混在一份里会让「只这一处也会挂」变成两处违例。
 *
 * 内容锁在本文件里覆盖六条标签序列（含 `srcset` / `poster`）与 CSS `url()` 那半边。
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { lintMigration, decideMigrationVerdict } from '../scripts/lint-migration.mjs'
import {
	MIGRATION_GATE_ORDER,
	gateAcceptFulfillment,
	gateLiteralVerdictBacking,
	gateContentLock,
} from '../scripts/lib/migration-gates.mjs'
import { scanCss, scanHtml } from '../scripts/lib/css-scan.mjs'
import { gateColorLiteral } from '../scripts/lib/gates.mjs'
import { loadClosedSet } from '../scripts/lib/closed-set.mjs'
import { FIXTURE_ASSET } from './helpers.mjs'

const FIX = path.join(import.meta.dirname, 'fixtures', 'migration')
const closedSet = loadClosedSet(FIXTURE_ASSET)

const read = (rel) => fs.readFileSync(path.join(FIX, rel), 'utf8')

function fixtureInput(overrides = {}) {
	return {
		assetDir: FIXTURE_ASSET,
		beforeFiles: [
			{ rel: 'floor-good.html', text: read('before/floor-good.html') },
			{ rel: 'floor-good.css', text: read('before/floor-good.css') },
		],
		afterFiles: [
			{ rel: 'floor-good.html', text: read('after/floor-good.html') },
			{ rel: 'floor-good.css', text: read('after/floor-good.css') },
			{ rel: 'theme-vars.css', text: read('after/theme-vars.css') },
		],
		verdicts: JSON.parse(read('verdicts.json')),
		typeVerdicts: JSON.parse(read('type-verdicts.json')),
		baselinePresent: true,
		...overrides,
	}
}

function decls(files) {
	const out = []
	for (const f of files) {
		if (/\.html$/i.test(f.rel)) out.push(...scanHtml(f.text, f.rel).declarations)
		else out.push(...scanCss(f.text, f.rel))
	}
	return out
}

function mutateAfterCss(from, to) {
	const input = fixtureInput()
	const css = input.afterFiles.find((f) => f.rel === 'floor-good.css')
	if (!css.text.includes(from)) throw new Error(`after CSS 找不到锚点：${from}`)
	css.text = css.text.replace(from, to)
	return input
}

function mutateThemeVars(from, to) {
	const input = fixtureInput()
	const sheet = input.afterFiles.find((f) => f.rel === 'theme-vars.css')
	if (!sheet.text.includes(from)) throw new Error(`theme-vars 找不到锚点：${from}`)
	sheet.text = sheet.text.replace(from, to)
	return input
}

function codes(result, gate) {
	return result.findings.filter((f) => (gate ? f.gate === gate : true)).map((f) => f.code)
}

test('正例：fixture 全硬编码 before → after 兑现裁决、内容未动', () => {
	const r = lintMigration(fixtureInput())
	assert.equal(r.verdict, 'pass', r.findings.map((f) => `${f.gate}:${f.code} ${f.reason}`).join('\n'))
	assert.equal(r.fulfillment.rate, 1)
	assert.equal(r.fulfillment.acceptOccurrences, 8)
	assert.equal(r.fulfillment.fulfilled, 8)
	assert.deepEqual(
		r.gates.map((g) => g.gate),
		MIGRATION_GATE_ORDER,
	)
	assert.ok(r.gates.every((g) => g.status === 'ran'))
})

test('accept-fulfillment 正例：组内无源值且至少一条含选中 var()', () => {
	const input = fixtureInput()
	const findings = gateAcceptFulfillment({
		afterDeclarations: decls(input.afterFiles),
		rows: input.verdicts.rows,
		closedSet,
	})
	assert.deepEqual(findings, [])
})

test('accept-occurrence-lost：选择器被改写，对不上那一组', () => {
	const input = mutateAfterCss('.pt-feature-grid__icon {', '.pt-feature-grid__icon-renamed {')
	const r = lintMigration(input)
	assert.equal(r.verdict, 'blocked')
	assert.ok(codes(r, 'accept-fulfillment').includes('accept-occurrence-lost'))
	assert.ok(
		!codes(r, 'accept-fulfillment').includes('accept-literal-remains'),
		'已知盲区：门抓不住「改了选择器」本身，只报找不到那一处；不许改成按改名后的选择器重配',
	)
})

test('accept-literal-remains：十处里改了九处（本 fixture 八处改七处）', () => {
	const input = mutateAfterCss('background-color: var(--color-primary);', 'background-color: #0f7a6c;')
	const r = lintMigration(input)
	assert.equal(r.verdict, 'blocked')
	assert.ok(codes(r, 'accept-fulfillment').includes('accept-literal-remains'))
	assert.ok(r.fulfillment.rate < 1)
	assert.equal(r.fulfillment.fulfilled, r.fulfillment.acceptOccurrences - 1)
})

test('accept-var-missing：源值没了但没写成选中的 var()', () => {
	const input = mutateAfterCss('background-color: var(--color-primary);', 'background-color: var(--color-text-muted);')
	const r = lintMigration(input)
	assert.equal(r.verdict, 'blocked')
	assert.ok(codes(r, 'accept-fulfillment').includes('accept-var-missing'))
})

test('accept-var-undeclared：after 里找不到该 cssVar 的自定义属性声明', () => {
	const input = fixtureInput()
	input.afterFiles = input.afterFiles.filter((f) => f.rel !== 'theme-vars.css')
	const r = lintMigration(input)
	assert.equal(r.verdict, 'blocked')
	assert.ok(codes(r, 'accept-fulfillment').includes('accept-var-undeclared'))
})

test('accept-var-value-mismatch：变量层右侧不等于闭集查表值', () => {
	const input = mutateThemeVars('--color-primary: #0f7a6c;', '--color-primary: #ff0000;')
	const r = lintMigration(input)
	assert.equal(r.verdict, 'blocked')
	assert.ok(codes(r, 'accept-fulfillment').includes('accept-var-value-mismatch'))
})

/* ── 半透明源值的承载体（2026-09-03 加，与审计侧剥离 alpha 同一趟） ─────────────
 *
 * 值映射把 alpha 从检索键里剥出来之后，`rgba(255,255,255,.7)` 的候选是**不透明** token
 * `--color-surface-default`。于是「accept 一个半透明行」第一次成为可能，而它的兑现只能靠
 * `color-mix()` 这类承载体带着透明度：不补这一条的话，执行侧写成裸 `var()` 在机器眼里完全
 * 兑现，页面上那块半透明玻璃却当场变实心。夹具的 before 里没有 rgba，所以这两条走单元层。
 */

const GLASS_ROW = {
	id: 'vm-background-a1b2c3d4',
	usage: 'background',
	sourceValue: 'rgba(255, 255, 255, 0.7)',
	normalizedValue: '#ffffffb3',
	verdict: 'accept',
	acceptedCssVar: '--color-surface-default',
	occurrences: [{ file: 'glass.css', selector: '.glass', prop: 'background-color', value: 'rgba(255, 255, 255, 0.7)' }],
}

const glassDecls = (declValue) =>
	decls([
		{ rel: 'glass.css', text: `.glass {\n\tbackground-color: ${declValue};\n}\n` },
		{ rel: 'theme-vars.css', text: ':root {\n\t--color-surface-default: #ffffff;\n}\n' },
	])

test('兑现门认得 color-mix()：半透明行换成承载体写法即算兑现', () => {
	const findings = gateAcceptFulfillment({
		afterDeclarations: glassDecls('color-mix(in srgb, var(--color-surface-default) 70%, transparent)'),
		rows: [GLASS_ROW],
		closedSet,
	})
	assert.deepEqual(findings, [], '认不出这种写法会变成「能裁 accept 但永远兑现不了」')
})

test('兑现门认得相对色语法：rgb(from var(--t) r g b / .7) 同样算承载体', () => {
	const findings = gateAcceptFulfillment({
		afterDeclarations: glassDecls('rgb(from var(--color-surface-default) r g b / 0.7)'),
		rows: [GLASS_ROW],
		closedSet,
	})
	assert.deepEqual(findings, [])
})

test('accept-alpha-carrier-missing：半透明行写成裸 var()，透明度当场丢了', () => {
	const findings = gateAcceptFulfillment({
		afterDeclarations: glassDecls('var(--color-surface-default)'),
		rows: [GLASS_ROW],
		closedSet,
	})
	assert.deepEqual(findings.map((f) => f.code), ['accept-alpha-carrier-missing'])
	assert.equal(findings[0].gate, 'accept-fulfillment')
	assert.equal(findings[0].level, 'block')
	assert.match(findings[0].reason, /color-mix/)
})

test('承载体不比对百分数：归一把 0.7 量化成 b3，比数字会误伤合法写法', () => {
	const findings = gateAcceptFulfillment({
		afterDeclarations: glassDecls('color-mix(in srgb, var(--color-surface-default) 70.2%, transparent)'),
		rows: [GLASS_ROW],
		closedSet,
	})
	assert.deepEqual(findings, [])
})

test('不透明行不受这一条影响：裸 var() 仍是正当兑现', () => {
	const findings = gateAcceptFulfillment({
		afterDeclarations: glassDecls('var(--color-surface-default)'),
		rows: [{ ...GLASS_ROW, normalizedValue: '#ffffffff', sourceValue: '#ffffff' }],
		closedSet,
	})
	assert.deepEqual(findings, [])
})

test('一处都没引用选中 token 时只报 accept-var-missing，不叠报承载体那条', () => {
	const findings = gateAcceptFulfillment({
		afterDeclarations: glassDecls('var(--color-text-muted)'),
		rows: [GLASS_ROW],
		closedSet,
	})
	assert.deepEqual(findings.map((f) => f.code), ['accept-var-missing'])
})

test('分母为 0：全 defer 的裁决 rate 是 null 且不阻断（就兑现率这一门）', () => {
	const input = fixtureInput()
	input.verdicts = {
		...input.verdicts,
		rows: input.verdicts.rows.map((r) => ({ ...r, verdict: 'defer', acceptedCssVar: null })),
	}
	input.afterFiles = [
		{ rel: 'floor-good.html', text: read('before/floor-good.html') },
		{ rel: 'floor-good.css', text: read('before/floor-good.css') },
	]
	const fulfill = gateAcceptFulfillment({
		afterDeclarations: decls(input.afterFiles),
		rows: input.verdicts.rows,
		closedSet,
	})
	assert.deepEqual(fulfill, [])
	const r = lintMigration(input)
	assert.equal(r.fulfillment.rate, null)
	assert.equal(r.fulfillment.acceptOccurrences, 0)
	assert.ok(!codes(r, 'accept-fulfillment').length)
})

test('literal-verdict-backing 正例：剩下的字面量都有 defer/reject 背书', () => {
	const input = fixtureInput()
	const findings = gateLiteralVerdictBacking({
		afterDeclarations: decls(input.afterFiles),
		rows: input.verdicts.rows,
	})
	assert.deepEqual(findings, [])
})

test('literal-unbacked：顺手新调了一个 hex 进去', () => {
	const input = mutateAfterCss(
		'font-weight: var(--fontWeight-regular);',
		'font-weight: var(--fontWeight-regular);\n\tcolor: #abcdef;',
	)
	const r = lintMigration(input)
	assert.equal(r.verdict, 'blocked')
	assert.ok(codes(r, 'literal-verdict-backing').includes('literal-unbacked'))
})

test('literal-pending：对上了，该行 verdict 是 null', () => {
	const input = fixtureInput()
	const row = input.verdicts.rows.find((r) => r.acceptedCssVar === '--color-primary')
	row.verdict = null
	row.acceptedCssVar = null
	input.afterFiles.find((f) => f.rel === 'floor-good.css').text = input.afterFiles
		.find((f) => f.rel === 'floor-good.css')
		.text.replace('background-color: var(--color-primary);', 'background-color: #0f7a6c;')
	const r = lintMigration(input)
	assert.equal(r.verdict, 'blocked')
	assert.ok(codes(r, 'literal-verdict-backing').includes('literal-pending'))
})

test('literal-accept-residue：对上了却仍是 accept，与门一有意重叠', () => {
	const input = mutateAfterCss('background-color: var(--color-primary);', 'background-color: #0f7a6c;')
	const r = lintMigration(input)
	assert.equal(r.verdict, 'blocked')
	assert.ok(codes(r, 'accept-fulfillment').includes('accept-literal-remains'))
	assert.ok(codes(r, 'literal-verdict-backing').includes('literal-accept-residue'))
})

test('content-lock 正例：六条标签序列逐位相同', () => {
	const findings = gateContentLock({
		beforeHtml: [{ file: 'floor-good.html', text: read('before/floor-good.html') }],
		afterHtml: [{ file: 'floor-good.html', text: read('after/floor-good.html') }],
	})
	assert.deepEqual(findings, [])
})

test('content-file-missing：before 有这份 HTML，after 没有', () => {
	const findings = gateContentLock({
		beforeHtml: [{ file: 'floor-good.html', text: read('before/floor-good.html') }],
		afterHtml: [],
	})
	assert.ok(findings.some((f) => f.code === 'content-file-missing' && f.file === 'floor-good.html'))
})

test('text-changed：顺手把一句文案改通顺了', () => {
	const findings = gateContentLock({
		beforeHtml: [{ file: 'a.html', text: '<p>在真实场景里连续观察</p>' }],
		afterHtml: [{ file: 'a.html', text: '<p>在真实场景中连续观察</p>' }],
	})
	assert.ok(findings.some((f) => f.code === 'text-changed' && f.before === '在真实场景里连续观察' && f.after === '在真实场景中连续观察'))
})

test('href-changed：链接被改了', () => {
	const findings = gateContentLock({
		beforeHtml: [{ file: 'a.html', text: '<a href="/old">x</a>' }],
		afterHtml: [{ file: 'a.html', text: '<a href="/new">x</a>' }],
	})
	assert.ok(findings.some((f) => f.code === 'href-changed' && f.before === '/old' && f.after === '/new'))
})

test('src-changed：图片地址被改了', () => {
	const findings = gateContentLock({
		beforeHtml: [{ file: 'a.html', text: '<img src="a.png" alt="x">' }],
		afterHtml: [{ file: 'a.html', text: '<img src="b.png" alt="x">' }],
	})
	assert.ok(findings.some((f) => f.code === 'src-changed' && f.before === 'a.png' && f.after === 'b.png'))
})

test('alt-changed：alt 被改了', () => {
	const findings = gateContentLock({
		beforeHtml: [{ file: 'a.html', text: '<img src="a.png" alt="旧">' }],
		afterHtml: [{ file: 'a.html', text: '<img src="a.png" alt="新">' }],
	})
	assert.ok(findings.some((f) => f.code === 'alt-changed' && f.before === '旧' && f.after === '新'))
})

/* ── 内容锁的图片射程：srcset / poster / CSS url() ───────────────────────────── */

test('srcset-changed：换了 2x 图，src 与 alt 都没动', () => {
	const findings = gateContentLock({
		beforeHtml: [{ file: 'a.html', text: '<img src="a.png" srcset="a.png 1x, a@2x.png 2x" alt="x">' }],
		afterHtml: [{ file: 'a.html', text: '<img src="a.png" srcset="a.png 1x, b@2x.png 2x" alt="x">' }],
	})
	assert.ok(findings.some((f) => f.code === 'srcset-changed' && f.after === 'a.png 1x, b@2x.png 2x'))
	assert.deepEqual(
		findings.map((f) => f.code).filter((c) => c !== 'srcset-changed'),
		[],
		'src / alt 一个字没动，不许连带亮别的 code',
	)
})

test('`<picture><source>` 并进 srcset 序列，不另占编号：改 source 时 src-changed 不亮', () => {
	// 这条是「picture 不必另占一个 code」的可证伪点：改 `<source srcset>` 只动 srcset 序列，
	// 造不出与 srcset-changed 不同的独占失败输入，所以占 `source-srcset-changed` 就是空门。
	const html = (webp) => `<picture><source srcset="${webp}"><img src="narrow.jpg" alt="x"></picture>`
	const findings = gateContentLock({
		beforeHtml: [{ file: 'a.html', text: html('wide.webp') }],
		afterHtml: [{ file: 'a.html', text: html('wider.webp') }],
	})
	assert.deepEqual(findings.map((f) => f.code), ['srcset-changed'])
})

test('poster-changed：换了视频封面，src 没动', () => {
	const findings = gateContentLock({
		beforeHtml: [{ file: 'a.html', text: '<video src="a.mp4" poster="old.jpg"></video>' }],
		afterHtml: [{ file: 'a.html', text: '<video src="a.mp4" poster="new.jpg"></video>' }],
	})
	assert.deepEqual(findings.map((f) => f.code), ['poster-changed'])
	assert.ok(findings.some((f) => f.before === 'old.jpg' && f.after === 'new.jpg'))
})

test('css-url-changed：换了一张背景图，喂的是 .css 那半边的声明', () => {
	const before = scanCss('.hero { background-image: url("https://cdn/demo.png"); }\n', 'floor.css')
	const after = scanCss('.hero { background-image: url("https://cdn/other.png"); }\n', 'floor.css')
	const findings = gateContentLock({
		beforeHtml: [],
		afterHtml: [],
		beforeDeclarations: before,
		afterDeclarations: after,
	})
	assert.deepEqual(findings.map((f) => f.code), ['css-url-changed'])
	assert.ok(findings.some((f) => f.file === 'floor.css' && f.before === 'https://cdn/demo.png'))
})

test('css-url 不误伤：引号差异与 data-URI 改填色都不红', () => {
	const quotes = gateContentLock({
		beforeHtml: [],
		afterHtml: [],
		beforeDeclarations: scanCss('.a { background-image: url("hero.png"); }\n', 'a.css'),
		afterDeclarations: scanCss('.a { background-image: url(hero.png); }\n', 'a.css'),
	})
	assert.deepEqual(quotes, [], '剥引号：url(a) / url("a") 在 CSS 里是同一件事')

	const dataUri = gateContentLock({
		beforeHtml: [],
		afterHtml: [],
		beforeDeclarations: scanCss('.a { background-image: url("data:image/svg+xml;utf8,<svg fill=\'#f00\'/>"); }\n', 'a.css'),
		afterDeclarations: scanCss('.a { background-image: url("data:image/svg+xml;utf8,<svg fill=\'#0f0\'/>"); }\n', 'a.css'),
	})
	assert.deepEqual(dataUri, [], 'data-URI 里的填色归色门管，本门故意不看——否则会和「只改色值」打架')
})

test('css-url 已知盲区：before 侧就写在自定义属性 / widget 里的 url，改它不红', () => {
	// 跳过规则自带的洞，如实锁住。反方向（改造中把 url 搬进自定义属性）仍红，见下一条断言。
	const inCustomProp = gateContentLock({
		beforeHtml: [],
		afterHtml: [],
		beforeDeclarations: scanCss(':root { --hero: url(a.png); }\n', 'a.css'),
		afterDeclarations: scanCss(':root { --hero: url(b.png); }\n', 'a.css'),
	})
	assert.deepEqual(inCustomProp, [])

	const movedIn = gateContentLock({
		beforeHtml: [],
		afterHtml: [],
		beforeDeclarations: scanCss('.a { background-image: url(a.png); }\n', 'a.css'),
		afterDeclarations: scanCss(':root { --hero: url(a.png); }\n.a { background-image: var(--hero); }\n', 'a.css'),
	})
	assert.deepEqual(movedIn.map((f) => f.code), ['css-url-changed'], '搬进自定义属性让 before 那条消失，逐位比报得出来')
})

test('css-url：--after 里多出来的 CSS 文件不判', () => {
	const findings = gateContentLock({
		beforeHtml: [],
		afterHtml: [],
		beforeDeclarations: scanCss('.a { background-image: url(a.png); }\n', 'a.css'),
		afterDeclarations: [
			...scanCss('.a { background-image: url(a.png); }\n', 'a.css'),
			...scanCss('.b { background-image: url(b.png); }\n', 'theme-vars.css'),
		],
	})
	assert.deepEqual(findings, [])
})

function withCssDecl(beforeDecl, afterDecl) {
	const input = fixtureInput()
	const anchor = '.pt-feature-grid {'
	const patch = (files, decl) => {
		const css = files.find((f) => f.rel === 'floor-good.css')
		css.text = css.text.replace(anchor, `${anchor}\n\t${decl}`)
	}
	patch(input.beforeFiles, beforeDecl)
	patch(input.afterFiles, afterDecl)
	return input
}

test('srcset-changed 必须走 lintMigration：改 2x 图退 blocked', () => {
	const input = fixtureInput()
	const before = input.beforeFiles.find((f) => f.rel === 'floor-good.html')
	const after = input.afterFiles.find((f) => f.rel === 'floor-good.html')
	before.text = before.text.replace('</section>', '<img src="a.png" srcset="a.png 1x, a@2x.png 2x" alt="x"></section>')
	after.text = after.text.replace('</section>', '<img src="a.png" srcset="a.png 1x, b@2x.png 2x" alt="x"></section>')
	const r = lintMigration(input)
	assert.equal(r.verdict, 'blocked')
	assert.deepEqual(codes(r, 'content-lock'), ['srcset-changed'])
})

test('poster-changed 必须走 lintMigration：改视频封面退 blocked', () => {
	const input = fixtureInput()
	const before = input.beforeFiles.find((f) => f.rel === 'floor-good.html')
	const after = input.afterFiles.find((f) => f.rel === 'floor-good.html')
	before.text = before.text.replace('</section>', '<video src="a.mp4" poster="old.jpg"></video></section>')
	after.text = after.text.replace('</section>', '<video src="a.mp4" poster="new.jpg"></video></section>')
	const r = lintMigration(input)
	assert.equal(r.verdict, 'blocked')
	assert.deepEqual(codes(r, 'content-lock'), ['poster-changed'])
})

test('css-url-changed 必须走 lintMigration，且改的是 .css 文件（不是内联）', () => {
	// 只测内联 `style=` 的话，CSS 文件那条路径永远没人读，与当年「href 只喂门函数」同构。
	const ok = lintMigration(
		withCssDecl(
			'background-image: url("https://res-static.hc-cdn.cn/demo.png");',
			'background-image: url("https://res-static.hc-cdn.cn/demo.png");',
		),
	)
	assert.equal(ok.verdict, 'pass', ok.findings.map((f) => `${f.gate}:${f.code}`).join('\n'))

	const r = lintMigration(
		withCssDecl(
			'background-image: url("https://res-static.hc-cdn.cn/demo.png");',
			'background-image: url("https://res-static.hc-cdn.cn/other.png");',
		),
	)
	assert.equal(r.verdict, 'blocked')
	assert.deepEqual(codes(r, 'content-lock'), ['css-url-changed'])
	assert.ok(r.findings.some((f) => f.code === 'css-url-changed' && f.file === 'floor-good.css'))
})

test('css-url-changed 不依赖 HTML：纯 CSS 迁移里 content-lock 仍 ran 并抓得住', () => {
	const input = withCssDecl('background-image: url(a.png);', 'background-image: url(b.png);')
	input.beforeFiles = input.beforeFiles.filter((f) => !/\.html$/i.test(f.rel))
	input.afterFiles = input.afterFiles.filter((f) => !/\.html$/i.test(f.rel))
	const r = lintMigration(input)
	assert.equal(r.gates.find((g) => g.gate === 'content-lock').status, 'ran')
	assert.equal(r.verdict, 'blocked')
	assert.deepEqual(codes(r, 'content-lock'), ['css-url-changed'])
})

test('纯 CSS 迁移：content-lock 写 no-input，退 0（就这一门）', () => {
	const input = fixtureInput()
	input.beforeFiles = input.beforeFiles.filter((f) => !/\.html$/i.test(f.rel))
	input.afterFiles = input.afterFiles.filter((f) => !/\.html$/i.test(f.rel))
	const r = lintMigration(input)
	const lock = r.gates.find((g) => g.gate === 'content-lock')
	assert.equal(lock.status, 'no-input')
	assert.ok(!codes(r, 'content-lock').length)
})

test('content-lock 必须走 lintMigration：改文案退 blocked', () => {
	const input = fixtureInput()
	const html = input.afterFiles.find((f) => f.rel === 'floor-good.html')
	html.text = html.text.replace('研究方法', '研究办法')
	const r = lintMigration(input)
	assert.equal(r.verdict, 'blocked')
	assert.ok(codes(r, 'content-lock').includes('text-changed'))
})

test('content-file-missing 必须走 lintMigration：after 删掉 HTML', () => {
	const input = fixtureInput()
	input.afterFiles = input.afterFiles.filter((f) => f.rel !== 'floor-good.html')
	const r = lintMigration(input)
	assert.equal(r.verdict, 'blocked')
	assert.ok(codes(r, 'content-lock').includes('content-file-missing'))
})

test('href-changed 必须走 lintMigration：改链接退 blocked', () => {
	const input = fixtureInput()
	const before = input.beforeFiles.find((f) => f.rel === 'floor-good.html')
	const after = input.afterFiles.find((f) => f.rel === 'floor-good.html')
	before.text = before.text.replace('>研究方法</h2>', '><a href="/old">研究方法</a></h2>')
	after.text = after.text.replace('>研究方法</h2>', '><a href="/new">研究方法</a></h2>')
	const r = lintMigration(input)
	assert.equal(r.verdict, 'blocked')
	assert.ok(codes(r, 'content-lock').includes('href-changed'))
})

test('src-changed 必须走 lintMigration：改图片地址退 blocked', () => {
	const input = fixtureInput()
	const before = input.beforeFiles.find((f) => f.rel === 'floor-good.html')
	const after = input.afterFiles.find((f) => f.rel === 'floor-good.html')
	before.text = before.text.replace('</section>', '<img src="a.png" alt="x"></section>')
	after.text = after.text.replace('</section>', '<img src="b.png" alt="x"></section>')
	const r = lintMigration(input)
	assert.equal(r.verdict, 'blocked')
	assert.ok(codes(r, 'content-lock').includes('src-changed'))
})

test('alt-changed 必须走 lintMigration：改 alt 退 blocked', () => {
	const input = fixtureInput()
	const before = input.beforeFiles.find((f) => f.rel === 'floor-good.html')
	const after = input.afterFiles.find((f) => f.rel === 'floor-good.html')
	before.text = before.text.replace('</section>', '<img src="a.png" alt="旧"></section>')
	after.text = after.text.replace('</section>', '<img src="a.png" alt="新"></section>')
	const r = lintMigration(input)
	assert.equal(r.verdict, 'blocked')
	assert.ok(codes(r, 'content-lock').includes('alt-changed'))
})

test('迁移 finding 每条都有非空 reason', () => {
	const cases = [
		mutateAfterCss('.pt-feature-grid__icon {', '.pt-feature-grid__icon-renamed {'),
		mutateAfterCss('background-color: var(--color-primary);', 'background-color: #0f7a6c;'),
		mutateAfterCss('background-color: var(--color-primary);', 'background-color: var(--color-text-muted);'),
		(() => {
			const input = fixtureInput()
			input.afterFiles = input.afterFiles.filter((f) => f.rel !== 'theme-vars.css')
			return input
		})(),
		mutateThemeVars('--color-primary: #0f7a6c;', '--color-primary: #ff0000;'),
		mutateAfterCss(
			'font-weight: var(--fontWeight-regular);',
			'font-weight: var(--fontWeight-regular);\n\tcolor: #abcdef;',
		),
		(() => {
			const input = fixtureInput()
			input.afterFiles.find((f) => f.rel === 'floor-good.html').text = input.afterFiles
				.find((f) => f.rel === 'floor-good.html')
				.text.replace('研究方法', '研究办法')
			return input
		})(),
		(() => {
			const input = fixtureInput()
			const before = input.beforeFiles.find((f) => f.rel === 'floor-good.html')
			const after = input.afterFiles.find((f) => f.rel === 'floor-good.html')
			before.text = before.text.replace(
				'</section>',
				'<img src="a.png" srcset="a.png 1x" alt="x"><video src="a.mp4" poster="old.jpg"></video></section>',
			)
			after.text = after.text.replace(
				'</section>',
				'<img src="a.png" srcset="b.png 1x" alt="x"><video src="a.mp4" poster="new.jpg"></video></section>',
			)
			return input
		})(),
		withCssDecl('background-image: url(a.png);', 'background-image: url(b.png);'),
	]
	const seen = new Set()
	for (const input of cases) {
		for (const f of lintMigration(input).findings) {
			assert.equal(typeof f.reason, 'string', `${f.gate}:${f.code} 缺 reason`)
			assert.ok(f.reason.trim(), `${f.gate}:${f.code} 的 reason 是空串`)
			seen.add(f.code)
		}
	}
	for (const code of [
		'accept-occurrence-lost',
		'accept-literal-remains',
		'accept-var-missing',
		'accept-var-undeclared',
		'accept-var-value-mismatch',
		'fulfillment-rate-short',
		'literal-unbacked',
		'literal-accept-residue',
		'text-changed',
		'srcset-changed',
		'poster-changed',
		'css-url-changed',
	]) {
		assert.ok(seen.has(code), `这组输入必须覆盖 ${code}，否则 reason 锁不住它`)
	}
})

test('accept-var-undeclared 按 cssVar 去重，兑现率仍按 occurrence 记账', () => {
	const input = fixtureInput()
	input.afterFiles = input.afterFiles.filter((f) => f.rel !== 'theme-vars.css')
	const r = lintMigration(input)
	const undeclared = r.findings.filter((f) => f.code === 'accept-var-undeclared')
	const vars = undeclared.map((f) => f.acceptedCssVar)
	assert.equal(undeclared.length, new Set(vars).size, '同一 cssVar 不得按 occurrence 扇出')
	assert.equal(undeclared.length, 5)
	assert.equal(
		undeclared.reduce((n, f) => n + f.occurrenceCount, 0),
		8,
	)
	assert.equal(r.fulfillment.acceptOccurrences, 8)
	assert.equal(r.fulfillment.fulfilled, 0)
	assert.equal(r.fulfillment.rate, 0)
	assert.equal(r.verdict, 'blocked')
})

test('删旧 HTML、改文案放进新文件：报 content-file-missing，新文件不判', () => {
	const input = fixtureInput()
	input.afterFiles = input.afterFiles.filter((f) => f.rel !== 'floor-good.html')
	input.afterFiles.push({ rel: 'moved.html', text: '<p>改过的文案挪到新文件</p>' })
	const r = lintMigration(input)
	assert.equal(r.verdict, 'blocked')
	assert.ok(codes(r, 'content-lock').includes('content-file-missing'))
	assert.ok(!r.findings.some((f) => f.gate === 'content-lock' && f.file === 'moved.html'))
})

test('before 没有 HTML 时 after 多出来的 HTML 不判（已知盲区，不许顺手收严）', () => {
	const input = fixtureInput()
	input.beforeFiles = input.beforeFiles.filter((f) => !/\.html$/i.test(f.rel))
	input.afterFiles.push({ rel: 'sneak.html', text: '<p>全新文案</p>' })
	const r = lintMigration(input)
	const lock = r.gates.find((g) => g.gate === 'content-lock')
	assert.equal(lock.status, 'no-input')
	assert.ok(!codes(r, 'content-lock').length)
})

test('准入 baseline-empty：before 路径在但零份 html/css，内容锁不得哑着报绿', () => {
	const r = lintMigration({
		...fixtureInput(),
		beforeFiles: [],
		baselinePresent: true,
		verdicts: { verdict: 'pass', rows: [], warnings: [], findings: [] },
	})
	assert.equal(r.verdict, 'blocked')
	assert.equal(r.precheck.code, 'baseline-empty')
})

test('准入资产 absent：lintMigration 的 precheck.code 就是 admit 的 verdict', () => {
	const r = lintMigration({ ...fixtureInput(), assetDir: path.join(FIX, 'no-such-asset') })
	assert.equal(r.verdict, 'blocked')
	assert.equal(r.precheck.code, 'absent')
})

test('兑现率 0.9 仍阻断：九处兑现、一处漏做不得放行', () => {
	const input = fixtureInput()
	const row = input.verdicts.rows.find((r) => r.acceptedCssVar === '--color-primary')
	const css = input.afterFiles.find((f) => f.rel === 'floor-good.css')
	css.text += '\n.x1 { background-color: var(--color-primary); }\n.x2 { background-color: var(--color-primary); }\n'
	row.occurrences.push(
		{ file: 'floor-good.css', selector: '.x1', prop: 'background-color', value: '#0f7a6c' },
		{ file: 'floor-good.css', selector: '.x2', prop: 'background-color', value: '#0f7a6c' },
	)
	css.text = css.text.replace('background-color: var(--color-primary);', 'background-color: #0f7a6c;')
	const r = lintMigration(input)
	assert.equal(r.fulfillment.acceptOccurrences, 10)
	assert.equal(r.fulfillment.fulfilled, 9)
	assert.equal(r.fulfillment.rate, 0.9)
	assert.equal(r.verdict, 'blocked')
	assert.ok(codes(r, 'accept-fulfillment').includes('accept-literal-remains'))
})

test('兑现率门独立：findings 清空 + rate 0.9 仍阻断（不依赖任何其它 finding）', () => {
	assert.equal(decideMigrationVerdict([], { rate: 0.9, acceptOccurrences: 10, fulfilled: 9 }), 'blocked')
})

test('兑现率门独立：rate 为 null（分母 0）不阻断', () => {
	assert.equal(decideMigrationVerdict([], { rate: null, acceptOccurrences: 0, fulfilled: 0 }), 'pass')
})

test('兑现率门独立：rate 恰好为 1 且无 finding 才放行', () => {
	assert.equal(decideMigrationVerdict([], { rate: 1, acceptOccurrences: 8, fulfilled: 8 }), 'pass')
	assert.equal(decideMigrationVerdict([{ code: 'text-changed' }], { rate: 1, acceptOccurrences: 8, fulfilled: 8 }), 'blocked')
})

test('兑现率 0.9 必报 fulfillment-rate-short，与其它 finding 并列', () => {
	const input = fixtureInput()
	const row = input.verdicts.rows.find((r) => r.acceptedCssVar === '--color-primary')
	const css = input.afterFiles.find((f) => f.rel === 'floor-good.css')
	css.text += '\n.x1 { background-color: var(--color-primary); }\n.x2 { background-color: var(--color-primary); }\n'
	row.occurrences.push(
		{ file: 'floor-good.css', selector: '.x1', prop: 'background-color', value: '#0f7a6c' },
		{ file: 'floor-good.css', selector: '.x2', prop: 'background-color', value: '#0f7a6c' },
	)
	css.text = css.text.replace('background-color: var(--color-primary);', 'background-color: #0f7a6c;')
	const r = lintMigration(input)
	assert.equal(r.fulfillment.rate, 0.9)
	assert.equal(r.verdict, 'blocked')
	assert.ok(codes(r, 'accept-fulfillment').includes('fulfillment-rate-short'))
})

test('literal-accept-residue 独有：别处新加同值字面量，门一不报 remains', () => {
	const input = mutateAfterCss(
		'font-weight: var(--fontWeight-regular);',
		'font-weight: var(--fontWeight-regular);\n\tbackground-color: #0f7a6c;',
	)
	const r = lintMigration(input)
	assert.equal(r.verdict, 'blocked')
	assert.ok(codes(r, 'literal-verdict-backing').includes('literal-accept-residue'))
	assert.ok(!codes(r, 'accept-fulfillment').includes('accept-literal-remains'))
})

test('残留 defer 字面量：color-literal 挡、backing 放——本门不是更严', () => {
	const decls = scanCss('.x { color: #abcdef; }\n', 'x.css')
	assert.ok(gateColorLiteral(decls).length, 'color-literal 必须挡残留 hex')
	const backing = gateLiteralVerdictBacking({
		afterDeclarations: decls,
		rows: [{ usage: 'text', normalizedValue: '#abcdefff', verdict: 'defer', acceptedCssVar: null }],
	})
	assert.deepEqual(backing, [])
})
