/**
 * 两表交叉门的**接线锁**：判定必须落在 `SKILL.md` 硬序真会走的那条路上。
 *
 * 这一族用例一条都不喂 `combineMapVerdicts()`——helper 层判得对，证不了 CLI 把它接上了。
 * 全部真 spawn 两个 CLI，且默认那几条**不传任何对表旗标**：交叉判定挂在可选旗标上时，
 * 按硬序跑（各自 `--read-back`）「一张 pass 一张 blocked」照样退 0，那就是这道门要堵的
 * 静默绿。卸掉任一 CLI 里的 `crossCheckMaps()` 调用，本文件必须转红。
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { FIXTURE_ASSET, goodCss, mutateCss, tempDir, writeArtifact, SCRIPTS_DIR } from './helpers.mjs'
import { MAP_MD_NAME } from '../scripts/lib/map-cross.mjs'

const COLOR_ANCHOR = 'background-color: var(--color-primary);'

/** 两张表都有行的产物：色表靠这处 hex 字面量，非色表靠夹具里原有的 px 字面量。 */
const bothTablesCss = () => mutateCss(COLOR_ANCHOR, 'background-color: #0F7A6C;')

const cli = (name) => path.join(SCRIPTS_DIR, name)

function run(args) {
	return spawnSync(process.execPath, args, { encoding: 'utf8' })
}

const jsonOf = (r) => {
	const at = r.stdout.indexOf('{')
	assert.ok(at >= 0, `stdout 里没有 JSON：${r.stdout}${r.stderr}`)
	return JSON.parse(r.stdout.slice(at))
}

/** 按硬序出表：两张表 `--out` 到**同一个目录**，于是对表就在本表旁边。 */
function bothMaps(t, css = bothTablesCss()) {
	const art = writeArtifact(path.join(tempDir(t), 'art'), { css })
	const out = path.join(tempDir(t), 'out')
	for (const name of ['value-map.mjs', 'type-map.mjs']) {
		const gen = run([cli(name), '--asset', FIXTURE_ASSET, '--artifact', art.dir, '--out', out])
		assert.equal(gen.status, 0, gen.stderr)
	}
	return { art, out, valueMd: path.join(out, 'value-map.md'), typeMd: path.join(out, 'type-map.md') }
}

/**
 * 把一张表弄成 blocked：第一条数据行的「裁决」列写个读不懂的字 → `verdict-unknown`。
 * 两张表的「裁决」都是第 7 格（色表八列、非色表九列，前六列同形），所以同一把手能用在两边。
 */
function blockTable(file) {
	const lines = fs.readFileSync(file, 'utf8').split('\n')
	const i = lines.findIndex((l) => /^\| (vm|tm)-/.test(l))
	assert.ok(i >= 0, `${path.basename(file)} 里一条数据行都没有，这条用例证不了什么`)
	const cells = lines[i].split('|')
	cells[7] = ' 略过 '
	lines[i] = cells.join('|')
	fs.writeFileSync(file, lines.join('\n'))
}

const readBack = (name, art, md, extra = []) =>
	run([cli(name), '--asset', FIXTURE_ASSET, '--artifact', art.dir, '--read-back', md, ...extra])

test('默认路径：色表 pass、非色表 blocked → 色表也退 1，不传任何对表旗标', (t) => {
	const { art, out, valueMd, typeMd } = bothMaps(t)
	blockTable(typeMd)
	const r = readBack('value-map.mjs', art, valueMd)
	const back = jsonOf(r)
	assert.equal(r.status, 1, '按硬序跑的这条命令必须挡住「一张 pass 一张 blocked」')
	assert.equal(back.verdict, 'blocked')
	assert.equal(back.findings.filter((f) => f.code === 'maps-cross-blocked').length, 1)
	assert.deepEqual(
		back.findings.filter((f) => f.code !== 'maps-cross-blocked'),
		[],
		'色表自己一条阻断都没有——退 1 只能是对表带来的，否则这条用例证不了交叉判定',
	)
	assert.equal(back.peerMap.verdict, 'blocked')
	assert.equal(path.resolve(back.peerMap.file), path.resolve(out, 'type-map.md'), '对表是同目录取的，不是旗标给的')
})

test('默认路径反向：非色表 pass、色表 blocked → 非色表也退 1', (t) => {
	const { art, valueMd, typeMd } = bothMaps(t)
	blockTable(valueMd)
	const r = readBack('type-map.mjs', art, typeMd)
	const back = jsonOf(r)
	assert.equal(r.status, 1)
	assert.equal(back.mapKind, 'type')
	assert.equal(back.findings.filter((f) => f.code === 'maps-cross-blocked').length, 1)
	assert.deepEqual(back.findings.filter((f) => f.code !== 'maps-cross-blocked'), [])
	assert.equal(back.peerMap.verdict, 'blocked')
})

