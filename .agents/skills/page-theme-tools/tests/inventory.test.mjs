import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { inventory, inventoryMarkdown } from '../scripts/lib/inventory.mjs'
import { buildCss } from '../scripts/lib/tokens.mjs'
import { ASSET, FIXTURES, tmpDir, tmpAsset, writeFiles, readTokens } from './helpers.mjs'

test('groups source values by value x usage with counts and locations', () => {
	const dir = writeFiles(tmpDir(), { 'a.css': '.a { color: #1A5FD6; }\n.b { color: rgb(26,95,214); background: #1a5fd6; }\n.c { color: #1b60d7; }' })
	const { entries } = inventory([dir])
	const text = entries.find((e) => e.kind === 'color' && e.value === '#1a5fd6' && e.usage === 'text')
	assert.equal(text.count, 2)
	assert.equal(text.locations.length, 2)
	assert.ok(entries.find((e) => e.value === '#1a5fd6' && e.usage === 'background'))
})

test('a generated tokens.css is not inventoried', () => {
	const dir = writeFiles(tmpDir(), { 'a.css': '.a { color: #123456; }' })
	fs.copyFileSync(path.join(ASSET, 'tokens.css'), path.join(dir, 'tokens.css'))
	assert.deepEqual(inventory([dir]).entries.map((e) => e.value), ['#123456'])
})

test('with an asset, candidates are ranked by deltaE and exact matches are flagged', () => {
	const dir = writeFiles(tmpDir(), { 'a.css': '.c { color: #1b60d7; } .d { color: #1a5fd6; } .e { color: var(--legacy-blue); }' })
	const { entries } = inventory([dir], { assetDir: ASSET })
	const near = entries.find((e) => e.value === '#1b60d7')
	assert.equal(near.candidates[0].cssVar, '--zz-action-primary')
	assert.equal(near.candidates[0].exact, false)
	assert.ok(near.candidates[0].deltaE00 > 0)
	const exact = entries.find((e) => e.value === '#1a5fd6')
	assert.equal(exact.candidates[0].exact, true)
	const legacy = entries.find((e) => e.kind === 'var')
	assert.equal(legacy.candidates[0].id, 'color.action.primary')
})

test('colour candidates prefer tokens whose usage fits the source usage and selector role, then deltaE', () => {
	const json = readTokens()
	json.tokens['color.brand.aux'] = { type: 'color', value: '#1b60d7', cssVar: '--zz-brand-aux', usage: '辅助蓝，插图与图表', source: 'spec' }
	const asset = tmpAsset({ 'tokens.json': json, 'tokens.css': buildCss(json) })
	const dir = writeFiles(tmpDir(), { 'a.css': '.btn-primary { background: #1b60d7; }\n.btn-primary:hover { background: #1b60d7; }\n.chart .bar { fill: #1b60d7; }' })
	const r = inventory([dir], { assetDir: asset })
	const btn = r.entries.find((e) => e.role === 'button' && !e.state)
	assert.equal(btn.usage, 'background')
	assert.deepEqual(btn.candidates.map((c) => c.cssVar), ['--zz-action-primary', '--zz-action-hover', '--zz-brand-aux'])
	assert.equal(btn.candidates[0].usage, '主按钮底色、文字链接')
	assert.equal(r.entries.find((e) => e.role === 'button' && e.state === 'hover').candidates[0].cssVar, '--zz-action-hover')
	const bar = r.entries.find((e) => e.usage === 'icon')
	assert.equal(bar.candidates[0].cssVar, '--zz-brand-aux', 'no usage or role hint: exact match first')
	assert.match(inventoryMarkdown(r), /background · button \|.*--zz-action-primary \(ΔE [\d.]+\)：主按钮底色/)
})

test('fixture page inventory covers colors, fonts and dimensions; markdown renders one row per entry', () => {
	const r = inventory([path.join(FIXTURES, 'page', 'index.html')], { assetDir: ASSET })
	const kinds = new Set(r.entries.map((e) => e.kind))
	for (const k of ['color', 'font-family', 'spacing', 'radius', 'var']) assert.ok(kinds.has(k), k)
	const md = inventoryMarkdown(r)
	assert.equal(md.split('\n').filter((l) => /^\| \d+ \|/.test(l)).length, r.entries.length)
	assert.doesNotMatch(md, /decision|accept|决定/)
})
