import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { lintArtifacts } from '../scripts/lib/lint.mjs'
import { buildCss } from '../scripts/lib/tokens.mjs'
import { inventory } from '../scripts/lib/inventory.mjs'
import { ASSET, tmpAsset, tmpDir, writeFiles, codes, layeredTokens, readTokens } from './helpers.mjs'

function lintCss(css, extra = {}) {
	const dir = writeFiles(tmpDir(), { 'a.css': css, ...extra })
	return lintArtifacts(ASSET, [dir])
}

test('asset colors pass in any notation; vars from asset pass', () => {
	const r = lintCss('.a { color: rgb(31 35 41); background: #FFF; border: 1px solid var(--zz-action-primary); box-shadow: 0 2px 8px rgba(0,0,0,.12); }')
	assert.deepEqual(r.errors, [])
	assert.equal(r.ok, true)
})

test('blocks: color outside asset, including named colors and var fallbacks', () => {
	const r = lintCss('.a { color: #ff0000; }\n.b { background: tomato; }\n.c { color: var(--zz-text, #123456); }')
	assert.deepEqual(codes(r.errors), ['color-outside-asset', 'color-outside-asset', 'color-outside-asset'])
	assert.equal(r.errors[1].line, 2)
	assert.equal(r.ok, false)
})

test('blocks: unknown var; private token var is unknown; local compliant var is fine', () => {
	const r = lintCss(':root { --local-ink: #1f2329; }\n.a { color: var(--local-ink); background: var(--zz-blue-600); outline-color: var(--nope); }')
	assert.deepEqual(r.errors.map((e) => e.value), ['--zz-blue-600', '--nope'])
	assert.ok(codes(r.errors).every((c) => c === 'unknown-var'))
})

test('a deprecated variable only warns and names its replacement', () => {
	const json = layeredTokens()
	const asset = tmpAsset({ 'tokens.json': json, 'tokens.css': buildCss(json) })
	const r = lintArtifacts(asset, [writeFiles(tmpDir(), { 'a.css': '.a { color: var(--zz-ink); background: var(--zz-button-primary-bg); }' })])
	assert.deepEqual(r.errors, [])
	assert.deepEqual(r.warnings.map((w) => [w.code, w.value]), [['deprecated-var', '--zz-ink']])
	assert.match(r.warnings[0].message, /--zz-text/)
})

test('custom property names are case-sensitive', () => {
	const r = lintCss(':root { --fontFamily-sans: Inter; }\n.a { font-family: var(--fontFamily-sans); color: var(--fontfamily-sans); }')
	assert.deepEqual(r.errors.map((e) => e.value), ['--fontfamily-sans'])
})

test('local var with an off-asset color still blocks', () => {
	const r = lintCss(':root { --local-red: #e00; }')
	assert.deepEqual(codes(r.errors), ['color-outside-asset'])
})

test('blocks: font family outside asset stacks; generic families only when the asset stack has them', () => {
	const ok = lintCss('.a { font-family: "PingFang SC", sans-serif; } .b { font: 600 14px/22px Inter, sans-serif; } .c { font-family: inherit; }')
	assert.deepEqual(ok.errors, [])
	const bad = lintCss('.a { font-family: "Comic Sans MS", Inter; } .b { font: 14px Arial; } .c { font-family: monospace; }')
	assert.deepEqual(codes(bad.errors), ['font-family-outside-asset', 'font-family-outside-asset', 'font-family-outside-asset'])
})

test('unparsed colour functions (oklch, lab, ...) block', () => {
	assert.deepEqual(codes(lintCss('.a { color: oklch(70% 0.1 200); background: lab(50% 20 30); }').errors), ['color-outside-asset', 'color-outside-asset'])
})

test('typography, spacing, radius, border width, breakpoints and asset-colour literals only warn', () => {
	const r = lintCss('.a { font-size: 13px; line-height: 21px; padding: 0 16px 7px 0px; border-radius: 6px; margin: 16px; border: 3px solid var(--zz-text); color: #1f2329; }\n@media (max-width: 1000px) { .a { gap: 16px; } }\n@media (max-width: 767px) { .a { gap: 16px; } }')
	assert.deepEqual(r.errors, [])
	assert.equal(r.ok, true)
	assert.deepEqual(codes(r.warnings).sort(), ['breakpoint-literal', 'color-literal', 'radius-literal', 'scalar-check-skipped', 'spacing-literal', 'typography-literal', 'typography-literal'])
	assert.deepEqual(r.warnings.find((w) => w.code === 'scalar-check-skipped'), { code: 'scalar-check-skipped', file: null, line: null, prop: 'border-width', value: 1, message: 'asset has no border-width tokens; 1 border-width literal(s) not checked' })
})

