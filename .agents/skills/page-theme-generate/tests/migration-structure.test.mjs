/**
 * 迁移门 `structure-lock`（`gates[]` 第六行），一个 code `tag-changed`。
 *
 * 单独一份，是因为坏输入的造法与内容锁不同：内容锁改的是文本 / 属性值，本门改的是
 * **标签本身**，而「改标签但不改文本」正是内容锁全绿、本门必红的那种输入——混在一份里
 * 会让「只这一处也会挂」变成两处违例。
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { lintMigration, decideMigrationVerdict } from '../scripts/lint-migration.mjs'
import { MIGRATION_GATE_ORDER, gateStructureLock, gateContentLock } from '../scripts/lib/migration-gates.mjs'
import { extractTagSequence } from '../scripts/lib/structure-lock.mjs'
import { FIXTURE_ASSET } from './helpers.mjs'

const FIX = path.join(import.meta.dirname, 'fixtures', 'migration')
const read = (rel) => fs.readFileSync(path.join(FIX, rel), 'utf8')

function fixtureInput(overrides = {}) {
	return {
		assetDir: FIXTURE_ASSET,
		beforeFiles: [
			{ rel: 'floor-good.html', text: read('before/floor-good.html') },
			{ rel: 'floor-good.css', text: read('before/floor-good.css') },
		],
		afterFiles: [
			{ rel: 'floor-good.html', text: read('after/floor-good.html') },
			{ rel: 'floor-good.css', text: read('after/floor-good.css') },
			{ rel: 'theme-vars.css', text: read('after/theme-vars.css') },
		],
		verdicts: JSON.parse(read('verdicts.json')),
		typeVerdicts: JSON.parse(read('type-verdicts.json')),
		baselinePresent: true,
		...overrides,
	}
}

const pair = (beforeText, afterText) =>
	gateStructureLock({
		beforeHtml: [{ file: 'a.html', text: beforeText }],
		afterHtml: [{ file: 'a.html', text: afterText }],
	})

const codes = (findings) => findings.map((f) => f.code)

/* ── 抽取器 ──────────────────────────────────────────────────────────────────── */

test('抽取器：只收开标签名，小写归一，闭标签与 DOCTYPE 不进序列', () => {
	assert.deepEqual(extractTagSequence('<!DOCTYPE html><DIV><P>x</P></DIV>'), ['div', 'p'])
})

test('抽取器：不收 class、不收属性、不收层级深度', () => {
	assert.deepEqual(
		extractTagSequence('<div class="a" id="b" data-pattern="x"><span>y</span></div>'),
		extractTagSequence('<div><span>y</span></div>'),
	)
})

test('抽取器：`<script>` / `<style>` 的体不进序列，开标签名进', () => {
	// 体必须跳：`a<b` 会被标签正则读成开标签。名字必须进：插一个 script 是换骨架。
	assert.deepEqual(extractTagSequence('<div><script>if (a<b) {}</script></div>'), ['div', 'script'])
	assert.deepEqual(extractTagSequence('<div><style>.x > .y { color: red; }</style></div>'), ['div', 'style'])
})

test('抽取器：注释不进序列', () => {
	assert.deepEqual(extractTagSequence('<div><!-- <span> --></div>'), ['div'])
})

/* ── tag-changed：会挂的输入 ─────────────────────────────────────────────────── */

test('tag-changed：包一层 <div>，文本一个字没动', () => {
	// 逐位比，插一个标签会让它之后每一位都错开：两位的序列包一层报三条（第三条 before 为 null）。
	const findings = pair('<section><h2>标题</h2></section>', '<div><section><h2>标题</h2></section></div>')
	assert.deepEqual(codes(findings), ['tag-changed', 'tag-changed', 'tag-changed'])
	assert.ok(findings.some((f) => f.index === 0 && f.before === 'section' && f.after === 'div'))
	assert.ok(findings.some((f) => f.index === 2 && f.before === null && f.after === 'h2'))
})

test('tag-changed：`<section>` 改 `<div>`', () => {
	assert.deepEqual(codes(pair('<section><h2>x</h2></section>', '<div><h2>x</h2></div>')), ['tag-changed'])
})

