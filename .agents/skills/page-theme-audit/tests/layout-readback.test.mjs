/**
 * 布局表的裁决回灌（`R4-09`）。出表那一半在 `layout-map.test.mjs`。
 *
 * 四条硬承诺各有独占用例，卸掉判据即转红：
 *
 * 1. **裁决词表多一档 `recreate`**——「本模式做不到」的行只能走它；给这种行裁 `accept` 会挂
 *    （`accept-needs-recreate`），反方向给做得到的行裁 `recreate` 也挂（`recreate-not-required`）。
 * 2. **重做后整页跑 audit，不是跑迁移门**——这句话落在产物里（`recreateOrders[].verifyBy` /
 *    `notVerifyBy` / `verifyReason`），不只写在报告里。
 * 3. **阻断码与报警码分列**——报警不进 `findings`、不影响退出码；三档行数都非零、四种报警
 *    都在，只要裁决合法就仍退 0。
 * 4. **`--out` 与 `--read-back` 互斥，两者都不给也是用法错误**，且交叉判定挂在 `--read-back`
 *    本身上（默认取同目录的色表 / 非色表读回件），不挂在可选旗标上。
 *
 * 坏输入一律从 `--out` 产出的那份 Markdown **改一格**派生：手写一整份表会让「只这一格错」
 * 变成两处错，而它本该证明的是「只这一格也会挂」。
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { LAYOUT_VERDICTS, readBackLayoutMap } from '../scripts/lib/layout-rows.mjs'
import { MAP_MD_NAME } from '../scripts/lib/map-cross.mjs'
import { goodCss, tempDir, writeArtifact, SCRIPTS_DIR } from './helpers.mjs'
import { LAYOUT_MAP_CLI, assetWithEnvelope, CROSS_SITE_PAGE } from './layout-fixture.mjs'

/**
 * 一份三档全非零的跨站改页产物：
 * 阻断层 3（首层 / 末层 / float-widget 进序列）· 报警层 2（容器宽 1440 · 7 列）· 不在包络 1（900px）。
 * `@media` 里那处色字面量是给色表留的行——交叉判定要两张对表都真有行才判得动。
 */
const LAYOUT_CSS = `${goodCss()}
.wrap { max-width: 1440px; }
.g { display: grid; grid-template-columns: repeat(7, 1fr); }
@media (max-width: 900px) { .x { color: #0F7A6C; } }
`

const run = (args) => spawnSync(process.execPath, args, { encoding: 'utf8' })
const cli = (name) => path.join(SCRIPTS_DIR, name)

const jsonOf = (r) => {
	const at = r.stdout.indexOf('{')
	assert.ok(at >= 0, `stdout 里没有 JSON：${r.stdout}${r.stderr}`)
	return JSON.parse(r.stdout.slice(at))
}

/** 按硬序出三张表：`--out` 到**同一个目录**，于是两张对表就在布局表旁边。 */
function threeMaps(t, { css = LAYOUT_CSS, html = CROSS_SITE_PAGE, mutate } = {}) {
	const asset = assetWithEnvelope(t, mutate)
	const art = writeArtifact(path.join(tempDir(t), 'art'), { html, css })
	const out = path.join(tempDir(t), 'out')
	for (const name of ['value-map.mjs', 'type-map.mjs', 'layout-map.mjs']) {
		const gen = run([cli(name), '--asset', asset, '--artifact', art.dir, '--out', out])
		assert.equal(gen.status, 0, `${name}：${gen.stderr}`)
	}
	return { asset, art, out, md: path.join(out, 'layout-map.md'), doc: JSON.parse(fs.readFileSync(path.join(out, 'layout-map.json'), 'utf8')) }
}

const readBack = (asset, art, md, extra = []) => run([LAYOUT_MAP_CLI, '--asset', asset, '--artifact', art.dir, '--read-back', md, ...extra])

/**
 * 改「选中值」（第 9 格）与「裁决」（第 10 格）两格。`decide(row)` 返回 `null` 表示这一行不填。
 * 只动这两格，别的一个字节不碰——坏用例必须只在人填区不同。
 */
