/**
 * 布局映射：决策单元是「源布局 × 用途」，双份产出。
 *
 * 三条硬承诺各有独占用例，卸掉判据即转红：
 *
 * 1. **不读 trace**——两份只在 trace 自由文本上不同的输入，双份产出**字节相同**（真 spawn
 *    CLI，trace 既落在产物目录里、又用 `--trace` 显式递进去）；另加一条扫源码的形状断言。
 * 2. **候选取自包络**——取不到就写「无候选」，一个值都不编。
 * 3. **退 1 只有两条路**——收不到产物、读不开包络（缺件 / 解不开 / 形状不对三个码各一条）。
 *    表里有阻断层行照样退 0：本表是报表不是门。
 *
 * 本文件只管**出表**这一半。裁决回灌（`--read-back`）那一半在 `layout-readback.test.mjs`。
 * 包络这份输入从哪来见 `layout-fixture.mjs`：拷 fixture 再跑采集侧真投影，不手写精简形状。
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import {
	buildLayoutMap,
	renderLayoutMapMarkdown,
	loadLayoutEnvelope,
	LayoutEnvelopeError,
	assetBreakpoints,
	parseFloorRoots,
	sequenceScopeOf,
	gridColumnCount,
	breakpointFeatures,
	taxonomyOf,
	envelopeFloorIds,
	LAYOUT_USAGE_ORDER,
	LAYER_LABEL,
} from '../scripts/lib/layout-rows.mjs'
import { scanArtifact } from '../scripts/lib/css-scan.mjs'
import { loadClosedSet } from '../scripts/lib/closed-set.mjs'
import { FIXTURE_ASSET, goodHtml, goodCss, copyFixtureAsset, tempDir, writeArtifact } from './helpers.mjs'
import { LAYOUT_MAP_CLI, fixtureEnvelope, fixtureEnvelopeText, assetWithEnvelope, CROSS_SITE_PAGE } from './layout-fixture.mjs'

const HEX8 = (usage, normalized) => createHash('sha256').update(usage + '\u0000' + normalized).digest('hex').slice(0, 8)

function mapFrom({ html = goodHtml(), css = goodCss(), envelope = fixtureEnvelope() } = {}) {
	const { declarations } = scanArtifact({ html, htmlFile: 'index.html', css: [{ file: 'index.css', text: css }] })
	return buildLayoutMap({
		declarations,
		floorRoots: parseFloorRoots(html, 'index.html'),
		envelope,
		breakpoints: assetBreakpoints(FIXTURE_ASSET),
		styleSetId: loadClosedSet(FIXTURE_ASSET).styleSetId,
		asset: '../fixture-lanyuan-lab',
		artifactRoot: '.',
	})
}

const rowOf = (doc, usage, normalized) => doc.rows.find((r) => r.usage === usage && r.normalizedValue === normalized)
const usagesIn = (doc) => doc.rows.map((r) => r.usage)

/* ── 出表：形状与 id ────────────────────────────────────────────────────────── */

test('id 前缀 lm- 与色表 vm- / 非色表 tm- 三家分立，mapKind 自己一套', () => {
	const doc = mapFrom({ css: `${goodCss()}\n.wrap { max-width: 1440px; }\n` })
	assert.equal(doc.schemaVersion, 1)
	assert.equal(doc.mapKind, 'layout')
	assert.ok(doc.rows.length, '这条用例要有行才证得了 id 规矩')
	assert.ok(doc.rows.every((r) => r.id.startsWith('lm-')))
	assert.ok(!doc.rows.some((r) => r.id.startsWith('vm-') || r.id.startsWith('tm-')), '三张表不许共用一个 id 体系')
	const row = rowOf(doc, 'container-width', '1440px')
	assert.equal(row.id, `lm-container-width-${HEX8('container-width', '1440px')}`)
})