test('tag-changed：抽掉一层', () => {
	assert.ok(codes(pair('<div><section><p>x</p></section></div>', '<div><p>x</p></div>')).includes('tag-changed'))
})

test('tag-changed：两段互换（h2 与 ul 对调），文本序列也变，两门各报各的', () => {
	const before = '<div><h2>甲</h2><ul><li>乙</li></ul></div>'
	const after = '<div><ul><li>乙</li></ul><h2>甲</h2></div>'
	assert.ok(codes(pair(before, after)).includes('tag-changed'))
})

test('tag-changed：h2 改 h3（标题级别是骨架）', () => {
	assert.deepEqual(codes(pair('<h2>x</h2>', '<h3>x</h3>')), ['tag-changed'])
})

test('tag-changed：插一个 `<script>`', () => {
	assert.ok(codes(pair('<div><p>x</p></div>', '<div><script>t()</script><p>x</p></div>')).includes('tag-changed'))
})

/* ── 不误伤：射程边界 ────────────────────────────────────────────────────────── */

test('只改 class 时结构锁必须绿：class 不是本门的靶', () => {
	// 这条是「结构锁只比标签名」这个裁断的唯一证据。判据若偷偷收了 class，本条当场转红。
	// 改选择器的后果由兑现门的 accept-occurrence-lost 报，不由本门报。
	assert.deepEqual(pair('<div class="pt-feature-grid">x</div>', '<div class="pt-feature-grid extra">x</div>'), [])
})

test('只改 id / data-* / 属性顺序时结构锁绿（射程边界，不许顺手收严）', () => {
	assert.deepEqual(pair('<div id="a" data-pattern="p">x</div>', '<div data-pattern="q" id="b">x</div>'), [])
})

test('`<img>` 与 `<img/>` 同名：formatter 不插标签就不红', () => {
	assert.deepEqual(pair('<div><img src="a.png"></div>', '<div><img src="a.png" /></div>'), [])
})

test('改缩进与换行不红', () => {
	assert.deepEqual(pair('<div><p>x</p></div>', '<div>\n\t<p>\n\t\tx\n\t</p>\n</div>'), [])
})

test('只比序列不比树：同一条标签序列换个嵌套抓不住（已知盲区，不许假装抓得住）', () => {
	// 本门最大的洞。判据若哪天改成比树，本条转红——那时该做的是改这条用例与两处文档，
	// 不是悄悄让门变严而散文还写着「抓不住」。
	assert.deepEqual(extractTagSequence('<div><p>x</p></div>'), extractTagSequence('<div></div><p>x</p>'))
	assert.deepEqual(pair('<div><p>x</p></div>', '<div></div><p>x</p>'), [])
})

test('`--after` 多出来的 HTML 不判', () => {
	const findings = gateStructureLock({
		beforeHtml: [{ file: 'keep.html', text: '<p>x</p>' }],
		afterHtml: [
			{ file: 'keep.html', text: '<p>x</p>' },
			{ file: 'extra.html', text: '<section><div>新增页</div></section>' },
		],
	})
	assert.deepEqual(findings, [])
})

test('before 有 after 没有那份：结构锁不报，内容锁报 content-file-missing（不重复报同一件事）', () => {
	const beforeHtml = [{ file: 'gone.html', text: '<section><p>x</p></section>' }]
	assert.deepEqual(gateStructureLock({ beforeHtml, afterHtml: [] }), [])
	assert.ok(codes(gateContentLock({ beforeHtml, afterHtml: [] })).includes('content-file-missing'))
})

/* ── 编排：门真的接上了 ──────────────────────────────────────────────────────── */

test('gates[] 九行恒在，第七行是 structure-lock', () => {
	const r = lintMigration(fixtureInput())
	assert.equal(r.verdict, 'pass', r.findings.map((f) => `${f.gate}:${f.code} ${f.reason}`).join('\n'))
	assert.deepEqual(r.gates.map((g) => g.gate), MIGRATION_GATE_ORDER)
	assert.equal(r.gates.length, 9)
	assert.equal(r.gates[6].gate, 'structure-lock')
	assert.ok(r.gates.every((g) => g.status === 'ran'))
})

