/**
 * 非色迁移两道门：`type-accept-fulfillment` 与 `type-literal-backing`，外加 `--type-verdicts`
 * 那一串准入。
 *
 * 每个 code 两条用例：一条直接喂门函数（证判据），一条走 `lintMigration`（证接线）。
 * 本仓库在「只喂门函数、编排里那行删掉仍全绿」上踩过四次，非色这两道门是第五次机会。
 *
 * 裁决记录不手写：拿 `buildTypeMap` → `renderTypeMapMarkdown` → 填一格 → `readBackTypeMap`
 * 派生，与人真实走的路同一条。手写一份 JSON 会让行 id 与判据悄悄脱钩。
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { lintMigration, decideMigrationVerdict } from '../scripts/lint-migration.mjs'
import {
	MIGRATION_GATE_ORDER,
	gateTypeAcceptFulfillment,
	gateTypeLiteralBacking,
	computeTypeFulfillment,
	inspectTypeVarLayer,
} from '../scripts/lib/migration-gates.mjs'
import { buildTypeMap, renderTypeMapMarkdown, readBackTypeMap } from '../scripts/lib/type-rows.mjs'
import { scanCss } from '../scripts/lib/css-scan.mjs'
import { loadClosedSet } from '../scripts/lib/closed-set.mjs'
import { FIXTURE_ASSET } from './helpers.mjs'

const closedSet = loadClosedSet(FIXTURE_ASSET)

/** 改造前：圆角 / 间距 / 字体栈三个类目各一处硬编码，一处色值都没有。 */
const BEFORE_CSS = `.pt-card {
	border-radius: 12px;
	padding: 24px;
	font-family: "PingFang SC", Arial, sans-serif;
}
`

const AFTER_CSS = `.pt-card {
	border-radius: var(--shape-radius-container);
	padding: var(--dimension-spacing-2);
	font-family: var(--fontFamily-sans);
}
`

const THEME_VARS = `:root {
	--shape-radius-container: 12px;
	--dimension-spacing-2: 24px;
	--fontFamily-sans: system-ui, "PingFang SC", "Microsoft YaHei", sans-serif;
}
`

/** 色值那侧本例零行：非色链路必须能在没有一处色值字面量时独立跑完。 */
const COLOR_VERDICTS = { verdict: 'pass', rows: [], warnings: [], findings: [] }

function typeDocFrom(css) {
	return buildTypeMap({
		declarations: scanCss(css, 'card.css'),
		closedSet,
		styleSetId: closedSet.styleSetId,
		asset: '.',
		artifactRoot: '.',
	})
}

function fillRow(md, id, { token = '', verdict = '', lossy = '' } = {}) {
	if (!md.includes(`| ${id} |`)) throw new Error(`表里找不到行 ${id}，坏用例造不出来`)
	return md
		.split('\n')
		.map((line) => {
			if (!line.startsWith(`| ${id} |`)) return line
			const cells = line.split('|')
			cells[6] = ` ${token} `
			cells[7] = ` ${verdict} `
			cells[8] = ` ${lossy} `
			return cells.join('|')
		})
		.join('\n')
}

const idOf = (doc, kind, normalized) =>
	normalized != null
		? doc.rows.find((r) => r.kind === kind && r.normalizedValue === normalized).id
		: doc.rows.find((r) => r.kind === kind).id

/** 三行分别裁 accept（圆角 / 间距）/ accept + lossy（近义字体栈）。 */
function typeVerdicts(overrides = {}) {
	const doc = typeDocFrom(BEFORE_CSS)
	let md = renderTypeMapMarkdown(doc)
	md = fillRow(md, idOf(doc, 'radius'), { token: '--shape-radius-container', verdict: 'accept' })
	md = fillRow(md, idOf(doc, 'font-stack'), { token: '--fontFamily-sans', verdict: 'accept', lossy: '是' })
	md = fillRow(md, idOf(doc, 'space', '24px'), { token: '--dimension-spacing-2', verdict: 'accept' })
	const back = readBackTypeMap(doc, md)
	assert.equal(back.verdict, 'pass', JSON.stringify(back.findings))
	return { ...back, ...overrides }
}