function fill(fixture, decide) {
	const byId = new Map(fixture.doc.rows.map((r) => [r.id, r]))
	const lines = fs.readFileSync(fixture.md, 'utf8').split('\n')
	let touched = 0
	const out = lines.map((line) => {
		if (!/^\| lm-/.test(line)) return line
		const cells = line.split('|')
		const row = byId.get(cells[1].trim())
		assert.ok(row, `表里这一行 JSON 里没有：${cells[1]}`)
		const got = decide(row)
		if (!got) return line
		touched++
		cells[9] = ` ${got.value ?? ''} `
		cells[10] = ` ${got.verdict ?? ''} `
		return cells.join('|')
	})
	assert.ok(touched > 0, '一格都没改，这条用例证不了什么')
	fs.writeFileSync(fixture.md, out.join('\n'))
	return fixture
}

/** 全合法的一份裁决：优化模式做得到的那一行 accept 第一个候选，其余全 recreate。 */
const legalDecision = (row) =>
	row.modeRequired === 'optimize' ? { verdict: 'accept', value: `\`${row.candidates[0].value}\`` } : { verdict: 'recreate' }

const codes = (back) => back.findings.map((f) => f.code)
const warnCodes = (back) => back.warnings.map((w) => w.code)

/* ── 裁决词表 ───────────────────────────────────────────────────────────────── */

test('裁决词表四值，第四值是 recreate；本表没有 omit', () => {
	assert.deepEqual([...LAYOUT_VERDICTS].sort(), ['accept', 'defer', 'recreate', 'reject'])
	assert.ok(!LAYOUT_VERDICTS.has('omit'), '布局零候选行的出路是 recreate，不是承认缺口就地收工')
	assert.ok(!LAYOUT_VERDICTS.has('pending'), '未裁用未填表达，不是一个枚举值')
})

test('读不懂的裁决不猜：verdict-unknown，且报错文本列全四值', (t) => {
	const f = fill(threeMaps(t), (row) => (row.usage === 'columns' ? { verdict: '略过' } : null))
	const r = readBack(f.asset, f.art, f.md)
	assert.equal(r.status, 1)
	const hit = jsonOf(r).findings.find((c) => c.code === 'verdict-unknown')
	assert.ok(hit)
	assert.match(hit.reason, /accept \/ reject \/ defer \/ recreate/)
})

/* ── recreate 那一档：两个方向各有一条会挂的输入 ─────────────────────────────── */

test('「本模式做不到」的行裁 accept 会挂：accept-needs-recreate（新那一档的门牙）', (t) => {
	// 列数行：改列数会让内容条数不对（content-lock），也牵连降列行为（breakpoint-lock）。
	const f = fill(threeMaps(t), (row) => (row.usage === 'columns' ? { verdict: 'accept', value: `\`${row.candidates[0].value}\`` } : null))
	const r = readBack(f.asset, f.art, f.md)
	const back = jsonOf(r)
	assert.equal(r.status, 1)
	assert.equal(back.verdict, 'blocked')
	const hit = back.findings.find((c) => c.code === 'accept-needs-recreate')
	assert.ok(hit, '没有这一条，「本模式做不到」那句建议就能被一个 accept 盖过去')
	assert.equal(hit.level, 'block')
	assert.match(hit.reason, /本模式做不到/)
	assert.match(hit.reason, /recreate/)
	assert.match(hit.reason, /整页跑 audit/)
	assert.deepEqual(back.recreateOrders, [], '挂掉的行不许长出一条重做指令')
	assert.equal(back.rows.find((x) => x.usage === 'columns').acceptedValue, null)
})

test('四个 modeRequired: create 的用途，裁 accept 全挂——不是只有列数那一维', (t) => {
	const f = fill(threeMaps(t), (row) =>
		row.modeRequired === 'create' ? { verdict: 'accept', value: row.candidates.length ? `\`${row.candidates[0].value}\`` : '' } : null,
	)
	const back = jsonOf(readBack(f.asset, f.art, f.md))
	const hit = back.findings.filter((c) => c.code === 'accept-needs-recreate')
	assert.equal(hit.length, f.doc.rows.filter((r) => r.modeRequired === 'create').length)
	assert.ok(hit.length >= 4, `create 档的行只有 ${hit.length} 条，这条用例覆盖不到四个用途`)
	assert.deepEqual(
		codes(back).filter((c) => c !== 'accept-needs-recreate'),
		[],
		'零候选行不许另报 accept-without-candidate：病因是优化模式改不动它，不是没得填',
	)
})

