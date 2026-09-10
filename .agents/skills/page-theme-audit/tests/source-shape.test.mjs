/**
 * 两道扫源码的形状门。本包同样不许派生变量名，射程同为 scripts 下所有 mjs 的代码部分。
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { findVarDerivation, findRuntimeDependencies, collectSourceFiles } from '../scripts/lib/source-shape.mjs'
import { SCRIPTS_DIR, tempDir } from './helpers.mjs'

test('扫描射程本身要对：能扫到本包脚本，且跳过 vendor', () => {
	const files = collectSourceFiles(SCRIPTS_DIR).map((f) => path.relative(SCRIPTS_DIR, f).split(path.sep).join('/'))
	for (const f of [
		'lint-artifact.mjs',
		'value-map.mjs',
		'type-map.mjs',
		'lib/gates.mjs',
		'lib/gates-asset.mjs',
		'lib/layout-envelope-gate.mjs',
		'lib/paint-floors.mjs',
		'lib/value-rows.mjs',
		'lib/type-rows.mjs',
		'lib/collect-artifact.mjs',
	]) {
		assert.ok(files.includes(f), `${f} 必须在射程内`)
	}
	assert.ok(!files.includes('lib/value-map.mjs'), 'lib 侧不得与 CLI 同名，值映射行逻辑在 value-rows.mjs')
	assert.ok(!files.includes('lib/type-map.mjs'), 'lib 侧不得与 CLI 同名，非色映射行逻辑在 type-rows.mjs')
	assert.ok(
		!files.some((f) => f.startsWith('vendor/')),
		'vendor 是 core 的副本，派生函数本来就住在那里，扫它会把 core 的正当职责判成违例',
	)
})

test('本包不派生变量名：现状干净', () => {
	const violations = findVarDerivation(SCRIPTS_DIR)
	assert.deepEqual(violations, [], `只许查 closed-set.json：\n${violations.map((v) => `${v.file}:${v.line} ${v.reason}`).join('\n')}`)
})

test('本包不派生变量名：引入 core 的派生函数会红', (t) => {
	const dir = tempDir(t)
	fs.writeFileSync(path.join(dir, 'bad.mjs'), "import { tokenPathToCssVar } from '../vendor/page-theme-core/index.mjs'\nexport const f = (p) => tokenPathToCssVar(p)\n")

	const violations = findVarDerivation(dir)
	assert.ok(violations.length > 0, '引入派生函数必须被抓到')
	assert.ok(violations.some((v) => v.code === 'imports-derivation'))
})

test('本包不派生变量名：用字符串拼变量名会红', (t) => {
	const dir = tempDir(t)
	fs.writeFileSync(path.join(dir, 'a.mjs'), 'export const v = (segs) => `--${segs.join("-")}`\n')
	fs.writeFileSync(path.join(dir, 'b.mjs'), "export const w = (s) => '--' + s\n")

	const codes = findVarDerivation(dir).map((v) => v.code)
	assert.equal(codes.filter((c) => c === 'builds-var-name').length, 2, '模板串与字符串相加两种拼法都要抓到')
})

test('无运行时依赖：本包现状干净', () => {
	const violations = findRuntimeDependencies(SCRIPTS_DIR)
	assert.deepEqual(violations, [], `本包必须零运行时依赖：\n${violations.map((v) => `${v.file}:${v.line} ${v.specifier}`).join('\n')}`)
})

test('无运行时依赖：引入第三方包会红，node: 内置与相对路径不会', (t) => {
	const dir = tempDir(t)
	fs.writeFileSync(path.join(dir, 'bad.mjs'), "import sharp from 'sharp'\nimport { x } from '@scope/pkg'\n")
	fs.writeFileSync(path.join(dir, 'ok.mjs'), "import fs from 'node:fs'\nimport { y } from './bad.mjs'\nconst z = await import('node:path')\n")

	const violations = findRuntimeDependencies(dir)
	assert.deepEqual(violations.map((v) => v.specifier).sort(), ['@scope/pkg', 'sharp'])
})

test('无运行时依赖：包里不得出现 node_modules 或声明了依赖的 package.json', () => {
	const pkgRoot = path.resolve(SCRIPTS_DIR, '..')
	assert.ok(!fs.existsSync(path.join(SCRIPTS_DIR, 'node_modules')), 'scripts/ 下不得有 node_modules')
	for (const dir of [pkgRoot, SCRIPTS_DIR]) {
		const pkg = path.join(dir, 'package.json')
		if (!fs.existsSync(pkg)) continue
		const deps = JSON.parse(fs.readFileSync(pkg, 'utf8')).dependencies ?? {}
		assert.deepEqual(Object.keys(deps), [], `${pkg} 不得声明运行时依赖`)
	}
})

test('vendor 副本不得手改：本包不得往 vendor 里写自己的文件', () => {
	const vendorRoot = path.join(SCRIPTS_DIR, 'vendor')
	const manifest = JSON.parse(fs.readFileSync(path.join(vendorRoot, 'VENDOR.json'), 'utf8'))
	const declared = new Set(Object.keys(manifest.files))

	const onDisk = []
	const walk = (dir, prefix) => {
		for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
			const rel = prefix ? `${prefix}/${e.name}` : e.name
			if (e.isDirectory()) walk(path.join(dir, e.name), rel)
			else onDisk.push(rel)
		}
	}
	walk(path.join(vendorRoot, 'page-theme-core'), '')

	assert.deepEqual(onDisk.filter((f) => !declared.has(f)).sort(), [], 'vendor 里出现了 VENDOR.json 没登记的文件')
})