function input(overrides = {}) {
	return {
		assetDir: FIXTURE_ASSET,
		beforeFiles: [{ rel: 'card.css', text: BEFORE_CSS }],
		afterFiles: [
			{ rel: 'card.css', text: AFTER_CSS },
			{ rel: 'theme-vars.css', text: THEME_VARS },
		],
		verdicts: COLOR_VERDICTS,
		typeVerdicts: typeVerdicts(),
		baselinePresent: true,
		...overrides,
	}
}

function mutateAfter(from, to) {
	const inp = input()
	const css = inp.afterFiles.find((f) => f.rel === 'card.css')
	if (!css.text.includes(from)) throw new Error(`after CSS 找不到锚点：${from}`)
	css.text = css.text.replace(from, to)
	return inp
}

function mutateVars(from, to) {
	const inp = input()
	const sheet = inp.afterFiles.find((f) => f.rel === 'theme-vars.css')
	if (!sheet.text.includes(from)) throw new Error(`theme-vars 找不到锚点：${from}`)
	sheet.text = sheet.text.replace(from, to)
	return inp
}

const codes = (r, gate) => r.findings.filter((f) => (gate ? f.gate === gate : true)).map((f) => f.code)
const afterDecls = (inp) => inp.afterFiles.flatMap((f) => scanCss(f.text, f.rel))

/* ── 正例与门位 ──────────────────────────────────────────────────────────────── */

test('正例：三个非色类目各迁一处，退 0，九道门都 ran', () => {
	const r = lintMigration(input())
	assert.equal(r.verdict, 'pass', r.findings.map((f) => `${f.gate}:${f.code} ${f.reason}`).join('\n'))
	assert.equal(r.typeFulfillment.acceptOccurrences, 3)
	assert.equal(r.typeFulfillment.fulfilled, 3)
	assert.equal(r.typeFulfillment.rate, 1)
	assert.deepEqual(
		r.gates.map((g) => g.gate),
		MIGRATION_GATE_ORDER,
	)
	assert.deepEqual(MIGRATION_GATE_ORDER, [
		'accept-fulfillment',
		'literal-verdict-backing',
		'type-accept-fulfillment',
		'type-literal-backing',
		'verdict-hold-lock',
		'content-lock',
		'structure-lock',
		'breakpoint-lock',
		'theme-api-lock',
	])
	assert.ok(r.gates.filter((g) => g.gate.startsWith('type-')).every((g) => g.status === 'ran'))
})

test('accept 的 lossy 行照样要真兑现：近义拼并不是「可以不换」', () => {
	const inp = mutateAfter('font-family: var(--fontFamily-sans);', 'font-family: "PingFang SC", Arial, sans-serif;')
	const r = lintMigration(inp)
	assert.equal(r.verdict, 'blocked')
	assert.ok(codes(r, 'type-accept-fulfillment').includes('type-accept-literal-remains'))
})

/* ── type-accept-fulfillment 五个 code ───────────────────────────────────────── */

test('type-accept-fulfillment 正例：喂门函数零 finding', () => {
	const inp = input()
	assert.deepEqual(
		gateTypeAcceptFulfillment({ afterDeclarations: afterDecls(inp), rows: inp.typeVerdicts.rows, closedSet }),
		[],
	)
})

test('type-accept-occurrence-lost：选择器被改写，对不上那一组', () => {
	const inp = mutateAfter('.pt-card {', '.pt-card-renamed {')
	const direct = gateTypeAcceptFulfillment({ afterDeclarations: afterDecls(inp), rows: inp.typeVerdicts.rows, closedSet })
	assert.ok(direct.some((f) => f.code === 'type-accept-occurrence-lost'))
	const r = lintMigration(inp)
	assert.equal(r.verdict, 'blocked')
	assert.ok(codes(r, 'type-accept-fulfillment').includes('type-accept-occurrence-lost'))
})

test('type-accept-literal-remains：圆角没换，字面量还在', () => {
	const inp = mutateAfter('border-radius: var(--shape-radius-container);', 'border-radius: 12px;')
	const direct = gateTypeAcceptFulfillment({ afterDeclarations: afterDecls(inp), rows: inp.typeVerdicts.rows, closedSet })
	assert.ok(direct.some((f) => f.code === 'type-accept-literal-remains'))
	const r = lintMigration(inp)
	assert.equal(r.verdict, 'blocked')
	assert.ok(codes(r, 'type-accept-fulfillment').includes('type-accept-literal-remains'))
	assert.equal(r.typeFulfillment.rate, 2 / 3)
})

