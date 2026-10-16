import test from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { buildCss } from '../scripts/lib/tokens.mjs'
import { ASSET, CLI, FIXTURES, tmpAsset, tmpDir, writeFiles, layeredTokens, COMPONENTS_CSS, COMPONENTS_MD } from './helpers.mjs'

function run(...args) {
	const r = spawnSync(process.execPath, [CLI, ...args], { encoding: 'utf8' })
	let json = null
	try { json = JSON.parse(r.stdout) } catch {}
	return { code: r.status, json, stdout: r.stdout, stderr: r.stderr }
}

test('check: exit 0 on a valid asset, 1 on a broken one, JSON on stdout', () => {
	const ok = run('check', ASSET)
	assert.equal(ok.code, 0)
	assert.equal(ok.json.ok, true)
	assert.equal(run('check', tmpAsset({ 'tokens.css': null })).code, 1)
})

test('css: writes tokens.css, --check reports staleness', () => {
	const dir = tmpAsset({ 'tokens.css': '/* old */\n' })
	assert.equal(run('css', dir, '--check').code, 1)
	assert.equal(run('css', dir).code, 0)
	assert.equal(run('css', dir, '--check').code, 0)
	const read = (d) => fs.readFileSync(path.join(d, 'tokens.css'), 'utf8').replace(/\r\n/g, '\n')
	assert.equal(read(dir), read(ASSET))
	const copy = path.join(tmpDir(), 'tokens.1.0.0.css')
	assert.equal(run('css', dir, '--out', copy, '--scope', '.legacy-app', '--layer', 'theme').code, 0)
	assert.match(fs.readFileSync(copy, 'utf8'), /@layer theme \{\n  \.legacy-app \{/)
	assert.equal(read(dir), read(ASSET), 'the asset copy stays canonical')
	assert.equal(run('css', dir, '--scope', '.x').code, 2)
})

test('lint: warnings alone exit 0, blocking findings exit 1', () => {
	const warnOnly = writeFiles(tmpDir(), { 'a.css': '.a { font-size: 13px; color: var(--zz-text); }' })
	const w = run('lint', '--asset', ASSET, warnOnly)
	assert.equal(w.code, 0)
	assert.equal(w.json.warnings.length, 1)
	const bad = writeFiles(tmpDir(), { 'a.css': '.a { color: #ff0000; }' })
	assert.equal(run('lint', '--asset', ASSET, bad).code, 1)
})

test('baseline: snapshot then compare; drift exits 1', () => {
	const dir = tmpDir()
	const html = path.join(dir, 'p.html')
	fs.copyFileSync(path.join(FIXTURES, 'page', 'index.html'), html)
	const out = path.join(dir, 'baseline.json')
	assert.equal(run('baseline', 'snapshot', html, '--out', out).code, 0)
	assert.equal(run('baseline', 'compare', out, html).code, 0)
	fs.writeFileSync(html, fs.readFileSync(html, 'utf8').replace('构建你的云', '改了'))
	const r = run('baseline', 'compare', out, html)
	assert.equal(r.code, 1)
	assert.equal(r.json.files[0].diffs[0].kind, 'text')
})

test('inventory: JSON by default, markdown with --format md', () => {
	const page = path.join(FIXTURES, 'page', 'index.html')
	assert.ok(run('inventory', page).json.entries.length > 0)
	assert.match(run('inventory', page, '--asset', ASSET, '--format', 'md').stdout, /^\| # \|/m)
})

test('preview: renders every token, pending rows highlighted', () => {
	const out = path.join(tmpDir(), 'preview.html')
	assert.equal(run('preview', ASSET, '--out', out).code, 0)
	const html = fs.readFileSync(out, 'utf8')
	assert.equal((html.match(/<tr( class="pending")?><td>/g) || []).length, 13)
	assert.equal((html.match(/<tr class="pending">/g) || []).length, 4)
	assert.doesNotMatch(html, /<h2>components/)
	const json = layeredTokens()
	const withComponents = tmpAsset({ 'tokens.json': json, 'tokens.css': buildCss(json), 'components.css': COMPONENTS_CSS, 'components.md': COMPONENTS_MD })
	assert.equal(run('preview', withComponents, '--out', out).code, 0)
	const gallery = fs.readFileSync(out, 'utf8')
	assert.match(gallery, /<h2>components \(1\)<\/h2>\n<h3>按钮<\/h3>/)
	assert.doesNotMatch(gallery, /<h3>组件清单/, 'the inventory section is not a component')
	assert.match(gallery, /zz-button--primary is-hover/)
	assert.equal((gallery.match(/<div class="gallery"/g) || []).length, 2)
	assert.match(gallery, /<div class="gallery" style="background:var\(--zz-text\)">\n<button[^>]*>深底/)
	assert.match(gallery, /\.zz-button--primary\.is-hover/)
	assert.equal(run('preview', withComponents, '--out', out, '--components-only').code, 0)
	const only = fs.readFileSync(out, 'utf8')
	assert.match(only, /<h2>components \(1\)<\/h2>/)
	assert.doesNotMatch(only, /<table>/, 'token tables are left out')
	assert.equal(run('preview', ASSET, '--out', out, '--components-only').code, 2)
})

test('outputs never land in the input asset or over input files; refusals exit 2', () => {
	const asset = tmpAsset()
	const page = writeFiles(tmpDir(), {
		'p.html': '<link rel="stylesheet" href="evidence.json"><link rel="stylesheet" href="style.css"><p>x</p>',
		'evidence.json': '{}',
		'style.css': 'p{color:red}'
	})
	const html = path.join(page, 'p.html')
	const style = path.join(page, 'style.css')
	const viaParent = path.join(page, '..', path.basename(page), 'style.css')
	const snapshot = () => fs.readdirSync(page).map((f) => f + ':' + createHash('sha256').update(fs.readFileSync(path.join(page, f))).digest('hex')).join()
	const before = snapshot()
	const cases = [
		run('preview', asset, '--out', path.join(asset, 'layouts', 'review.html')),
		run('baseline', 'snapshot', html, '--out', html),
		run('baseline', 'snapshot', html, '--out', viaParent),
		run('capture', html, '--out', page),
		run('capture', html, '--out', style)
	]
	if (process.platform === 'win32') {
		cases.push(run('capture', html, '--out', page.toUpperCase()), run('baseline', 'snapshot', html, '--out', path.join(page, 'STYLE.CSS')))
	}
	for (const r of cases) {
		assert.equal(r.code, 2)
		assert.match(r.stderr, /^refusing to write [^\n]*\n$/)
	}
	assert.equal(snapshot(), before)
})

test('usage errors exit 2', () => {
	assert.equal(run('nope').code, 2)
	assert.equal(run('lint', ASSET).code, 2)
})

test('nothing to scan or an invalid asset exits 2 with a one-line reason, not a stack', () => {
	const empty = run('lint', '--asset', ASSET, tmpDir())
	assert.equal(empty.code, 2)
	assert.match(empty.stderr, /no scannable files/)
	assert.equal(run('inventory', tmpDir()).code, 2)
	const old = tmpAsset({ 'tokens.json': { tokens: [] } })
	const page = path.join(FIXTURES, 'page')
	for (const r of [run('lint', '--asset', old, page), run('inventory', page, '--asset', old)]) {
		assert.equal(r.code, 2)
		assert.match(r.stderr, /bad-format/)
		assert.doesNotMatch(r.stderr, /\n\s+at /)
	}
})
