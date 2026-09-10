/**
 * 值映射：决策单元是「源值 × 用途」，双份产出，裁决回灌。
 *
 * pending 不是第四个枚举值，用未填表达（JSON null / Markdown 空单元格）。
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { buildValueMap, renderValueMapMarkdown, readBackValueMap, NEAR_DELTA_E00_MAX } from '../scripts/lib/value-rows.mjs'
import { scanArtifact } from '../scripts/lib/css-scan.mjs'
import { loadClosedSet } from '../scripts/lib/closed-set.mjs'
import { FIXTURE_ASSET, goodHtml, mutateCss, tempDir, writeArtifact, SCRIPTS_DIR, goodCss } from './helpers.mjs'

const HEX8 = (usage, normalized) => createHash('sha256').update(usage + '\u0000' + normalized).digest('hex').slice(0, 8)

function mapFrom(css, extraHtml) {
	const closedSet = loadClosedSet(FIXTURE_ASSET)
	const { declarations } = scanArtifact({
		html: extraHtml ?? goodHtml(),
		htmlFile: 'index.html',
		css: [{ file: 'index.css', text: css }],
	})
	return buildValueMap({
		declarations,
		closedSet,
		styleSetId: closedSet.styleSetId,
		asset: '../fixture-lanyuan-lab',
		artifactRoot: '.',
	})
}

test('同一源值落在两种用途上必须分成两行', () => {
	const css =
		mutateCss('background-color: var(--color-primary);', 'background-color: #0F7A6C;').replace(
			'border: 1px solid var(--color-border-default);',
			'border: 1px solid #0F7A6C;',
		)
	const doc = mapFrom(css)
	const bg = doc.rows.filter((r) => r.normalizedValue === '#0f7a6cff' && r.usage === 'background')
	const bd = doc.rows.filter((r) => r.normalizedValue === '#0f7a6cff' && r.usage === 'border')
	assert.equal(bg.length, 1, 'background 用途单独一行')
	assert.equal(bd.length, 1, 'border 用途单独一行')
	assert.notEqual(bg[0].id, bd[0].id, '行 id 含用途，两行不得合成一行')
	assert.ok(bg[0].occurrences.every((o) => o.prop === 'background-color' || o.prop === 'background'))
	assert.ok(bd[0].occurrences.every((o) => o.prop === 'border' || o.prop.startsWith('border')))
})

test('COLOR_EXEMPT 与色值门共用一份，值映射不得自备', () => {
	const src = fs.readFileSync(new URL('../scripts/lib/value-rows.mjs', import.meta.url), 'utf8')
	assert.match(src, /import\s*\{[^}]*COLOR_EXEMPT[^}]*\}\s*from\s*['"]\.\/gates\.mjs['"]/)
	assert.ok(!/const\s+COLOR_EXEMPT\s*=/.test(src), '豁免清单分家会让一侧改了另一侧不知道')
})

test('同一 (源值, 用途) 多处出现归成一行', () => {
	const css =
		mutateCss('background-color: var(--color-primary);', 'background-color: #0F7A6C;') +
		'\n.x { background: #0f7a6c; }\n.y { background-color: rgb(15, 122, 108); }\n'
	const doc = mapFrom(css)
	const rows = doc.rows.filter((r) => r.usage === 'background')
	assert.equal(rows.length, 1, '三种写法归一后是同一行')
	assert.equal(rows[0].normalizedValue, '#0f7a6cff')
	assert.equal(rows[0].occurrenceCount, rows[0].occurrences.length)
	assert.ok(rows[0].occurrenceCount >= 3)
	assert.equal(rows[0].verdict, null, 'pending 用 null，不是字符串')
	assert.equal(rows[0].id, `vm-background-${HEX8('background', '#0f7a6cff')}`)
	assert.ok(rows[0].candidates.some((c) => c.path === 'color.primary.$root' && c.cssVar === '--color-primary' && c.matchedBy === 'hex-exact'))
})

test('未归并的 prop 归 other 并在报告里点名', () => {
	const css = goodCss() + '\n.mask { mask-image: linear-gradient(#000, #fff); }\n'
	const doc = mapFrom(css)
	assert.ok(doc.summary.unmappedProps.includes('mask-image'))
	assert.ok(doc.rows.some((r) => r.usage === 'other'))
	const md = renderValueMapMarkdown(doc)
	assert.match(md, /未归并的 prop/)
	assert.match(md, /mask-image/)
})

test('反查不到就写无候选，不编一个 token', () => {
	const css = mutateCss('background-color: var(--color-primary);', 'background-color: #123456;')
	const doc = mapFrom(css)
	const row = doc.rows.find((r) => r.normalizedValue === '#123456ff')
	assert.deepEqual(row.candidates, [])
	assert.equal(row.note, '无候选')
})

function fillMarkdownRow(md, id, { token = '', verdict = '' } = {}) {
	return md
		.split('\n')
		.map((line) => {
			if (!line.startsWith(`| ${id} |`)) return line
			const cells = line.split('|')
			cells[6] = ` ${token} `
			cells[7] = ` ${verdict} `
			return cells.join('|')
		})
		.join('\n')
}

test('Markdown 八列固定，选中 token 与裁决列空即 pending', () => {
	const css = mutateCss('background-color: var(--color-primary);', 'background-color: #0F7A6C;')
	const doc = mapFrom(css)
	const md = renderValueMapMarkdown(doc)
	assert.match(md, /^\| id \| 源值 \| 用途 \| 处数 \| 候选 token \| 选中 token \| 裁决 \| 备注 \|$/m)
	assert.match(md, /^\| --- \| --- \| --- \| ---: \| --- \| --- \| --- \| --- \|$/m)
	const data = md.split('\n').find((l) => l.startsWith('| vm-'))
	const cells = data.split('|').map((s) => s.trim())
	assert.equal(cells[6], '', '选中 token 列 --out 必须空着，不预填')
	assert.equal(cells[7], '', '裁决列必须空着表示 pending')
	assert.ok(!md.includes('pending'), 'pending 不是第四个枚举值，不得写进表')
})

test('--out 行上 acceptedCssVar 一律 null，哪怕只有一个候选', () => {
	const css = mutateCss('background-color: var(--color-primary);', 'background-color: #0F7A6C;')
	const doc = mapFrom(css)
	assert.ok(doc.rows.every((r) => Object.hasOwn(r, 'acceptedCssVar')))
	assert.ok(doc.rows.every((r) => r.acceptedCssVar === null), '预填就是本包在裁')
})

test('JSON 的 verdict 三值枚举加 null，没有 pending 这个键值', () => {
	const css = mutateCss('color: var(--color-text-default);', 'color: #16202c;')
	const doc = mapFrom(css)
	const dumped = JSON.stringify(doc)
	assert.ok(!/"verdict":\s*"pending"/.test(dumped), 'schema 里不许把 pending 写成第四个枚举值')
	assert.ok(doc.rows.every((r) => r.verdict === null))
	assert.equal(typeof doc.summary.pending, 'number', 'summary.pending 是未填行数，不是枚举值')
})

test('回灌：空裁决记 pending，退 0', () => {
	const css = mutateCss('background-color: var(--color-primary);', 'background-color: #0F7A6C;')
	const doc = mapFrom(css)
	const md = renderValueMapMarkdown(doc)
	const back = readBackValueMap(doc, md)
	assert.equal(back.verdict, 'pass')
	assert.equal(back.summary.pending, doc.rows.length)
	assert.deepEqual(back.findings, [])
})

test('回灌：accept / reject / defer 能正确读回', () => {
	const css =
		mutateCss('background-color: var(--color-primary);', 'background-color: #0F7A6C;') +
		'\n.z { color: #123456; }\n.w { box-shadow: 0 0 0 #abcdef; }\n'
	const doc = mapFrom(css)
	assert.ok(doc.rows.length >= 3)
	const [a, b, c] = doc.rows
	const acceptVar = a.candidates.find((x) => x.layer === 'semantic')?.cssVar ?? a.candidates[0].cssVar
	let md = renderValueMapMarkdown(doc)
	md = fillMarkdownRow(md, a.id, { token: acceptVar, verdict: 'accept' })
	md = fillMarkdownRow(md, b.id, { verdict: 'reject' })
	md = fillMarkdownRow(md, c.id, { verdict: 'defer' })
	const back = readBackValueMap(doc, md)
	assert.equal(back.verdict, 'pass')
	const byId = Object.fromEntries(back.rows.map((r) => [r.id, r]))
	assert.equal(byId[a.id].verdict, 'accept')
	assert.equal(byId[a.id].acceptedCssVar, acceptVar)
	assert.equal(byId[b.id].verdict, 'reject')
	assert.equal(byId[b.id].acceptedCssVar, null)
	assert.equal(byId[c.id].verdict, 'defer')
	assert.equal(byId[c.id].acceptedCssVar, null)
})

test('回灌：枚举外的值阻断 verdict-unknown', () => {
	const css = mutateCss('background-color: var(--color-primary);', 'background-color: #0F7A6C;')
	const doc = mapFrom(css)
	const md = fillMarkdownRow(renderValueMapMarkdown(doc), doc.rows[0].id, { verdict: '同意' })
	const back = readBackValueMap(doc, md)
	assert.equal(back.verdict, 'blocked')
	assert.ok(back.findings.some((f) => f.code === 'verdict-unknown'))
})

test('回灌：id 认不出阻断 row-id-unknown', () => {
	const css = mutateCss('background-color: var(--color-primary);', 'background-color: #0F7A6C;')
	const doc = mapFrom(css)
	const md = `| id | 源值 | 用途 | 处数 | 候选 token | 选中 token | 裁决 | 备注 |\n| --- | --- | --- | ---: | --- | --- | --- | --- |\n| vm-background-deadbeef | \`#0F7A6C\` | background | 1 | | | accept | |\n`
	const back = readBackValueMap(doc, md)
	assert.equal(back.verdict, 'blocked')
	assert.ok(back.findings.some((f) => f.code === 'row-id-unknown'))
})

test('回灌：同一 id 两行裁决不同阻断 row-id-duplicate', () => {
	const css = mutateCss('background-color: var(--color-primary);', 'background-color: #0F7A6C;')
	const doc = mapFrom(css)
	const id = doc.rows[0].id
	const row = `| ${id} | \`#0F7A6C\` | background | 1 | | \`--color-primary\` | accept | |`
	const md = `| id | 源值 | 用途 | 处数 | 候选 token | 选中 token | 裁决 | 备注 |\n| --- | --- | --- | ---: | --- | --- | --- | --- |\n${row}\n${row.replace('accept', 'reject')}\n`
	const back = readBackValueMap(doc, md)
	assert.equal(back.verdict, 'blocked')
	assert.ok(back.findings.some((f) => f.code === 'row-id-duplicate'))
})

test('回灌：同一 id 两行裁决相同只报警 row-id-repeated', () => {
	const css = mutateCss('background-color: var(--color-primary);', 'background-color: #0F7A6C;')
	const doc = mapFrom(css)
	const id = doc.rows[0].id
	const row = `| ${id} | \`#0F7A6C\` | background | 1 | | \`--color-primary\` | accept | |`
	const md = `| id | 源值 | 用途 | 处数 | 候选 token | 选中 token | 裁决 | 备注 |\n| --- | --- | --- | ---: | --- | --- | --- | --- |\n${row}\n${row}\n`
	const back = readBackValueMap(doc, md)
	assert.equal(back.verdict, 'pass')
	assert.ok(back.warnings.some((w) => w.code === 'row-id-repeated'))
	assert.equal(back.findings.length, 0, '报警不进 findings')
})

test('回灌：JSON 里有、表里缺行 → 报警 row-missing，按 pending', () => {
	const css = mutateCss('background-color: var(--color-primary);', 'background-color: #0F7A6C;')
	const doc = mapFrom(css)
	const md = `| id | 源值 | 用途 | 处数 | 候选 token | 选中 token | 裁决 | 备注 |\n| --- | --- | --- | ---: | --- | --- | --- | --- |\n`
	const back = readBackValueMap(doc, md)
	assert.equal(back.verdict, 'pass')
	assert.ok(back.warnings.some((w) => w.code === 'row-missing'))
	assert.ok(back.rows.every((r) => r.verdict === null))
})

test('CLI --out 与 --read-back 都不给，退 1', (t) => {
	const art = writeArtifact(path.join(tempDir(t), 'art'))
	const r = spawnSync(process.execPath, [path.join(SCRIPTS_DIR, 'value-map.mjs'), '--asset', FIXTURE_ASSET, '--artifact', art.dir], {
		encoding: 'utf8',
	})
	assert.equal(r.status, 1)
	assert.match(r.stderr, /必须给 --out 或 --read-back/)
})

test('CLI --out 与 --read-back 互斥，退 1', (t) => {
	const art = writeArtifact(path.join(tempDir(t), 'art'))
	const md = path.join(tempDir(t), 'value-map.md')
	fs.writeFileSync(md, '| id |\n')
	const r = spawnSync(
		process.execPath,
		[path.join(SCRIPTS_DIR, 'value-map.mjs'), '--asset', FIXTURE_ASSET, '--artifact', art.dir, '--out', art.dir, '--read-back', md],
		{ encoding: 'utf8' },
	)
	assert.equal(r.status, 1)
})

test('CLI 双份落到 --out，不写进资产目录', (t) => {
	const art = writeArtifact(path.join(tempDir(t), 'art'), {
		css: mutateCss('background-color: var(--color-primary);', 'background-color: #0F7A6C;'),
	})
	const out = path.join(tempDir(t), 'out')
	const r = spawnSync(
		process.execPath,
		[path.join(SCRIPTS_DIR, 'value-map.mjs'), '--asset', FIXTURE_ASSET, '--artifact', art.dir, '--out', out],
		{ encoding: 'utf8' },
	)
	assert.equal(r.status, 0)
	assert.ok(fs.existsSync(path.join(out, 'value-map.json')))
	assert.ok(fs.existsSync(path.join(out, 'value-map.md')))
	assert.ok(!fs.existsSync(path.join(FIXTURE_ASSET, 'value-map.json')))
})

test('回灌：accept 但选中 token 空着 → 阻断 accepted-token-missing', () => {
	const css = mutateCss('background-color: var(--color-primary);', 'background-color: #0F7A6C;')
	const doc = mapFrom(css)
	const row = doc.rows.find((r) => r.candidates.length)
	const md = fillMarkdownRow(renderValueMapMarkdown(doc), row.id, { verdict: 'accept' })
	const back = readBackValueMap(doc, md)
	assert.equal(back.verdict, 'blocked')
	assert.ok(back.findings.some((f) => f.code === 'accepted-token-missing' && f.id === row.id))
})

test('回灌：选中 token 不在 candidates.cssVar 里 → 阻断 accepted-token-unknown', () => {
	const css = mutateCss('background-color: var(--color-primary);', 'background-color: #0F7A6C;')
	const doc = mapFrom(css)
	const row = doc.rows.find((r) => r.candidates.length)
	const md = fillMarkdownRow(renderValueMapMarkdown(doc), row.id, { token: 'var(--color-primary)', verdict: 'accept' })
	const back = readBackValueMap(doc, md)
	assert.equal(back.verdict, 'blocked')
	const hit = back.findings.find((f) => f.code === 'accepted-token-unknown')
	assert.ok(hit)
	assert.match(hit.reason, /→/)
	assert.match(hit.reason, /右边/)
})

test('回灌：写成 path 左半也算填错，报错指出只填 → 右边', () => {
	const css = mutateCss('background-color: var(--color-primary);', 'background-color: #0F7A6C;')
	const doc = mapFrom(css)
	const row = doc.rows.find((r) => r.candidates.some((c) => c.path === 'color.primary.$root'))
	const md = fillMarkdownRow(renderValueMapMarkdown(doc), row.id, { token: 'color.primary.$root', verdict: 'accept' })
	const back = readBackValueMap(doc, md)
	assert.equal(back.verdict, 'blocked')
	assert.ok(back.findings.some((f) => f.code === 'accepted-token-unknown' && /→/.test(f.reason)))
})

test('回灌：无候选行裁 accept → 阻断 accept-without-candidate，不叠报 missing', () => {
	const css = mutateCss('background-color: var(--color-primary);', 'background-color: #123456;')
	const doc = mapFrom(css)
	const row = doc.rows.find((r) => r.candidates.length === 0)
	const md = fillMarkdownRow(renderValueMapMarkdown(doc), row.id, { verdict: 'accept' })
	const back = readBackValueMap(doc, md)
	assert.equal(back.verdict, 'blocked')
	assert.ok(back.findings.some((f) => f.code === 'accept-without-candidate'))
	assert.ok(!back.findings.some((f) => f.code === 'accepted-token-missing'), '无候选行裁 accept 只报 accept-without-candidate')
})

test('回灌：defer 行填了选中 token → 阻断 accepted-token-unexpected，不叠报 unknown', () => {
	const css = mutateCss('background-color: var(--color-primary);', 'background-color: #0F7A6C;')
	const doc = mapFrom(css)
	const row = doc.rows.find((r) => r.candidates.length)
	const md = fillMarkdownRow(renderValueMapMarkdown(doc), row.id, { token: row.candidates[0].cssVar, verdict: 'defer' })
	const back = readBackValueMap(doc, md)
	assert.equal(back.verdict, 'blocked')
	assert.ok(back.findings.some((f) => f.code === 'accepted-token-unexpected'))
	assert.ok(!back.findings.some((f) => f.code === 'accepted-token-unknown'), '非 accept 行那一格填了只报 unexpected')
	assert.equal(back.rows.find((r) => r.id === row.id).acceptedCssVar, null)
})

test('回灌：accept 选中 primitive 候选 → 报警 accepted-token-primitive，退 0', () => {
	const css = mutateCss('background-color: var(--color-primary);', 'background-color: #0F7A6C;')
	const doc = mapFrom(css)
	const row = doc.rows.find((r) => r.candidates.some((c) => c.cssVar === '--color-teal-2' && c.layer === 'primitive'))
	assert.ok(row, 'fixture 的 #0F7A6C 必须有 --color-teal-2 这条 primitive 候选')
	const md = fillMarkdownRow(renderValueMapMarkdown(doc), row.id, { token: '--color-teal-2', verdict: 'accept' })
	const back = readBackValueMap(doc, md)
	assert.equal(back.verdict, 'pass')
	assert.ok(back.warnings.some((w) => w.code === 'accepted-token-primitive'))
	assert.equal(back.findings.length, 0, '报警不进 findings、不影响退出码')
	assert.equal(back.rows.find((r) => r.id === row.id).acceptedCssVar, '--color-teal-2')
})

test('回灌：无候选行裁 accept 且填了表外名字，仍只报 accept-without-candidate', () => {
	const css = mutateCss('background-color: var(--color-primary);', 'background-color: #123456;')
	const doc = mapFrom(css)
	const row = doc.rows.find((r) => r.candidates.length === 0)
	const md = fillMarkdownRow(renderValueMapMarkdown(doc), row.id, { token: '--color-primary', verdict: 'accept' })
	const back = readBackValueMap(doc, md)
	assert.equal(back.verdict, 'blocked')
	assert.deepEqual(
		back.findings.filter((f) => f.id === row.id).map((f) => f.code),
		['accept-without-candidate'],
	)
})

test('CLI --read-back：accept 但选中 token 空着，退 1', (t) => {
	const art = writeArtifact(path.join(tempDir(t), 'art'), {
		css: mutateCss('background-color: var(--color-primary);', 'background-color: #0F7A6C;'),
	})
	const out = path.join(tempDir(t), 'out')
	const gen = spawnSync(
		process.execPath,
		[path.join(SCRIPTS_DIR, 'value-map.mjs'), '--asset', FIXTURE_ASSET, '--artifact', art.dir, '--out', out],
		{ encoding: 'utf8' },
	)
	assert.equal(gen.status, 0, gen.stderr)
	const mdPath = path.join(out, 'value-map.md')
	const doc = JSON.parse(fs.readFileSync(path.join(out, 'value-map.json'), 'utf8'))
	const row = doc.rows.find((r) => r.candidates.length)
	const filled = fillMarkdownRow(fs.readFileSync(mdPath, 'utf8'), row.id, { verdict: 'accept' })
	const filledPath = path.join(tempDir(t), 'filled.md')
	fs.writeFileSync(filledPath, filled)
	const r = spawnSync(
		process.execPath,
		[path.join(SCRIPTS_DIR, 'value-map.mjs'), '--asset', FIXTURE_ASSET, '--artifact', art.dir, '--read-back', filledPath],
		{ encoding: 'utf8' },
	)
	assert.equal(r.status, 1)
	const back = JSON.parse(r.stdout.slice(r.stdout.indexOf('{')))
	assert.ok(back.findings.some((f) => f.code === 'accepted-token-missing'))
})

/* ── 候选两档：近邻色与半透明值 ────────────────────────────────────────────────
 *
 * 这一族用例钉的是 2026-09-03 补上的两个洞：近邻色与半透明值原来一律零候选，于是只能裁
 * `defer`，而执行侧照样把它们全换成了 `var()`。每条都从冻结夹具派生，不手写候选列。
 */

