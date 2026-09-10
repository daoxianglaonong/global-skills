/**
 * 第五道迁移门 `verdict-hold-lock`，两条 code：`held-literal-removed` / `held-occurrence-lost`。
 *
 * 判据：裁成 `defer` / `reject` / `omit` 的行，它的每一处 occurrence 在改造后那一组声明里
 * 仍然带着源值。找不到源值 = 那一处被改了 = 阻断。
 *
 * 它堵的洞来自一次真实迁移：88 行色值里 75 行裁 `defer`，执行侧照样把那 123 处全换成了
 * `var()`，而八道门一道没响——`accept-fulfillment` 的分母只数 accept 行，`literal-verdict-backing`
 * 只查**还留着**的字面量，那些字面量已经没了。本文件里每条坏输入都保持「兑现率仍是 1」，
 * 那是「旧八道门确实看不见这件事」的正面证据。
 *
 * 单独一份，是因为这类坏输入的造法与前八道都不同：不动产物的合法性，只动**裁决与产物的
 * 一致性方向**——把一行改判 defer，产物那一处却已经迁完了。
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { lintMigration } from '../scripts/lint-migration.mjs'
import { MIGRATION_GATE_ORDER, gateVerdictHoldLock } from '../scripts/lib/migration-gates.mjs'
import { scanCss, scanHtml } from '../scripts/lib/css-scan.mjs'
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

/** 把某个源值的色行改判成 held。行 id 不动，所以准入的 `verdicts-stale` 不会误开口。 */
function holdRow(input, sourceValue, verdict = 'defer') {
	const row = input.verdicts.rows.find((r) => r.sourceValue === sourceValue)
	if (!row) throw new Error(`裁决记录里没有这个源值：${sourceValue}`)
	row.verdict = verdict
	row.acceptedCssVar = null
	return row
}

function afterCss(input, from, to) {
	const css = input.afterFiles.find((f) => f.rel === 'floor-good.css')
	if (!css.text.includes(from)) throw new Error(`after CSS 找不到锚点：${from}`)
	css.text = css.text.replace(from, to)
	return input
}

function decls(files) {
	const out = []
	for (const f of files) {
		if (/\.html$/i.test(f.rel)) out.push(...scanHtml(f.text, f.rel).declarations)
		else out.push(...scanCss(f.text, f.rel))
	}
	return out
}

const holdCodes = (r) => r.findings.filter((f) => f.gate === 'verdict-hold-lock').map((f) => f.code)
const gatesFired = (r) => [...new Set(r.findings.map((f) => f.gate))].sort()

/* ── 门位 ───────────────────────────────────────────────────────────────────── */

test('gates[] 第五行是 verdict-hold-lock，正例 ran 且零 finding', () => {
	const r = lintMigration(fixtureInput())
	assert.equal(r.verdict, 'pass', r.findings.map((f) => `${f.gate}:${f.code} ${f.reason}`).join('\n'))
	assert.equal(MIGRATION_GATE_ORDER[4], 'verdict-hold-lock')
	assert.equal(r.gates[4].gate, 'verdict-hold-lock')
	assert.equal(r.gates[4].status, 'ran', '色行是必填输入，本门恒 ran，没有 no-input 这一档')
	assert.equal(r.gates[4].findings, 0)
})

test('门名与 code 不与既有八道撞车', () => {
	assert.equal(new Set(MIGRATION_GATE_ORDER).size, MIGRATION_GATE_ORDER.length)
	assert.equal(MIGRATION_GATE_ORDER.length, 9)
	// 本门的两条 code 独占 `held-` 前缀，既有八道一条都没借用，反过来本门也没借它们的。
	const src = fs.readFileSync(new URL('../scripts/lib/migration-gates.mjs', import.meta.url), 'utf8')
	const heldCodes = [...src.matchAll(/'(held-[a-z-]+)'/g)].map((m) => m[1])
	assert.deepEqual([...new Set(heldCodes)].sort(), ['held-literal-removed', 'held-occurrence-lost'])
	for (const code of heldCodes) {
		assert.ok(src.includes(`'${code}':`), `${code} 必须在 FINDING_REASON 里有成文判据`)
	}
})

/* ── 正例 ───────────────────────────────────────────────────────────────────── */

