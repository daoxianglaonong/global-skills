/**
 * audit 的 type-rows.mjs 必须整文件拷进本包，一个字符都不改。
 *
 * 与 `copied-value-rows.test.mjs` 同一条纪律、同一个理由：跨包 import 被禁，而这份模块
 * 两侧都要用——audit 拿它出表与回灌，generate 拿它的 `typeLiteralsOf` / `closedSetTypeValue`
 * 判兑现与残余背书。两侧各写一份的话，「表里没有的字面量」与「门看得见的字面量」会静默
 * 变成两批，而那时两边都绿。
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { SCRIPTS_DIR } from './helpers.mjs'

const GENERATE_LIB = path.join(SCRIPTS_DIR, 'lib')
const AUDIT_LIB = path.resolve(import.meta.dirname, '..', '..', 'page-theme-audit', 'scripts', 'lib')

test('type-rows.mjs 与 page-theme-audit 那份逐字节相同', () => {
	const ours = fs.readFileSync(path.join(GENERATE_LIB, 'type-rows.mjs'))
	const src = fs.readFileSync(path.join(AUDIT_LIB, 'type-rows.mjs'))
	assert.ok(ours.equals(src), `type-rows.mjs 与 audit 不一致（generate=${ours.length} audit=${src.length}）`)
})

test('两份 id 前缀不得撞车：色表 vm-、非色表 tm-', () => {
	// 票面第 1 条勾禁止「两种形状挤进同一张表却仍叫同一个 id 体系」。两个前缀写在各自的
	// rowId 里，谁改成一样了，下游 `verdicts-stale` 的两个 id 集合就会互相污染。
	const valueRows = fs.readFileSync(path.join(GENERATE_LIB, 'value-rows.mjs'), 'utf8')
	const typeRows = fs.readFileSync(path.join(GENERATE_LIB, 'type-rows.mjs'), 'utf8')
	assert.match(valueRows, /return `vm-\$\{usage\}-\$\{hex8\}`/)
	assert.match(typeRows, /return `tm-\$\{kind\}-\$\{hex8\}`/)
	// 只看 rowId 那一行：模块头里为了讲清「为什么分家」必然要写出 `vm-`，扫全文会让
	// 「解释这条纪律」本身变成违反它（`source-shape.mjs` 模块头记着同一个自伤形态）。
	assert.ok(!/return `vm-/.test(typeRows), '非色表不得复用色表的 id 前缀')
	assert.ok(!/return `tm-/.test(valueRows), '色表也不得反过来发非色前缀')
})
