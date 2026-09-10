/**
 * 非色值映射：决策单元是「源值 × 类目」，双份产出，裁决回灌。
 *
 * 每个 code 一条真会挂的输入，且尽量独占——写不出会失败的用例就不准占一个 code。
 * 坏输入一律从合格产物改一处派生（`mutateCss`），不手写整份，免得「本该只违一处」的
 * 用例悄悄变成违两处。
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import {
	buildTypeMap,
	renderTypeMapMarkdown,
	readBackTypeMap,
	kindOf,
	typeLiteralsOf,
	entryKind,
	closedSetKindFindings,
	TYPE_KIND_ORDER,
} from '../scripts/lib/type-rows.mjs'
import { combineMapVerdicts } from '../scripts/lib/map-cross.mjs'
import { scanArtifact } from '../scripts/lib/css-scan.mjs'
import { loadClosedSet } from '../scripts/lib/closed-set.mjs'
import { FIXTURE_ASSET, goodHtml, goodCss, mutateCss, tempDir, writeArtifact, SCRIPTS_DIR } from './helpers.mjs'

const HEX8 = (kind, normalized) => createHash('sha256').update(kind + '\u0000' + normalized).digest('hex').slice(0, 8)

const RADIUS_ANCHOR = 'border-radius: var(--shape-radius-container);'
const CONTROL_ANCHOR = 'border-radius: var(--shape-radius-control);'
const FONT_ANCHOR = 'font-family: var(--fontFamily-sans);'
const FONT_STACK = 'system-ui, "PingFang SC", "Microsoft YaHei", sans-serif'

function mapFrom(css, extraHtml) {
	const closedSet = loadClosedSet(FIXTURE_ASSET)
	const { declarations } = scanArtifact({
		html: extraHtml ?? goodHtml(),
		htmlFile: 'index.html',
		css: [{ file: 'index.css', text: css }],
	})
	return buildTypeMap({
		declarations,
		closedSet,
		styleSetId: closedSet.styleSetId,
		asset: '../fixture-lanyuan-lab',
		artifactRoot: '.',
	})
}

function fillMarkdownRow(md, id, { token = '', verdict = '', lossy = '' } = {}) {
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

const rowOf = (doc, kind, normalized) => doc.rows.find((r) => r.kind === kind && r.normalizedValue === normalized)

/* ── 出表 ───────────────────────────────────────────────────────────────────── */

test('id 前缀 tm- 与色表 vm- 分家，schemaVersion 与 mapKind 都自己一套', () => {
	const doc = mapFrom(mutateCss(RADIUS_ANCHOR, 'border-radius: 12px;'))
	assert.equal(doc.schemaVersion, 1)
	assert.equal(doc.mapKind, 'type')
	assert.ok(doc.rows.every((r) => r.id.startsWith('tm-')))
	assert.ok(!doc.rows.some((r) => r.id.startsWith('vm-')), '两张表不许共用一个 id 体系')
	const row = rowOf(doc, 'radius', '12px')
	assert.equal(row.id, `tm-radius-${HEX8('radius', '12px')}`)
})

test('跨类目数字复用不得串候选：32px 在圆角上无候选，在字号上有', () => {
	// 这是另立一张表的**数据理由**：闭集里 32px 是 dimension.fontSize.2。色值 hex 反查
	// 不会出这种事（同一 hex 的多个候选是同一颜色的不同角色），维度会。
	const doc = mapFrom(
		mutateCss(RADIUS_ANCHOR, 'border-radius: 32px;').replace('font-size: var(--dimension-fontSize-2);', 'font-size: 32px;'),
	)
	const radius = rowOf(doc, 'radius', '32px')
	assert.deepEqual(radius.candidates, [], '圆角行不得把字号变量当候选递给人')
	assert.equal(radius.note, '无候选')
	const fontSize = rowOf(doc, 'font-size', '32px')
	assert.ok(
		fontSize.candidates.some((c) => c.cssVar === '--dimension-fontSize-2' && c.matchedBy === 'px-exact'),
		'同一个 32px 在字号类目上必须命中——两行的差别只来自类目，不来自数字',
	)
})

test('行高类目根本不进索引：闭集里的 lineHeight 不会成为任何行的候选', () => {
	const doc = mapFrom(mutateCss(RADIUS_ANCHOR, 'border-radius: 26px;'))
	assert.deepEqual(rowOf(doc, 'radius', '26px').candidates, [])
	assert.equal(entryKind({ path: 'dimension.lineHeight.1', type: 'dimension' }), null)
	assert.equal(entryKind({ path: 'dimension.radius.1', type: 'dimension' }), 'radius')
})

