/**
 * 门 (e) primitive-dont-id。
 *
 * 真会挂的输入：删掉 fixture 里 `color.orange.1` 的 `dontId`；或把它改成 DESIGN.md 里没有的 id。
 * 不判 DESIGN.md 那一行的文字是否真点到这条色阶；non-primitive 那一半归采集侧。
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { lintArtifact } from '../scripts/lint-artifact.mjs'
import { copyFixtureAsset, goodHtml, goodCss, FIXTURE_ASSET } from './helpers.mjs'

const lintOn = (assetDir) =>
	lintArtifact({
		assetDir,
		files: [
			{ file: 'floor.html', text: goodHtml() },
			{ file: 'floor.css', text: goodCss() },
		],
	})

function patchOrangeDontId(dir, mutator) {
	const file = path.join(dir, 'tokens.json')
	const tokens = JSON.parse(fs.readFileSync(file, 'utf8'))
	const ext = tokens.color.orange['1'].$extensions['page-theme']
	mutator(ext)
	fs.writeFileSync(file, JSON.stringify(tokens, null, 2))
}

test('删掉 color.orange.1 的 dontId → primitive-dont-id-missing', (t) => {
	const dir = copyFixtureAsset(t)
	patchOrangeDontId(dir, (ext) => {
		delete ext.dontId
	})

	const r = lintOn(dir)
	assert.equal(r.verdict, 'blocked')
	const hits = r.findings.filter((f) => f.gate === 'primitive-dont-id')
	assert.equal(hits.length, 1)
	assert.equal(hits[0].code, 'primitive-dont-id-missing')
	assert.equal(hits[0].tokenPath, 'color.orange.1')
	assert.equal(hits[0].assetFile, 'DESIGN.md')
	assert.ok(!('dontId' in hits[0]) || hits[0].dontId == null)
})

test('把 color.orange.1 的 dontId 改成 DESIGN.md 里没有的 id → primitive-dont-id-orphan', (t) => {
	const dir = copyFixtureAsset(t)
	patchOrangeDontId(dir, (ext) => {
		ext.dontId = 'design-dont-not-in-this-file'
	})

	const r = lintOn(dir)
	assert.equal(r.verdict, 'blocked')
	const hits = r.findings.filter((f) => f.gate === 'primitive-dont-id')
	assert.equal(hits.length, 1)
	assert.equal(hits[0].code, 'primitive-dont-id-orphan')
	assert.equal(hits[0].tokenPath, 'color.orange.1')
	assert.equal(hits[0].dontId, 'design-dont-not-in-this-file')
})

test('冻结 fixture 过门 (e)：orange.1 是射程内唯一 primitive，accent 是 semantic 不归本门', () => {
	const r = lintOn(FIXTURE_ASSET)
	assert.equal(r.verdict, 'pass', `fixture 该过门：\n${r.findings.map((f) => `[${f.gate}] ${f.reason}`).join('\n')}`)
	const row = r.gates.find((g) => g.gate === 'primitive-dont-id')
	assert.equal(row.status, 'pass')
	assert.equal(row.findings, 0)
})

test('两个 primitive 共指同一个 dontId → 过门，不判唯一性', (t) => {
	const dir = copyFixtureAsset(t)
	const file = path.join(dir, 'tokens.json')
	const tokens = JSON.parse(fs.readFileSync(file, 'utf8'))
	const orangeDontId = tokens.color.orange['1'].$extensions['page-theme'].dontId
	assert.equal(typeof orangeDontId, 'string')
	const tealExt = tokens.color.teal['1'].$extensions['page-theme']
	assert.equal(tealExt.observed, true, '派生前 teal.1 必须是另一条 primitive，不能手写精简形状')
	tealExt.observed = false
	tealExt.dontId = orangeDontId
	fs.writeFileSync(file, JSON.stringify(tokens, null, 2))

	const r = lintOn(dir)
	const hits = r.findings.filter((f) => f.gate === 'primitive-dont-id')
	assert.equal(hits.length, 0, '多个 primitive 共指同一行是预期形态；给门加上唯一性检查后本条转红')
	assert.equal(r.gates.find((g) => g.gate === 'primitive-dont-id').status, 'pass')
})

test('non-primitive 的 observed:false 缺 dontId 不归本门', (t) => {
	const dir = copyFixtureAsset(t)
	const file = path.join(dir, 'tokens.json')
	const tokens = JSON.parse(fs.readFileSync(file, 'utf8'))
	delete tokens.color.accent.$root.$extensions['page-theme'].dontId
	fs.writeFileSync(file, JSON.stringify(tokens, null, 2))

	const r = lintOn(dir)
	assert.equal(
		r.findings.filter((f) => f.gate === 'primitive-dont-id').length,
		0,
		'color.accent.$root 是 semantic，归采集侧',
	)
})
