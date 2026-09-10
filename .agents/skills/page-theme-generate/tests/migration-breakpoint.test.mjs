/**
 * 第七道迁移门 `breakpoint-lock`，一个 code `media-condition-added`。
 *
 * 判据：`--after` 不得引入 `--before` 里不存在的 `@media` 宽度条件。**判增量**，不判
 * 「产物所有 `@media` ⊆ 资产 §5 白名单」——老页本来就带着 §5 之外的弱档。
 *
 * 单独一份，是因为坏输入的造法与前六道都不同：不改文本、不改标签、不改任何值，只在
 * `@media` 前奏上多一条件。混进别的文件会让「只这一处也会挂」变成两处违例。
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { lintMigration, decideMigrationVerdict } from '../scripts/lint-migration.mjs'
import { MIGRATION_GATE_ORDER, gateBreakpointLock } from '../scripts/lib/migration-gates.mjs'
import { extractMediaWidthConditions } from '../scripts/lib/breakpoint-lock.mjs'
import { FIXTURE_ASSET, SCRIPTS_DIR } from './helpers.mjs'

const FIX = path.join(import.meta.dirname, 'fixtures', 'migration')
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

const pair = (beforeText, afterText) =>
	gateBreakpointLock({
		beforeSources: [{ file: 'a.css', text: beforeText }],
		afterSources: [{ file: 'a.css', text: afterText }],
	})

const codes = (findings) => findings.map((f) => f.code)

function mutateAfterCss(from, to) {
	const input = fixtureInput()
	const css = input.afterFiles.find((f) => f.rel === 'floor-good.css')
	if (!css.text.includes(from)) throw new Error(`after CSS 找不到锚点：${from}`)
	css.text = css.text.replace(from, to)
	return input
}

/* ── 抽取器 ──────────────────────────────────────────────────────────────────── */

test('抽取器：整条归一成无空白小写串，媒体类型不进条件', () => {
	// `@media screen and (…)` 与 `@media (…)` 是同一条断点：媒体类型不是断点。
	assert.deepEqual(extractMediaWidthConditions('@media screen and ( MIN-WIDTH : 641px ) { .a { color: red } }'), [
		'min-width:641px',
	])
	assert.deepEqual(
		extractMediaWidthConditions('@media (min-width:641px){.a{color:red}}'),
		extractMediaWidthConditions('@media screen and (min-width: 641px) { .a { color: red } }'),
	)
})

test('抽取器：一条前奏里几个条件各算一条，区间语法照收', () => {
	assert.deepEqual(
		extractMediaWidthConditions('@media (min-width: 641px) and (max-width: 999px) { .a { color: red } }'),
		['min-width:641px', 'max-width:999px'],
	)
	assert.deepEqual(extractMediaWidthConditions('@media (width >= 48em) { .a { color: red } }'), ['width>=48em'])
})

test('抽取器：不含 width 的媒体条件不收（射程边界）', () => {
	assert.deepEqual(extractMediaWidthConditions('@media print { .a { color: red } }'), [])
	assert.deepEqual(extractMediaWidthConditions('@media (prefers-color-scheme: dark) { .a { color: red } }'), [])
	assert.deepEqual(extractMediaWidthConditions('@media (orientation: landscape) { .a { color: red } }'), [])
	assert.deepEqual(extractMediaWidthConditions('@container (min-width: 641px) { .a { color: red } }'), [])
})

test('抽取器：注释里的 @media 不进序列（CSS 与 HTML 两种注释）', () => {
	assert.deepEqual(extractMediaWidthConditions('/* @media (min-width: 641px) { } */ .a { color: red }'), [])
	assert.deepEqual(extractMediaWidthConditions('<!-- <style>@media (min-width: 641px){.a{color:red}}</style> -->'), [])
})

test('抽取器：HTML 里 `<style>` 块的 @media 照抽（单文件页不许是盲区）', () => {
	const html = '<section><style>@media (max-width: 999px) { .a { color: red } }</style></section>'
	assert.deepEqual(extractMediaWidthConditions(html), ['max-width:999px'])
})

/* ── media-condition-added：会挂的输入 ───────────────────────────────────────── */