test('优化模式做得到的行裁 recreate 也挂：recreate-not-required（反方向同样要挡）', (t) => {
	const f = fill(threeMaps(t), (row) => (row.modeRequired === 'optimize' ? { verdict: 'recreate' } : null))
	const r = readBack(f.asset, f.art, f.md)
	const back = jsonOf(r)
	assert.equal(r.status, 1)
	const hit = back.findings.find((c) => c.code === 'recreate-not-required')
	assert.ok(hit)
	assert.match(hit.reason, /只动一个数字/)
	assert.deepEqual(back.recreateOrders, [])
})

test('recreate 合法：退 0，重做指令带「整页跑 audit、不是迁移门」两个字段', (t) => {
	const f = fill(threeMaps(t), (row) => (row.usage === 'sequence-first' ? { verdict: 'recreate' } : null))
	const r = readBack(f.asset, f.art, f.md)
	const back = jsonOf(r)
	assert.equal(r.status, 0, r.stderr)
	assert.equal(back.verdict, 'pass')
	assert.deepEqual(back.findings, [])
	assert.equal(back.recreateOrders.length, 1)
	const order = back.recreateOrders[0]
	assert.equal(order.usage, 'sequence-first')
	assert.equal(order.verifyBy, 'lint-artifact', '重做后整页跑 audit')
	assert.equal(order.notVerifyBy, 'structure-lock', '不是跑迁移门')
	assert.match(order.verifyReason, /结构本不该变/)
	assert.match(order.verifyReason, /用错了尺/)
	assert.ok(order.candidates.length, '指令要带候选，执行方才知道首层该换成哪些型之一')
	assert.equal(back.summary.recreateOrders, 1)
	assert.equal(back.summary.byVerdict.recreate, 1)
	// 报警层这一句在报警里也要有，别只藏在 JSON 字段名里。
	const warn = back.warnings.find((w) => w.code === 'recreate-order-open')
	assert.match(warn.reason, /整页跑 audit/)
	assert.match(warn.reason, /structure-lock/)
})

test('阻断层行不许裁 reject；同一行裁 defer 不挡', (t) => {
	const rejected = fill(threeMaps(t), (row) => (row.layer === 'blocking' ? { verdict: 'reject' } : null))
	const back = jsonOf(readBack(rejected.asset, rejected.art, rejected.md))
	assert.equal(back.findings.filter((c) => c.code === 'reject-on-blocking-layer').length, 3)
	assert.match(back.findings[0].reason, /不是豁免章/)

	const deferred = fill(threeMaps(t), (row) => (row.layer === 'blocking' ? { verdict: 'defer' } : null))
	const r = readBack(deferred.asset, deferred.art, deferred.md)
	assert.equal(r.status, 0, 'defer 明说以后还会再来，不是声称这一处刻意留着')
	assert.equal(jsonOf(r).summary.byVerdict.defer, 3)
})

/* ── 选中值那一格 ───────────────────────────────────────────────────────────── */

test('选中值：accept 空着 / 填候选外的值 / 非 accept 行填了，三条各自阻断', (t) => {
	const cases = [
		['accepted-value-missing', (row) => ({ verdict: 'accept', value: '' })],
		['accepted-value-unknown', () => ({ verdict: 'accept', value: '`9999`' })],
		['accepted-value-unexpected', (row) => ({ verdict: 'defer', value: `\`${row.candidates[0].value}\`` })],
	]
	for (const [code, decide] of cases) {
		const f = fill(threeMaps(t), (row) => (row.modeRequired === 'optimize' ? decide(row) : null))
		const back = jsonOf(readBack(f.asset, f.art, f.md))
		assert.deepEqual(codes(back), [code], code)
	}
})

test('数值行 `1128` 与 `1128px` 都收：人是从候选那一格抄过来的', (t) => {
	for (const shape of [(v) => `\`${v}\``, (v) => `\`${v}px\``, (v) => `${v}`]) {
		const f = threeMaps(t)
		const width = f.doc.rows.find((r) => r.usage === 'container-width')
		fill(f, (row) => (row.usage === 'container-width' ? { verdict: 'accept', value: shape(width.candidates[0].value) } : null))
		const r = readBack(f.asset, f.art, f.md)
		const back = jsonOf(r)
		assert.equal(r.status, 0, `${shape(width.candidates[0].value)}：${r.stderr}`)
		assert.equal(back.rows.find((x) => x.usage === 'container-width').acceptedValue, width.candidates[0].value)
	}
})

