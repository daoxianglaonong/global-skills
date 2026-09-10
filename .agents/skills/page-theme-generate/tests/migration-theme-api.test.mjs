/**
 * 末道迁移门 `theme-api-lock`，一个 code `foreign-var-introduced`。
 *
 * 判据：`--after` **新引入**的 `var()` 引用（after 引用集减 before 引用集）必须在
 * `closed-set.json` 内。判增量不判绝对集合，判「不在闭集」不判前缀黑名单。
 *
 * 它守的那件事是「名字在不在闭集」：裁成 `defer` / `reject` / `omit` 的行，产物把字面量换成
 * `var(--por-x)` 之后，兑现率不管（那些行不进分子分母）、残余字面量门也不管（字面量已经没了）。
 * 2026-09-03 起 `verdict-hold-lock` 在这一处与它重叠，但换成**闭集内**的名字时只有 hold 锁能报，
 * 而新写一条规则引私有变量时只有本门能报。单独一份，是因为这条坏输入要同时动裁决记录与产物。
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { lintMigration, decideMigrationVerdict } from '../scripts/lint-migration.mjs'
import { MIGRATION_GATE_ORDER, gateThemeApiLock } from '../scripts/lib/migration-gates.mjs'
import { loadClosedSet } from '../scripts/lib/closed-set.mjs'
import { FIXTURE_ASSET } from './helpers.mjs'

const FIX = path.join(import.meta.dirname, 'fixtures', 'migration')
const read = (rel) => fs.readFileSync(path.join(FIX, rel), 'utf8')
const closedSet = loadClosedSet(FIXTURE_ASSET)

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

const decl = (value, over = {}) => ({ file: 'a.css', selector: '.a', prop: 'color', value, widget: false, ...over })
const pair = (beforeValues, afterValues) =>
	gateThemeApiLock({
		beforeDeclarations: beforeValues.map((v) => (typeof v === 'string' ? decl(v) : v)),
		afterDeclarations: afterValues.map((v) => (typeof v === 'string' ? decl(v) : v)),
		closedSet,
	})

const codes = (findings) => findings.map((f) => f.code)

/* ── foreign-var-introduced：会挂的输入 ──────────────────────────────────────── */

test('foreign-var-introduced：改造中新引入一个闭集外的引用', () => {
	const findings = pair(['#0f7a6c'], ['var(--por-brand-primary)'])
	assert.deepEqual(codes(findings), ['foreign-var-introduced'])
	assert.equal(findings[0].var, '--por-brand-primary')
	assert.equal(findings[0].gate, 'theme-api-lock')
	assert.equal(findings[0].level, 'block')
	assert.ok(findings[0].reason.trim())
})

test('判据变异锁：前缀无关——换个前缀照样红（写成 --por/--ti/--cf 黑名单当场变空门）', () => {
	// 华为云那三个前缀是票面举的例子，不是判据。判的是「不在闭集」，私有前缀自然落网。
	assert.deepEqual(codes(pair(['#0f7a6c'], ['var(--brandkit-accent)'])), ['foreign-var-introduced'])
	assert.deepEqual(codes(pair(['#0f7a6c'], ['var(--legacy_Token9)'])), ['foreign-var-introduced'])
})

test('fallback 里的引用同样算引用：外层在闭集内也挡不住内层', () => {
	assert.deepEqual(codes(pair(['#0f7a6c'], ['var(--color-primary, var(--por-brand))'])), ['foreign-var-introduced'])
})

test('一条声明里两个新引用各报一条', () => {
	assert.equal(pair(['#0f7a6c'], ['var(--por-a) var(--por-b)']).length, 2)
})

/* ── 不误伤 ──────────────────────────────────────────────────────────────────── */

test('判据变异锁：--before 里就有的源站私有变量原样保留必须绿（判绝对集合当场误伤）', () => {
	// 渐进迁移的合法形状：只把 accept 行换成闭集变量，其余字面量与源站私有变量原样留下。
	// 判据若改成「产物所有 var() ⊆ 闭集」，本条转红——那会让华为云每页必红。
	assert.deepEqual(pair(['var(--por-legacy)'], ['var(--por-legacy)']), [])
})

test('--before 在别的文件 / 别的选择器上引过，也算已有（引用集不按位置配对）', () => {
	const findings = gateThemeApiLock({
		beforeDeclarations: [decl('var(--por-legacy)', { file: 'a.css', selector: '.x' })],
		afterDeclarations: [decl('var(--por-legacy)', { file: 'b.css', selector: '.y' })],
		closedSet,
	})
	assert.deepEqual(findings, [])
})

test('新引入闭集内的引用是本模式的正常兑现：绿', () => {
	assert.deepEqual(pair(['#0f7a6c'], ['var(--color-primary)']), [])
})

test('变量层的声明不是引用：`:root { --color-primary: #0f7a6c }` 不进射程', () => {
	assert.deepEqual(pair([], [decl('#0f7a6c', { selector: ':root', prop: '--color-primary' })]), [])
})

test('widget 子树两侧同待遇：第三方控件里的引用不判', () => {
	assert.deepEqual(pair([], [decl('var(--por-widget)', { widget: true })]), [])
})

/* ── 编排：门真的接上了 ──────────────────────────────────────────────────────── */