test('type-accept-var-missing：源值没了但换成了别的 var()', () => {
	const inp = mutateAfter('border-radius: var(--shape-radius-container);', 'border-radius: var(--shape-radius-control);')
	const direct = gateTypeAcceptFulfillment({ afterDeclarations: afterDecls(inp), rows: inp.typeVerdicts.rows, closedSet })
	assert.ok(direct.some((f) => f.code === 'type-accept-var-missing'))
	const r = lintMigration(inp)
	assert.equal(r.verdict, 'blocked')
	assert.ok(codes(r, 'type-accept-fulfillment').includes('type-accept-var-missing'))
	assert.ok(!codes(r, 'type-accept-fulfillment').includes('type-accept-literal-remains'))
})

test('type-accept-var-undeclared：变量层整份没了，按 cssVar 去重', () => {
	const inp = input()
	inp.afterFiles = inp.afterFiles.filter((f) => f.rel !== 'theme-vars.css')
	const direct = gateTypeAcceptFulfillment({ afterDeclarations: afterDecls(inp), rows: inp.typeVerdicts.rows, closedSet })
	assert.ok(direct.some((f) => f.code === 'type-accept-var-undeclared'))
	const r = lintMigration(inp)
	assert.equal(r.verdict, 'blocked')
	const hits = r.findings.filter((f) => f.code === 'type-accept-var-undeclared')
	assert.equal(hits.length, new Set(hits.map((f) => f.acceptedCssVar)).size, '同一 cssVar 不得按 occurrence 扇出')
	assert.equal(hits.length, 3)
	assert.equal(r.typeFulfillment.rate, 0)
})

test('type-accept-var-value-mismatch：变量层右侧不是闭集查表值', () => {
	const inp = mutateVars('--shape-radius-container: 12px;', '--shape-radius-container: 20px;')
	const direct = gateTypeAcceptFulfillment({ afterDeclarations: afterDecls(inp), rows: inp.typeVerdicts.rows, closedSet })
	assert.ok(direct.some((f) => f.code === 'type-accept-var-value-mismatch'))
	const r = lintMigration(inp)
	assert.equal(r.verdict, 'blocked')
	assert.ok(codes(r, 'type-accept-fulfillment').includes('type-accept-var-value-mismatch'))
})

test('变量层比的是归一后的值，不是字面串：12.0px 与带引号的族名都算对', () => {
	const inp = mutateVars('--shape-radius-container: 12px;', '--shape-radius-container: 12.0px;')
	const layer = inspectTypeVarLayer(afterDecls(inp), closedSet, '--shape-radius-container')
	assert.ok(layer.declaredOk, '12.0px 与 12px 在 CSS 里是同一个值，不该判成不一致')
	assert.equal(lintMigration(inp).verdict, 'pass')
})

/* ── type-literal-backing 三个 code ──────────────────────────────────────────── */

test('type-literal-backing 正例：omit / accept 都算已背书', () => {
	const inp = input()
	assert.deepEqual(gateTypeLiteralBacking({ afterDeclarations: afterDecls(inp), rows: inp.typeVerdicts.rows }), [])
})

test('type-literal-unbacked：顺手调了一个表里没有的圆角', () => {
	const inp = mutateAfter('}\n', '}\n.pt-card__badge { border-radius: 20px; }\n')
	const direct = gateTypeLiteralBacking({ afterDeclarations: afterDecls(inp), rows: inp.typeVerdicts.rows })
	assert.ok(direct.some((f) => f.code === 'type-literal-unbacked'))
	const r = lintMigration(inp)
	assert.equal(r.verdict, 'blocked')
	assert.ok(codes(r, 'type-literal-backing').includes('type-literal-unbacked'))
})

test('type-literal-pending：对上了，该行 verdict 是 null', () => {
	const inp = input()
	const row = inp.typeVerdicts.rows.find((r) => r.kind === 'space')
	row.verdict = null
	const css = inp.afterFiles.find((f) => f.rel === 'card.css')
	css.text = css.text.replace('padding: var(--dimension-spacing-2);', 'padding: 24px;')
	const direct = gateTypeLiteralBacking({ afterDeclarations: afterDecls(inp), rows: inp.typeVerdicts.rows })
	assert.ok(direct.some((f) => f.code === 'type-literal-pending'))
	const r = lintMigration(inp)
	assert.equal(r.verdict, 'blocked')
	assert.ok(codes(r, 'type-literal-backing').includes('type-literal-pending'))
})

