/**
 * 准入校验：拿不出合格资产就不许开工。
 *
 * 这道门是防跳步的物理手段。它要挡的事故是：没有资产也「凭感觉照着做」，产出一份看着
 * 像那么回事、但没有任何一处能追溯到观测的页面。那种产物的坏法是静默的——它不报错，
 * 只是慢慢地把一个虚构的设计语言当成真的。
 *
 * 三种结论的动作互斥，所以三种都要有用例，且 `absent` 与 `incomplete` **不能合并**：
 * 前者是空手，补齐的办法是去采；后者是残件，直接重采可能盖掉 `holdout.yaml` /
 * `site-overrides.yaml` 这类人拥有的输入。合并成一句「资产不合格」，就把「该去采」和
 * 「不许去采」两个相反的动作揉成了一个。
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { admitAsset, REQUIRED_FILES } from '../scripts/admit-asset.mjs'
import { FIXTURE_ASSET, copyFixtureAsset, tempDir } from './helpers.mjs'

test('冻结 fixture 资产必须过准入', () => {
	const r = admitAsset(FIXTURE_ASSET)
	assert.equal(r.verdict, 'ok', `fixture 应当过准入，实际 ${r.verdict}：${r.reason}`)
	assert.equal(r.nextAction, 'generate')
	assert.equal(r.styleSetId, 'fixture-lanyuan-lab')
	assert.ok(r.tokenCount > 0, '闭集条数应当为正')
})

test('准入不得要求采集期才有的文件', () => {
	// fixture 没有采集运行，所以没有 screenshots/ 与 run-meta.json。把它们写进必交清单，
	// 会让一切非采集产出的合格资产（包括本包行为 eval 的唯一输入）当场被拒。
	for (const f of ['screenshots/index.json', 'screenshots/.gitignore', 'run-meta.json']) {
		assert.ok(!REQUIRED_FILES.includes(f), `${f} 不该在必交清单里`)
	}
	assert.ok(!fs.existsSync(path.join(FIXTURE_ASSET, 'run-meta.json')), 'fixture 不该被补上 run-meta.json')
})

test('目录不存在 → absent，动作是去采集', (t) => {
	const r = admitAsset(path.join(tempDir(t), 'never-extracted'))
	assert.equal(r.verdict, 'absent')
	assert.equal(r.nextAction, 'chain-extract')
})

test('有目录无 README.md → absent，一律视为无资产', (t) => {
	const dir = copyFixtureAsset(t)
	fs.rmSync(path.join(dir, 'README.md'))

	const r = admitAsset(dir)
	assert.equal(r.verdict, 'absent', 'README.md 是「这里有一份资产」的路标，没有它，目录里剩下什么都不算资产')
	assert.equal(r.nextAction, 'chain-extract')
	assert.ok(r.missing.includes('README.md'))
})

test('只有 input/ 的目录 → absent', (t) => {
	const dir = tempDir(t)
	fs.mkdirSync(path.join(dir, 'input', 'design-system'), { recursive: true })
	fs.writeFileSync(path.join(dir, 'input', 'design-system', 'tokens.json'), '{}')

	const r = admitAsset(dir)
	assert.equal(r.verdict, 'absent')
	assert.equal(r.nextAction, 'chain-extract')
})

test('有 README.md 但缺别的必交件 → incomplete，且必须拒绝而不是去重采', (t) => {
	for (const missing of REQUIRED_FILES.filter((f) => f !== 'README.md')) {
		const dir = copyFixtureAsset(t)
		fs.rmSync(path.join(dir, missing))

		const r = admitAsset(dir)
		assert.equal(r.verdict, 'incomplete', `缺 ${missing} 应判 incomplete，实际 ${r.verdict}`)
		assert.equal(r.nextAction, 'reject', `缺 ${missing} 时不得自动串采集：那会盖掉人拥有的输入`)
		assert.ok(r.missing.includes(missing), `缺件清单应当点名 ${missing}`)
	}
})

test('包络是第九份必交件：删了会挡，恢复会过', (t) => {
	// `R4-10` 的双向用例。只验一个方向不够：只验「删了会挡」，`REQUIRED_FILES` 里塞任何一个
	// 不存在的文件名都能让它绿；只验「有就过」，撤掉这一行也绿。两个方向合起来才钉住这一行。
	const dir = copyFixtureAsset(t)
	const file = path.join(dir, 'layout-envelope.json')
	const text = fs.readFileSync(file, 'utf8')

	assert.ok(REQUIRED_FILES.includes('layout-envelope.json'), '包络必须在必交清单里：门、布局表、合成型四维都读它')
	assert.equal(REQUIRED_FILES.length, 9)

	fs.rmSync(file)
	const gone = admitAsset(dir)
	assert.equal(gone.verdict, 'incomplete', '缺包络是残件，不是空手')
	assert.equal(gone.nextAction, 'reject', '不许自动串采集：修法是补投影一次，不是重采')
	assert.deepEqual(gone.missing, ['layout-envelope.json'], '缺件清单只该点名这一份')

	fs.writeFileSync(file, text)
	const back = admitAsset(dir)
	assert.equal(back.verdict, 'ok', `恢复之后必须能开工，实际 ${back.verdict}：${back.reason}`)
	assert.equal(back.nextAction, 'generate')
	assert.deepEqual(back.missing, [])
})

test('闭集读不开 → incomplete，不是「有资产」', (t) => {
	const dir = copyFixtureAsset(t)
	fs.writeFileSync(path.join(dir, 'closed-set.json'), '{ 这不是 JSON')

	const r = admitAsset(dir)
	assert.equal(r.verdict, 'incomplete')
	assert.equal(r.code, 'closed-set-unparseable')
})

test('闭集条目缺 cssVar → incomplete', (t) => {
	const dir = copyFixtureAsset(t)
	const doc = JSON.parse(fs.readFileSync(path.join(dir, 'closed-set.json'), 'utf8'))
	delete doc.entries[0].cssVar
	fs.writeFileSync(path.join(dir, 'closed-set.json'), JSON.stringify(doc))

	const r = admitAsset(dir)
	assert.equal(r.verdict, 'incomplete')
	assert.equal(r.code, 'closed-set-shape')
})

test('退出码只有 0 / 1：非 ok 一律不许开工', (t) => {
	// 不给 absent 单开一个 2。`2` 在采集侧校验器里是「仅报警、可交付」，同一个数字在相邻
	// 的包里表示相反的意思，被误读一次的代价是「没有资产也开工了」。
	const dir = copyFixtureAsset(t)
	fs.rmSync(path.join(dir, 'README.md'))
	for (const verdict of [admitAsset(FIXTURE_ASSET), admitAsset(dir)]) {
		assert.ok(['ok', 'absent', 'incomplete'].includes(verdict.verdict))
		assert.equal(verdict.verdict === 'ok', verdict.nextAction === 'generate')
	}
})