test('正例：defer 行的源值原样留在产物里，本门放行', () => {
	const input = fixtureInput()
	holdRow(input, '#5a6472')
	afterCss(input, 'color: var(--color-text-muted);', 'color: #5a6472;')
	const r = lintMigration(input)
	assert.equal(r.verdict, 'pass', r.findings.map((f) => `${f.gate}:${f.code} ${f.reason}`).join('\n'))
	assert.equal(r.fulfillment.rate, 1, '那一行退出 accept 之后分母少一处，其余七处仍全兑现')
	assert.equal(r.fulfillment.acceptOccurrences, 7)
})

test('正例：defer 的非色行原样留着（本 fixture 的 16px / 24px 间距暂缓）', () => {
	const input = fixtureInput()
	const findings = gateVerdictHoldLock({
		afterDeclarations: decls(input.afterFiles),
		rows: input.verdicts.rows,
		typeRows: input.typeVerdicts.rows,
	})
	assert.deepEqual(findings, [])
	assert.ok(input.typeVerdicts.rows.every((r) => r.verdict === 'defer'), '这份夹具的非色行全是 defer')
})

test('accept 行不进本门射程：兑现门要求源值消失，本门不许因此报它', () => {
	const input = fixtureInput()
	const findings = gateVerdictHoldLock({
		afterDeclarations: decls(input.afterFiles),
		rows: input.verdicts.rows,
		typeRows: null,
	})
	assert.deepEqual(findings, [], '五行全是 accept 且全已迁完，本门一条都不该报')
})

/* ── 会挂的输入：每个 code 一条 ─────────────────────────────────────────────── */

test('held-literal-removed：defer 行的字面量被换成闭集内的 var()，前八道门全绿，只有它报', () => {
	// 这就是那次真实迁移的形状：裁决记录写着「暂缓、别动」，产物里那一处已经换成 var()。
	// 换的是**闭集内**的名字，所以 theme-api-lock 按定义放行；兑现率仍是 1；残余背书门看不到
	// 字面量。整份的 blocked 只能来自本门。
	const input = fixtureInput()
	holdRow(input, '#5a6472')
	const r = lintMigration(input)
	assert.equal(r.verdict, 'blocked')
	assert.deepEqual(gatesFired(r), ['verdict-hold-lock'])
	assert.deepEqual(holdCodes(r), ['held-literal-removed'])
	assert.equal(r.fulfillment.rate, 1, 'defer 行不进兑现率：旧八道门确实看不见这件事')
	assert.equal(r.gates.find((g) => g.gate === 'verdict-hold-lock').findings, 1)
	const f = r.findings[0]
	assert.equal(f.level, 'block')
	assert.equal(f.table, 'color')
	assert.equal(f.verdict, 'defer')
	assert.equal(f.sourceValue, '#5a6472')
	assert.equal(f.file, 'floor-good.css')
	assert.equal(f.selector, '.pt-feature-grid__card-body')
	assert.equal(f.prop, 'color')
	assert.match(f.reason, /越权执行/)
})

test('held-literal-removed：reject 与 defer 同待遇', () => {
	const input = fixtureInput()
	holdRow(input, '#5a6472', 'reject')
	const r = lintMigration(input)
	assert.equal(r.verdict, 'blocked')
	assert.deepEqual(holdCodes(r), ['held-literal-removed'])
	assert.equal(r.findings[0].verdict, 'reject')
})

test('held-literal-removed：一行多处只改一处也报，且只报那一处', () => {
	// `#16202cff` 那行有三处。改判 defer 后把其中一处（`.pt-feature-grid`，文件里第一条）
	// 退回字面量，另两处仍是 var()。
	const input = fixtureInput()
	holdRow(input, '#16202c')
	afterCss(input, 'color: var(--color-text-default);', 'color: #16202c;')
	const r = lintMigration(input)
	assert.equal(r.verdict, 'blocked')
	assert.deepEqual(holdCodes(r), ['held-literal-removed', 'held-literal-removed'], '三处里两处被改，报两条')
	assert.deepEqual(
		r.findings.filter((f) => f.gate === 'verdict-hold-lock').map((f) => f.selector),
		['.pt-feature-grid__card-title', '.pt-feature-grid__heading'],
	)
})

test('held-occurrence-lost：defer 行 + 选择器被改写，报的是 lost 不是 removed', () => {
	// 继承既有盲区：门抓不住「改了选择器」这件事本身，只知道那一组对不上了。
	const input = fixtureInput()
	holdRow(input, '#5a6472')
	afterCss(input, '.pt-feature-grid__card-body {', '.pt-feature-grid__card-body-renamed {')
	const r = lintMigration(input)
	assert.equal(r.verdict, 'blocked')
	assert.deepEqual(holdCodes(r), ['held-occurrence-lost'])
	assert.ok(!holdCodes(r).includes('held-literal-removed'), '两条 code 不许在同一处叠报')
	assert.equal(r.findings[0].selector, '.pt-feature-grid__card-body', '报的是**改造前**那一组的坐标')
})