test('type-literal-accept-residue：对上了却仍是 accept，与门三有意重叠', () => {
	const inp = mutateAfter('border-radius: var(--shape-radius-container);', 'border-radius: 12px;')
	const direct = gateTypeLiteralBacking({ afterDeclarations: afterDecls(inp), rows: inp.typeVerdicts.rows })
	assert.ok(direct.some((f) => f.code === 'type-literal-accept-residue'))
	const r = lintMigration(inp)
	assert.ok(codes(r, 'type-literal-backing').includes('type-literal-accept-residue'))
	assert.ok(codes(r, 'type-accept-fulfillment').includes('type-accept-literal-remains'))
})

test('omit 与 defer 在门上等价：都算已背书、都不进兑现分母（不许说 omit 多守了什么）', () => {
	const inp = input()
	const css = inp.afterFiles.find((f) => f.rel === 'card.css')
	css.text = css.text.replace('padding: var(--dimension-spacing-2);', 'padding: 24px;')
	const row = inp.typeVerdicts.rows.find((r) => r.kind === 'space')
	row.verdict = 'defer'
	row.acceptedCssVar = null
	const r = lintMigration(inp)
	assert.equal(r.verdict, 'pass')
	assert.equal(r.typeFulfillment.acceptOccurrences, 2)
})

/* ── 兑现率：判定必须自己读，不能只靠 findings ─────────────────────────────────── */

test('非色兑现率门独立：findings 清空 + 色值 rate 1 + 非色 rate 0.9 仍阻断', () => {
	assert.equal(decideMigrationVerdict([], { rate: 1 }, { rate: 0.9 }), 'blocked')
	assert.equal(decideMigrationVerdict([], { rate: 1 }, { rate: null }), 'pass')
	assert.equal(decideMigrationVerdict([], { rate: 1 }, { rate: 1 }), 'pass')
})

test('非色兑现率不足必报 type-fulfillment-rate-short，与色值那条分开记', () => {
	const inp = mutateAfter('border-radius: var(--shape-radius-container);', 'border-radius: 12px;')
	const r = lintMigration(inp)
	assert.equal(r.typeFulfillment.rate, 2 / 3)
	assert.ok(codes(r, 'type-accept-fulfillment').includes('type-fulfillment-rate-short'))
	assert.ok(!codes(r).includes('fulfillment-rate-short'), '色值那侧本例零 accept 行，不该跟着报')
})

test('计账函数与门共用同一份判据：computeTypeFulfillment 与 gate 对不上就是账错了', () => {
	const inp = mutateAfter('border-radius: var(--shape-radius-container);', 'border-radius: 12px;')
	const f = computeTypeFulfillment({ afterDeclarations: afterDecls(inp), rows: inp.typeVerdicts.rows, closedSet })
	assert.equal(f.acceptOccurrences, 3)
	assert.equal(f.fulfilled, 2)
})

/* ── 准入 ───────────────────────────────────────────────────────────────────── */

test('准入 type-verdicts-missing：改造前有非色字面量却不给 --type-verdicts', () => {
	const r = lintMigration(input({ typeVerdicts: null }))
	assert.equal(r.verdict, 'blocked')
	assert.equal(r.precheck.code, 'type-verdicts-missing')
	assert.match(r.precheck.nextAction, /type-map/)
})

test('no-input 不是后门：只有改造前一条非色字面量都没有时才写 no-input', () => {
	const bare = `.pt-bare { display: block; color: #16202c; }\n`
	const colorDoc = { verdict: 'pass', rows: [], warnings: [], findings: [] }
	// 先证明这份产物确实一行非色都算不出来，再证明它才配拿到 no-input。
	assert.equal(typeDocFrom(bare).rows.length, 0)
	const r = lintMigration({
		assetDir: FIXTURE_ASSET,
		beforeFiles: [{ rel: 'bare.css', text: bare }],
		afterFiles: [{ rel: 'bare.css', text: bare }],
		verdicts: { ...colorDoc, rows: [{ id: 'x', usage: 'text', normalizedValue: '#16202cff', verdict: 'defer', acceptedCssVar: null }] },
		typeVerdicts: null,
		baselinePresent: true,
	})
	assert.equal(r.precheck?.code, 'verdicts-stale', '这份手搓的色值裁决本就该被 stale 挡下')

	const colorBack = { verdict: 'pass', rows: [], warnings: [], findings: [] }
	const clean = lintMigration({
		assetDir: FIXTURE_ASSET,
		beforeFiles: [{ rel: 'bare.css', text: '.pt-bare { display: block; }\n' }],
		afterFiles: [{ rel: 'bare.css', text: '.pt-bare { display: block; }\n' }],
		verdicts: colorBack,
		typeVerdicts: null,
		baselinePresent: true,
	})
	assert.equal(clean.verdict, 'pass')
	assert.ok(clean.gates.filter((g) => g.gate.startsWith('type-')).every((g) => g.status === 'no-input'))
})

