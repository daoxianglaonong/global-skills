/**
 * 双闸门：`primitive-leak` 与 `unresolved-var` 必须**同时**关上。
 *
 * 为什么非要两道门，而不是一道「颜色必须走 semantic」：
 *
 * - 只查 `primitive-leak`（确实引了 primitive 层的色变量），把 `--color-neutral-1`
 *   改名成 `--brand-bg` 就溜过去了——名字反解不出 token 路径，判据无从判它是哪一层。
 * - 只查 `unresolved-var`（名字反解不出路径），规规矩矩地写 `var(--color-neutral-1)`
 *   也溜过去了——那是个完全合法、能反解、还在闭集里的名字，只是它不该被直接用。
 *
 * 所以本文件的核心是**两条独立**失败用例：一条只亮前者、一条只亮后者。合并成一条
 * 「双闸门失败」就验不出上面那两种绕法，门看起来在，实际有个对穿的洞。
 *
 * 两门在一类输入上**有意重叠**（顶层是 `color` 却既非色相族也不在角色词表内），那不是
 * 缺陷：`classifyCssVar` 对 `top === 'color'` 一律给 `type: 'color'`，哪怕反解失败。
 * 重叠这件事本身也配了用例，免得下一个人以为是 bug 去「修」掉它。
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { lintFloor } from '../scripts/lint-floor.mjs'
import { gatePrimitiveLeak, gateUnresolvedVar } from '../scripts/lib/gates.mjs'
import { FIXTURE_ASSET, goodHtml, goodCss, mutateCss } from './helpers.mjs'

const lint = (css) => lintFloor({ assetDir: FIXTURE_ASSET, html: goodHtml(), css: [{ file: 'floor.css', text: css }] })
const gatesHit = (result) => [...new Set(result.findings.map((f) => f.gate))].sort()
const decl = (value) => [{ file: 'x.css', selector: '.x', prop: 'color', value }]

test('只漏 primitive-leak：引用一个在闭集里、名字反解得开的 primitive 色变量', () => {
	// --color-neutral-1 是这份资产真有的 token，名字合法，闭集里查得到。它唯一的问题是
	// 层次：色相族刻度是调色盘不是用色决策，越过 semantic 用它，换主题时这一处不会跟着变。
	const r = lint(mutateCss('background-color: var(--color-surface-default);', 'background-color: var(--color-neutral-1);'))

	assert.equal(r.verdict, 'blocked')
	assert.deepEqual(gatesHit(r), ['primitive-leak'], '只该亮 primitive-leak：名字反解得开，也在闭集里')
	assert.ok(r.findings.every((f) => f.var === '--color-neutral-1'))
})

test('只漏 unresolved-var：引用一个反解不出 token 路径、且不是颜色的变量', () => {
	// --foo-bar-baz 的顶层组不在词表内，反解不出 token 路径。它的 type 是 other，
	// 所以 primitive-leak 判据（要求 type === 'color'）碰不到它——这正是要的独立性。
	const r = lint(mutateCss('gap: var(--dimension-spacing-2);', 'gap: var(--foo-bar-baz);'))

	assert.equal(r.verdict, 'blocked')
	const gates = gatesHit(r)
	assert.ok(gates.includes('unresolved-var'), '应当亮 unresolved-var')
	assert.ok(!gates.includes('primitive-leak'), '不该亮 primitive-leak：这不是颜色，两门必须能各自单独触发')
})

test('两条失败用例互不代劳', () => {
	const leakOnly = decl('var(--color-neutral-1)')
	const unresolvedOnly = decl('var(--foo-bar-baz)')

	assert.equal(gatePrimitiveLeak(leakOnly).length, 1)
	assert.equal(gateUnresolvedVar(leakOnly).length, 0, 'primitive 泄漏的那条不该被 unresolved 门抓到')

	assert.equal(gateUnresolvedVar(unresolvedOnly).length, 1)
	assert.equal(gatePrimitiveLeak(unresolvedOnly).length, 0, 'unresolved 的那条不该被 primitive 门抓到')
})

test('把 primitive 色变量改个名并不能绕过整道门', () => {
	// 这就是双闸门存在的全部理由：改名躲开了 A，但躲不开 B。
	const renamed = decl('var(--brand-bg)')
	assert.equal(gatePrimitiveLeak(renamed).length, 0, '改名之后 A 确实判不到了')
	assert.equal(gateUnresolvedVar(renamed).length, 1, 'B 必须接住它，否则整道门有个对穿的洞')
})

test('两门有意重叠的那一类：顶层是 color 但既非色相族也不在角色词表内', () => {
	// classifyCssVar 对 top === 'color' 一律给 type: 'color'，哪怕反解失败，于是
	// --color-brand-primary 会同时点亮两门。这是判据的定义使然，不是 bug，别去「修」。
	const both = decl('var(--color-brand-primary)')
	assert.equal(gatePrimitiveLeak(both).length, 1)
	assert.equal(gateUnresolvedVar(both).length, 1)
})

test('合格楼层两门都不亮', () => {
	const r = lint(goodCss())
	assert.equal(r.findings.filter((f) => f.gate === 'primitive-leak' || f.gate === 'unresolved-var').length, 0)
})

test('第三方 widget 子树在双闸门下同样豁免', () => {
	const r = lint(`${goodCss()}\n[data-pt-widget="third-party"] .x { color: var(--color-neutral-1); }`)
	assert.equal(r.verdict, 'pass')
})