test('包络那个条目缺席 → 容器宽行零候选，裁 accept 报 accept-without-candidate', (t) => {
	const f = threeMaps(t, {
		mutate: (text) => {
			const doc = JSON.parse(text)
			delete doc.blocking.find((b) => b.id === 'contained-has-enumerated-max-width').detail.maxWidthPx
			return JSON.stringify(doc, null, 2)
		},
	})
	// 条目一缺，包络那一侧的观测集合整个空掉，于是合格产物里本来对得上的 `1128px` 也出行了
	// ——只填 1440 那一行，别把两行的病因混进同一条断言。
	const width = f.doc.rows.find((r) => r.usage === 'container-width' && r.normalizedValue === '1440px')
	assert.deepEqual(width.candidates, [], '这条用例的前提就是零候选')
	assert.equal(width.modeRequired, 'optimize', '它仍是优化模式做得到的行，所以病因不是 accept-needs-recreate')
	fill(f, (row) => (row.id === width.id ? { verdict: 'accept', value: '`1128`' } : null))
	const back = jsonOf(readBack(f.asset, f.art, f.md))
	assert.deepEqual(codes(back), ['accept-without-candidate'])
	assert.match(back.findings[0].reason, /recreate 或 defer/)
})

/* ── 阻断码与报警码分列 ─────────────────────────────────────────────────────── */

test('三档行数都非零、四种报警都在，仍退 0：报警不进 findings、不影响退出码', (t) => {
	const f = threeMaps(t)
	fill(f, legalDecision)
	// 再补两条报警：把某一行整行删掉（row-missing）、把另一行原样复制一份（row-id-repeated）。
	const lines = fs.readFileSync(f.md, 'utf8').split('\n')
	const at = lines.findIndex((l) => /^\| lm-sequence-last-/.test(l))
	const dropAt = lines.findIndex((l) => /^\| lm-sequence-float-widget-/.test(l))
	lines.splice(at + 1, 0, lines[at])
	lines.splice(dropAt + (dropAt > at ? 1 : 0), 1)
	fs.writeFileSync(f.md, lines.join('\n'))

	const r = readBack(f.asset, f.art, f.md)
	const back = jsonOf(r)
	assert.equal(r.status, 0, r.stderr)
	assert.equal(back.verdict, 'pass')
	assert.deepEqual(back.findings, [], '报警一条都不许进 findings')
	assert.deepEqual(back.summary.byLayer, { blocking: 3, advisory: 2, 'outside-envelope': 1 }, '三档都非零才证得了这件事')
	assert.deepEqual(
		[...new Set(warnCodes(back))].sort(),
		['accepted-value-delta', 'recreate-order-open', 'row-id-repeated', 'row-missing'],
		'四种报警码',
	)
	assert.ok(back.warnings.length >= 5)
	assert.equal(back.summary.byVerdict.accept, 1)
	assert.equal(back.summary.byVerdict.recreate, 4, '被删掉那一行按未裁算，不进 recreate')
	assert.equal(back.summary.pending, 1)
})