test('准入 type-verdicts-unparseable：JSON 解不开', () => {
	const r = lintMigration(input({ typeVerdicts: '{ 这不是 JSON' }))
	assert.equal(r.precheck.code, 'type-verdicts-unparseable')
})

test('准入 type-verdicts-shape：把色值那份错喂到 --type-verdicts', () => {
	const colorLike = {
		verdict: 'pass',
		rows: [{ id: 'vm-background-deadbeef', usage: 'background', normalizedValue: '#ffffffff', verdict: 'defer', acceptedCssVar: null }],
	}
	const r = lintMigration(input({ typeVerdicts: colorLike }))
	assert.equal(r.precheck.code, 'type-verdicts-shape')
	assert.match(r.precheck.nextAction, /mapKind/)
})

test('准入 verdicts-shape：反过来把非色那份错喂到 --verdicts', () => {
	const r = lintMigration(input({ verdicts: typeVerdicts() }))
	assert.equal(r.precheck.code, 'verdicts-shape')
})

test('准入 type-verdicts-shape：缺 lossy 列的行不算这份表的行', () => {
	const doc = typeVerdicts()
	const rows = doc.rows.map(({ lossy, ...rest }) => (void lossy, rest))
	const r = lintMigration(input({ typeVerdicts: { ...doc, rows } }))
	assert.equal(r.precheck.code, 'type-verdicts-shape')
})

test('准入 type-verdicts-accept-token-absent：accept 行的 acceptedCssVar 空着', () => {
	const doc = typeVerdicts()
	doc.rows.find((r) => r.verdict === 'accept').acceptedCssVar = '   '
	const r = lintMigration(input({ typeVerdicts: doc }))
	assert.equal(r.precheck.code, 'type-verdicts-accept-token-absent')
})

test('准入 type-verdicts-blocked：记录自身 verdict 不是 pass', () => {
	const r = lintMigration(input({ typeVerdicts: { ...typeVerdicts(), verdict: 'blocked' } }))
	assert.equal(r.precheck.code, 'type-verdicts-blocked')
})

test('准入 type-verdicts-stale：行 id 集合与重算对不上', () => {
	const doc = typeVerdicts()
	doc.rows[0] = { ...doc.rows[0], id: 'tm-radius-deadbeef' }
	const r = lintMigration(input({ typeVerdicts: doc }))
	assert.equal(r.precheck.code, 'type-verdicts-stale')
})

test('准入 type-verdicts-omit-with-candidate：手搓一份 pass 信封想拿 omit 当免检', () => {
	// 回灌那侧本来就挡这条，但准入只信封上验 id 集合与 verdict——不在这里再判一次，
	// 手写一份 `verdict: "pass"` 就能把有候选的行 omit 掉，兑现率照样满分。
	const doc = typeVerdicts()
	const radius = doc.rows.find((r) => r.kind === 'radius')
	radius.verdict = 'omit'
	radius.acceptedCssVar = null
	const r = lintMigration(input({ typeVerdicts: doc }))
	assert.equal(r.verdict, 'blocked')
	assert.equal(r.precheck.code, 'type-verdicts-omit-with-candidate')
})