test('三张表的 id 前缀互不相交，且既有两张表源码里认不出 lm-', () => {
	const valueSrc = fs.readFileSync(new URL('../scripts/lib/value-rows.mjs', import.meta.url), 'utf8')
	const typeSrc = fs.readFileSync(new URL('../scripts/lib/type-rows.mjs', import.meta.url), 'utf8')
	const layoutSrc = fs.readFileSync(new URL('../scripts/lib/layout-rows.mjs', import.meta.url), 'utf8')
	assert.ok(!valueSrc.includes('lm-'), '布局射程不许回头污染色表')
	assert.ok(!typeSrc.includes('lm-'), '布局射程不许回头污染非色表')
	assert.ok(layoutSrc.includes("return `lm-${usage}-${hex8}`"), 'id 前缀写死在本表里')
	// 用途名各自独立：色表 usage 与非色表 kind 都不许出现在布局用途表里，撞了 id 就会撞。
	const foreign = ['background', 'text', 'border', 'shadow', 'fill', 'accent', 'other', 'font-stack', 'font-size', 'radius', 'stroke', 'space']
	for (const u of LAYOUT_USAGE_ORDER) assert.ok(!foreign.includes(u), `用途 ${u} 与既有两张表的用途 / 类目撞名`)
})

test('max-width 归本表：非色表白名单里没有它，两张表不重叠', async () => {
	const { kindOf } = await import('../scripts/lib/type-rows.mjs')
	assert.equal(kindOf('max-width'), null, '非色表明写不收布局尺寸；收了就是两张表判同一处')
	const doc = mapFrom({ css: `${goodCss()}\n.wrap { max-width: 1440px; }\n` })
	assert.ok(rowOf(doc, 'container-width', '1440px'), '本表必须接住它，否则这一维两张表都不管')
})

/* ── 候选取自包络 ───────────────────────────────────────────────────────────── */

test('容器宽越界：候选逐个取自包络的 maxWidthPx，按 |差| 升序', () => {
	const doc = mapFrom({ css: `${goodCss()}\n.wrap { max-width: 1440px; }\n` })
	const row = rowOf(doc, 'container-width', '1440px')
	const envelopeWidths = fixtureEnvelope().blocking.find((b) => b.id === 'contained-has-enumerated-max-width').detail.maxWidthPx
	assert.deepEqual(row.candidates.map((c) => c.value), envelopeWidths.map((v) => v.value))
	assert.ok(row.candidates.every((c) => c.source.startsWith('blocking:contained-has-enumerated-max-width')))
	assert.deepEqual(row.assetValues, envelopeWidths.map((v) => v.value))
	assert.equal(row.candidates[0].deltaPx, envelopeWidths[0].value - 1440)
	assert.equal(row.note, '', '有候选的行不写「无候选」')
})

test('容器宽落在包络集合里就不出行，但计进 summary.scanned', () => {
	const doc = mapFrom()
	assert.equal(rowOf(doc, 'container-width', '1128px'), undefined, '1128 是包络里的观测值')
	const scanned = doc.summary.scanned.find((s) => s.usage === 'container-width')
	assert.equal(scanned.rowed, 0)
	assert.equal(scanned.notRowed, 1, '零行不等于没扫：扫到的那一个要在 summary 里留痕')
})

test('列数越界：候选是 pc / tablet / mobile 三档观测的并集，逐个带分档层数', () => {
	const doc = mapFrom({ css: `${goodCss()}\n.g { display: grid; grid-template-columns: repeat(7, 1fr); }\n` })
	const row = rowOf(doc, 'columns', '7')
	const env = fixtureEnvelope()
	const union = new Set()
	for (const id of ['columns-pc', 'columns-tablet', 'columns-mobile']) {
		for (const v of env.advisory.find((a) => a.id === id).detail.values) union.add(v.value)
	}
	assert.deepEqual(new Set(row.candidates.map((c) => c.value)), union)
	assert.ok(row.candidates.every((c) => c.bands.length && c.bands.every((b) => ['pc', 'tablet', 'mobile'].includes(b.band))))
	assert.deepEqual(row.envelopeRefs, ['advisory:columns-pc', 'advisory:columns-tablet', 'advisory:columns-mobile'])
})