test('近邻色出候选，档位是 hex-near 并带实算 ΔE', () => {
	// #107b6d 与资产的 #0f7a6c 差 ΔE00 0.364：肉眼分不出，原来却零候选。
	const doc = mapFrom(goodCss() + '\n.near { background-color: #107b6d; }\n')
	const row = doc.rows.find((r) => r.normalizedValue === '#107b6dff')
	assert.ok(row, '这一行必须存在，否则本条无从验起')
	assert.ok(row.candidates.length, '近邻色不得再是零候选')
	assert.ok(row.candidates.every((c) => c.matchedBy === 'hex-near'), '本行一个精确命中都没有，全档必须是 hex-near')
	assert.ok(row.candidates.some((c) => c.cssVar === '--color-primary'))
	assert.ok(
		row.candidates.every((c) => c.deltaE00 > 0 && c.deltaE00 <= NEAR_DELTA_E00_MAX),
		'每个近邻候选都要带可核对的距离，且不得越过阈值',
	)
	assert.equal(row.note, '', '有候选就不写「无候选」')
})

test('近邻不等于就近：越过 ΔE 阈值仍是无候选', () => {
	// #10806f 到最近的 #0f7a6c 是 2.339，刚过 2。这条是阈值的可证伪点：把阈值放宽到 3
	// 或改成「取最近的一个」，本条当场转红。
	const doc = mapFrom(goodCss() + '\n.far { background-color: #10806f; }\n')
	const row = doc.rows.find((r) => r.normalizedValue === '#10806fff')
	assert.deepEqual(row.candidates, [])
	assert.equal(row.note, '无候选')
})

