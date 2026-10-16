import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { buildCss, validateTokens, resolveValue, vocabulary } from '../scripts/lib/tokens.mjs'
import { ASSET, readTokens, codes, layeredTokens } from './helpers.mjs'

test('fixture tokens are valid and tokens.css rebuilds byte-for-byte', () => {
	const json = readTokens()
	assert.deepEqual(validateTokens(json), [])
	const onDisk = fs.readFileSync(path.join(ASSET, 'tokens.css'), 'utf8').replace(/\r\n/g, '\n')
	assert.equal(buildCss(json), onDisk)
})

test('cssVar is taken verbatim, any prefix works', () => {
	const css = buildCss(readTokens())
	assert.match(css, /--zz-text: #1f2329;/)
	const json = readTokens()
	json.tokens['color.text.default'].cssVar = '--Brand_Ink'
	assert.match(buildCss(json), /--Brand_Ink: #1f2329;/)
})

test('private tokens are not exported; aliases to them resolve to literals', () => {
	const css = buildCss(readTokens())
	assert.doesNotMatch(css, /--zz-blue-600:/)
	assert.match(css, /--zz-action-primary: #1a5fd6;/)
	assert.match(css, /--zz-text-link: var\(--zz-action-primary\);/)
})

test('component tokens stay var() of their semantic token; deprecated names alias; scope and layer wrap copies', () => {
	const json = layeredTokens()
	assert.deepEqual(validateTokens(json), [])
	const css = buildCss(json)
	assert.match(css, /--zz-button-primary-bg: var\(--zz-action-primary\);/)
	assert.match(css, /--zz-ink: var\(--zz-text\);/)
	assert.equal(css.split('\n')[1], '/* acme-test 1.1.0 */')
	assert.match(css, /\n:root \{\n  --zz-action-primary/)
	const copy = buildCss(json, { scope: '.app', layer: 'theme' })
	assert.match(copy, /\n@layer theme \{\n  \.app \{\n    --zz-action-primary: #1a5fd6;/)
	assert.match(copy, /\n  \}\n\}\n$/)
})

test('component, deprecation and version rules', () => {
	const json = layeredTokens()
	const t = json.tokens
	json.version = 'v1'
	t['color.text.old'].replacedBy = 'color.blue.600'
	t['component.button.primary.bg'].value = '{color.blue.600}'
	t['component.button.text'] = { type: 'color', value: '#ffffff', cssVar: '--zz-button-text', usage: 'x', source: 'spec' }
	t['component.button.border'] = { type: 'color', value: '#ffffff', cssVar: '--zz-button-border', usage: 'x', source: 'spec', note: '规范印的固定白描边' }
	const found = validateTokens(json)
	assert.deepEqual(codes(found).sort(), ['bad-replaced-by', 'bad-version', 'component-ref', 'component-ref'])
	assert.ok(!found.some((e) => e.where === 'component.button.border'))
})

test('valuePolicy spec-only rejects site-provisional and draft tokens', () => {
	const json = readTokens()
	assert.deepEqual(validateTokens(json), [])
	json.valuePolicy = 'spec-only'
	const found = validateTokens(json)
	assert.deepEqual([...new Set(codes(found))], ['spec-only-source'])
	assert.deepEqual(found.map((e) => e.where).sort(), ['breakpoint.md', 'color.action.hover', 'color.surface.page', 'space.4'])
	json.valuePolicy = 'strict'
	assert.ok(codes(validateTokens(json)).includes('bad-value-policy'))
})

test('alias resolution follows chains', () => {
	const { tokens } = readTokens()
	assert.equal(resolveValue(tokens, 'color.text.link'), '#1a5fd6')
})

test('validation catches missing cssVar, duplicates, bad alias, cycles, bad color', () => {
	const json = readTokens()
	const t = json.tokens
	delete t['radius.md'].cssVar
	t['space.4'].cssVar = '--zz-text'
	t['color.text.default'].value = '{color.nope}'
	t['color.surface.page'].value = '{color.action.hover}'
	t['color.action.hover'].value = '{color.surface.page}'
	t['shadow.card'].source = 'guess'
	t['shadow.card'].specName = 3
	t['font.size.body'].usage = ''
	json.tokens['color.bad'] = { type: 'color', value: 'blurple', cssVar: '--zz-bad', usage: 'x', source: 'spec' }
	const found = codes(validateTokens(json))
	for (const c of ['missing-css-var', 'duplicate-css-var', 'unknown-alias', 'alias-cycle', 'bad-source', 'missing-usage', 'bad-color', 'bad-spec-name']) {
		assert.ok(found.includes(c), `expected ${c} in ${found}`)
	}
})

test('vocabulary exposes public vars, colors from all tokens, font families, breakpoints', () => {
	const v = vocabulary(readTokens())
	assert.ok(v.cssVars.has('--zz-action-primary'))
	assert.ok(!v.cssVars.has('--zz-blue-600'))
	assert.ok(v.colors.has('#1a5fd6ff'))
	assert.ok(v.colors.has('#0000001f'), 'shadow colors count as asset colors')
	assert.ok(v.fontFamilies.has('pingfang sc'))
	assert.deepEqual(v.breakpoints, [768])
})