test('held-literal-removed：非色 defer 行被换成闭集变量，findings 上标 table=type', () => {
	// 换的是 `--dimension-radius-2`（闭集内），所以 theme-api-lock 放行；这里要的是门位隔离，
	// 不是语义合理——padding 用圆角 token 是刻意选的，为了让本门成为唯一响的那道。
	const input = fixtureInput()
	afterCss(input, 'padding: 24px;', 'padding: var(--dimension-radius-2);')
	const r = lintMigration(input)
	assert.equal(r.verdict, 'blocked')
	assert.deepEqual(gatesFired(r), ['verdict-hold-lock'])
	assert.deepEqual(holdCodes(r), ['held-literal-removed'])
	const f = r.findings[0]
	assert.equal(f.table, 'type')
	assert.equal(f.verdict, 'defer')
	assert.equal(f.prop, 'padding')
	assert.equal(f.sourceValue, '24px')
})

/* ── 射程边界 ───────────────────────────────────────────────────────────────── */

test('射程边界：同选择器同属性另有一条带着源值时算原样保留（判据保守，误报偏放行）', () => {
	// 继承既有盲区「同一选择器同一属性有多条规则时对不上是哪一条」。判据因此是「那一组里
	// **一条都不带**源值才算被改」。放宽方向是有意的：宁可漏报也不要把该保留的另一条报成越权。
	const input = fixtureInput()
	holdRow(input, '#5a6472')
	afterCss(input, 'color: var(--color-text-muted);', 'color: var(--color-text-muted);\n\tcolor: #5a6472;')
	const r = lintMigration(input)
	assert.deepEqual(holdCodes(r), [], '同一组里还有一条带着源值，本门放行')
})

test('射程边界：源值还在那一组里就放行，不比对「那一行一个字节没动」', () => {
	const input = fixtureInput()
	holdRow(input, '#5a6472')
	afterCss(input, 'color: var(--color-text-muted);', 'color: #5a6472 !important;')
	const r = lintMigration(input)
	assert.deepEqual(holdCodes(r), [], '加 !important 不是「改了那个值」')
})

test('射程边界（已知盲区）：未裁的行不进射程，被改了也不报', () => {
	// `verdict` 为 null 的行由残余背书门报 `literal-pending`——**但那只在字面量还留着时**。
	// 字面量被换掉之后，pending 行落在所有门之外。这里把它钉成已知盲区而不是悄悄兜住：
	// 兜住它等于让本门替准入去判「表填完了没有」，而那件事该在准入那侧解决。
	const input = fixtureInput()
	const row = input.verdicts.rows.find((r) => r.sourceValue === '#5a6472')
	row.verdict = null
	row.acceptedCssVar = null
	const r = lintMigration(input)
	assert.deepEqual(holdCodes(r), [])
	assert.equal(r.verdict, 'pass', '这一条是当前契约的实况，不是它应该如此')
})

test('射程边界：本门不看变量层，held 行本来就没有选中 token', () => {
	const input = fixtureInput()
	holdRow(input, '#5a6472')
	input.afterFiles = input.afterFiles.filter((f) => f.rel !== 'theme-vars.css')
	const r = lintMigration(input)
	assert.deepEqual(holdCodes(r), ['held-literal-removed'], '变量层整份没了，本门报的仍只是那一处被改')
	assert.ok(
		r.findings.some((f) => f.code === 'accept-var-undeclared'),
		'变量层缺失是兑现门的事，两道各报各的',
	)
})

test('单元层：afterDeclarations 为空时每一处都报 lost，不静默', () => {
	const input = fixtureInput()
	holdRow(input, '#5a6472')
	const findings = gateVerdictHoldLock({ afterDeclarations: [], rows: input.verdicts.rows, typeRows: null })
	assert.deepEqual(findings.map((f) => f.code), ['held-occurrence-lost'])
})

test('单元层：occurrences 缺失的手写行不制造 finding', () => {
	const findings = gateVerdictHoldLock({
		afterDeclarations: [],
		rows: [{ id: 'vm-text-deadbeef', usage: 'text', normalizedValue: '#abcdefff', verdict: 'defer' }],
		typeRows: null,
	})
	assert.deepEqual(findings, [])
})