test('精确在前、近邻按 ΔE 升序、同距按 path：两次跑出来的表逐字节可比', () => {
	const doc = mapFrom(goodCss() + '\n.two { background-color: #f5f6f7; }\n')
	const row = doc.rows.find((r) => r.normalizedValue === '#f5f6f7ff')
	assert.ok(row.candidates.length >= 2)
	const ranks = row.candidates.map((c) => (c.matchedBy === 'hex-exact' ? 0 : 1))
	assert.deepEqual(ranks, [...ranks].sort(), 'hex-exact 恒排在 hex-near 之前')
	const near = row.candidates.filter((c) => c.matchedBy === 'hex-near')
	assert.deepEqual(
		near.map((c) => c.deltaE00),
		[...near.map((c) => c.deltaE00)].sort((a, b) => a - b),
		'近邻按 ΔE 升序',
	)
	const first = near.filter((c) => c.deltaE00 === near[0].deltaE00).map((c) => c.path)
	assert.deepEqual(first, [...first].sort(), '同距按 path 定序')
})

test('alpha 从检索键里剥出来：半透明值拿到不透明 token 的精确候选', () => {
	const doc = mapFrom(goodCss() + '\n.glass { background-color: rgba(255, 255, 255, 0.7); }\n')
	const row = doc.rows.find((r) => r.normalizedValue === '#ffffffb3')
	assert.ok(row, 'alpha 仍进 normalizedValue，行还是按含 alpha 的键分的')
	// alpha 取自归一值而不是字面串：归一把 alpha 量化成一个 hex 字节，0.7 落成 b3 = 0.702。
	// 差值 ≤0.2pp，兑现门因此只认「有没有承载体」，不比对百分数（见 migration-gates.mjs）。
	assert.equal(row.alpha, 0.702)
	assert.ok(row.candidates.length, '半透明值不得再是零候选')
	assert.ok(
		row.candidates.every((c) => c.matchedBy === 'hex-exact' && c.deltaE00 === 0),
		'RGB 逐位相等就是精确档，alpha 不参与档位',
	)
	assert.ok(row.candidates.some((c) => c.cssVar === '--color-surface-default'))
	assert.match(row.note, /alpha 0\.702/)
	assert.match(row.note, /color-mix\(in srgb, var\(选中 token\) 70\.2%, transparent\)/)
})

