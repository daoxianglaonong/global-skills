/**
 * 真走 CLI：八个准入 code、gates[] 八行恒在、退出码。
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { FIXTURE_ASSET, SCRIPTS_DIR, tempDir } from './helpers.mjs'

const FIX = path.join(import.meta.dirname, 'fixtures', 'migration')
const SCRIPT = path.join(SCRIPTS_DIR, 'lint-migration.mjs')

function runCli(args) {
	try {
		const stdout = execFileSync(process.execPath, [SCRIPT, ...args], {
			encoding: 'utf8',
			stdio: ['ignore', 'pipe', 'pipe'],
		})
		return { code: 0, stdout }
	} catch (e) {
		return { code: e.status, stdout: `${e.stdout ?? ''}${e.stderr ?? ''}` }
	}
}

function parseOut(r) {
	const start = r.stdout.indexOf('{')
	assert.ok(start >= 0, `stdout 没有 JSON：\n${r.stdout}`)
	return JSON.parse(r.stdout.slice(start))
}

function writeJson(t, name, doc) {
	const file = path.join(tempDir(t, 'page-theme-verdicts-'), name)
	fs.writeFileSync(file, typeof doc === 'string' ? doc : JSON.stringify(doc, null, 2))
	return file
}

const baseArgs = () => [
	'--asset',
	FIXTURE_ASSET,
	'--before',
	path.join(FIX, 'before'),
	'--after',
	path.join(FIX, 'after'),
	'--verdicts',
	path.join(FIX, 'verdicts.json'),
	'--type-verdicts',
	path.join(FIX, 'type-verdicts.json'),
]

test('合格迁移 CLI 退 0，gates[] 九行恒在', (t) => {
	const jsonPath = path.join(tempDir(t), 'lint-migration.json')
	const r = runCli([...baseArgs(), '--json', jsonPath])
	assert.equal(r.code, 0, r.stdout)
	const doc = JSON.parse(fs.readFileSync(jsonPath, 'utf8'))
	assert.equal(doc.verdict, 'pass')
	assert.equal(doc.styleSetId, 'fixture-lanyuan-lab')
	assert.equal(doc.fulfillment.rate, 1)
	assert.equal(doc.typeFulfillment.rate, null, '两行 space 都裁 omit，非色分母为 0')
	assert.deepEqual(
		doc.gates.map((g) => g.gate),
		[
			'accept-fulfillment',
			'literal-verdict-backing',
			'type-accept-fulfillment',
			'type-literal-backing',
			'verdict-hold-lock',
			'content-lock',
			'structure-lock',
			'breakpoint-lock',
			'theme-api-lock',
		],
	)
	assert.equal(doc.gates.length, 9)
	assert.ok(doc.gates.every((g) => g.status === 'ran'))
})

test('门失败时仍写出 gates[] 九行，退 1', (t) => {
	const after = path.join(tempDir(t, 'page-theme-after-'), 'after')
	fs.mkdirSync(after, { recursive: true })
	fs.copyFileSync(path.join(FIX, 'after', 'floor-good.html'), path.join(after, 'floor-good.html'))
	fs.copyFileSync(path.join(FIX, 'after', 'floor-good.css'), path.join(after, 'floor-good.css'))
	const css = fs.readFileSync(path.join(after, 'floor-good.css'), 'utf8').replace(
		'background-color: var(--color-primary);',
		'background-color: #0f7a6c;',
	)
	fs.writeFileSync(path.join(after, 'floor-good.css'), css)
	fs.copyFileSync(path.join(FIX, 'after', 'theme-vars.css'), path.join(after, 'theme-vars.css'))
	const jsonPath = path.join(tempDir(t), 'out.json')
	const r = runCli([
		'--asset',
		FIXTURE_ASSET,
		'--before',
		path.join(FIX, 'before'),
		'--after',
		after,
		'--verdicts',
		path.join(FIX, 'verdicts.json'),
		'--type-verdicts',
		path.join(FIX, 'type-verdicts.json'),
		'--json',
		jsonPath,
	])
	assert.equal(r.code, 1)
	const doc = JSON.parse(fs.readFileSync(jsonPath, 'utf8'))
	assert.equal(doc.verdict, 'blocked')
	assert.equal(doc.gates.length, 9)
	assert.deepEqual(
		doc.gates.map((g) => g.gate),
		[
			'accept-fulfillment',
			'literal-verdict-backing',
			'type-accept-fulfillment',
			'type-literal-backing',
			'verdict-hold-lock',
			'content-lock',
			'structure-lock',
			'breakpoint-lock',
			'theme-api-lock',
		],
	)
})

test('--json 写文件的同时仍打 stdout', (t) => {
	const jsonPath = path.join(tempDir(t), 'lint-migration.json')
	const r = runCli([...baseArgs(), '--json', jsonPath])
	assert.equal(r.code, 0, r.stdout)
	const fromFile = JSON.parse(fs.readFileSync(jsonPath, 'utf8'))
	const fromStdout = parseOut(r)
	assert.deepEqual(fromStdout, fromFile)
})

test('CLI 改文案：content-lock 经编排退 1', (t) => {
	const after = path.join(tempDir(t, 'page-theme-after-'), 'after')
	fs.mkdirSync(after, { recursive: true })
	const html = fs.readFileSync(path.join(FIX, 'after', 'floor-good.html'), 'utf8').replace('研究方法', '研究办法')
	fs.writeFileSync(path.join(after, 'floor-good.html'), html)
	fs.copyFileSync(path.join(FIX, 'after', 'floor-good.css'), path.join(after, 'floor-good.css'))
	fs.copyFileSync(path.join(FIX, 'after', 'theme-vars.css'), path.join(after, 'theme-vars.css'))
	const r = runCli([
		'--asset',
		FIXTURE_ASSET,
		'--before',
		path.join(FIX, 'before'),
		'--after',
		after,
		'--verdicts',
		path.join(FIX, 'verdicts.json'),
		'--type-verdicts',
		path.join(FIX, 'type-verdicts.json'),
	])
	assert.equal(r.code, 1)
	assert.ok(parseOut(r).findings.some((f) => f.gate === 'content-lock' && f.code === 'text-changed'))
})

test('CLI 包一层容器：structure-lock 经编排退 1，content-lock 零 finding', (t) => {
	const after = path.join(tempDir(t, 'page-theme-after-'), 'after')
	fs.mkdirSync(after, { recursive: true })
	const html = fs.readFileSync(path.join(FIX, 'after', 'floor-good.html'), 'utf8')
	fs.writeFileSync(path.join(after, 'floor-good.html'), `<div class="wrapper">\n${html}\n</div>`)
	fs.copyFileSync(path.join(FIX, 'after', 'floor-good.css'), path.join(after, 'floor-good.css'))
	fs.copyFileSync(path.join(FIX, 'after', 'theme-vars.css'), path.join(after, 'theme-vars.css'))
	const r = runCli([
		'--asset',
		FIXTURE_ASSET,
		'--before',
		path.join(FIX, 'before'),
		'--after',
		after,
		'--verdicts',
		path.join(FIX, 'verdicts.json'),
		'--type-verdicts',
		path.join(FIX, 'type-verdicts.json'),
	])
	assert.equal(r.code, 1)
	const doc = parseOut(r)
	assert.ok(doc.findings.some((f) => f.gate === 'structure-lock' && f.code === 'tag-changed'))
	assert.equal(doc.gates.find((g) => g.gate === 'content-lock').findings, 0)
})

test('CLI 换背景图：css-url-changed 经编排退 1，读的是磁盘上的 .css', (t) => {
	// 真从磁盘收 `.css`，不是内存喂声明：`collectArtifactFiles` → `splitHtmlCss` → 内容锁
	// 这一整条路必须通，否则 css-url-changed 是空门。
	const root = tempDir(t, 'page-theme-url-')
	const before = path.join(root, 'before')
	const after = path.join(root, 'after')
	fs.mkdirSync(before, { recursive: true })
	fs.mkdirSync(after, { recursive: true })
	const decl = (url) => `\n.pt-hero { background-image: url("${url}"); }\n`
	fs.copyFileSync(path.join(FIX, 'before', 'floor-good.html'), path.join(before, 'floor-good.html'))
	fs.copyFileSync(path.join(FIX, 'after', 'floor-good.html'), path.join(after, 'floor-good.html'))
	fs.writeFileSync(
		path.join(before, 'floor-good.css'),
		fs.readFileSync(path.join(FIX, 'before', 'floor-good.css'), 'utf8') + decl('https://res-static.hc-cdn.cn/demo.png'),
	)
	fs.writeFileSync(
		path.join(after, 'floor-good.css'),
		fs.readFileSync(path.join(FIX, 'after', 'floor-good.css'), 'utf8') + decl('https://res-static.hc-cdn.cn/other.png'),
	)
	fs.copyFileSync(path.join(FIX, 'after', 'theme-vars.css'), path.join(after, 'theme-vars.css'))
	const r = runCli([
		'--asset',
		FIXTURE_ASSET,
		'--before',
		before,
		'--after',
		after,
		'--verdicts',
		path.join(FIX, 'verdicts.json'),
		'--type-verdicts',
		path.join(FIX, 'type-verdicts.json'),
	])
	assert.equal(r.code, 1)
	const doc = parseOut(r)
	assert.ok(
		doc.findings.some(
			(f) => f.code === 'css-url-changed' && f.file === 'floor-good.css' && f.after === 'https://res-static.hc-cdn.cn/other.png',
		),
		JSON.stringify(doc.findings),
	)
})

test('准入 baseline-empty：--before 是空目录，退 1', (t) => {
	const empty = path.join(tempDir(t), 'empty-before')
	fs.mkdirSync(empty)
	const verdicts = writeJson(t, 'empty-rows.json', { verdict: 'pass', rows: [], warnings: [], findings: [] })
	const r = runCli(['--asset', FIXTURE_ASSET, '--before', empty, '--after', path.join(FIX, 'after'), '--verdicts', verdicts])
	assert.equal(r.code, 1)
	assert.equal(parseOut(r).precheck.code, 'baseline-empty')
})

test('准入 baseline-missing：--before 没给或路径不存在，退 1', (t) => {
	const missing = runCli(['--asset', FIXTURE_ASSET, '--after', path.join(FIX, 'after'), '--verdicts', path.join(FIX, 'verdicts.json')])
	assert.equal(missing.code, 1)
	assert.equal(parseOut(missing).precheck.code, 'baseline-missing')

	const gone = runCli([
		'--asset',
		FIXTURE_ASSET,
		'--before',
		path.join(tempDir(t), 'no-such-before'),
		'--after',
		path.join(FIX, 'after'),
		'--verdicts',
		path.join(FIX, 'verdicts.json'),
	])
	assert.equal(gone.code, 1)
	assert.equal(parseOut(gone).precheck.code, 'baseline-missing')
})

test('准入 after-empty：--after 一份 html/css 都收不到，退 1', (t) => {
	const empty = path.join(tempDir(t), 'empty-after')
	fs.mkdirSync(empty)
	const r = runCli(['--asset', FIXTURE_ASSET, '--before', path.join(FIX, 'before'), '--after', empty, '--verdicts', path.join(FIX, 'verdicts.json')])
	assert.equal(r.code, 1)
	assert.equal(parseOut(r).precheck.code, 'after-empty')
})

test('准入 verdicts-missing：--verdicts 读不到，退 1', (t) => {
	const omitted = runCli(['--asset', FIXTURE_ASSET, '--before', path.join(FIX, 'before'), '--after', path.join(FIX, 'after')])
	assert.equal(omitted.code, 1)
	assert.equal(parseOut(omitted).precheck.code, 'verdicts-missing')

	const gone = runCli([
		'--asset',
		FIXTURE_ASSET,
		'--before',
		path.join(FIX, 'before'),
		'--after',
		path.join(FIX, 'after'),
		'--verdicts',
		path.join(tempDir(t), 'no-verdicts.json'),
	])
	assert.equal(gone.code, 1)
	assert.equal(parseOut(gone).precheck.code, 'verdicts-missing')
})

test('准入 verdicts-unparseable：JSON 解不开，退 1', (t) => {
	const file = writeJson(t, 'bad.json', '{ 这不是 JSON')
	const r = runCli(['--asset', FIXTURE_ASSET, '--before', path.join(FIX, 'before'), '--after', path.join(FIX, 'after'), '--verdicts', file])
	assert.equal(r.code, 1)
	assert.equal(parseOut(r).precheck.code, 'verdicts-unparseable')
})

test('准入 verdicts-shape：缺 rows[] 或行里缺必填字段，退 1', (t) => {
	const noRows = writeJson(t, 'norows.json', { verdict: 'pass' })
	const r1 = runCli(['--asset', FIXTURE_ASSET, '--before', path.join(FIX, 'before'), '--after', path.join(FIX, 'after'), '--verdicts', noRows])
	assert.equal(r1.code, 1)
	assert.equal(parseOut(r1).precheck.code, 'verdicts-shape')

	const good = JSON.parse(fs.readFileSync(path.join(FIX, 'verdicts.json'), 'utf8'))
	const { acceptedCssVar, ...rest } = good.rows[0]
	void acceptedCssVar
	const slim = writeJson(t, 'slim.json', { ...good, rows: [{ ...rest }] })
	const r2 = runCli(['--asset', FIXTURE_ASSET, '--before', path.join(FIX, 'before'), '--after', path.join(FIX, 'after'), '--verdicts', slim])
	assert.equal(r2.code, 1)
	assert.equal(parseOut(r2).precheck.code, 'verdicts-shape')
})

test('准入 verdicts-accept-token-absent：accept 行 acceptedCssVar 为空，退 1', (t) => {
	const good = JSON.parse(fs.readFileSync(path.join(FIX, 'verdicts.json'), 'utf8'))
	good.rows[0].acceptedCssVar = null
	const file = writeJson(t, 'notoken.json', good)
	const r = runCli(['--asset', FIXTURE_ASSET, '--before', path.join(FIX, 'before'), '--after', path.join(FIX, 'after'), '--verdicts', file])
	assert.equal(r.code, 1)
	assert.equal(parseOut(r).precheck.code, 'verdicts-accept-token-absent')

	const blank = JSON.parse(fs.readFileSync(path.join(FIX, 'verdicts.json'), 'utf8'))
	blank.rows[0].acceptedCssVar = '   '
	const blankFile = writeJson(t, 'blanktoken.json', blank)
	const r2 = runCli(['--asset', FIXTURE_ASSET, '--before', path.join(FIX, 'before'), '--after', path.join(FIX, 'after'), '--verdicts', blankFile])
	assert.equal(r2.code, 1)
	assert.equal(parseOut(r2).precheck.code, 'verdicts-accept-token-absent')
})

test('准入 verdicts-blocked：记录自身 verdict 不是 pass，退 1', (t) => {
	const good = JSON.parse(fs.readFileSync(path.join(FIX, 'verdicts.json'), 'utf8'))
	good.verdict = 'blocked'
	const file = writeJson(t, 'blocked.json', good)
	const r = runCli(['--asset', FIXTURE_ASSET, '--before', path.join(FIX, 'before'), '--after', path.join(FIX, 'after'), '--verdicts', file])
	assert.equal(r.code, 1)
	assert.equal(parseOut(r).precheck.code, 'verdicts-blocked')
})

test('准入 verdicts-stale：行 id 集合与重算对不上，退 1', (t) => {
	const good = JSON.parse(fs.readFileSync(path.join(FIX, 'verdicts.json'), 'utf8'))
	good.rows[0].id = 'vm-background-deadbeef'
	const file = writeJson(t, 'stale.json', good)
	const r = runCli(['--asset', FIXTURE_ASSET, '--before', path.join(FIX, 'before'), '--after', path.join(FIX, 'after'), '--verdicts', file])
	assert.equal(r.code, 1)
	assert.equal(parseOut(r).precheck.code, 'verdicts-stale')
})

test('只写 --json 不给路径是用法错误，退 1', () => {
	const r = runCli([...baseArgs(), '--json'])
	assert.equal(r.code, 1)
	assert.match(r.stdout, /用法：|--json/)
})

test('被 import 时不得跑 main', async () => {
	const mod = await import('../scripts/lint-migration.mjs')
	assert.equal(typeof mod.lintMigration, 'function')
})
