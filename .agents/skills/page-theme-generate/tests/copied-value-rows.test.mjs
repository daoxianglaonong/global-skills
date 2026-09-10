/**
 * audit 的 value-rows.mjs / collect-artifact.mjs 必须整文件拷进本包，一个字符都不改。
 * 跨包 import 被禁；收文件跳过规则一改，这边会静默分叉。
 * 写法照 audit 的 tests/copied-helpers.test.mjs。
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { SCRIPTS_DIR } from './helpers.mjs'

const GENERATE_LIB = path.join(SCRIPTS_DIR, 'lib')
const AUDIT_LIB = path.resolve(import.meta.dirname, '..', '..', 'page-theme-audit', 'scripts', 'lib')

test('value-rows.mjs 与 page-theme-audit 那份逐字节相同', () => {
	const ours = fs.readFileSync(path.join(GENERATE_LIB, 'value-rows.mjs'))
	const src = fs.readFileSync(path.join(AUDIT_LIB, 'value-rows.mjs'))
	assert.ok(ours.equals(src), `value-rows.mjs 与 audit 不一致（generate=${ours.length} audit=${src.length}）`)
})

test('collect-artifact.mjs 与 page-theme-audit 那份逐字节相同', () => {
	const ours = fs.readFileSync(path.join(GENERATE_LIB, 'collect-artifact.mjs'))
	const src = fs.readFileSync(path.join(AUDIT_LIB, 'collect-artifact.mjs'))
	assert.ok(ours.equals(src), `collect-artifact.mjs 与 audit 不一致（generate=${ours.length} audit=${src.length}）`)
})