test('剥 alpha 不动行 id：半透明与不透明仍是两行，只是检索键相同', () => {
	const doc = mapFrom(
		goodCss().replace('background-color: var(--color-surface-default);', 'background-color: #ffffff;') +
			'\n.glass { background-color: rgba(255, 255, 255, 0.7); }\n',
	)
	const opaque = doc.rows.find((r) => r.normalizedValue === '#ffffffff' && r.usage === 'background')
	const glass = doc.rows.find((r) => r.normalizedValue === '#ffffffb3' && r.usage === 'background')
	assert.ok(opaque && glass)
	assert.notEqual(opaque.id, glass.id, 'alpha 不同就是两个值，不许合成一行')
	assert.equal(glass.id, `vm-background-${HEX8('background', '#ffffffb3')}`, '行 id 一个字节不动，否则已填好的表全部 stale')
	assert.equal(opaque.alpha, 1)
	assert.deepEqual(
		glass.candidates.map((c) => c.cssVar).sort(),
		opaque.candidates.map((c) => c.cssVar).sort(),
		'两行的候选来自同一个不透明键',
	)
})

test('全透明不给候选：rgba(0,0,0,0) 的候选空着，备注说清是为什么', () => {
	const doc = mapFrom(goodCss() + '\n.void { background-color: rgba(0, 0, 0, 0); }\n')
	const row = doc.rows.find((r) => r.normalizedValue === '#00000000')
	assert.equal(row.alpha, 0)
	assert.deepEqual(row.candidates, [], '任何 token 在 0% 上都是同一个结果，递过去等于教人换掉「不涂」')
	assert.equal(row.note, '全透明，无候选')
})