test('media-condition-added：after 长出一档 before 没有的断点', () => {
	const before = '@media (max-width: 999px) { .a { display: flex } }'
	const after = `${before}\n@media (min-width: 641px) { .a { display: grid } }`
	const findings = pair(before, after)
	assert.deepEqual(codes(findings), ['media-condition-added'])
	assert.equal(findings[0].condition, 'min-width:641px')
	assert.equal(findings[0].file, 'a.css')
	assert.ok(findings[0].reason.trim())
	assert.equal(findings[0].level, 'block')
})

test('判据变异锁：条件**个数**相同、值不同也必须红（只比个数当场变空门）', () => {
	// 判据若退化成「比条件条数」，本条转红——两侧都恰好是一条。
	const findings = pair('@media (max-width: 999px) { .a { display: flex } }', '@media (max-width: 900px) { .a { display: flex } }')
	assert.deepEqual(codes(findings), ['media-condition-added'])
	assert.equal(findings[0].condition, 'max-width:900px')
})

function stripJsComments(src) {
	return String(src)
		.replace(/\/\*[\s\S]*?\*\//g, ' ')
		.replace(/\/\/[^\n]*/g, ' ')
}

/** 只切 `export function <name>` 到下一个 `export function`，避免扫到别的门里的阈值。 */
function exportedFnSlice(src, name) {
	const needle = `export function ${name}`
	const start = src.indexOf(needle)
	assert.ok(start >= 0, `找不到 ${needle}`)
	const from = src.slice(start)
	const next = from.slice(needle.length).search(/\nexport function /)
	assert.ok(next >= 0, `${name} 后面找不到下一个 export function，切段会扫到别的门`)
	return from.slice(0, needle.length + next)
}

function breakpointCriterionSources(gatesSrc = null) {
	const extractor = stripJsComments(fs.readFileSync(path.join(SCRIPTS_DIR, 'lib', 'breakpoint-lock.mjs'), 'utf8'))
	const gates = stripJsComments(
		gatesSrc ?? fs.readFileSync(path.join(SCRIPTS_DIR, 'lib', 'migration-gates.mjs'), 'utf8'),
	)
	return { extractor, gateBody: exportedFnSlice(gates, 'gateBreakpointLock') }
}

function assertNoHardcodedBreakpoints({ extractor, gateBody }) {
	assert.ok(!/\d{3,}/.test(extractor), `breakpoint-lock.mjs 里出现了写死的数字：${extractor.match(/\d{3,}/g)?.join(' / ')}`)
	assert.ok(
		!/\d{3,}/.test(gateBody),
		`gateBreakpointLock 函数体里出现了写死的数字：${gateBody.match(/\d{3,}/g)?.join(' / ')}`,
	)
}

test('判据变异锁：断点值全由 --before 现读，脚本里不许写死任何断点数字', () => {
	// 源站改版、断点值变了，本门必须零代码改动跟着走。所以判据两边都现读，且抽取器整文件
	// 与 `gateBreakpointLock` 函数体都无 3 位以上数字（白名单写在门函数里、本钉仍只扫抽取器，就是漏半边）。
	assertNoHardcodedBreakpoints(breakpointCriterionSources())

	// 现读的正面证据：两条谁也不是「常见断点」的宽度，一条留用绿、一条新加红。
	const before = '@media (max-width: 641px) { .a { display: flex } }\n@media (min-width: 999px) { .a { display: grid } }'
	assert.deepEqual(pair(before, '@media (max-width: 641px) { .a { display: block } }'), [])
	assert.deepEqual(codes(pair(before, `${before}\n@media (min-width: 1201px) { .a { display: none } }`)), [
		'media-condition-added',
	])
})

test('判据源码钉：白名单写进 gateBreakpointLock 函数体，本钉必须红', () => {
	const { gateBody } = breakpointCriterionSources()
	const poisoned = gateBody.replace(
		'return out',
		'const ALLOWED = new Set([768, 1024, 1280]);\n\treturn out',
	)
	assert.ok(/\d{3,}/.test(poisoned), '投毒后函数体必须能匹配到写死数字')
	assert.throws(
		() => assertNoHardcodedBreakpoints({ extractor: 'no-digits-here', gateBody: poisoned }),
		(err) => /gateBreakpointLock 函数体里出现了写死的数字/.test(err.message),
	)
})

test('判据源码钉：只切 gateBreakpointLock 函数体，别的门里的数字不许误伤', () => {
	const gatesSrc = stripJsComments(fs.readFileSync(path.join(SCRIPTS_DIR, 'lib', 'migration-gates.mjs'), 'utf8'))
	const start = gatesSrc.indexOf('export function gateThemeApiLock')
	assert.ok(start >= 0, '找不到 gateThemeApiLock，无法造误伤对照')
	const brace = gatesSrc.indexOf('{', start)
	const poisoned = `${gatesSrc.slice(0, brace + 1)}\n\tconst _OTHER_GATE_THRESHOLD = 768;${gatesSrc.slice(brace + 1)}`
	assert.match(poisoned, /768/)
	assert.ok(/\d{3,}/.test(poisoned), '对照：整份源码（含别的门）确实有 768')
	assert.ok(/\d{3,}/.test(exportedFnSlice(poisoned, 'gateThemeApiLock')), '768 必须落在闭集门函数体里')
	assertNoHardcodedBreakpoints(breakpointCriterionSources(poisoned))
})

/* ── 不误伤 ──────────────────────────────────────────────────────────────────── */

test('--before 里已有的 @media 原样保留：绿（本门只判增量）', () => {
	const both = '@media (max-width: 999px) { .a { display: flex } }\n@media (min-width: 641px) { .b { display: grid } }'
	assert.deepEqual(pair(both, both), [])
})

test('只改 @media 块里的声明、不动条件：绿', () => {
	assert.deepEqual(
		pair('@media (max-width: 999px) { .a { color: #0f7a6c } }', '@media (max-width: 999px) { .a { color: var(--color-primary) } }'),
		[],
	)
})

test('after 把已有条件换个写法（大小写 / 空白 / 加媒体类型）：绿', () => {
	assert.deepEqual(pair('@media (max-width:999px) { .a { display: flex } }', '@media screen and ( MAX-WIDTH : 999px ) { .a { display: flex } }'), [])
})

test('同一条件在一份文件里多处出现只报一条；不同文件各报一条', () => {
	const added = '@media (min-width: 641px) { .a { display: grid } }'
	assert.equal(pair('', `${added}\n${added}`).length, 1)
	const findings = gateBreakpointLock({
		beforeSources: [{ file: 'a.css', text: '' }],
		afterSources: [
			{ file: 'a.css', text: added },
			{ file: 'b.css', text: added },
		],
	})
	assert.deepEqual(findings.map((f) => f.file), ['a.css', 'b.css'])
})

test('单文件页：`<style>` 里的 @media 两侧都进射程（只吃 .css 就是空门）', () => {
	// 楼层完全可以是自带样式的单文件 HTML。抽取器认得 `<style>`（上面那条），但门只有真把
	// `.html` 也喂进来才不是空门——这条钉的是**喂进来了**。
	const style = (body) => `<section><style>${body}</style></section>`
	const findings = gateBreakpointLock({
		beforeSources: [{ file: 'page.html', text: style('@media (max-width: 999px){.a{display:flex}}') }],
		afterSources: [
			{ file: 'page.html', text: style('@media (max-width: 999px){.a{display:flex}}@media (min-width: 641px){.a{display:grid}}') },
		],
	})
	assert.deepEqual(codes(findings), ['media-condition-added'])
	assert.equal(findings[0].condition, 'min-width:641px')
})

test('条件集合按整个 --before 取并集，不按文件配对', () => {
	// 断点是全站的事：改造中把一档 @media 从 a.css 挪进 b.css 不是「新增断点」。
	const findings = gateBreakpointLock({
		beforeSources: [{ file: 'a.css', text: '@media (min-width: 641px) { .a { display: grid } }' }],
		afterSources: [{ file: 'b.css', text: '@media (min-width: 641px) { .a { display: grid } }' }],
	})
	assert.deepEqual(findings, [])
})

/* ── 编排：门真的接上了 ──────────────────────────────────────────────────────── */

test('gates[] 九行恒在，第八行是 breakpoint-lock，正例全 ran', () => {
	const r = lintMigration(fixtureInput())
	assert.equal(r.verdict, 'pass', r.findings.map((f) => `${f.gate}:${f.code} ${f.reason}`).join('\n'))
	assert.deepEqual(r.gates.map((g) => g.gate), MIGRATION_GATE_ORDER)
	assert.equal(r.gates.length, 9)
	assert.equal(r.gates[7].gate, 'breakpoint-lock')
	assert.ok(r.gates.every((g) => g.status === 'ran'))
})

test('media-condition-added 必须走 lintMigration：新加一档断点退 blocked，且它是唯一那条', () => {
	// 「门没装上」的正面证据：本例里 media-condition-added 是唯一一条 finding，verdict 只能靠它变 blocked。
	const input = mutateAfterCss(
		'@media (max-width: 1023px) {',
		'@media (min-width: 1281px) {\n\t.pt-feature-grid__list {\n\t\tdisplay: flex;\n\t}\n}\n\n@media (max-width: 1023px) {',
	)
	const r = lintMigration(input)
	assert.equal(r.verdict, 'blocked')
	assert.deepEqual([...new Set(r.findings.map((f) => f.gate))], ['breakpoint-lock'])
	assert.equal(r.gates.find((g) => g.gate === 'breakpoint-lock').findings, 1)
	assert.equal(r.findings[0].file, 'floor-good.css')
})

test('走 lintMigration 的判据变异锁：把已有断点改个值（条数不变）照样 blocked', () => {
	const r = lintMigration(mutateAfterCss('@media (max-width: 1023px) {', '@media (max-width: 900px) {'))
	assert.equal(r.verdict, 'blocked')
	assert.ok(codes(r.findings).includes('media-condition-added'))
	assert.equal(r.findings.find((f) => f.code === 'media-condition-added').condition, 'max-width:900px')
})

test('走 lintMigration：`.html` 真的进了两侧射程，不是只喂 .css', () => {
	// `--before` 侧的那一条只写在 HTML 的 `<style>` 里；`--after` 侧在 CSS 里复用它。
	// 接线若只把 `.css` 喂给本门，before 集合里就没有这一条，这次合法复用会被误报。
	const input = fixtureInput()
	const media = '@media (min-width: 641px) { .pt-legacy { display: flex; } }'
	for (const files of [input.beforeFiles, input.afterFiles]) {
		const html = files.find((f) => f.rel === 'floor-good.html')
		html.text = `<style>${media}</style>\n${html.text}`
	}
	const afterCss = input.afterFiles.find((f) => f.rel === 'floor-good.css')
	afterCss.text += `\n\n${media}\n`

	const r = lintMigration(input)
	assert.equal(r.gates.find((g) => g.gate === 'breakpoint-lock').findings, 0)
	assert.equal(r.verdict, 'pass', r.findings.map((f) => `${f.gate}:${f.code} ${f.reason}`).join('\n'))
})

test('走 lintMigration：`--after` 侧新断点写在 HTML 的 `<style>` 里同样报', () => {
	// 换骨架那一条由 structure-lock 报（插了 `<style>`），本门只认那条新条件，两门各报各的。
	const input = fixtureInput()
	const html = input.afterFiles.find((f) => f.rel === 'floor-good.html')
	html.text = `<style>@media (min-width: 641px) { .pt-legacy { display: flex; } }</style>\n${html.text}`
	const r = lintMigration(input)
	assert.equal(r.verdict, 'blocked')
	assert.equal(r.gates.find((g) => g.gate === 'breakpoint-lock').findings, 1)
	assert.equal(r.findings.find((f) => f.code === 'media-condition-added').file, 'floor-good.html')
})

test('断点锁 finding 进 verdict 判定：只有一条 media-condition-added 也必须 blocked', () => {
	assert.equal(
		decideMigrationVerdict([{ gate: 'breakpoint-lock', code: 'media-condition-added' }], { rate: 1 }, { rate: null }),
		'blocked',
	)
})

test('已知盲区：--before 里就有的采样宽 @media 本门不报（那是资产 / 采集侧的事）', () => {
	// 判据若改成「产物所有 @media ⊆ 资产 §5」，本条当场转红——而那正是会误伤老页的那种写法。
	const both = '@media (max-width: 1688px) { .a { display: flex } }'
	assert.deepEqual(pair(both, both), [])
})