test('gates[] 九行恒在，末行是 theme-api-lock，正例全 ran', () => {
	const r = lintMigration(fixtureInput())
	assert.equal(r.verdict, 'pass', r.findings.map((f) => `${f.gate}:${f.code} ${f.reason}`).join('\n'))
	assert.deepEqual(r.gates.map((g) => g.gate), MIGRATION_GATE_ORDER)
	assert.equal(r.gates.length, 9)
	assert.equal(r.gates[8].gate, 'theme-api-lock')
	assert.ok(r.gates.every((g) => g.status === 'ran'))
})

test('本门堵的洞：defer 行把字面量换成源站私有变量，兑现率仍是 1，本门必报', () => {
	// 兑现率不管（defer 不进分子分母）、残余字面量门也不管（字面量已经没了）。
	// 2026-09-03 起 `verdict-hold-lock` 会在同一处响：defer 行的源值被换掉了。两道**有意重叠**，
	// 判据不同——把 `--por-text-muted` 换成闭集内的 `--color-text-muted`，本门按定义放行，
	// 那时只有 hold 锁能报（那一条钉在 migration-hold.test.mjs）。所以这里断言的是「本门必在
	// 报的门里、且只报这一条 foreign-var-introduced」，不是「它是唯一响的门」。
	const input = fixtureInput()
	const row = input.verdicts.rows.find((r) => r.sourceValue === '#5a6472')
	row.verdict = 'defer'
	const css = input.afterFiles.find((f) => f.rel === 'floor-good.css')
	css.text = css.text.replace('color: var(--color-text-muted);', 'color: var(--por-text-muted);')

	const r = lintMigration(input)
	assert.equal(r.verdict, 'blocked')
	const own = r.findings.filter((f) => f.gate === 'theme-api-lock')
	assert.deepEqual(own.map((f) => f.code), ['foreign-var-introduced'])
	assert.deepEqual(
		[...new Set(r.findings.map((f) => f.gate))].sort(),
		['theme-api-lock', 'verdict-hold-lock'],
		'除了本门与 hold 锁，别的门一道都不许被这一处牵连',
	)
	assert.equal(r.fulfillment.rate, 1, 'defer 行不进兑现率，兑现率那条挡不住这种改动')
	assert.equal(r.gates.find((g) => g.gate === 'theme-api-lock').findings, 1)
	assert.equal(own[0].var, '--por-text-muted')
	assert.equal(own[0].file, 'floor-good.css')
	assert.equal(own[0].selector, '.pt-feature-grid__card-body')
})

test('走 lintMigration：改造中新写一条引用闭集外变量的规则，唯一红的也是本门', () => {
	const input = fixtureInput()
	const css = input.afterFiles.find((f) => f.rel === 'floor-good.css')
	css.text += '\n.pt-extra {\n\tcolor: var(--por-text-secondary);\n}\n'
	const r = lintMigration(input)
	assert.equal(r.verdict, 'blocked')
	assert.deepEqual([...new Set(r.findings.map((f) => f.gate))], ['theme-api-lock'])
	assert.equal(r.findings[0].var, '--por-text-secondary')
	assert.equal(r.findings[0].prop, 'color')
})

test('走 lintMigration 的不误伤：源站私有变量在 before / after 两侧都在，全绿', () => {
	const input = fixtureInput()
	const legacy = '\n.pt-legacy {\n\tcolor: var(--por-legacy);\n}\n'
	for (const files of [input.beforeFiles, input.afterFiles]) {
		const css = files.find((f) => f.rel === 'floor-good.css')
		css.text += legacy
	}
	const r = lintMigration(input)
	assert.equal(r.verdict, 'pass', r.findings.map((f) => `${f.gate}:${f.code} ${f.reason}`).join('\n'))
})

test('主题 API 锁 finding 进 verdict 判定：只有一条 foreign-var-introduced 也必须 blocked', () => {
	assert.equal(
		decideMigrationVerdict([{ gate: 'theme-api-lock', code: 'foreign-var-introduced' }], { rate: 1 }, { rate: null }),
		'blocked',
	)
})

/* ── 两道新门共同的误伤面 ────────────────────────────────────────────────────── */

test('合法优化改动四种：两道新门一条都不开口', () => {
	// 正例（色值换成闭集 var()）已在上面的 gates[] 那条覆盖，这里是另外三种。
	const quiet = (input, label) => {
		const r = lintMigration(input)
		for (const gate of ['breakpoint-lock', 'theme-api-lock']) {
			assert.equal(r.gates.find((g) => g.gate === gate).findings, 0, `${label} 不该让 ${gate} 开口`)
		}
	}

	const onlyClass = fixtureInput()
	for (const files of [onlyClass.beforeFiles, onlyClass.afterFiles]) {
		const html = files.find((f) => f.rel === 'floor-good.html')
		html.text = html.text.replace('class="pt-feature-grid__card"', 'class="pt-feature-grid__card is-new"')
	}
	quiet(onlyClass, '只改 class')

	const onlyPadding = fixtureInput()
	const paddingCss = onlyPadding.afterFiles.find((f) => f.rel === 'floor-good.css')
	paddingCss.text = paddingCss.text.replace('padding: 24px;', 'padding: 32px;')
	quiet(onlyPadding, '只改 padding')

	const keepMedia = fixtureInput()
	const mediaCss = keepMedia.afterFiles.find((f) => f.rel === 'floor-good.css')
	assert.ok(mediaCss.text.includes('@media (max-width: 1023px)'), '夹具两侧本来就带 @media，原样保留是本条的前提')
	quiet(keepMedia, '--before 里已有的 @media 原样保留')
})