test('准入 type-verdicts-omit-with-candidate 不误伤：无候选行 omit 照样过', () => {
	const before = `${BEFORE_CSS}.pt-gap { padding: 99px; }\n`
	const doc = buildTypeMap({
		declarations: scanCss(before, 'card.css'),
		closedSet,
		styleSetId: closedSet.styleSetId,
		asset: '.',
		artifactRoot: '.',
	})
	let md = renderTypeMapMarkdown(doc)
	md = fillRow(md, idOf(doc, 'radius'), { token: '--shape-radius-container', verdict: 'accept' })
	md = fillRow(md, idOf(doc, 'font-stack'), { token: '--fontFamily-sans', verdict: 'accept', lossy: '是' })
	md = fillRow(md, idOf(doc, 'space', '24px'), { token: '--dimension-spacing-2', verdict: 'accept' })
	const orphan = doc.rows.find((r) => r.normalizedValue === '99px')
	md = fillRow(md, orphan.id, { verdict: 'omit' })
	const back = readBackTypeMap(doc, md)
	assert.equal(back.verdict, 'pass')
	const after = `${AFTER_CSS}.pt-gap { padding: 99px; }\n`
	const r = lintMigration(
		input({
			beforeFiles: [{ rel: 'card.css', text: before }],
			afterFiles: [
				{ rel: 'card.css', text: after },
				{ rel: 'theme-vars.css', text: THEME_VARS },
			],
			typeVerdicts: back,
		}),
	)
	assert.equal(r.verdict, 'pass')
	assert.ok(r.typeFulfillment)
})

test('准入 type-verdicts-lossy-required：手搓一份 pass 信封把近义 accept 的 lossy 旗抹掉', () => {
	// 与上面 omit 那条同构的作弊：回灌那侧 `lossy-required` 挡得住，但准入只验信封的
	// id 集合与 verdict，所以把 lossy 改成 false 就能让「有失真」这面旗在执行侧消失。
	// 独立复核实测过这条旁路——补这条准入之前，下面这份输入 lintMigration 退 0。
	const doc = typeVerdicts()
	const stack = doc.rows.find((r) => r.kind === 'font-stack')
	assert.equal(stack.lossy, true, '前提：那一行选中的确实是近义栈，否则这条坏用例造不出来')
	stack.lossy = false
	const r = lintMigration(input({ typeVerdicts: doc }))
	assert.equal(r.verdict, 'blocked')
	assert.equal(r.precheck.code, 'type-verdicts-lossy-required')
})

test('准入 type-verdicts-lossy-required 不误伤：精确候选的 accept 不标 lossy 是对的', () => {
	// 圆角那行是 px-exact，`lossy: false` 是它的正确形状。判据若退化成「凡 accept 都要标
	// lossy」，这条当场转红。
	const doc = typeVerdicts()
	assert.equal(doc.rows.find((r) => r.kind === 'radius').lossy, false)
	assert.equal(lintMigration(input({ typeVerdicts: doc })).verdict, 'pass')
})

test('每条非色 finding 都有非空 reason，且这组输入覆盖全部九个 code', () => {
	const cases = [
		mutateAfter('.pt-card {', '.pt-card-renamed {'),
		mutateAfter('border-radius: var(--shape-radius-container);', 'border-radius: 12px;'),
		mutateAfter('border-radius: var(--shape-radius-container);', 'border-radius: var(--shape-radius-control);'),
		(() => {
			const inp = input()
			inp.afterFiles = inp.afterFiles.filter((f) => f.rel !== 'theme-vars.css')
			return inp
		})(),
		mutateVars('--shape-radius-container: 12px;', '--shape-radius-container: 20px;'),
		mutateAfter('}\n', '}\n.pt-card__badge { border-radius: 20px; }\n'),
		(() => {
			const inp = input()
			inp.typeVerdicts.rows.find((r) => r.kind === 'space').verdict = null
			const css = inp.afterFiles.find((f) => f.rel === 'card.css')
			css.text = css.text.replace('padding: var(--dimension-spacing-2);', 'padding: 24px;')
			return inp
		})(),
	]
	const seen = new Set()
	for (const inp of cases) {
		for (const f of lintMigration(inp).findings) {
			assert.ok(String(f.reason ?? '').trim(), `${f.gate}:${f.code} 缺 reason`)
			seen.add(f.code)
		}
	}
	for (const code of [
		'type-accept-occurrence-lost',
		'type-accept-literal-remains',
		'type-accept-var-missing',
		'type-accept-var-undeclared',
		'type-accept-var-value-mismatch',
		'type-fulfillment-rate-short',
		'type-literal-unbacked',
		'type-literal-pending',
		'type-literal-accept-residue',
	]) {
		assert.ok(seen.has(code), `这组输入必须覆盖 ${code}，否则 reason 锁不住它`)
	}
})