test('tag-changed 必须走 lintMigration：包一层容器退 blocked，且内容锁零 finding', () => {
	// 「门没装上」的正面证据：本例里 tag-changed 是**唯一**一条 finding，所以 verdict 只能
	// 靠它变 blocked。结构 finding 只进 findings[] 而不进判定的话，这条会退 pass。
	const input = fixtureInput()
	const after = input.afterFiles.find((f) => f.rel === 'floor-good.html')
	after.text = `<div class="wrapper">\n${after.text}\n</div>`
	const r = lintMigration(input)
	assert.equal(r.verdict, 'blocked')
	assert.ok(r.findings.every((f) => f.gate === 'structure-lock'), '包一层不改文本：内容锁与两道兑现门都不该开口')
	assert.ok(codes(r.findings).includes('tag-changed'))
	assert.equal(r.gates.find((g) => g.gate === 'content-lock').findings, 0)
	assert.ok(r.gates.find((g) => g.gate === 'structure-lock').findings > 0)
})

test('tag-changed 必须走 lintMigration：换标签名退 blocked', () => {
	const input = fixtureInput()
	const after = input.afterFiles.find((f) => f.rel === 'floor-good.html')
	after.text = after.text.replace('<section ', '<div ').replace('</section>', '</div>')
	const r = lintMigration(input)
	assert.equal(r.verdict, 'blocked')
	assert.deepEqual(
		[...new Set(r.findings.map((f) => f.gate))],
		['structure-lock'],
	)
})

test('只改 class 走 lintMigration 仍退 blocked，但红的不是结构锁', () => {
	// 两门分开的另一半证据：改选择器由兑现门报，结构锁一条不报。
	const input = fixtureInput()
	for (const files of [input.beforeFiles, input.afterFiles]) {
		const html = files.find((f) => f.rel === 'floor-good.html')
		html.text = html.text.replace('class="pt-feature-grid__icon"', 'class="pt-feature-grid__icon extra"')
	}
	const after = input.afterFiles.find((f) => f.rel === 'floor-good.css')
	after.text = after.text.replace('.pt-feature-grid__icon {', '.pt-feature-grid__icon-renamed {')
	const r = lintMigration(input)
	assert.equal(r.verdict, 'blocked')
	assert.equal(r.gates.find((g) => g.gate === 'structure-lock').findings, 0)
	assert.ok(r.findings.some((f) => f.code === 'accept-occurrence-lost'))
})

test('纯 CSS 迁移：structure-lock 写 no-input，退 0（就这一门）', () => {
	const input = fixtureInput()
	input.beforeFiles = input.beforeFiles.filter((f) => !/\.html$/i.test(f.rel))
	input.afterFiles = input.afterFiles.filter((f) => !/\.html$/i.test(f.rel))
	const r = lintMigration(input)
	assert.equal(r.gates.find((g) => g.gate === 'structure-lock').status, 'no-input')
	assert.equal(r.verdict, 'pass', r.findings.map((f) => `${f.gate}:${f.code}`).join('\n'))
})

test('tag-changed 的 finding 带非空 reason 与 file / index / before / after', () => {
	const input = fixtureInput()
	const after = input.afterFiles.find((f) => f.rel === 'floor-good.html')
	after.text = `<div>\n${after.text}\n</div>`
	const f = lintMigration(input).findings.find((x) => x.code === 'tag-changed')
	assert.ok(f && f.reason.trim())
	assert.equal(f.gate, 'structure-lock')
	assert.equal(f.level, 'block')
	assert.equal(f.file, 'floor-good.html')
	assert.equal(typeof f.index, 'number')
})

test('结构锁 finding 进 verdict 判定：只有一条 tag-changed 也必须 blocked', () => {
	assert.equal(
		decideMigrationVerdict([{ gate: 'structure-lock', code: 'tag-changed' }], { rate: 1 }, { rate: null }),
		'blocked',
	)
})