test('Markdown 里近邻标出 ΔE，精确档不标', () => {
	const md = renderValueMapMarkdown(mapFrom(goodCss() + '\n.near { background-color: #107b6d; }\n'))
	const line = md.split('\n').find((l) => l.includes('#107b6d'))
	assert.match(line, /（近邻 ΔE 0\.364）/)
	const exactLine = md.split('\n').find((l) => l.includes('rgba') || l.includes('#0F7A6C'))
	if (exactLine) assert.ok(!/近邻/.test(exactLine), '精确命中不得标近邻')
})

test('回灌：accept 一个近邻候选 → 报警 accepted-token-near 带 ΔE，退 0', () => {
	const doc = mapFrom(goodCss() + '\n.near { background-color: #107b6d; }\n')
	const row = doc.rows.find((r) => r.normalizedValue === '#107b6dff')
	const md = fillMarkdownRow(renderValueMapMarkdown(doc), row.id, { token: '--color-primary', verdict: 'accept' })
	const back = readBackValueMap(doc, md)
	assert.equal(back.verdict, 'pass', '近邻 accept 不是违规：判阻断会让这一档白开')
	const warn = back.warnings.find((w) => w.code === 'accepted-token-near')
	assert.ok(warn, '精度损失必须留痕：色表八列固定，加不了 lossy 那样一列，所以走 warnings[]')
	assert.match(warn.reason, /ΔE00 0\.364/)
	assert.equal(back.findings.length, 0)
	assert.equal(back.rows.find((r) => r.id === row.id).acceptedCssVar, '--color-primary')
})