test('包络条目取不到时如实写「无候选」，并在 missing 里点名，不编一个值', () => {
	const doc = mapFrom({
		css: `${goodCss()}\n.g { display: grid; grid-template-columns: repeat(7, 1fr); }\n`,
		envelope: { ...fixtureEnvelope(), advisory: fixtureEnvelope().advisory.filter((a) => !/^columns-/.test(a.id)) },
	})
	const row = rowOf(doc, 'columns', '7')
	assert.deepEqual(row.candidates, [], '取不到就是零候选，不许拿别的维度顶上')
	assert.deepEqual(row.assetValues, [])
	assert.equal(row.assetValuesResolved, false)
	assert.equal(row.note, '无候选')
	assert.deepEqual(doc.summary.envelopeRefs.missing.filter((r) => r.startsWith('advisory:columns')), [
		'advisory:columns-mobile',
		'advisory:columns-pc',
		'advisory:columns-tablet',
	])
	assert.match(renderLayoutMapMarkdown(doc), /## 包络里取不到的条目/)
})

test('float-widget 行恒零候选：出路是摘出去，不是换一个值', () => {
	const doc = mapFrom({ html: CROSS_SITE_PAGE })
	const row = rowOf(doc, 'sequence-float-widget', 'float-widget.service-rail')
	assert.equal(row.layer, 'blocking')
	assert.deepEqual(row.candidates, [])
	assert.match(row.note, /^无候选：这一条的出路是把该层从序列里摘出去/)
	assert.match(row.advice, /摘出去/)
})

test('序列首末候选取自包络里那份完整层名册，按 taxonomy 挑', () => {
	const doc = mapFrom({ html: CROSS_SITE_PAGE })
	const census = envelopeFloorIds(fixtureEnvelope())
	assert.ok(census.length, '这份名册是候选的唯一来源，空了这条用例就白跑')
	const first = rowOf(doc, 'sequence-first', 'hero.centered-pitch')
	const last = rowOf(doc, 'sequence-last', 'cta.centered-band')
	assert.deepEqual(first.candidates.map((c) => c.value), census.filter((id) => taxonomyOf(id) === 'navbar'))
	assert.deepEqual(last.candidates.map((c) => c.value), census.filter((id) => taxonomyOf(id) === 'footer'))
	assert.ok(first.candidates.every((c) => c.source.startsWith('advisory:slot-combinations')))
})

/* ── 断点：事实行，两边的值都列 ─────────────────────────────────────────────── */

test('断点与资产不一致：出事实行，两边的值都列，档位是「不在包络」', () => {
	const doc = mapFrom({ css: `${goodCss()}\n@media (max-width: 900px) { .x { color: red; } }\n` })
	const row = rowOf(doc, 'breakpoint', '900px')
	assert.equal(row.sourceValue, '(max-width: 900px)', '本页那一侧的值')
	assert.deepEqual(row.assetValues, assetBreakpoints(FIXTURE_ASSET).values, '资产那一侧的值')
	assert.equal(row.layer, 'outside-envelope')
	assert.deepEqual(row.envelopeRefs, [], '包络里根本没有断点这一维')
	assert.deepEqual(row.candidates, [])
	assert.equal(row.modeRequired, 'create')
	assert.match(row.advice, /本模式做不到/)
	assert.match(row.advice, /breakpoint-lock/)
	assert.match(row.advice, /创造模式/)
})

test('断点对得上资产自己声明的 aliases 就不出行——判据来自资产，不是本表放的容差', () => {
	const bp = assetBreakpoints(FIXTURE_ASSET)
	assert.ok(bp.accepted.has(1023) && !bp.values.includes(1023), '1023 必须是 1024 档的 alias，否则这条用例证不了什么')
	const doc = mapFrom()
	assert.ok(goodCss().includes('@media (max-width: 1023px)'), '冻结夹具用的就是整数补写法')
	assert.equal(rowOf(doc, 'breakpoint', '1023px'), undefined)
	assert.equal(rowOf(doc, 'breakpoint', '767px'), undefined)
	// 差一个像素照样不认：容差会放行 901，aliases 不会。
	const off = mapFrom({ css: `${goodCss()}\n@media (max-width: 1022px) { .x { color: red; } }\n` })
	assert.ok(rowOf(off, 'breakpoint', '1022px'), '1022 不在 aliases 里，必须出行')
})

test('宽度特性的语法自己认，不靠「括号里含 width 字样」', () => {
	assert.deepEqual(breakpointFeatures('@media (max-width: 900px) .g').map((f) => f.px), [900])
	assert.deepEqual(breakpointFeatures('@media (min-width: 600px) and (max-width: 900px) .g').map((f) => f.px), [600, 900])
	assert.deepEqual(breakpointFeatures('@media (width <= 700px) .g').map((f) => f.px), [700])
	assert.deepEqual(breakpointFeatures('@media (max-width: 900px) .a:not(.width-x)').map((f) => f.px), [900])
	assert.deepEqual(breakpointFeatures('.g'), [], '不在 @media 里就没有断点')
	assert.deepEqual(breakpointFeatures('@media (min-width: 48em) .g').map((f) => f.px), [null], '非 px 的宽度特性记进射程外')
})

/* ── 档位：两档 + 一档「不在包络」，措辞不许混 ───────────────────────────────── */

test('每行都标档位，且档位只从用途表来，逐行可查', () => {
	const doc = mapFrom({
		html: CROSS_SITE_PAGE,
		css: `${goodCss()}\n.wrap { max-width: 1440px; }\n.g { grid-template-columns: repeat(7, 1fr); }\n@media (max-width: 900px) { .x { color: red; } }\n`,
	})
	assert.ok(doc.rows.every((r) => ['blocking', 'advisory', 'outside-envelope'].includes(r.layer)))
	assert.ok(doc.rows.every((r) => typeof r.layerBasis === 'string' && r.layerBasis.length > 0))
	assert.equal(rowOf(doc, 'container-width', '1440px').layer, 'advisory')
	assert.equal(rowOf(doc, 'columns', '7').layer, 'advisory')
	assert.equal(rowOf(doc, 'breakpoint', '900px').layer, 'outside-envelope')
	assert.equal(rowOf(doc, 'sequence-first', 'hero.centered-pitch').layer, 'blocking')
	assert.deepEqual(doc.summary.byLayer, { blocking: 3, advisory: 2, 'outside-envelope': 1 })
})

test('容器宽判成报警档是照包络原文来的：那一条的判据不含集合本身', () => {
	const entry = fixtureEnvelope().blocking.find((b) => b.id === 'contained-has-enumerated-max-width')
	assert.match(entry.counterexampleRule, /集合本身是观测/, '包络改了这句话，本表的档位就得跟着改')
	const doc = mapFrom({ css: `${goodCss()}\n.wrap { max-width: 1440px; }\n` })
	const row = rowOf(doc, 'container-width', '1440px')
	assert.equal(row.layer, 'advisory')
	assert.match(row.layerBasis, /集合本身是观测/)
	assert.ok(row.envelopeRefs[0].startsWith('blocking:'), '依据出自阻断层条目，但档位仍是报警档，两件事都要写出来')
})

test('报警层不得写成违规：报表里一个「违规」都不许有，图例明写不阻断', () => {
	const md = renderLayoutMapMarkdown(
		mapFrom({ html: CROSS_SITE_PAGE, css: `${goodCss()}\n.wrap { max-width: 1440px; }\n.g { grid-template-columns: repeat(7, 1fr); }\n` }),
	)
	assert.ok(!md.includes('违规') || /这不是违规/.test(md), '「违规」只准出现在「这不是违规」那句里')
	assert.match(md, /报警层是观测的如实投影，不做判定、不参与退出码、不阻断任何东西/)
	assert.match(md, /本表不因任何一行退 1/)
	assert.deepEqual(Object.keys(LAYER_LABEL).sort(), ['advisory', 'blocking', 'outside-envelope'])
})

/* ── 序列读面 ───────────────────────────────────────────────────────────────── */

test('单层楼层不出 sequence 行，且 summary 说清是哪种「没出行」', () => {
	const doc = mapFrom()
	assert.equal(doc.summary.sequence.scope, 'floor')
	assert.equal(doc.summary.sequence.floorRoots, 1)
	assert.ok(!usagesIn(doc).some((u) => u.startsWith('sequence-')))
	assert.match(renderLayoutMapMarkdown(doc), /只有 `page` 才出 sequence 行/)
})

test('序列首末对得上就不出行', () => {
	const html = [
		'<header data-pattern="navbar.utility-left"></header>',
		'<section data-pattern="hero.centered-pitch"></section>',
		'<footer data-pattern="footer.compact-three"></footer>',
	].join('\n')
	const doc = mapFrom({ html })
	assert.equal(doc.summary.sequence.scope, 'page')
	assert.ok(!usagesIn(doc).some((u) => u.startsWith('sequence-')))
})

test('层根按文档序摊；style / script 体里的 data-pattern 不算层根', () => {
	const html = `<style>[data-pattern="hero.centered-pitch"] { color: red; }</style>\n${CROSS_SITE_PAGE}`
	const roots = parseFloorRoots(html, 'index.html')
	assert.deepEqual(roots.map((r) => r.pattern), [
		'hero.centered-pitch',
		'feature.grid-3-cards',
		'float-widget.service-rail',
		'cta.centered-band',
	])
	assert.deepEqual(roots.map((r) => r.index), [0, 1, 2, 3])
	assert.equal(taxonomyOf('synth:pricing.table-3'), 'pricing', '合成型身份剥掉前缀再取 taxonomy')
})

test('层根散在多份 HTML 里就不出 sequence 行：跨文件的序不是页序', () => {
	assert.equal(sequenceScopeOf([]).scope, 'none')
	assert.equal(sequenceScopeOf([{ file: 'a.html' }]).scope, 'floor')
	assert.equal(sequenceScopeOf([{ file: 'a.html' }, { file: 'a.html' }]).scope, 'page')
	assert.equal(sequenceScopeOf([{ file: 'a.html' }, { file: 'b.html' }]).scope, 'multi-file')
})

/* ── 射程边界 ───────────────────────────────────────────────────────────────── */

test('数不出列数的写法不进表也不静默丢', () => {
	const doc = mapFrom({ css: `${goodCss()}\n.g { grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); }\n.h { max-width: 100%; }\n` })
	const shown = doc.summary.outOfScopeValues.map((v) => `${v.prop}: ${v.value}`)
	assert.ok(shown.includes('grid-template-columns: repeat(auto-fill, minmax(240px, 1fr))'))
	assert.ok(shown.includes('max-width: 100%'))
	assert.equal(gridColumnCount('repeat(auto-fill, minmax(240px, 1fr))'), null, '列数由视口定，本表不替浏览器算')
	assert.equal(gridColumnCount('repeat(3, 360px)'), 3)
	assert.equal(gridColumnCount('minmax(0, 1fr) 320px'), 2, '函数里的空白不是轨道分隔符')
	assert.equal(gridColumnCount('[full-start] 1fr [full-end]'), 1, '行名不是轨道')
	assert.equal(gridColumnCount('var(--grid)'), null)
	assert.match(renderLayoutMapMarkdown(doc), /## 射程外的值（未进表）/)
})

test('@media 里的 max-width 是内容宽不是容器宽：记进射程外，不当越界', () => {
	const doc = mapFrom()
	assert.ok(goodCss().includes('max-width: 704px'), '冻结夹具的降档内容宽正是这条用例的输入')
	assert.equal(rowOf(doc, 'container-width', '704px'), undefined, '拿它比容器宽集合会把每条降档规则都报成越界')
	const shown = doc.summary.outOfScopeValues.map((v) => `${v.prop}: ${v.value}`)
	assert.ok(shown.includes('@media 内的 max-width: 704px'))
	assert.ok(shown.includes('@media 内的 max-width: 344px'))
})

test('合格产物配自家资产：零行，但 summary 说得出扫了什么', () => {
	const doc = mapFrom()
	assert.equal(doc.summary.rows, 0)
	assert.deepEqual(doc.summary.byLayer, { blocking: 0, advisory: 0, 'outside-envelope': 0 })
	assert.ok(doc.summary.scanned.some((s) => s.notRowed > 0), '零行必须能与「一个都没扫到」分开')
	assert.deepEqual(doc.summary.envelopeRefs.missing, [])
})

/* ── Markdown ───────────────────────────────────────────────────────────────── */

test('Markdown 十一列固定，选中值 / 裁决两列空即 pending', () => {
	const doc = mapFrom({ css: `${goodCss()}\n.wrap { max-width: 1440px; }\n` })
	const md = renderLayoutMapMarkdown(doc)
	assert.match(md, /^\| id \| 源布局 \| 用途 \| 档位 \| 处数 \| 资产侧取值 \| 候选 \| 建议 \| 选中值 \| 裁决 \| 备注 \|$/m)
	assert.match(md, /^\| --- \| --- \| --- \| --- \| ---: \| --- \| --- \| --- \| --- \| --- \| --- \|$/m)
	const data = md.split('\n').find((l) => l.startsWith('| lm-'))
	const cells = data.split('|').map((s) => s.trim())
	assert.equal(cells.length, 13, '首尾各一个空格子，十一列')
	assert.equal(cells[9], '', '选中值列 --out 必须空着，不预填')
	assert.equal(cells[10], '', '裁决列必须空着表示 pending')
	assert.ok(!md.includes('pending'), 'pending 用未填表达，不是一个枚举值')
	assert.ok(doc.rows.every((r) => r.verdict === null && r.acceptedValue === null))
	assert.equal(doc.summary.pending, doc.summary.rows)
})

test('同一份输入连跑两次，双份产出字节相同（候选与行序都定死）', () => {
	const input = { html: CROSS_SITE_PAGE, css: `${goodCss()}\n.wrap { max-width: 1440px; }\n.g { grid-template-columns: repeat(7, 1fr); }\n` }
	const a = mapFrom(input)
	const b = mapFrom(input)
	assert.equal(JSON.stringify(a, null, 2), JSON.stringify(b, null, 2))
	assert.equal(renderLayoutMapMarkdown(a), renderLayoutMapMarkdown(b))
	assert.ok(!/generatedAt|"timestamp"|elapsed/i.test(JSON.stringify(a)), '输出不得含时间戳 / 耗时键')
})

/* ── 不读 trace ─────────────────────────────────────────────────────────────── */

/**
 * 本包核心主张在布局表这一侧的证据。trace 用两种方式递进去，两条路都必须无效：
 * 落在产物目录里（`collectArtifactFiles` 只收 `.html` / `.css`），以及 `--trace` 显式给。
 */
test('CLI：两份只在 trace 自由文本上不同的输入，双份产出字节相同', (t) => {
	const asset = assetWithEnvelope(t)
	// 同一个产物目录、同一个 --out：两跑之间**只有 trace 那一份文件的内容变了**，
	// 别的一个字节都没动，字节不等就只可能是 trace 进了判据。
	const art = writeArtifact(path.join(tempDir(t), 'art'), {
		html: CROSS_SITE_PAGE,
		css: `${goodCss()}\n.wrap { max-width: 1440px; }\n`,
	})
	const tracePath = path.join(art.dir, 'generate-trace.json')
	const out = path.join(tempDir(t), 'out')
	const run = (marker) => {
		fs.writeFileSync(
			tracePath,
			JSON.stringify({
				reason: `自述 ${marker}`,
				assumptions: [`假设 ${marker}`],
				sequence: { source: 'skeleton', notes: `该拍板了 ${marker}` },
				floors: [{ pattern: 'hero.centered-pitch', fields: [{ field: 'columns', note: `我认为完全合规 ${marker}`, rationale: marker }] }],
			}),
		)
		const r = spawnSync(
			process.execPath,
			[LAYOUT_MAP_CLI, '--asset', asset, '--artifact', art.dir, '--out', out, '--trace', tracePath],
			{ encoding: 'utf8' },
		)
		assert.equal(r.status, 0, r.stderr)
		return {
			json: fs.readFileSync(path.join(out, 'layout-map.json'), 'utf8'),
			md: fs.readFileSync(path.join(out, 'layout-map.md'), 'utf8'),
		}
	}
	const a = run('TRACE-MARKER-A')
	const b = run('TRACE-MARKER-B')
	assert.equal(a.json, b.json, 'trace 自由文本进了判据，字节就不同了')
	assert.equal(a.md, b.md)
	for (const s of [a.json, a.md]) {
		assert.ok(!s.includes('TRACE-MARKER'), 'trace 里的字一个都不许出现在产出里')
		assert.ok(!s.includes('自述') && !s.includes('假设'), 'trace 的键名也不许泄漏')
	}
	assert.ok(JSON.parse(a.json).summary.rows > 0, '零行表的字节当然相同，这条用例要有行才证得了什么')
})

test('源码形状：布局表两份都不认识 trace', () => {
	for (const rel of ['../scripts/layout-map.mjs', '../scripts/lib/layout-rows.mjs']) {
		const src = fs.readFileSync(new URL(rel, import.meta.url), 'utf8')
		const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
		assert.ok(!/\btrace\b/i.test(code), `${rel} 的代码里出现了 trace 读面`)
		assert.ok(!/whitelistTrace|generate-trace|hasTrace/.test(code), `${rel} 不许接生成侧自述`)
	}
})

/* ── 退出码：两条退 1 的路 ──────────────────────────────────────────────────── */

test('CLI：收不到产物，退 1（不以「零行」全绿交差）', (t) => {
	const asset = assetWithEnvelope(t)
	const empty = path.join(tempDir(t), 'empty')
	fs.mkdirSync(empty, { recursive: true })
	const out = path.join(tempDir(t), 'out')
	const r = spawnSync(process.execPath, [LAYOUT_MAP_CLI, '--asset', asset, '--artifact', empty, '--out', out], { encoding: 'utf8' })
	assert.equal(r.status, 1)
	const back = JSON.parse(r.stdout.slice(r.stdout.indexOf('{')))
	assert.equal(back.verdict, 'blocked')
	assert.equal(back.precheck.code, 'artifact-empty')
	assert.ok(!fs.existsSync(path.join(out, 'layout-map.json')), '收不到产物就不许落一张空表')
})

test('CLI：资产没有包络，退 1 且点名 layout-envelope-missing', (t) => {
	// 「资产没投影过包络」仍是真状态：包络自 R4-10 起是**生成侧**准入必交件，本包不跑准入，
	// 一份没投影过的资产照样递得进来。拷一份再删干净，不依赖冻结 fixture 里有没有这份文件。
	const asset = copyFixtureAsset(t)
	fs.rmSync(path.join(asset, 'layout-envelope.json'), { force: true })
	const art = writeArtifact(path.join(tempDir(t), 'art'))
	const out = path.join(tempDir(t), 'out')
	const r = spawnSync(process.execPath, [LAYOUT_MAP_CLI, '--asset', asset, '--artifact', art.dir, '--out', out], { encoding: 'utf8' })
	assert.equal(r.status, 1)
	const back = JSON.parse(r.stdout.slice(r.stdout.indexOf('{')))
	assert.equal(back.precheck.code, 'layout-envelope-missing')
	assert.match(back.precheck.nextAction, /build-envelope\.mjs/)
	assert.ok(!fs.existsSync(path.join(out, 'layout-map.json')))
})

test('CLI：包络解不开 / 形状不对，各退 1 且码不合并', (t) => {
	const art = writeArtifact(path.join(tempDir(t), 'art'))
	const cases = [
		['layout-envelope-unparseable', () => '{ 这不是 JSON'],
		['layout-envelope-shape', (text) => JSON.stringify({ ...JSON.parse(text), blocking: undefined })],
	]
	for (const [code, mutate] of cases) {
		const asset = assetWithEnvelope(t, mutate)
		const out = path.join(tempDir(t), `out-${code}`)
		const r = spawnSync(process.execPath, [LAYOUT_MAP_CLI, '--asset', asset, '--artifact', art.dir, '--out', out], { encoding: 'utf8' })
		assert.equal(r.status, 1, code)
		assert.equal(JSON.parse(r.stdout.slice(r.stdout.indexOf('{'))).precheck.code, code)
	}
})

test('loadLayoutEnvelope 三个码分家，缺件 / 解不开 / 形状不对不是一件事', (t) => {
	const bare = copyFixtureAsset(t)
	fs.rmSync(path.join(bare, 'layout-envelope.json')) // fixture 自带一份（R4-10 起是必交件），先删干净
	assert.throws(() => loadLayoutEnvelope(bare), (e) => e instanceof LayoutEnvelopeError && e.code === 'layout-envelope-missing')
	fs.writeFileSync(path.join(bare, 'layout-envelope.json'), '{')
	assert.throws(() => loadLayoutEnvelope(bare), (e) => e.code === 'layout-envelope-unparseable')
	fs.writeFileSync(path.join(bare, 'layout-envelope.json'), JSON.stringify({ blocking: [] }))
	assert.throws(() => loadLayoutEnvelope(bare), (e) => e.code === 'layout-envelope-shape')
	fs.writeFileSync(path.join(bare, 'layout-envelope.json'), fixtureEnvelopeText())
	assert.equal(loadLayoutEnvelope(bare).blocking.length, 7)
})

test('CLI：表里有阻断层行照样退 0——本表是报表不是门', (t) => {
	const asset = assetWithEnvelope(t)
	const art = writeArtifact(path.join(tempDir(t), 'art'), {
		html: CROSS_SITE_PAGE,
		css: `${goodCss()}\n.wrap { max-width: 1440px; }\n@media (max-width: 900px) { .x { color: red; } }\n`,
	})
	const out = path.join(tempDir(t), 'out')
	const r = spawnSync(process.execPath, [LAYOUT_MAP_CLI, '--asset', asset, '--artifact', art.dir, '--out', out], { encoding: 'utf8' })
	assert.equal(r.status, 0, r.stderr)
	const doc = JSON.parse(fs.readFileSync(path.join(out, 'layout-map.json'), 'utf8'))
	assert.ok(doc.summary.byLayer.blocking > 0, '这条用例要有阻断层行才证得了退 0')
	assert.ok(doc.summary.byLayer.advisory > 0, '报警层行同样不影响退出码')
	assert.ok(doc.summary.byLayer['outside-envelope'] > 0)
})

test('CLI：双份落到 --out，不写进另外两张表的文件名，也不写进资产目录', (t) => {
	const asset = assetWithEnvelope(t)
	const art = writeArtifact(path.join(tempDir(t), 'art'), { css: `${goodCss()}\n.wrap { max-width: 1440px; }\n` })
	const out = path.join(tempDir(t), 'out')
	const r = spawnSync(process.execPath, [LAYOUT_MAP_CLI, '--asset', asset, '--artifact', art.dir, '--out', out], { encoding: 'utf8' })
	assert.equal(r.status, 0, r.stderr)
	assert.ok(fs.existsSync(path.join(out, 'layout-map.json')))
	assert.ok(fs.existsSync(path.join(out, 'layout-map.md')))
	for (const name of ['value-map.json', 'value-map.md', 'type-map.json', 'type-map.md']) {
		assert.ok(!fs.existsSync(path.join(out, name)), `布局表不得写进 ${name}`)
	}
	assert.ok(!fs.existsSync(path.join(asset, 'layout-map.json')), '不写进资产目录')
})

test('CLI：--out 与 --read-back 都不给是用法错误（互斥那一族在 layout-readback.test.mjs）', (t) => {
	const asset = assetWithEnvelope(t)
	const art = writeArtifact(path.join(tempDir(t), 'art'))
	const neither = spawnSync(process.execPath, [LAYOUT_MAP_CLI, '--asset', asset, '--artifact', art.dir], { encoding: 'utf8' })
	assert.equal(neither.status, 1)
	assert.match(neither.stderr, /必须给 --out 或 --read-back 之一/)
})
