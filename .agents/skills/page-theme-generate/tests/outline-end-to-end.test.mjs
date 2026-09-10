/**
 * 端到端：两个大纲阶段的 CLI 在真实调用下的行为。
 *
 * 走 CLI 而不是只调函数，理由与楼层那份端到端一样：参数拼错、退出码取反、被 import 时误跑
 * main，这三类事故在函数级测试里一条都看不见，却会让门在真实调用下全程静默。
 *
 * 这里额外要钉一件本阶段独有的事：**提示不得影响退出码**。提示与阻断印在同一段输出里，
 * 一旦哪次改动把它们混进同一个计数，症状是「大纲永远过不了门」，而那会逼人绕开整个阶段。
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { FIXTURE_ASSET, SCRIPTS_DIR, tempDir } from './helpers.mjs'

function runCli(script, args) {
	try {
		return { code: 0, stdout: execFileSync(process.execPath, [path.join(SCRIPTS_DIR, script), ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }) }
	} catch (e) {
		return { code: e.status, stdout: `${e.stdout ?? ''}${e.stderr ?? ''}` }
	}
}

function stageSteps(t, doc) {
	const file = path.join(tempDir(t, 'page-theme-steps-'), 'steps.json')
	fs.writeFileSync(file, JSON.stringify(doc))
	return file
}

const LANDING = [{ pattern: 'hero.centered-pitch' }, { pattern: 'feature.grid-3-cards' }, { pattern: 'cta.centered-band' }]

test('选型素材 CLI：摊开骨架型、共现、两套闭集', () => {
	const r = runCli('sequence-sources.mjs', ['--asset', FIXTURE_ASSET, '--want', 'hero,feature'])

	assert.equal(r.code, 0, r.stdout)
	assert.match(r.stdout, /sk-landing/)
	assert.match(r.stdout, /装得下/)
	assert.match(r.stdout, /页数不够/, '1 页的资产必须如实说共现是弱证据，而不是印一张看着很像统计的表')
})

test('选型素材 CLI：装不下时说清缺哪一类', () => {
	const r = runCli('sequence-sources.mjs', ['--asset', FIXTURE_ASSET, '--want', 'pricing', '--json'])

	const doc = JSON.parse(r.stdout)
	assert.equal(doc.skeletons[0].fits, false)
	assert.deepEqual(doc.skeletons[0].missing, ['pricing'])
	assert.ok(doc.vocabulary.includes('pricing'), 'pricing 在词表内，只是本资产没有型——两件事别混')
	assert.ok(!doc.available.includes('pricing'))
})

test('大纲 CLI：合格序列印出三列表并退 0', (t) => {
	const r = runCli('lint-outline.mjs', ['--asset', FIXTURE_ASSET, '--steps', stageSteps(t, { skeleton: 'sk-landing', steps: LANDING })])

	assert.equal(r.code, 0, r.stdout)
	assert.match(r.stdout, /\| # \| 型 \| 中文标签 \| 关键内容点 \|/)
	assert.match(r.stdout, /首屏·居中主张/)
	assert.match(r.stdout, /白底三列等宽描边卡/)
	assert.match(r.stdout, /大纲门：pass/)
	assert.match(r.stdout, /approvedBy/, '过了门要指向下一步：拍板并把它记进 trace')
})

test('大纲 CLI：自造词让整次退 1', (t) => {
	const r = runCli('lint-outline.mjs', ['--asset', FIXTURE_ASSET, '--steps', stageSteps(t, { steps: [...LANDING, { taxonomy: 'breadcrumb', gapReason: '想加个面包屑' }] })])

	assert.equal(r.code, 1)
	assert.match(r.stdout, /taxonomy-invented/)
})

test('大纲 CLI：只有提示时照样退 0', (t) => {
	const threeFeatures = [{ pattern: 'hero.centered-pitch' }, { pattern: 'feature.grid-3-cards' }, { pattern: 'feature.grid-3-cards' }, { pattern: 'feature.grid-3-cards' }]
	const r = runCli('lint-outline.mjs', ['--asset', FIXTURE_ASSET, '--steps', stageSteps(t, { steps: threeFeatures })])

	assert.equal(r.code, 0, `提示是程度问题，交拍板的人裁，不该改退出码：\n${r.stdout}`)
	assert.match(r.stdout, /repeated-taxonomy-run/)
	assert.match(r.stdout, /不影响退出码/)
})

test('大纲 CLI：缺口印在表里并单列一段，不假装它是正常楼层', (t) => {
	const r = runCli('lint-outline.mjs', [
		'--asset', FIXTURE_ASSET,
		'--steps', stageSteps(t, { steps: [...LANDING, { taxonomy: 'pricing', gapReason: '目标页要报价对比，本资产无此型' }] }),
	])

	assert.equal(r.code, 0)
	assert.match(r.stdout, /（缺口：pricing）/)
	assert.match(r.stdout, /形态缺口 1 处/)
})

test('大纲 CLI：缺必填参数与空 steps 都给用法而不是堆栈', (t) => {
	const missing = runCli('lint-outline.mjs', ['--asset', FIXTURE_ASSET])
	assert.equal(missing.code, 1)
	assert.match(missing.stdout, /用法：/)

	const empty = runCli('lint-outline.mjs', ['--asset', FIXTURE_ASSET, '--steps', stageSteps(t, { steps: [] })])
	assert.equal(empty.code, 1)
	assert.match(empty.stdout, /非空数组/)
	assert.ok(!empty.stdout.includes('at Object.'), '不该把 Node 堆栈甩给使用者')
})

test('两个 CLI 被 import 时都不得跑 main', async () => {
	const outline = await import('../scripts/lint-outline.mjs')
	const sources = await import('../scripts/sequence-sources.mjs')
	assert.equal(typeof outline.lintOutline, 'function')
	assert.equal(typeof sources.sequenceSources, 'function')
})