test('两张都 pass：退 0，且报告里留着对表读面——不是「没找到就放过」', (t) => {
	const { art, valueMd, typeMd } = bothMaps(t)
	for (const [name, md, peerKind] of [
		['value-map.mjs', valueMd, 'type'],
		['type-map.mjs', typeMd, 'value'],
	]) {
		const r = readBack(name, art, md)
		const back = jsonOf(r)
		assert.equal(r.status, 0, r.stderr)
		assert.equal(back.verdict, 'pass')
		assert.equal(back.peerMap.mapKind, peerKind)
		assert.equal(back.peerMap.verdict, 'pass', '对表必须真被读回过')
	}
})

test('对表有行却取不到读回件 → maps-cross-blocked：挪走对表 md 绕不过去', (t) => {
	const { art, valueMd, typeMd } = bothMaps(t)
	fs.rmSync(valueMd)
	const r = readBack('type-map.mjs', art, typeMd)
	const back = jsonOf(r)
	assert.equal(r.status, 1)
	const hit = back.findings.find((f) => f.code === 'maps-cross-blocked')
	assert.ok(hit, '对表该有行而读不回，不许当没这张表')
	assert.equal(hit.peer, 'value')
	assert.match(hit.reason, /取不到/)
	assert.match(hit.reason, /value-map\.md/)
	assert.equal(back.peerMap.verdict, null)
})

test('对表一行都没有：不开口、退 0，报告里 peerMap 为 null', (t) => {
	// 合格产物一处色字面量都没有，色表零行；它的读回必然 pass，跳过与读回等价。
	const art = writeArtifact(path.join(tempDir(t), 'art'), { css: goodCss() })
	const out = path.join(tempDir(t), 'out')
	const gen = run([cli('type-map.mjs'), '--asset', FIXTURE_ASSET, '--artifact', art.dir, '--out', out])
	assert.equal(gen.status, 0, gen.stderr)
	assert.ok(!fs.existsSync(path.join(out, 'value-map.md')), '这条用例的前提就是同目录没有对表 md')
	const r = readBack('type-map.mjs', art, path.join(out, 'type-map.md'))
	const back = jsonOf(r)
	assert.equal(r.status, 0, r.stderr)
	assert.equal(back.peerMap, null)
	assert.deepEqual(back.findings, [])
})

test('--peer-read-back 仍是显式指路：对表不在同目录时照样挡住', (t) => {
	const { art, valueMd, typeMd } = bothMaps(t)
	const moved = path.join(tempDir(t), 'somewhere-else', 'type-map.md')
	fs.mkdirSync(path.dirname(moved), { recursive: true })
	blockTable(typeMd)
	fs.renameSync(typeMd, moved)
	const r = readBack('value-map.mjs', art, valueMd, ['--peer-read-back', moved])
	assert.equal(r.status, 1)
	assert.ok(jsonOf(r).findings.some((f) => f.code === 'maps-cross-blocked'))
})

test('--peer-read-back 指到不存在的路径是用法错误，退 1，不降级成「没对表」', (t) => {
	const { art, valueMd } = bothMaps(t)
	const r = readBack('value-map.mjs', art, valueMd, ['--peer-read-back', path.join(path.dirname(valueMd), 'nope.md')])
	assert.equal(r.status, 1)
	assert.match(r.stderr, /读不回对表/)
})

/**
 * 第三张表接进来之后，这两个 CLI 的默认路径**一个字都没变**（`R4-09`）。
 *
 * 布局表的回灌会读回这两张，反过来这两张**不读布局表**——那是明写的单向，理由在
 * `lib/map-cross.mjs` 模块头：布局表重算要先读得开 `layout-envelope.json`，而包络只是**生成侧**
 * 准入必交件（`R4-10`），本包不跑准入，没投影过包络的资产照样递得进来。让色表回灌去重算布局行，
 * 等于把「这份资产还没投影过包络」变成色链路退 1 的理由。这条用例把那句话钉住：同目录摆一份**已 blocked** 的 `layout-map.md`，
 * 两张表照样退 0，且 `peerMap` 仍是单数、仍指对面那一张。
 */
test('单向：同目录摆一份 blocked 的 layout-map.md，色表 / 非色表照样退 0', (t) => {
	const { art, out, valueMd, typeMd } = bothMaps(t)
	fs.writeFileSync(
		path.join(out, MAP_MD_NAME.layout),
		'| id | 源布局 | 用途 | 档位 | 处数 | 资产侧取值 | 候选 | 建议 | 选中值 | 裁决 | 备注 |\n| lm-columns-deadbeef | x | columns | 报警层 | 1 | x | x | x |  | 略过 |  |\n',
	)
	for (const [name, md, peerKind] of [
		['value-map.mjs', valueMd, 'type'],
		['type-map.mjs', typeMd, 'value'],
	]) {
		const r = readBack(name, art, md)
		const back = jsonOf(r)
		assert.equal(r.status, 0, `${name}：${r.stderr}`)
		assert.equal(back.peerMap.mapKind, peerKind, '对表仍是单数那一张')
		assert.equal(back.peerMaps, undefined, '这两个 CLI 不许长出复数形状：peerMap 被生成侧 lint-migration 读着')
	}
})
