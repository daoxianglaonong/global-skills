/**
 * 六份复用 helper 必须与 generate 逐字节同一套。跨包 import 被禁，只能整文件拷贝。
 * 前六道门函数 + 依赖的模块级常量从 generate 的 gates.mjs 抠出逐字对照：
 * gates.mjs 整文件不能拷（那边还带着 outline / sequence-approval）。
 *
 * 第十道门 `layout-envelope` 的判据整份在 `layout-envelope-gate.mjs` 里，连同它依赖的层根
 * 解析 `paint-floors.mjs` 一起进这份清单——**这道锁不是可选项**：同源设计的固有成本就是改一处
 * 要同步两处，判据一分叉，「同一份越界产物两侧同样退 1」当场失效，而分叉不会有任何一侧报错。
 * 喂给它的那份包络夹具同样逐字节对照：两侧判据相同但输入不同，仍然验不出同源。
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import {
	AUDIT_LIB,
	GENERATE_LIB,
	LAYOUT_ENVELOPE_FIXTURE,
	COPIED_HELPERS,
	COPIED_GATE_FNS,
	COPIED_GATE_CONSTS,
	extractFunctionSource,
	extractConstSource,
} from './helpers.mjs'

test('六份 helper 与 page-theme-generate 源文件逐字节相同', () => {
	for (const name of COPIED_HELPERS) {
		const ours = fs.readFileSync(path.join(AUDIT_LIB, name))
		const src = fs.readFileSync(path.join(GENERATE_LIB, name))
		assert.ok(ours.equals(src), `${name} 与 generate 不一致（audit=${ours.length} generate=${src.length}）`)
	}
	assert.ok(COPIED_HELPERS.includes('layout-envelope-gate.mjs'), '包络门的判据必须在这份清单里，否则两侧可以静默分叉')
})

test('包络夹具与 page-theme-generate 那份逐字节相同', () => {
	const ours = fs.readFileSync(LAYOUT_ENVELOPE_FIXTURE)
	const src = fs.readFileSync(path.resolve(GENERATE_LIB, '..', '..', 'tests', 'fixtures', 'layout-envelope.fixture.json'))
	assert.ok(ours.equals(src), `包络夹具与 generate 不一致（audit=${ours.length} generate=${src.length}）`)
})

test('前六道门函数及依赖常量与 generate 的 gates.mjs 逐字相同', () => {
	const ours = fs.readFileSync(path.join(AUDIT_LIB, 'gates.mjs'), 'utf8')
	const src = fs.readFileSync(path.join(GENERATE_LIB, 'gates.mjs'), 'utf8')
	for (const name of COPIED_GATE_FNS) {
		assert.equal(extractFunctionSource(ours, name), extractFunctionSource(src, name), `${name} 与 generate 不一致`)
	}
	for (const name of COPIED_GATE_CONSTS) {
		assert.equal(extractConstSource(ours, name), extractConstSource(src, name), `${name} 与 generate 不一致`)
	}
})
