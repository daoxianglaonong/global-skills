/**
 * 混搭一致性门拆出的接缝：解析层根与反查底色各自单测。
 * 门序与 17 个 code 的行为仍由 paint-consistency.test.mjs 回归。
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseFloorRoots } from '../scripts/lib/paint-floors.mjs'
import { readInlineSurfaces } from '../scripts/lib/paint-surface.mjs'
import { algoStepsForPaint, algoStepsWithoutHandwrittenSurface } from '../scripts/lib/paint-recompute.mjs'
import { loadClosedSet } from '../scripts/lib/closed-set.mjs'
import { FIXTURE_ASSET, goodPageHtml } from './helpers.mjs'

test('parseFloorRoots：页级夹具收齐五个 data-pattern 层根', () => {
	const roots = parseFloorRoots(goodPageHtml())
	assert.deepEqual(
		roots.map((r) => r.pattern),
		['navbar.utility-left', 'hero.centered-pitch', 'feature.grid-3-cards', 'feature.grid-3-cards', 'footer.compact-three'],
	)
})

test('parseFloorRoots：没有 data-pattern 的组件是空数组', () => {
	assert.deepEqual(parseFloorRoots('<article class="pt-card"><h3>卡</h3></article>'), [])
})

test('readInlineSurfaces：引号内分号不切断 background 声明', () => {
	const closedSet = loadClosedSet(FIXTURE_ASSET)
	const names = readInlineSurfaces({ style: `background: url('x;y') var(--color-surface-muted)` }, closedSet)
	assert.deepEqual(names, ['muted'])
})

test('algoStepsWithoutHandwrittenSurface：重建对象不带 surface 键', () => {
	const floorsById = new Map([['feature.grid-3-cards', { role: 'content', taxonomy: 'feature', paint: { ownSurface: 'default' } }]])
	const algo = algoStepsWithoutHandwrittenSurface([{ id: 's1', pattern: 'feature.grid-3-cards', surface: 'image' }], floorsById, 1)
	assert.equal(algo.length, 1)
	assert.ok(!Object.prototype.hasOwnProperty.call(algo[0], 'surface'))
	assert.equal(algo[0].ownSurface, 'default')
})

test('algoStepsForPaint：custom 保留手写 surface', () => {
	const floorsById = new Map([['feature.grid-3-cards', { role: 'content', taxonomy: 'feature', paint: { ownSurface: 'default' } }]])
	const algo = algoStepsForPaint([{ id: 's1', pattern: 'feature.grid-3-cards', surface: 'image' }], floorsById, 1, { keepHandwrittenSurface: true })
	assert.equal(algo[0].surface, 'image')
	assert.equal(algo[0].ownSurface, 'default')
})