test('colour-only asset: font, scalar and breakpoint checks step aside without flooding', () => {
	const json = readTokens()
	for (const id of Object.keys(json.tokens)) if (json.tokens[id].type !== 'color') delete json.tokens[id]
	const asset = tmpAsset({ 'tokens.json': json, 'tokens.css': buildCss(json) })
	const css = ':root { --page-gap: 24px; }\n.a { font-family: Arial; font-size: 15px; padding: 13px; margin: 7px 9px; gap: var(--page-gap); border-radius: 3px; }\n@media (max-width: 900px) { .a { padding: 5px; } }'
	const page = writeFiles(tmpDir(), { 'a.css': css })
	const r = lintArtifacts(asset, [page])
	assert.deepEqual(r.errors, [])
	assert.deepEqual(r.warnings.map((w) => [w.code, w.prop, w.value]), [
		['font-check-skipped', 'font-family', 'Arial'],
		['scalar-check-skipped', 'typography', 1],
		['scalar-check-skipped', 'spacing', 4],
		['scalar-check-skipped', 'radius', 1]
	])
	json.tokens['font.weight.strong'] = readTokens().tokens['font.weight.strong']
	const weighted = tmpAsset({ 'tokens.json': json, 'tokens.css': buildCss(json) })
	const w = lintArtifacts(weighted, [writeFiles(tmpDir(), { 'a.css': '.a { font-size: 15px; line-height: 22px; font-weight: 500; }' })])
	assert.deepEqual(w.warnings.map((x) => [x.code, x.prop, x.value]), [['typography-literal', 'font-weight', '500'], ['scalar-check-skipped', 'typography', 2]], 'a weight token does not stand in for a size scale')
	const inv = inventory([page], { assetDir: asset })
	assert.ok(inv.entries.some((e) => e.kind === 'font-family' && e.candidates.length === 0))
	assert.ok(inv.entries.some((e) => e.kind === 'spacing' && e.value === '13px' && e.candidates.length === 0))
})

test('framework files: <style> blocks, style attributes and JSX style objects are scanned', () => {
	const dir = writeFiles(tmpDir(), {
		'A.vue': '<template><p style="color: #abcdef">x</p></template>\n<style scoped>.a { color: #010203; }</style>',
		'B.tsx': 'export const B = () => <div style={{ backgroundColor: "#fedcba", padding: 4 }} />'
	})
	const r = lintArtifacts(ASSET, [dir])
	assert.deepEqual(r.errors.map((e) => e.value).sort(), ['#010203', '#abcdef', '#fedcba'])
	assert.equal(r.files.length, 2)
})

test('nothing scannable is an input error, never a pass', () => {
	const dir = writeFiles(tmpDir(), { 'a.txt': 'color: #ff0000' })
	assert.throws(() => lintArtifacts(ASSET, [dir]), (e) => e.input && /no scannable files/.test(e.message))
	assert.throws(() => lintArtifacts(ASSET, [path.join(dir, 'missing')]), (e) => e.input)
})

test('html: <style>, style attributes and linked local css are scanned', () => {
	const dir = writeFiles(tmpDir(), {
		'p.html': '<link rel="stylesheet" href="x.css">\n<style>.a{color:#abcdef}</style>\n<div style="background: #fedcba"></div>',
		'x.css': '.b { color: #010203; }'
	})
	const r = lintArtifacts(ASSET, [path.join(dir, 'p.html')])
	assert.deepEqual(r.errors.map((e) => e.value).sort(), ['#010203', '#abcdef', '#fedcba'])
	assert.equal(r.errors.find((e) => e.value === '#fedcba').line, 3)
})

test('the generated tokens.css copied into the product is skipped', () => {
	const dir = tmpDir()
	fs.copyFileSync(path.join(ASSET, 'tokens.css'), path.join(dir, 'tokens.css'))
	const r = lintArtifacts(ASSET, [dir])
	assert.deepEqual(r.errors, [])
	assert.deepEqual(r.files, [])
})

test('comments and url() payloads are ignored', () => {
	const r = lintCss('/* color: #ff0000 */ .a { background: url("data:image/svg+xml;utf8,<svg fill=%23ff0000>"); }')
	assert.deepEqual(r.errors, [])
})
