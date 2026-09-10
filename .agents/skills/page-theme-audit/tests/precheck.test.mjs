/**
 * 资产前置与产物收件：缺件硬失败，不在残件上出结论。
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { lintArtifact } from '../scripts/lint-artifact.mjs'
import { collectArtifactFiles } from '../scripts/lib/collect-artifact.mjs'
import { copyFixtureAsset, tempDir, writeArtifact, goodHtml, goodCss, SCRIPTS_DIR, FIXTURE_ASSET } from './helpers.mjs'

const lintOn = (assetDir, files) =>
	lintArtifact({
		assetDir,
		files: files ?? [
			{ file: 'floor.html', text: goodHtml() },
			{ file: 'floor.css', text: goodCss() },
		],
	})

test('资产目录不存在 → asset-missing，findings 为空', () => {
	const r = lintOn(path.join(os.tmpdir(), 'page-theme-audit-no-such-asset'))
	assert.equal(r.verdict, 'blocked')
	assert.equal(r.precheck.code, 'asset-missing')
	assert.deepEqual(r.findings, [])
	assert.ok(!r.gates)
	assert.match(r.precheck.nextAction, /--asset/, '缺件必须用 nextAction 指出下一步')
})

test('缺四份必读件之一 → asset-incomplete，不在残件上出结论', (t) => {
	const dir = copyFixtureAsset(t)
	fs.rmSync(path.join(dir, 'DESIGN.md'))
	const r = lintOn(dir)
	assert.equal(r.verdict, 'blocked')
	assert.equal(r.precheck.code, 'asset-incomplete')
	assert.equal(r.precheck.file, 'DESIGN.md')
	assert.deepEqual(r.findings, [])
	assert.match(r.precheck.nextAction, /DESIGN\.md/)
})

test('closed-set.json 解不开 → closed-set-unparseable', (t) => {
	const dir = copyFixtureAsset(t)
	fs.writeFileSync(path.join(dir, 'closed-set.json'), '{ not json')
	const r = lintOn(dir)
	assert.equal(r.verdict, 'blocked')
	assert.equal(r.precheck.code, 'closed-set-unparseable')
	assert.equal(r.precheck.file, 'closed-set.json')
	assert.match(r.precheck.nextAction, /closed-set\.json/)
})

test('tokens.json 解不开 → asset-incomplete，不在残件上出结论', (t) => {
	const dir = copyFixtureAsset(t)
	fs.writeFileSync(path.join(dir, 'tokens.json'), '{ not json')
	const r = lintOn(dir)
	assert.equal(r.verdict, 'blocked')
	assert.equal(r.precheck.code, 'asset-incomplete')
	assert.equal(r.precheck.file, 'tokens.json')
	assert.deepEqual(r.findings, [])
	assert.ok(!r.gates)
	assert.match(r.precheck.nextAction, /tokens\.json/)
})

test('产物一份 html/css 都收不到 → artifact-empty', (t) => {
	const dir = tempDir(t)
	fs.writeFileSync(path.join(dir, 'readme.txt'), 'no artifacts')
	const r = lintArtifact({ assetDir: FIXTURE_ASSET, artifact: dir })
	assert.equal(r.verdict, 'blocked')
	assert.equal(r.precheck.code, 'artifact-empty')
	assert.deepEqual(r.findings, [])
	assert.match(r.precheck.nextAction, /\.html|\.css|产物/)
})

test('前置失败的 nextAction 按 code 给出可执行提示，且各 code 互不相同', (t) => {
	const missing = lintOn(path.join(os.tmpdir(), 'page-theme-audit-no-such-asset'))
	const incompleteDir = copyFixtureAsset(t)
	fs.rmSync(path.join(incompleteDir, 'voice.md'))
	const incomplete = lintOn(incompleteDir)
	const unparseableDir = copyFixtureAsset(t)
	fs.writeFileSync(path.join(unparseableDir, 'closed-set.json'), '{ not json')
	const unparseable = lintOn(unparseableDir)
	const emptyDir = tempDir(t)
	fs.writeFileSync(path.join(emptyDir, 'readme.txt'), 'no artifacts')
	const empty = lintArtifact({ assetDir: FIXTURE_ASSET, artifact: emptyDir })

	const byCode = {
		'asset-missing': missing.precheck,
		'asset-incomplete': incomplete.precheck,
		'closed-set-unparseable': unparseable.precheck,
		'artifact-empty': empty.precheck,
	}
	for (const [code, pre] of Object.entries(byCode)) {
		assert.equal(pre.code, code)
		assert.equal(typeof pre.nextAction, 'string', `${code} 必须带 nextAction`)
		assert.ok(pre.nextAction.length > 8, `${code} 的 nextAction 必须是一句可执行提示`)
	}
	const texts = Object.values(byCode).map((p) => p.nextAction)
	assert.equal(new Set(texts).size, texts.length, '四个 code 的 nextAction 不得写成同一句')
})

test('目录递归收 html/css，跳过 node_modules 与点开头目录，按相对路径升序', (t) => {
	const dir = tempDir(t)
	fs.mkdirSync(path.join(dir, 'node_modules', 'x'), { recursive: true })
	fs.mkdirSync(path.join(dir, '.hidden'), { recursive: true })
	fs.mkdirSync(path.join(dir, 'b'), { recursive: true })
	fs.writeFileSync(path.join(dir, 'node_modules', 'x', 'skip.css'), '.x{color:red}')
	fs.writeFileSync(path.join(dir, '.hidden', 'skip.html'), '<p>no</p>')
	fs.writeFileSync(path.join(dir, 'b', 'z.css'), '.z{}')
	fs.writeFileSync(path.join(dir, 'a.html'), '<p>a</p>')

	const { files } = collectArtifactFiles(dir)
	assert.deepEqual(
		files.map((f) => f.rel),
		['a.html', 'b/z.css'],
	)
})

test('--asset 缺了 CLI 退 1', (t) => {
	const art = writeArtifact(path.join(tempDir(t), 'art'))
	const r = spawnSync(process.execPath, [path.join(SCRIPTS_DIR, 'lint-artifact.mjs'), '--artifact', art.dir], {
		encoding: 'utf8',
	})
	assert.equal(r.status, 1)
})

test('CLI 对合格产物退 0，对坏产物退 1，不用 2', (t) => {
	const good = writeArtifact(path.join(tempDir(t), 'good'))
	const bad = writeArtifact(path.join(tempDir(t), 'bad'), {
		css: goodCss().replace('border: 1px solid var(--color-border-default);', 'border: 1px solid #fff;'),
	})
	const run = (artifact) =>
		spawnSync(process.execPath, [path.join(SCRIPTS_DIR, 'lint-artifact.mjs'), '--asset', FIXTURE_ASSET, '--artifact', artifact], {
			encoding: 'utf8',
		})
	assert.equal(run(good.dir).status, 0)
	assert.equal(run(bad.dir).status, 1)
})