test('阻断码十条互不合并，且每条都有一条会挂的输入（本文件逐条覆盖）', () => {
	const src = fs.readFileSync(new URL('../scripts/lib/layout-rows.mjs', import.meta.url), 'utf8')
	const declared = [...src.matchAll(/block\(\s*'([a-z-]+)'/g)].map((m) => m[1])
	const inRow = [...src.matchAll(/code: '([a-z-]+)',\n\t\t\t\tid: row\.id,\n\t\t\t\tlevel: 'block'/g)].map((m) => m[1])
	const all = [...new Set([...declared, ...inRow])].sort()
	assert.deepEqual(all, [
		'accept-needs-recreate',
		'accept-without-candidate',
		'accepted-value-missing',
		'accepted-value-unexpected',
		'accepted-value-unknown',
		'recreate-not-required',
		'reject-on-blocking-layer',
	])
	// 另三条阻断码在 readBackLayoutMap 的循环里（不带 row.id 那套形状）加 map-cross 那一条。
	for (const code of ['row-id-unknown', 'verdict-unknown', 'row-id-duplicate']) {
		assert.ok(src.includes(`code: '${code}'`), `${code} 不在本模块里`)
	}
	const cross = fs.readFileSync(new URL('../scripts/lib/map-cross.mjs', import.meta.url), 'utf8')
	assert.ok(cross.includes("code: 'maps-cross-blocked'"))
})

test('id 认不出 / 同一 id 两行裁决不同，各自阻断；逐字相同只报警', (t) => {
	const f = fill(threeMaps(t), legalDecision)
	const lines = fs.readFileSync(f.md, 'utf8').split('\n')
	const at = lines.findIndex((l) => /^\| lm-container-width-/.test(l))
	const cells = lines[at].split('|')
	cells[1] = ' lm-container-width-deadbeef '
	lines.splice(at + 1, 0, cells.join('|'))
	fs.writeFileSync(f.md, lines.join('\n'))
	let back = jsonOf(readBack(f.asset, f.art, f.md))
	assert.deepEqual(codes(back), ['row-id-unknown'])

	const g = fill(threeMaps(t), legalDecision)
	const gl = fs.readFileSync(g.md, 'utf8').split('\n')
	const gi = gl.findIndex((l) => /^\| lm-sequence-last-/.test(l))
	const dup = gl[gi].split('|')
	dup[10] = ' defer '
	gl.splice(gi + 1, 0, dup.join('|'))
	fs.writeFileSync(g.md, gl.join('\n'))
	back = jsonOf(readBack(g.asset, g.art, g.md))
	assert.deepEqual(codes(back), ['row-id-duplicate'])
})

test('整列空着（刚出的表原样读回）退 0，pending 就是行数', (t) => {
	const f = threeMaps(t)
	const r = readBack(f.asset, f.art, f.md)
	const back = jsonOf(r)
	assert.equal(r.status, 0, r.stderr)
	assert.equal(back.summary.pending, back.summary.rows)
	assert.deepEqual(back.findings, [])
	assert.deepEqual(back.recreateOrders, [])
	assert.deepEqual(back.summary.byVerdict, { accept: 0, reject: 0, defer: 0, recreate: 0 })
})

/* ── 三表交叉判定 ───────────────────────────────────────────────────────────── */

/** 把一张对表弄成 blocked：第一条数据行的「裁决」列写个读不懂的字（两张表都是第 7 格）。 */
function blockPeer(file) {
	const lines = fs.readFileSync(file, 'utf8').split('\n')
	const i = lines.findIndex((l) => /^\| (vm|tm)-/.test(l))
	assert.ok(i >= 0, `${path.basename(file)} 里一条数据行都没有，这条用例证不了什么`)
	const cells = lines[i].split('|')
	cells[7] = ' 略过 '
	lines[i] = cells.join('|')
	fs.writeFileSync(file, lines.join('\n'))
}

test('默认路径：色表 blocked → 布局表也退 1，不传任何对表旗标', (t) => {
	const f = fill(threeMaps(t), legalDecision)
	blockPeer(path.join(f.out, 'value-map.md'))
	const r = readBack(f.asset, f.art, f.md)
	const back = jsonOf(r)
	assert.equal(r.status, 1, '按硬序跑的这条命令必须挡住「布局 pass、色表 blocked」')
	assert.deepEqual(codes(back), ['maps-cross-blocked'])
	assert.equal(back.findings[0].peer, 'value')
	assert.deepEqual(
		back.peerMaps.map((p) => [p.mapKind, p.verdict]),
		[['value', 'blocked'], ['type', 'pass']],
		'两张对表都要真被读回过，且各自留痕',
	)
	assert.equal(path.resolve(back.peerMaps[0].file), path.resolve(f.out, MAP_MD_NAME.value), '对表是同目录取的，不是旗标给的')
})

test('非色表 blocked 同样挡；两张都 blocked 出两条，不合并成一条', (t) => {
	const f = fill(threeMaps(t), legalDecision)
	blockPeer(path.join(f.out, 'type-map.md'))
	let back = jsonOf(readBack(f.asset, f.art, f.md))
	assert.deepEqual(codes(back), ['maps-cross-blocked'])
	assert.equal(back.findings[0].peer, 'type')

	blockPeer(path.join(f.out, 'value-map.md'))
	back = jsonOf(readBack(f.asset, f.art, f.md))
	assert.deepEqual(codes(back), ['maps-cross-blocked', 'maps-cross-blocked'])
	assert.deepEqual(back.findings.map((c) => c.peer), ['value', 'type'], '报告要说得出是哪一张')
})

test('三张都 pass：退 0，且报告里留着两张对表的读面', (t) => {
	const f = fill(threeMaps(t), legalDecision)
	const r = readBack(f.asset, f.art, f.md)
	const back = jsonOf(r)
	assert.equal(r.status, 0, r.stderr)
	assert.equal(back.verdict, 'pass')
	assert.deepEqual(back.peerMaps.map((p) => p.verdict), ['pass', 'pass'])
	assert.ok(back.peerMaps.every((p) => p.rows > 0), '两张对表都要真有行，否则这条用例证不了交叉判定')
})

test('对表有行却取不到读回件 → maps-cross-blocked：挪走对表 md 绕不过去', (t) => {
	const f = fill(threeMaps(t), legalDecision)
	fs.rmSync(path.join(f.out, 'type-map.md'))
	const r = readBack(f.asset, f.art, f.md)
	const back = jsonOf(r)
	assert.equal(r.status, 1)
	const hit = back.findings.find((c) => c.code === 'maps-cross-blocked')
	assert.equal(hit.peer, 'type')
	assert.match(hit.reason, /取不到/)
	assert.match(hit.reason, /type-map\.md/)
	assert.equal(back.peerMaps[1].verdict, null)
	assert.ok(back.peerMaps[1].rows > 0, '判据来自产物重算的行数，不是文件系统')
})

test('对表一行都没有：不开口、退 0，peerMaps 那一条写明零行', (t) => {
	// 合格产物一处色字面量都没有 → 色表零行；布局行靠层根序列出，不靠 CSS。
	const f = threeMaps(t, { css: goodCss() })
	fs.rmSync(path.join(f.out, 'value-map.md'))
	fill(f, legalDecision)
	const r = readBack(f.asset, f.art, f.md)
	const back = jsonOf(r)
	assert.equal(r.status, 0, r.stderr)
	assert.deepEqual(back.peerMaps[0], { mapKind: 'value', file: null, verdict: null, rows: 0 })
	assert.deepEqual(back.findings, [])
})

test('--peer-read-back-* 是显式指路：对表不在同目录时照样挡住；指不到即用法错误', (t) => {
	const f = fill(threeMaps(t), legalDecision)
	const moved = path.join(tempDir(t), 'elsewhere', 'type-map.md')
	fs.mkdirSync(path.dirname(moved), { recursive: true })
	blockPeer(path.join(f.out, 'type-map.md'))
	fs.renameSync(path.join(f.out, 'type-map.md'), moved)
	const hit = readBack(f.asset, f.art, f.md, ['--peer-read-back-type', moved])
	assert.equal(hit.status, 1)
	assert.ok(jsonOf(hit).findings.some((c) => c.code === 'maps-cross-blocked'))

	const nope = readBack(f.asset, f.art, f.md, ['--peer-read-back-value', path.join(f.out, 'nope.md')])
	assert.equal(nope.status, 1)
	assert.match(nope.stderr, /读不回对表/)
})

/* ── 用法错误与落盘 ─────────────────────────────────────────────────────────── */

test('用法错误三种：--out 与 --read-back 同时给 / 都不给 / 读不回', (t) => {
	const f = threeMaps(t)
	const both = run([LAYOUT_MAP_CLI, '--asset', f.asset, '--artifact', f.art.dir, '--out', f.out, '--read-back', f.md])
	assert.equal(both.status, 1)
	assert.match(both.stderr, /--out 与 --read-back 互斥/)

	const neither = run([LAYOUT_MAP_CLI, '--asset', f.asset, '--artifact', f.art.dir])
	assert.equal(neither.status, 1)
	assert.match(neither.stderr, /必须给 --out 或 --read-back 之一/)

	const gone = readBack(f.asset, f.art, path.join(f.out, 'not-here.md'))
	assert.equal(gone.status, 1)
	assert.match(gone.stderr, /读不回：/)
})

test('单数那个 --peer-read-back 不收：本表有两张对表，指哪一张说不清', (t) => {
	const f = threeMaps(t)
	const r = readBack(f.asset, f.art, f.md, ['--peer-read-back', path.join(f.out, 'type-map.md')])
	assert.equal(r.status, 1)
	assert.match(r.stderr, /--peer-read-back-value/)
	assert.match(r.stderr, /--peer-read-back-type/)
})

test('回灌不回写那两份文件；--json 另落一份，形状带 recreateOrders 与 peerMaps', (t) => {
	const f = fill(threeMaps(t), legalDecision)
	const before = { md: fs.readFileSync(f.md, 'utf8'), json: fs.readFileSync(path.join(f.out, 'layout-map.json'), 'utf8') }
	const jsonPath = path.join(tempDir(t), 'back', 'layout-readback.json')
	const r = readBack(f.asset, f.art, f.md, ['--json', jsonPath])
	assert.equal(r.status, 0, r.stderr)
	assert.equal(fs.readFileSync(f.md, 'utf8'), before.md, '人填的那份是输入，不许回写')
	assert.equal(fs.readFileSync(path.join(f.out, 'layout-map.json'), 'utf8'), before.json)
	const back = JSON.parse(fs.readFileSync(jsonPath, 'utf8'))
	assert.equal(back.mapKind, 'layout')
	assert.equal(back.recreateOrders.length, 5)
	assert.equal(back.peerMaps.length, 2)
	assert.equal(JSON.stringify(back), JSON.stringify(jsonOf(r)), 'stdout 与 --json 落盘必须是同一份')
})

/* ── 不读 trace：回灌这一侧同形 ─────────────────────────────────────────────── */

test('回灌也不读 trace：产物目录里 trace 内容变了，读回 JSON 字节相同', (t) => {
	const f = fill(threeMaps(t), legalDecision)
	const tracePath = path.join(f.art.dir, 'generate-trace.json')
	const once = (marker) => {
		fs.writeFileSync(tracePath, JSON.stringify({ reason: `自述 ${marker}`, floors: [{ pattern: 'hero.centered-pitch', note: marker }] }))
		const r = readBack(f.asset, f.art, f.md)
		assert.equal(r.status, 0, r.stderr)
		return r.stdout
	}
	const a = once('READBACK-MARKER-A')
	const b = once('READBACK-MARKER-B')
	assert.equal(a, b, 'trace 自由文本进了判据，字节就不同了')
	assert.ok(!a.includes('READBACK-MARKER'))
	assert.ok(JSON.parse(a.slice(a.indexOf('{'))).summary.rows > 0, '零行表的字节当然相同，这条用例要有行')
})

/* ── 纯函数层：不经 CLI 也判得对 ────────────────────────────────────────────── */

test('readBackLayoutMap 是纯函数：不落盘、不改入参', () => {
	const doc = {
		summary: { rows: 1, occurrences: 1, pending: 1, scanned: [], sequence: { scope: 'page' }, envelopeRefs: { resolved: [], missing: [] }, outOfScopeValues: [] },
		rows: [
			{
				id: 'lm-columns-aaaaaaaa',
				usage: 'columns',
				layer: 'advisory',
				modeRequired: 'create',
				sourceValue: 'repeat(7, 1fr)',
				normalizedValue: '7',
				occurrences: [],
				candidates: [{ value: 3, deltaColumns: -4 }],
				advice: '本模式做不到',
				verdict: null,
				acceptedValue: null,
				note: '',
			},
		],
	}
	const md = '| id | 源布局 | 用途 | 档位 | 处数 | 资产侧取值 | 候选 | 建议 | 选中值 | 裁决 | 备注 |\n| lm-columns-aaaaaaaa | x | columns | 报警层 | 1 | x | x | x |  | recreate |  |\n'
	const back = readBackLayoutMap(doc, md)
	assert.equal(back.verdict, 'pass')
	assert.equal(back.recreateOrders.length, 1)
	assert.equal(doc.rows[0].verdict, null, '入参那份不许被改')
})
