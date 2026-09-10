/**
 * 两道扫源码的形状门，外加它们自己的射程说明。
 *
 * 形状门守的是「下一个人顺手写了」，不守「有人存心绕」。一个存心要绕的人当然能用
 * `String.fromCharCode` 拼出 `--`；抓不住，也不打算抓。它的价值在于改动发生的那一刻
 * 就红，而不是等到生成页白底了才发现。
 *
 * 所以每道门都配两组断言：**本包现状必须干净**，以及**把违规写法喂进去必须真的红**。
 * 只有前者的形状门是自证清白，改判据时会不知不觉退化成一句空话。
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { findVarDerivation, findRuntimeDependencies, collectSourceFiles } from '../scripts/lib/source-shape.mjs'
import { SCRIPTS_DIR, tempDir } from './helpers.mjs'

test('扫描射程本身要对：能扫到本包每个脚本，且跳过 vendor', () => {
	// 逐个点名而不是只数个数：新加一个脚本却忘了让它进射程，是这道门最容易的失效方式，
	// 而「射程里有 3 个文件」这种断言对此毫无反应。
	const files = collectSourceFiles(SCRIPTS_DIR).map((f) => path.relative(SCRIPTS_DIR, f).split(path.sep).join('/'))
	for (const f of [
		'admit-asset.mjs',
		'lint-floor.mjs',
		'lint-outline.mjs',
		'lint-migration.mjs',
		'sequence-sources.mjs',
		'lib/gates.mjs',
		'lib/outline.mjs',
		'lib/migration-gates.mjs',
		'lib/content-lock.mjs',
		'lib/structure-lock.mjs',
		'lib/breakpoint-lock.mjs',
		'lib/variant-lock.mjs',
		'lib/value-rows.mjs',
		'lib/type-rows.mjs',
		'lib/collect-artifact.mjs',
		'lib/layout-envelope-gate.mjs',
		'lib/paint-check.mjs',
		'lib/paint-floors.mjs',
		'lib/paint-surface.mjs',
		'lib/paint-recompute.mjs',
		'lib/responsive-inherit.mjs',
		'lib/synth-identity.mjs',
	]) {
		assert.ok(files.includes(f), `${f} 必须在射程内`)
	}
	assert.ok(
		!files.some((f) => f.startsWith('vendor/')),
		'vendor 是 core 的副本，派生函数本来就住在那里，扫它会把 core 的正当职责判成违例',
	)
})

test('生成侧不派生变量名：本包现状干净', () => {
	const violations = findVarDerivation(SCRIPTS_DIR)
	assert.deepEqual(violations, [], `生成侧只许查 closed-set.json：\n${violations.map((v) => `${v.file}:${v.line} ${v.reason}`).join('\n')}`)
})

test('生成侧不派生变量名：引入 core 的派生函数会红', (t) => {
	const dir = tempDir(t)
	fs.writeFileSync(path.join(dir, 'bad.mjs'), "import { tokenPathToCssVar } from '../vendor/page-theme-core/index.mjs'\nexport const f = (p) => tokenPathToCssVar(p)\n")

	const violations = findVarDerivation(dir)
	assert.ok(violations.length > 0, '引入派生函数必须被抓到')
	assert.ok(violations.some((v) => v.code === 'imports-derivation'))
})

test('生成侧不派生变量名：用字符串拼变量名会红', (t) => {
	const dir = tempDir(t)
	fs.writeFileSync(path.join(dir, 'a.mjs'), 'export const v = (segs) => `--${segs.join("-")}`\n')
	fs.writeFileSync(path.join(dir, 'b.mjs'), "export const w = (s) => '--' + s\n")

	const codes = findVarDerivation(dir).map((v) => v.code)
	assert.equal(codes.filter((c) => c === 'builds-var-name').length, 2, '模板串与字符串相加两种拼法都要抓到')
})

test('生成侧不派生变量名：查表本身不得被误伤', (t) => {
	// 射程只钉两个具体动作。正当的查表写法——从闭集条目上取 cssVar、用正则从值里抽出
	// 已经写好的变量名——都不该红，否则这道门会逼着人绕开它写更难读的代码。
	const dir = tempDir(t)
	fs.writeFileSync(
		path.join(dir, 'ok.mjs'),
		'export const lookup = (closedSet, name) => closedSet.byVar.get(name) ?? null\n' +
			'export const refs = (value) => [...String(value).matchAll(/var\\(\\s*(--[A-Za-z0-9_-]+)/g)].map((m) => m[1])\n',
	)
	assert.deepEqual(findVarDerivation(dir), [])
})

test('注释一律不进射程：整行、行尾、跨行块注释都不算写法', (t) => {
	// 门守的是代码，不是散文。而讲清「为什么不许派生变量名」必然要在文字里写出被禁的那个
	// 函数名——只跳整行注释是不够的，行尾注释与跨行块注释同样是散文。射程漏掉它们，下一个
	// 人的选择就成了「删掉解释」而不是「遵守纪律」，这是形状门最典型的自伤方式。
	const dir = tempDir(t)
	fs.writeFileSync(
		path.join(dir, 'prose.mjs'),
		'const n = 1 // 这里刻意不调 tokenPathToCssVar\n' +
			'const m = 2 /* 也不用 tokenPathToCssVar */\n' +
			'/*\n 派生写法长这样：`--${group}-${name}`，本包不许这么写\n*/\n' +
			"// import sharp from 'sharp' —— 曾经想过，否了\n" +
			'export const k = n + m\n',
	)
	assert.deepEqual(findVarDerivation(dir), [])
	assert.deepEqual(findRuntimeDependencies(dir), [])
})

test('注释射程不得把代码一起吃掉：字符串里的 // 不是注释开头', (t) => {
	// 抠注释最容易写出的是假阴性：见到第一个 `//` 就截断，于是一行里凡是出现 URL，后面
	// 真正的违规写法就被连带抹掉，门当场变成一句空话——比误伤更坏，因为它是静默的。
	const dir = tempDir(t)
	fs.writeFileSync(path.join(dir, 'url.mjs'), "const doc = 'https://example.com/tokens'\nexport const w = (s) => '--' + s + doc\n")

	const codes = findVarDerivation(dir).map((v) => v.code)
	assert.deepEqual(codes, ['builds-var-name'], 'URL 之后的拼名字写法必须照样抓到')
})

test('注释射程不得把代码一起吃掉：正则里的 \\/\\/ 也不是注释开头', (t) => {
	// 与上一条同一种假阴性，另一个入口：`/https:\/\//` 里那两个转义斜杠挨在一起，按「见到
	// // 就截断」处理，同一行后面的违规写法就静默消失了。正则字面量必须整段留在代码里。
	const dir = tempDir(t)
	fs.writeFileSync(path.join(dir, 'regex.mjs'), "const re = /https:\\/\\//; export const w = (s) => '--' + s + re\n")

	const codes = findVarDerivation(dir).map((v) => v.code)
	assert.deepEqual(codes, ['builds-var-name'], '同一行正则之后的拼名字写法必须照样抓到')
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
	// core 的判据只许由同步脚本重放。往 vendor 里加一个「本包专用」的模块，会让下次同步
	// 悄悄把它冲掉，或者更坏——让三个包的 vendor 从此不再逐字节一致，而那件事没人会当场发现。
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
