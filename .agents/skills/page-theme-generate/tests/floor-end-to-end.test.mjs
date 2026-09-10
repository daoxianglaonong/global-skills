/**
 * 端到端：喂一份合格资产，产出一个楼层，跑完自检门。
 *
 * 上面几份测试都在直接调函数，这份走 CLI。理由是 CLI 才是 skill 真正的使用面——参数拼
 * 错、退出码取反、被 import 时误跑 main，这三类事故在函数级测试里一条都看不见，但它们会
 * 让门在真实调用下全程静默。
 *
 * 「产出一个楼层」这件事本身由 agent 完成，不是脚本。本文件用的楼层是照 fixture 资产的
 * `feature.grid-3-cards` 手写的一份，几何取自该 pattern 的 responsive 实测值。它在这里
 * 的角色是「一份合格产物长什么样」的可执行样本——门放行它，同时对它的每一处单点改动亮红。
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { FIXTURE_ASSET, SCRIPTS_DIR, goodCss, mutateCss, tempDir } from './helpers.mjs'

const FIXTURES = path.join(import.meta.dirname, 'fixtures')

function runCli(script, args) {
	try {
		const stdout = execFileSync(process.execPath, [path.join(SCRIPTS_DIR, script), ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
		return { code: 0, stdout }
	} catch (e) {
		return { code: e.status, stdout: `${e.stdout ?? ''}${e.stderr ?? ''}` }
	}
}

/** 把楼层产物摆进一个临时工作目录，CSS 可替换成坏用例。 */
function stageFloor(t, css = goodCss()) {
	const dir = tempDir(t, 'page-theme-floor-')
	fs.copyFileSync(path.join(FIXTURES, 'floor-good.html'), path.join(dir, 'floor.html'))
	fs.copyFileSync(path.join(FIXTURES, 'generate-trace.good.json'), path.join(dir, 'generate-trace.json'))
	fs.writeFileSync(path.join(dir, 'floor.css'), css)
	return dir
}

test('准入 CLI 对合格资产退 0', () => {
	const r = runCli('admit-asset.mjs', [FIXTURE_ASSET])
	assert.equal(r.code, 0, r.stdout)
	assert.match(r.stdout, /准入结论：ok/)
})

test('准入 CLI 对无资产退非 0，并说清下一步该去采集', (t) => {
	const r = runCli('admit-asset.mjs', [path.join(tempDir(t), 'nothing-here')])
	assert.notEqual(r.code, 0)
	assert.match(r.stdout, /absent/)
	assert.match(r.stdout, /chain-extract/)
})

test('合格资产 + 合格楼层 → 自检门全绿', (t) => {
	const dir = stageFloor(t)
	const r = runCli('lint-floor.mjs', [
		'--asset', FIXTURE_ASSET,
		'--html', path.join(dir, 'floor.html'),
		'--css', path.join(dir, 'floor.css'),
		'--trace', path.join(dir, 'generate-trace.json'),
	])
	assert.equal(r.code, 0, `合格楼层应当全绿，实际输出：\n${r.stdout}`)
	assert.match(r.stdout, /自检门：pass/)
})

test('一处色值字面量就让整次退 1', (t) => {
	const dir = stageFloor(t, mutateCss('border: 1px solid var(--color-border-default);', 'border: 1px solid #e5e7eb;'))
	const r = runCli('lint-floor.mjs', ['--asset', FIXTURE_ASSET, '--html', path.join(dir, 'floor.html'), '--css', path.join(dir, 'floor.css')])

	assert.equal(r.code, 1)
	assert.match(r.stdout, /color-literal/)
	assert.match(r.stdout, /#e5e7eb/)
})

test('资产没过准入时不许开跑，且理由要指向准入而不是某道门', (t) => {
	const brokenAsset = tempDir(t, 'page-theme-broken-')
	const dir = stageFloor(t)
	const r = runCli('lint-floor.mjs', ['--asset', brokenAsset, '--html', path.join(dir, 'floor.html'), '--css', path.join(dir, 'floor.css')])

	assert.equal(r.code, 1)
	assert.match(r.stdout, /asset-admission/, '没有资产时报「某个变量不在闭集里」会把人引向错误的病因')
})

test('缺必填参数时给用法而不是堆栈', () => {
	const r = runCli('lint-floor.mjs', ['--asset', FIXTURE_ASSET])
	assert.equal(r.code, 1)
	assert.match(r.stdout, /用法：/)
	assert.ok(!r.stdout.includes('at Object.'), '不该把 Node 堆栈甩给使用者')
})

test('--json 输出可被机器消费', (t) => {
	const dir = stageFloor(t, mutateCss('color: var(--color-text-default);', 'color: var(--color-brand-primary);'))
	const r = runCli('lint-floor.mjs', ['--asset', FIXTURE_ASSET, '--html', path.join(dir, 'floor.html'), '--css', path.join(dir, 'floor.css'), '--json'])

	const doc = JSON.parse(r.stdout)
	assert.equal(doc.verdict, 'blocked')
	assert.equal(doc.styleSetId, 'fixture-lanyuan-lab')
	assert.ok(doc.findings.some((f) => f.gate === 'var-not-in-closed-set' && f.var === '--color-brand-primary'))
})

test('被 import 时不得跑 main', async () => {
	// 测试要直接调 lintFloor() 拿结构化结论。若 import 就跑 main，上面每一份测试都会在
	// 加载阶段 process.exit，症状是「测试无声通过」——最坏的那种绿。
	const mod = await import('../scripts/lint-floor.mjs')
	assert.equal(typeof mod.lintFloor, 'function')
})