test('回灌：accept 一个半透明行 → 报警 accepted-token-alpha-carrier，点名 color-mix', () => {
	const doc = mapFrom(goodCss() + '\n.glass { background-color: rgba(255, 255, 255, 0.7); }\n')
	const row = doc.rows.find((r) => r.normalizedValue === '#ffffffb3')
	const md = fillMarkdownRow(renderValueMapMarkdown(doc), row.id, { token: '--color-surface-default', verdict: 'accept' })
	const back = readBackValueMap(doc, md)
	assert.equal(back.verdict, 'pass')
	const warn = back.warnings.find((w) => w.code === 'accepted-token-alpha-carrier')
	assert.ok(warn)
	assert.match(warn.reason, /color-mix\(in srgb, var\(--color-surface-default\) 70\.2%, transparent\)/)
	assert.match(warn.reason, /accept-alpha-carrier-missing/, '报警要指出兑现门那一侧会怎么报')
})

test('近邻档不放宽 accept-without-candidate：两档都反查不到仍阻断', () => {
	const doc = mapFrom(mutateCss('background-color: var(--color-primary);', 'background-color: #123456;'))
	const row = doc.rows.find((r) => r.candidates.length === 0)
	const md = fillMarkdownRow(renderValueMapMarkdown(doc), row.id, { verdict: 'accept' })
	const back = readBackValueMap(doc, md)
	assert.equal(back.verdict, 'blocked')
	assert.ok(back.findings.some((f) => f.code === 'accept-without-candidate'))
})