test('同一 (源值, 类目) 多处出现归成一行，跨类目同值分两行', () => {
	const css = mutateCss(RADIUS_ANCHOR, 'border-radius: 16px;').replace(CONTROL_ANCHOR, 'border-radius: 16px;')
	const doc = mapFrom(css)
	const radius = doc.rows.filter((r) => r.kind === 'radius' && r.normalizedValue === '16px')
	assert.equal(radius.length, 1)
	assert.equal(radius[0].occurrenceCount, 2)
	const space = rowOf(doc, 'space', '16px')
	assert.ok(space, '夹具里 gap: 16px 是间距类目，与圆角 16px 不得合成一行')
	assert.notEqual(space.id, radius[0].id)
})

test('dimension.spacing 组：间距行能反查到候选，不许拿字号变量顶上', () => {
	const doc = mapFrom(goodCss() + '\n.pad { padding: 16px; }\n')
	const row = rowOf(doc, 'space', '16px')
	assert.ok(row.candidates.some((c) => c.path === 'dimension.spacing.1' && c.matchedBy === 'px-exact'))
	assert.ok(!row.candidates.some((c) => c.path.startsWith('dimension.fontSize')), '间距行不得串字号变量')
})

test('闭集 dimension 认不出类目：token-kind-unmapped 阻断，不许退化成无候选', () => {
	const closedSet = loadClosedSet(FIXTURE_ASSET)
	const bad = {
		...closedSet,
		entries: [
			...closedSet.entries,
			{
				path: 'dimension.inset.1',
				cssVar: '--dimension-inset-1',
				type: 'dimension',
				layer: 'primitive',
				value: { value: 16, unit: 'px' },
				resolved: { value: 16, unit: 'px' },
			},
		],
	}
	const findings = closedSetKindFindings(bad)
	assert.equal(findings.length, 1)
	assert.equal(findings[0].code, 'token-kind-unmapped')
	assert.equal(findings[0].path, 'dimension.inset.1')
	assert.deepEqual(closedSetKindFindings(closedSet), [], '合格夹具 spacing/radius 等 path 段名都在')
})

test('两表交叉门：本表 pass 对表 blocked → maps-cross-blocked', () => {
	const pass = { verdict: 'pass', mapKind: 'type', findings: [], warnings: [], rows: [] }
	const blocked = { verdict: 'blocked', mapKind: 'value', findings: [{ code: 'verdict-unknown', level: 'block' }], warnings: [], rows: [] }
	const merged = combineMapVerdicts(pass, blocked, { primaryLabel: '非色表', peerLabel: '色表' })
	assert.equal(merged.verdict, 'blocked')
	assert.equal(merged.findings.filter((f) => f.code === 'maps-cross-blocked').length, 1)
	assert.equal(combineMapVerdicts(blocked, pass, { primaryLabel: '色表', peerLabel: '非色表' }).findings.some((f) => f.code === 'maps-cross-blocked'), false)
})

test('字体栈整栈相等是 stack-exact', () => {
	const doc = mapFrom(mutateCss(FONT_ANCHOR, `font-family: ${FONT_STACK};`))
	const row = rowOf(doc, 'font-stack', 'system-ui, pingfang sc, microsoft yahei, sans-serif')
	assert.equal(row.candidates.length, 1)
	assert.equal(row.candidates[0].cssVar, '--fontFamily-sans')
	assert.equal(row.candidates[0].matchedBy, 'stack-exact')
})

test('字体栈共享非通用族名是 stack-near，报告里标「近义」', () => {
	const doc = mapFrom(mutateCss(FONT_ANCHOR, 'font-family: "PingFang SC", Arial, sans-serif;'))
	const row = rowOf(doc, 'font-stack', 'pingfang sc, arial, sans-serif')
	assert.equal(row.candidates[0].matchedBy, 'stack-near')
	assert.match(renderTypeMapMarkdown(doc), /（近义）/)
})

test('只共享通用族名不算近义：sans-serif 到处都是，认它等于 stack-near 永远命中', () => {
	const doc = mapFrom(mutateCss(FONT_ANCHOR, 'font-family: Georgia, serif;'))
	assert.deepEqual(rowOf(doc, 'font-stack', 'georgia, serif').candidates, [])
})

