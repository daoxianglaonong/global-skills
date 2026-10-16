import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { snapshotHtml, compareSnapshots } from '../scripts/lib/baseline.mjs'
import { lintArtifacts } from '../scripts/lib/lint.mjs'
import { ASSET, FIXTURES, tmpDir, writeFiles, codes } from './helpers.mjs'

const before = fs.readFileSync(path.join(FIXTURES, 'page', 'index.html'), 'utf8')
const kinds = (diffs) => diffs.map((d) => d.kind)

test('snapshot captures text, links, images and structure', () => {
	const s = snapshotHtml(before)
	assert.ok(s.text.includes('构建你的云'))
	assert.deepEqual(s.links, ['/docs'])
	assert.deepEqual(s.images, [{ src: 'hero.png', alt: '主视觉' }])
	assert.ok(s.structure.includes('3:h1'))
})

test('pure restyle is not drift: classes, inline style, stylesheet links may change', () => {
	const after = before
		.replace('class="cta"', 'class="btn btn-primary" style="color: var(--zz-text)"')
		.replace('<link rel="stylesheet" href="page.css">', '<link rel="stylesheet" href="tokens.css"><link rel="stylesheet" href="page.css"><style>.x{}</style>')
	assert.deepEqual(compareSnapshots(snapshotHtml(before), snapshotHtml(after)), [])
})

test('text, link, image and DOM changes are drift', () => {
	const cases = {
		text: before.replace('立即试用', '免费试用'),
		links: before.replace('/docs', '/doc'),
		images: before.replace('hero.png', 'hero2.png'),
		structure: before.replace('<div id="block" class="block"></div>', '<section><div id="block" class="block"></div></section>')
	}
	for (const [kind, after] of Object.entries(cases)) {
		assert.deepEqual([...new Set(kinds(compareSnapshots(snapshotHtml(before), snapshotHtml(after))))], [kind], kind)
	}
})

test('form text counts as text, <title> is its own aspect; every difference is listed', () => {
	const s = snapshotHtml('<title>T</title><textarea>备注</textarea><input value="张三" placeholder="姓名"><p>a</p><p>b</p>')
	assert.deepEqual(s.text, ['备注', '张三', '姓名', 'a', 'b'])
	assert.deepEqual(s.title, ['T'])
	const after = snapshotHtml('<title>T2</title><textarea>备注</textarea><input value="李四" placeholder="姓名"><p>a</p><p>c</p>')
	assert.deepEqual(compareSnapshots(s, after).map((d) => `${d.kind}:${d.after}`), ['title:T2', 'text:李四', 'text:c'])
})

test('a changed <title> is blocking baseline drift in lint', () => {
	const dir = writeFiles(tmpDir(), { 'p.html': before.replace('Fixture Page', 'Other Title') })
	const r = lintArtifacts(ASSET, [path.join(dir, 'p.html')], { baseline: { files: [{ file: 'index.html', ...snapshotHtml(before) }] } })
	assert.deepEqual(r.errors.map((e) => `${e.code}:${e.prop}`), ['baseline-drift:title'])
})

test('lint --baseline turns drift into a blocking error', () => {
	const dir = writeFiles(tmpDir(), { 'p.html': before.replace('文档', '帮助') })
	const baseline = { files: [{ file: 'index.html', ...snapshotHtml(before) }] }
	const r = lintArtifacts(ASSET, [path.join(dir, 'p.html')], { baseline })
	assert.ok(codes(r.errors).includes('baseline-drift'))
})