test('阈值是模块级常量，不是 CLI 旗标：门可调就不再守同一件事', () => {
	const src = fs.readFileSync(new URL('../scripts/lib/value-rows.mjs', import.meta.url), 'utf8')
	assert.match(src, /^export const NEAR_DELTA_E00_MAX = 2$/m)
	assert.equal(NEAR_DELTA_E00_MAX, 2)
	for (const name of ['value-map.mjs', 'lint-artifact.mjs']) {
		const cli = fs.readFileSync(path.join(SCRIPTS_DIR, name), 'utf8')
		assert.ok(
			!/--(?:near|delta|deltae|threshold|tolerance)\b/i.test(cli),
			`${name} 不得给近邻阈值开旗标`,
		)
	}
})

test('近邻距离用的是 vendored CIEDE2000，不自备一套色距', () => {
	// 一次性重上色脚本里那份 Lab 欧氏距离不许搬进 skill：两套色距会让同一对颜色在两处判不同档。
	const src = fs.readFileSync(new URL('../scripts/lib/value-rows.mjs', import.meta.url), 'utf8')
	assert.match(src, /import\s*\{[^}]*deltaE00[^}]*\}\s*from\s*['"]\.\.\/vendor\/page-theme-core\/index\.mjs['"]/)
	assert.ok(!/function\s+toLab\b/.test(src), '不得在本模块里自造 Lab 换算')
	assert.ok(!/Math\.hypot\([^)]*\bL\b/.test(src), '不得在本模块里自造色距')
})

test('行为 eval 第 3 条表头是八列，含选中 token', () => {
	const doc = JSON.parse(fs.readFileSync(path.resolve(import.meta.dirname, '..', 'evals', 'evals.json'), 'utf8'))
	const ev = doc.evals.find((e) => e.id === 3)
	assert.ok(ev, 'evals.json 必须有 id 3')
	assert.match(ev.expected_output, /八列/)
	assert.ok(
		ev.assertions.some((a) => a.includes('| id | 源值 | 用途 | 处数 | 候选 token | 选中 token | 裁决 | 备注 |')),
		'第 3 条断言必须锁八列表头，不得再教七列',
	)
})
