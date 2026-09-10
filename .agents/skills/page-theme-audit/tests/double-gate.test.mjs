/**
 * 双闸门：`primitive-leak` 与 `unresolved-var` 必须同时关上。
 *
 * 本文件里各门那条「真会挂的输入」：
 * - primitive-leak：`var(--color-neutral-1)`
 * - unresolved-var：`var(--foo-bar-baz)`
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { lintArtifact } from '../scripts/lint-artifact.mjs'
import { gatePrimitiveLeak, gateUnresolvedVar } from '../scripts/lib/gates.mjs'
import { FIXTURE_ASSET, goodHtml, goodCss, mutateCss } from './helpers.mjs'

const lint = (css) =>
	lintArtifact({
		assetDir: FIXTURE_ASSET,
		files: [
			{ file: 'floor.html', text: goodHtml() },
			{ file: 'floor.css', text: css },
		],
	})
const gatesHit = (result) => [...new Set(result.findings.map((f) => f.gate))].sort()
const decl = (value) => [{ file: 'x.css', selector: '.x', prop: 'color', value }]

test('只漏 primitive-leak：引用一个在闭集里、名字反解得开的 primitive 色变量', () => {
	const r = lint(mutateCss('background-color: var(--color-surface-default);', 'background-color: var(--color-neutral-1);'))

	assert.equal(r.verdict, 'blocked')
	assert.deepEqual(gatesHit(r), ['primitive-leak'], '只该亮 primitive-leak：名字反解得开，也在闭集里')
	assert.ok(r.findings.every((f) => f.var === '--color-neutral-1'))
})

test('只漏 unresolved-var：引用一个反解不出 token 路径、且不是颜色的变量', () => {
	const r = lint(mutateCss('gap: 24px;', 'gap: var(--foo-bar-baz);'))

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
	const renamed = decl('var(--brand-bg)')
	assert.equal(gatePrimitiveLeak(renamed).length, 0, '改名之后 A 确实判不到了')
	assert.equal(gateUnresolvedVar(renamed).length, 1, 'B 必须接住它，否则整道门有个对穿的洞')
})

test('两门有意重叠的那一类：顶层是 color 但既非色相族也不在角色词表内', () => {
	const both = decl('var(--color-brand-primary)')
	assert.equal(gatePrimitiveLeak(both).length, 1)
	assert.equal(gateUnresolvedVar(both).length, 1)
})

test('合格产物两门都不亮', () => {
	const r = lint(goodCss())
	assert.equal(r.findings.filter((f) => f.gate === 'primitive-leak' || f.gate === 'unresolved-var').length, 0)
})

test('第三方 widget 子树在双闸门下同样豁免', () => {
	const r = lint(`${goodCss()}\n[data-pt-widget="third-party"] .x { color: var(--color-neutral-1); }`)
	assert.equal(r.verdict, 'pass')
})