test('射程外的值不进表但要露面：var / calc / 百分比进 outOfScopeValues', () => {
	const doc = mapFrom(mutateCss(RADIUS_ANCHOR, 'border-radius: calc(4px + 8px);') + '\n.p { padding: 5%; }\n')
	const shown = doc.summary.outOfScopeValues.map((v) => `${v.prop}: ${v.value}`)
	assert.ok(shown.includes('border-radius: calc(4px + 8px)'))
	assert.ok(shown.includes('padding: 5%'))
	assert.ok(shown.some((s) => s.startsWith('font-family: var(')), '夹具里的 var() 引用同样要落在射程外一节')
	assert.equal(rowOf(doc, 'radius', '4px'), undefined, 'calc 里的 px 不许被切出来当源值')
	assert.match(renderTypeMapMarkdown(doc), /## 射程外的值（未进表）/)
})

test('零值不进表：padding: 0 与 margin: 0 auto 不产生行', () => {
	assert.ok(goodCss().includes('padding: 0;'), '夹具必须有 padding: 0，否则这条用例证不了什么')
	assert.ok(goodCss().includes('margin: 0 auto;'))
	const doc = mapFrom(goodCss())
	assert.equal(rowOf(doc, 'space', '0px'), undefined)
})

test('白名单外的 prop 一律不收，不是归 other', () => {
	assert.equal(kindOf('line-height'), null)
	assert.equal(kindOf('font-weight'), null)
	assert.equal(kindOf('max-width'), null)
	assert.equal(kindOf('border'), null, 'border 简写里的宽度有意不收：切开它会让 occurrence 的 value 不再是声明里那一串')
	const doc = mapFrom(goodCss())
	assert.ok(doc.rows.every((r) => TYPE_KIND_ORDER.includes(r.kind)))
	assert.ok(!doc.rows.some((r) => r.kind === 'stroke'), '夹具只有 border: 1px solid …，宽度不进 stroke 类目')
})

test('抽取器只此一份：typeLiteralsOf 与出表用的是同一条路', () => {
	const src = fs.readFileSync(new URL('../scripts/lib/type-rows.mjs', import.meta.url), 'utf8')
	assert.match(src, /const got = typeLiteralsOf\(d\.prop, d\.value\)/)
	assert.deepEqual(typeLiteralsOf('border-radius', '8px 8px 0 0').items.map((i) => i.normalizedValue), ['8px', '8px'])
	assert.deepEqual(typeLiteralsOf('color', '#fff').items, [], '色值不归本表')
})

test('Markdown 九列固定，选中 token / 裁决 / lossy 三列空即 pending', () => {
	const doc = mapFrom(mutateCss(RADIUS_ANCHOR, 'border-radius: 12px;'))
	const md = renderTypeMapMarkdown(doc)
	assert.match(md, /^\| id \| 源值 \| 类目 \| 处数 \| 候选 token \| 选中 token \| 裁决 \| lossy \| 备注 \|$/m)
	assert.match(md, /^\| --- \| --- \| --- \| ---: \| --- \| --- \| --- \| --- \| --- \|$/m)
	const data = md.split('\n').find((l) => l.startsWith('| tm-'))
	const cells = data.split('|').map((s) => s.trim())
	assert.equal(cells[6], '', '选中 token 列 --out 必须空着，不预填')
	assert.equal(cells[7], '', '裁决列必须空着表示 pending')
	assert.equal(cells[8], '', 'lossy 列同样不预填')
	assert.ok(!md.includes('pending'), 'pending 不是第五个枚举值，不得写进表')
	assert.ok(doc.rows.every((r) => r.acceptedCssVar === null && r.lossy === false))
})

/* ── 回灌 ───────────────────────────────────────────────────────────────────── */

test('回灌：空裁决记 pending，退 0', () => {
	const doc = mapFrom(mutateCss(RADIUS_ANCHOR, 'border-radius: 12px;'))
	const back = readBackTypeMap(doc, renderTypeMapMarkdown(doc))
	assert.equal(back.verdict, 'pass')
	assert.equal(back.mapKind, 'type')
	assert.equal(back.summary.pending, doc.rows.length)
	assert.deepEqual(back.findings, [])
})

test('回灌：accept / reject / defer / omit 四值都能读回', () => {
	const doc = mapFrom(mutateCss(RADIUS_ANCHOR, 'border-radius: 12px;') + '\n.x { padding: 99px; }\n')
	const radius = rowOf(doc, 'radius', '12px')
	const spaceOmit = rowOf(doc, 'space', '99px')
	const space16 = rowOf(doc, 'space', '16px')
	let md = renderTypeMapMarkdown(doc)
	md = fillMarkdownRow(md, radius.id, { token: '--shape-radius-container', verdict: 'accept' })
	md = fillMarkdownRow(md, spaceOmit.id, { verdict: 'omit' })
	md = fillMarkdownRow(md, space16.id, { verdict: 'defer' })
	const back = readBackTypeMap(doc, md)
	assert.equal(back.verdict, 'pass', JSON.stringify(back.findings))
	const byId = Object.fromEntries(back.rows.map((r) => [r.id, r]))
	assert.equal(byId[radius.id].acceptedCssVar, '--shape-radius-container')
	assert.equal(byId[spaceOmit.id].verdict, 'omit')
	assert.equal(byId[spaceOmit.id].acceptedCssVar, null)
	assert.equal(byId[space16.id].verdict, 'defer')
})

test('回灌：枚举外的值阻断 verdict-unknown，报错里点名四个枚举', () => {
	const doc = mapFrom(mutateCss(RADIUS_ANCHOR, 'border-radius: 12px;'))
	const md = fillMarkdownRow(renderTypeMapMarkdown(doc), doc.rows[0].id, { verdict: '略过' })
	const back = readBackTypeMap(doc, md)
	assert.equal(back.verdict, 'blocked')
	const hit = back.findings.find((f) => f.code === 'verdict-unknown')
	assert.ok(hit)
	assert.match(hit.reason, /omit/)
})

test('回灌：id 认不出阻断 row-id-unknown', () => {
	const doc = mapFrom(mutateCss(RADIUS_ANCHOR, 'border-radius: 12px;'))
	const md = `| id | 源值 | 类目 | 处数 | 候选 token | 选中 token | 裁决 | lossy | 备注 |\n| --- | --- | --- | ---: | --- | --- | --- | --- | --- |\n| tm-radius-deadbeef | \`12px\` | radius | 1 | | | defer | | |\n`
	const back = readBackTypeMap(doc, md)
	assert.equal(back.verdict, 'blocked')
	assert.ok(back.findings.some((f) => f.code === 'row-id-unknown'))
})

test('回灌：同一 id 两行裁决不同阻断 row-id-duplicate', () => {
	const doc = mapFrom(mutateCss(RADIUS_ANCHOR, 'border-radius: 12px;'))
	const id = rowOf(doc, 'radius', '12px').id
	const row = `| ${id} | \`12px\` | radius | 1 | | | defer | | |`
	const md = `| id | 源值 | 类目 | 处数 | 候选 token | 选中 token | 裁决 | lossy | 备注 |\n| --- | --- | --- | ---: | --- | --- | --- | --- | --- |\n${row}\n${row.replace('defer', 'reject')}\n`
	const back = readBackTypeMap(doc, md)
	assert.equal(back.verdict, 'blocked')
	assert.ok(back.findings.some((f) => f.code === 'row-id-duplicate'))
})

test('回灌：同一 id 两行裁决相同只报警 row-id-repeated', () => {
	const doc = mapFrom(mutateCss(RADIUS_ANCHOR, 'border-radius: 12px;'))
	const id = rowOf(doc, 'radius', '12px').id
	const row = `| ${id} | \`12px\` | radius | 1 | | | defer | | |`
	const md = `| id | 源值 | 类目 | 处数 | 候选 token | 选中 token | 裁决 | lossy | 备注 |\n| --- | --- | --- | ---: | --- | --- | --- | --- | --- |\n${row}\n${row}\n`
	const back = readBackTypeMap(doc, md)
	assert.equal(back.verdict, 'pass')
	assert.ok(back.warnings.some((w) => w.code === 'row-id-repeated'))
	assert.equal(back.findings.length, 0, '报警不进 findings')
})

test('回灌：JSON 里有、表里缺行 → 报警 row-missing，按 pending', () => {
	const doc = mapFrom(mutateCss(RADIUS_ANCHOR, 'border-radius: 12px;'))
	const md = `| id | 源值 | 类目 | 处数 | 候选 token | 选中 token | 裁决 | lossy | 备注 |\n| --- | --- | --- | ---: | --- | --- | --- | --- | --- |\n`
	const back = readBackTypeMap(doc, md)
	assert.equal(back.verdict, 'pass')
	assert.ok(back.warnings.some((w) => w.code === 'row-missing'))
	assert.ok(back.rows.every((r) => r.verdict === null))
})

test('回灌：accept 但选中 token 空着 → 阻断 accepted-token-missing', () => {
	const doc = mapFrom(mutateCss(RADIUS_ANCHOR, 'border-radius: 12px;'))
	const row = rowOf(doc, 'radius', '12px')
	const back = readBackTypeMap(doc, fillMarkdownRow(renderTypeMapMarkdown(doc), row.id, { verdict: 'accept' }))
	assert.equal(back.verdict, 'blocked')
	assert.ok(back.findings.some((f) => f.code === 'accepted-token-missing' && f.id === row.id))
})

test('回灌：选中 token 不在 candidates.cssVar 里 → 阻断 accepted-token-unknown', () => {
	const doc = mapFrom(mutateCss(RADIUS_ANCHOR, 'border-radius: 12px;'))
	const row = rowOf(doc, 'radius', '12px')
	const md = fillMarkdownRow(renderTypeMapMarkdown(doc), row.id, { token: 'var(--shape-radius-container)', verdict: 'accept' })
	const back = readBackTypeMap(doc, md)
	assert.equal(back.verdict, 'blocked')
	assert.ok(back.findings.some((f) => f.code === 'accepted-token-unknown'))
})

test('回灌：无候选行裁 accept → 阻断 accept-without-candidate，报错指向 omit / defer', () => {
	const doc = mapFrom(mutateCss(RADIUS_ANCHOR, 'border-radius: 32px;'))
	const row = rowOf(doc, 'radius', '32px')
	const back = readBackTypeMap(doc, fillMarkdownRow(renderTypeMapMarkdown(doc), row.id, { verdict: 'accept' }))
	assert.equal(back.verdict, 'blocked')
	const hit = back.findings.find((f) => f.code === 'accept-without-candidate')
	assert.ok(hit)
	assert.match(hit.reason, /omit/)
	assert.ok(!back.findings.some((f) => f.code === 'accepted-token-missing'), '无候选行裁 accept 只报一条')
})

test('回灌：defer 行填了选中 token → 阻断 accepted-token-unexpected', () => {
	const doc = mapFrom(mutateCss(RADIUS_ANCHOR, 'border-radius: 12px;'))
	const row = rowOf(doc, 'radius', '12px')
	const md = fillMarkdownRow(renderTypeMapMarkdown(doc), row.id, { token: '--shape-radius-container', verdict: 'defer' })
	const back = readBackTypeMap(doc, md)
	assert.equal(back.verdict, 'blocked')
	assert.ok(back.findings.some((f) => f.code === 'accepted-token-unexpected'))
	assert.equal(back.rows.find((r) => r.id === row.id).acceptedCssVar, null)
})

test('回灌：accept 选中 primitive 候选 → 报警 accepted-token-primitive，退 0', () => {
	const doc = mapFrom(mutateCss(RADIUS_ANCHOR, 'border-radius: 12px;'))
	const row = rowOf(doc, 'radius', '12px')
	assert.ok(row.candidates.some((c) => c.cssVar === '--dimension-radius-2' && c.layer === 'primitive'))
	const md = fillMarkdownRow(renderTypeMapMarkdown(doc), row.id, { token: '--dimension-radius-2', verdict: 'accept' })
	const back = readBackTypeMap(doc, md)
	assert.equal(back.verdict, 'pass')
	assert.ok(back.warnings.some((w) => w.code === 'accepted-token-primitive'))
})

test('回灌：有候选却裁 omit → 阻断 omit-with-candidate（omit 不是免检咒语）', () => {
	const doc = mapFrom(mutateCss(RADIUS_ANCHOR, 'border-radius: 12px;'))
	const row = rowOf(doc, 'radius', '12px')
	assert.ok(row.candidates.length, '这一行必须有候选，否则这条用例证不了什么')
	const back = readBackTypeMap(doc, fillMarkdownRow(renderTypeMapMarkdown(doc), row.id, { verdict: 'omit' }))
	assert.equal(back.verdict, 'blocked')
	assert.ok(back.findings.some((f) => f.code === 'omit-with-candidate' && f.id === row.id))
})

test('回灌：无候选行裁 omit 是正路，退 0', () => {
	const doc = mapFrom(mutateCss(RADIUS_ANCHOR, 'border-radius: 99px;'))
	const row = rowOf(doc, 'radius', '99px')
	assert.deepEqual(row.candidates, [])
	const back = readBackTypeMap(doc, fillMarkdownRow(renderTypeMapMarkdown(doc), row.id, { verdict: 'omit' }))
	assert.equal(back.verdict, 'pass')
	assert.equal(back.rows.find((r) => r.id === row.id).verdict, 'omit')
})

test('回灌：accept 近义栈却不标 lossy → 阻断 lossy-required', () => {
	const doc = mapFrom(mutateCss(FONT_ANCHOR, 'font-family: "PingFang SC", Arial, sans-serif;'))
	const row = rowOf(doc, 'font-stack', 'pingfang sc, arial, sans-serif')
	const md = fillMarkdownRow(renderTypeMapMarkdown(doc), row.id, { token: '--fontFamily-sans', verdict: 'accept' })
	const back = readBackTypeMap(doc, md)
	assert.equal(back.verdict, 'blocked')
	assert.ok(back.findings.some((f) => f.code === 'lossy-required' && f.id === row.id))
})

test('回灌：accept 近义栈并标 lossy → 退 0，lossy 落在行上', () => {
	const doc = mapFrom(mutateCss(FONT_ANCHOR, 'font-family: "PingFang SC", Arial, sans-serif;'))
	const row = rowOf(doc, 'font-stack', 'pingfang sc, arial, sans-serif')
	const md = fillMarkdownRow(renderTypeMapMarkdown(doc), row.id, { token: '--fontFamily-sans', verdict: 'accept', lossy: '是' })
	const back = readBackTypeMap(doc, md)
	assert.equal(back.verdict, 'pass', JSON.stringify(back.findings))
	assert.equal(back.rows.find((r) => r.id === row.id).lossy, true)
})

test('回灌：精确匹配却标 lossy → 阻断 lossy-without-near', () => {
	const doc = mapFrom(mutateCss(FONT_ANCHOR, `font-family: ${FONT_STACK};`))
	const row = rowOf(doc, 'font-stack', 'system-ui, pingfang sc, microsoft yahei, sans-serif')
	const md = fillMarkdownRow(renderTypeMapMarkdown(doc), row.id, { token: '--fontFamily-sans', verdict: 'accept', lossy: '是' })
	const back = readBackTypeMap(doc, md)
	assert.equal(back.verdict, 'blocked')
	assert.ok(back.findings.some((f) => f.code === 'lossy-without-near'))
})

test('回灌：defer 行标 lossy 同样阻断 lossy-without-near', () => {
	const doc = mapFrom(mutateCss(RADIUS_ANCHOR, 'border-radius: 12px;'))
	const row = rowOf(doc, 'radius', '12px')
	const back = readBackTypeMap(doc, fillMarkdownRow(renderTypeMapMarkdown(doc), row.id, { verdict: 'defer', lossy: '是' }))
	assert.equal(back.verdict, 'blocked')
	assert.ok(back.findings.some((f) => f.code === 'lossy-without-near'))
})

test('回灌：lossy 格写了读不懂的字 → 阻断 lossy-unknown，不猜', () => {
	const doc = mapFrom(mutateCss(RADIUS_ANCHOR, 'border-radius: 12px;'))
	const row = rowOf(doc, 'radius', '12px')
	const md = fillMarkdownRow(renderTypeMapMarkdown(doc), row.id, { verdict: 'defer', lossy: '大概吧' })
	const back = readBackTypeMap(doc, md)
	assert.equal(back.verdict, 'blocked')
	assert.ok(back.findings.some((f) => f.code === 'lossy-unknown'))
})

/* ── CLI ────────────────────────────────────────────────────────────────────── */

test('CLI --out 与 --read-back 都不给，退 1', (t) => {
	const art = writeArtifact(path.join(tempDir(t), 'art'))
	const r = spawnSync(process.execPath, [path.join(SCRIPTS_DIR, 'type-map.mjs'), '--asset', FIXTURE_ASSET, '--artifact', art.dir], {
		encoding: 'utf8',
	})
	assert.equal(r.status, 1)
	assert.match(r.stderr, /必须给 --out 或 --read-back/)
})

test('CLI 双份落到 --out，文件名与色表分家，不写进资产目录', (t) => {
	const art = writeArtifact(path.join(tempDir(t), 'art'), { css: mutateCss(RADIUS_ANCHOR, 'border-radius: 12px;') })
	const out = path.join(tempDir(t), 'out')
	const r = spawnSync(
		process.execPath,
		[path.join(SCRIPTS_DIR, 'type-map.mjs'), '--asset', FIXTURE_ASSET, '--artifact', art.dir, '--out', out],
		{ encoding: 'utf8' },
	)
	assert.equal(r.status, 0, r.stderr)
	assert.ok(fs.existsSync(path.join(out, 'type-map.json')))
	assert.ok(fs.existsSync(path.join(out, 'type-map.md')))
	assert.ok(!fs.existsSync(path.join(out, 'value-map.json')), '非色表不得写进色表那两个文件名')
	assert.ok(!fs.existsSync(path.join(FIXTURE_ASSET, 'type-map.json')))
})

/**
 * 出表 → 改一格 → 真 CLI `--read-back`。十一条阻断码都必须走过这条路，
 * 只喂 `readBackTypeMap` 证不了 CLI 真的把回灌接上了。
 */
function cliReadBack(t, { css, fill }) {
	const art = writeArtifact(path.join(tempDir(t), 'art'), { css })
	const out = path.join(tempDir(t), 'out')
	const gen = spawnSync(
		process.execPath,
		[path.join(SCRIPTS_DIR, 'type-map.mjs'), '--asset', FIXTURE_ASSET, '--artifact', art.dir, '--out', out],
		{ encoding: 'utf8' },
	)
	assert.equal(gen.status, 0, gen.stderr)
	const doc = JSON.parse(fs.readFileSync(path.join(out, 'type-map.json'), 'utf8'))
	const filledPath = path.join(tempDir(t), 'filled.md')
	fs.writeFileSync(filledPath, fill(fs.readFileSync(path.join(out, 'type-map.md'), 'utf8'), doc))
	const r = spawnSync(
		process.execPath,
		[path.join(SCRIPTS_DIR, 'type-map.mjs'), '--asset', FIXTURE_ASSET, '--artifact', art.dir, '--read-back', filledPath],
		{ encoding: 'utf8' },
	)
	const jsonAt = r.stdout.indexOf('{')
	const back = jsonAt >= 0 ? JSON.parse(r.stdout.slice(jsonAt)) : { findings: [] }
	return { r, back, doc }
}

test('CLI --read-back：有候选却裁 omit，退 1', (t) => {
	const { r, back, doc } = cliReadBack(t, {
		css: mutateCss(RADIUS_ANCHOR, 'border-radius: 12px;'),
		fill: (md, d) => fillMarkdownRow(md, d.rows.find((row) => row.candidates.length).id, { verdict: 'omit' }),
	})
	assert.equal(r.status, 1)
	assert.ok(back.findings.some((f) => f.code === 'omit-with-candidate'))
	assert.ok(doc.rows.some((row) => row.candidates.length), '这一行必须有候选，否则这条用例证不了什么')
})

test('CLI --read-back：枚举外的值，退 1', (t) => {
	const { r, back } = cliReadBack(t, {
		css: mutateCss(RADIUS_ANCHOR, 'border-radius: 12px;'),
		fill: (md, d) => fillMarkdownRow(md, d.rows[0].id, { verdict: '略过' }),
	})
	assert.equal(r.status, 1)
	assert.ok(back.findings.some((f) => f.code === 'verdict-unknown'))
})

test('CLI --read-back：id 认不出，退 1', (t) => {
	const { r, back } = cliReadBack(t, {
		css: mutateCss(RADIUS_ANCHOR, 'border-radius: 12px;'),
		fill: (md) =>
			`| id | 源值 | 类目 | 处数 | 候选 token | 选中 token | 裁决 | lossy | 备注 |\n| --- | --- | --- | ---: | --- | --- | --- | --- | --- |\n| tm-radius-deadbeef | \`12px\` | radius | 1 | | | defer | | |\n`,
	})
	assert.equal(r.status, 1)
	assert.ok(back.findings.some((f) => f.code === 'row-id-unknown'))
})

test('CLI --read-back：同一 id 两行裁决不同，退 1', (t) => {
	const { r, back } = cliReadBack(t, {
		css: mutateCss(RADIUS_ANCHOR, 'border-radius: 12px;'),
		fill: (md, d) => {
			const id = d.rows.find((row) => row.kind === 'radius' && row.normalizedValue === '12px').id
			const row = `| ${id} | \`12px\` | radius | 1 | | | defer | | |`
			return `| id | 源值 | 类目 | 处数 | 候选 token | 选中 token | 裁决 | lossy | 备注 |\n| --- | --- | --- | ---: | --- | --- | --- | --- | --- |\n${row}\n${row.replace('defer', 'reject')}\n`
		},
	})
	assert.equal(r.status, 1)
	assert.ok(back.findings.some((f) => f.code === 'row-id-duplicate'))
})

test('CLI --read-back：accept 但选中 token 空着，退 1', (t) => {
	const { r, back } = cliReadBack(t, {
		css: mutateCss(RADIUS_ANCHOR, 'border-radius: 12px;'),
		fill: (md, d) => fillMarkdownRow(md, d.rows.find((row) => row.kind === 'radius' && row.normalizedValue === '12px').id, { verdict: 'accept' }),
	})
	assert.equal(r.status, 1)
	assert.ok(back.findings.some((f) => f.code === 'accepted-token-missing'))
})

test('CLI --read-back：选中 token 不在候选里，退 1', (t) => {
	const { r, back } = cliReadBack(t, {
		css: mutateCss(RADIUS_ANCHOR, 'border-radius: 12px;'),
		fill: (md, d) =>
			fillMarkdownRow(md, d.rows.find((row) => row.kind === 'radius' && row.normalizedValue === '12px').id, {
				token: 'var(--shape-radius-container)',
				verdict: 'accept',
			}),
	})
	assert.equal(r.status, 1)
	assert.ok(back.findings.some((f) => f.code === 'accepted-token-unknown'))
})

test('CLI --read-back：无候选行裁 accept，退 1', (t) => {
	const { r, back, doc } = cliReadBack(t, {
		css: mutateCss(RADIUS_ANCHOR, 'border-radius: 32px;'),
		fill: (md, d) => fillMarkdownRow(md, d.rows.find((row) => row.kind === 'radius' && row.normalizedValue === '32px').id, { verdict: 'accept' }),
	})
	assert.equal(r.status, 1)
	assert.ok(back.findings.some((f) => f.code === 'accept-without-candidate'))
	assert.deepEqual(doc.rows.find((row) => row.kind === 'radius' && row.normalizedValue === '32px').candidates, [])
})

test('CLI --read-back：defer 行填了选中 token，退 1', (t) => {
	const { r, back } = cliReadBack(t, {
		css: mutateCss(RADIUS_ANCHOR, 'border-radius: 12px;'),
		fill: (md, d) =>
			fillMarkdownRow(md, d.rows.find((row) => row.kind === 'radius' && row.normalizedValue === '12px').id, {
				token: '--shape-radius-container',
				verdict: 'defer',
			}),
	})
	assert.equal(r.status, 1)
	assert.ok(back.findings.some((f) => f.code === 'accepted-token-unexpected'))
})

test('CLI --read-back：accept 近义栈却不标 lossy，退 1', (t) => {
	const { r, back } = cliReadBack(t, {
		css: mutateCss(FONT_ANCHOR, 'font-family: "PingFang SC", Arial, sans-serif;'),
		fill: (md, d) =>
			fillMarkdownRow(md, d.rows.find((row) => row.kind === 'font-stack').id, {
				token: '--fontFamily-sans',
				verdict: 'accept',
			}),
	})
	assert.equal(r.status, 1)
	assert.ok(back.findings.some((f) => f.code === 'lossy-required'))
})

test('CLI --read-back：精确匹配却标 lossy，退 1', (t) => {
	const { r, back } = cliReadBack(t, {
		css: mutateCss(FONT_ANCHOR, `font-family: ${FONT_STACK};`),
		fill: (md, d) =>
			fillMarkdownRow(md, d.rows.find((row) => row.kind === 'font-stack').id, {
				token: '--fontFamily-sans',
				verdict: 'accept',
				lossy: '是',
			}),
	})
	assert.equal(r.status, 1)
	assert.ok(back.findings.some((f) => f.code === 'lossy-without-near'))
})

test('CLI --read-back：lossy 格写了读不懂的字，退 1', (t) => {
	const { r, back } = cliReadBack(t, {
		css: mutateCss(RADIUS_ANCHOR, 'border-radius: 12px;'),
		fill: (md, d) =>
			fillMarkdownRow(md, d.rows.find((row) => row.kind === 'radius' && row.normalizedValue === '12px').id, {
				verdict: 'defer',
				lossy: '大概吧',
			}),
	})
	assert.equal(r.status, 1)
	assert.ok(back.findings.some((f) => f.code === 'lossy-unknown'))
})

test('色表一个字节不动：value-rows.mjs 不认识 tm- 前缀与 lossy 列', () => {
	const src = fs.readFileSync(new URL('../scripts/lib/value-rows.mjs', import.meta.url), 'utf8')
	assert.ok(!src.includes('tm-'), '非色射程不许回头污染色表')
	assert.ok(!src.includes('lossy'))
	assert.ok(!src.includes('omit'))
})
