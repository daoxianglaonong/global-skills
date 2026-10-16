import test from 'node:test'
import assert from 'node:assert/strict'
import { checkAsset } from '../scripts/lib/check-asset.mjs'
import { buildCss } from '../scripts/lib/tokens.mjs'
import { ASSET, tmpAsset, readTokens, codes, layeredTokens, COMPONENTS_CSS, COMPONENTS_MD } from './helpers.mjs'

test('minimal three-file asset passes; optional modules may be absent', () => {
	const r = checkAsset(ASSET)
	assert.deepEqual(r.errors, [])
	assert.equal(r.ok, true)
	assert.equal(r.summary.tokens, 13)
})

test('draft and site-provisional tokens warn as needing human confirmation', () => {
	const r = checkAsset(ASSET)
	const w = r.warnings.find((x) => x.code === 'needs-confirmation')
	assert.ok(w)
	assert.ok(w.ids.includes('color.action.hover'))
	assert.equal(w.count, w.ids.length)
})

test('each required file is required', () => {
	for (const f of ['DESIGN.md', 'tokens.json', 'tokens.css']) {
		const r = checkAsset(tmpAsset({ [f]: null }))
		assert.equal(r.ok, false, f)
		assert.ok(codes(r.errors).includes('missing-file'), f)
	}
})

test('stale tokens.css blocks', () => {
	const r = checkAsset(tmpAsset({ 'tokens.css': ':root { --zz-text: #000; }\n' }))
	assert.ok(codes(r.errors).includes('tokens-css-stale'))
})

test('token errors surface through the asset check', () => {
	const json = readTokens()
	json.tokens['radius.md'].cssVar = 'radius'
	const r = checkAsset(tmpAsset({ 'tokens.json': json, 'tokens.css': buildCss(json) }))
	assert.ok(codes(r.errors).includes('bad-css-var'))
})

test('optional modules: present files are link-checked, broken refs block', () => {
	const ok = tmpAsset({
		'layouts/index.md': '- [Hero](hero.md)\n',
		'layouts/hero.md': '![desktop](../evidence/hero.jpg)\n[外链](https://example.com) [锚](#x)\n',
		'evidence/hero.jpg': 'jpg',
		'voice.md': '# Voice\n'
	})
	assert.deepEqual(checkAsset(ok).errors, [])
	const bad = tmpAsset({ 'recipes/index.md': '- [Landing](landing.md)\n' })
	const r = checkAsset(bad)
	assert.ok(codes(r.errors).includes('broken-ref'))
	assert.match(r.errors[0].where, /recipes/)
})

test('pre-v2 tokens.json is a readable bad-format error; a UTF-8 BOM is tolerated', () => {
	const old = { name: 'x', tokens: [{ id: 'ink', value: '#111', cssVar: '--ink' }] }
	const r = checkAsset(tmpAsset({ 'tokens.json': old }))
	assert.deepEqual([...new Set(codes(r.errors))], ['bad-format'])
	const bom = '\uFEFF' + JSON.stringify(readTokens())
	assert.deepEqual(checkAsset(tmpAsset({ 'tokens.json': bom })).errors, [])
})

test('component layer: components.css gets lint rules; a version needs a CHANGELOG entry', () => {
	const json = layeredTokens()
	const base = { 'tokens.json': json, 'tokens.css': buildCss(json), 'components.md': COMPONENTS_MD }
	const ok = checkAsset(tmpAsset({ ...base, 'components.css': COMPONENTS_CSS, 'CHANGELOG.md': '## 1.1.0\n- 新增 component.button.*\n' }))
	assert.deepEqual(ok.errors, [])
	assert.ok(!codes(ok.warnings).includes('changelog-missing'))
	assert.ok(['components.md', 'components.css', 'CHANGELOG.md'].every((m) => ok.summary.modules.includes(m)))
	const bad = checkAsset(tmpAsset({ ...base, 'components.css': '.zz-tag { color: #ff0000; background: var(--zz-nope); }' }))
	assert.deepEqual(codes(bad.errors), ['color-outside-asset', 'unknown-var'])
	assert.equal(bad.errors[0].where, 'components.css:1')
	assert.ok(codes(bad.warnings).includes('changelog-missing'))
})

test('a non-brand prefix asset with no layouts passes', () => {
	const json = { format: 'page-theme-asset/2', id: 'tiny', tokens: {
		'ink': { type: 'color', value: '#111', cssVar: '--ink', usage: '文字', source: 'user' }
	} }
	const r = checkAsset(tmpAsset({ 'tokens.json': json, 'tokens.css': buildCss(json) }))
	assert.deepEqual(r.errors, [])
})
