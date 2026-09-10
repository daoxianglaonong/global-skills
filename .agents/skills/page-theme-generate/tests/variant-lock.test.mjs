/**
 * 门九（variant-lock）：体检判疑似多套设计语言时必须显式 targetVariant；词表外的名字不许编；
 * 照着哪条来源 URL 做的必须点名且点得到；一页之内不得混用多个 variant 的页壳条目。
 *
 * 接线用例夹在各段末尾：只单独调 `gateVariantLock` 不算把门装上。
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { lintFloor } from '../scripts/lint-floor.mjs'
import { gateVariantLock, runAllGates } from '../scripts/lib/gates.mjs'
import {
	MIXED_COHESION,
	hostsOfVariant,
	readChromeMounts,
	readCoverage,
	readVariantSources,
	resolveMountPattern,
	sourceVocabulary,
	variantVocabulary,
} from '../scripts/lib/variant-lock.mjs'
import { copyFixtureAsset, FIXTURE_ASSET, goodPageCss, goodPageHtml, goodPageTrace, tempDir } from './helpers.mjs'

const COVERAGE_BLOCK = `coverage:
  pages:
    - pageId: home
      url: https://www.lanyuan-lab.invalid/
      finalUrl: https://www.lanyuan-lab.invalid/
      variant: ""
    - pageId: orchard
      url: https://orchard.lanyuan-lab.invalid/
      finalUrl: https://orchard.lanyuan-lab.invalid/
      variant: orchard
  cohesion:
    verdict: mixed-suspected
    divergences: []
    suggestedSplit: []
`

const CHROME_VARIANTS = `chrome:
  navbar:
    default: navbar.utility-left
    variants:
      - hosts: [orchard.lanyuan-lab.invalid]
        pattern: navbar.orchard-brand
  footer: footer.compact-three
`

/** 把页级夹具的顶栏层根换成另一个型。换不掉就抛：换不掉时下面那条放行用例会静默变成错位用例。 */
function replaceNavbar(html, pattern) {
	const out = html.replace('data-pattern="navbar.utility-left"', `data-pattern="${pattern}"`)
	if (out === html) throw new Error('页级夹具里找不到 navbar.utility-left 层根')
	return out
}

/** 在 fixture 拷贝上补 coverage 与 chrome variant 挂载，供本门专用。 */
function stageVariantAsset(t) {
	const dir = copyFixtureAsset(t)
	const readme = fs.readFileSync(path.join(dir, 'README.md'), 'utf8')
	if (!readme.includes('```yaml')) {
		fs.appendFileSync(path.join(dir, 'README.md'), `\n\`\`\`yaml\n${COVERAGE_BLOCK}\n\`\`\`\n`)
	}
	const indexPath = path.join(dir, 'patterns', 'index.yaml')
	const index = fs.readFileSync(indexPath, 'utf8').replace(
		/^chrome:[\s\S]*?(?=page_skeletons:)/m,
		`${CHROME_VARIANTS}\n`,
	)
	fs.writeFileSync(indexPath, index)
	return dir
}

/**
 * 来源那两条 code 专用的 coverage：记了 `sourceId`，体检 `cohesive`、两页都是 default。
 *
 * 与 `COVERAGE_BLOCK` 分开写，是为了让来源的失败输入**独占**——那份带 `mixed-suspected` 与
 * `orchard`，拿它当底座时一份 trace 会同时亮 variant 与 source 两半，验不出「只这一处也会挂」。
 */
const COVERAGE_WITH_SOURCES = `coverage:
  pages:
    - pageId: home
      sourceId: source-01
      url: https://www.lanyuan-lab.invalid/
      finalUrl: https://www.lanyuan-lab.invalid/
      variant: ""
    - pageId: pricing
      sourceId: source-02
      url: https://www.lanyuan-lab.invalid/pricing
      finalUrl: https://www.lanyuan-lab.invalid/pricing
      variant: ""
  cohesion:
    verdict: cohesive
    divergences: []
    suggestedSplit: []
`

/** 只补一份带 sourceId 的 coverage，不动页壳挂载点：来源与页壳无关，混着装同样验不出独占。 */
function stageSourceAsset(t) {
	const dir = copyFixtureAsset(t)
	fs.appendFileSync(path.join(dir, 'README.md'), `\n\`\`\`yaml\n${COVERAGE_WITH_SOURCES}\n\`\`\`\n`)
	return dir
}

const traceWith = (targetVariant) => ({ ...goodPageTrace(), targetVariant })

const traceFrom = (sourceId) => ({ ...goodPageTrace(), targetVariant: '', sourceId })

test('readCoverage 从 README 围栏抠出 coverage', (t) => {
	const dir = stageVariantAsset(t)
	const cov = readCoverage(dir)
	assert.equal(cov.cohesion.verdict, MIXED_COHESION)
	assert.equal(variantVocabulary(cov).size, 1)
	assert.ok(variantVocabulary(cov).has('orchard'))
})

test('resolveMountPattern 无匹配回退 default', () => {
	const mount = {
		defaultPattern: 'navbar.utility-left',
		variants: [{ hosts: ['orchard.lanyuan-lab.invalid'], pattern: 'navbar.orchard-brand' }],
	}
	assert.equal(resolveMountPattern(mount, new Set(['www.example.com'])), 'navbar.utility-left')
	assert.equal(resolveMountPattern(mount, new Set(['orchard.lanyuan-lab.invalid'])), 'navbar.orchard-brand')
})

test('无 trace 或 assetDir 时整门不开口', () => {
	assert.deepEqual(gateVariantLock({ trace: null, assetDir: '/tmp/x' }), [])
	assert.deepEqual(gateVariantLock({ trace: goodPageTrace(), assetDir: null }), [])
})

test('mixed-suspected 而 targetVariant 留空会挂', (t) => {
	const dir = stageVariantAsset(t)
	const findings = gateVariantLock({ trace: traceWith(''), assetDir: dir, html: goodPageHtml() })
	assert.deepEqual(
		findings.map((f) => f.code),
		['variant-undeclared'],
	)
	assert.match(findings[0].reason, /mixed-suspected/)
})

test('词表外的 targetVariant 会挂', (t) => {
	const dir = stageVariantAsset(t)
	const findings = gateVariantLock({ trace: traceWith('about-light'), assetDir: dir, html: goodPageHtml() })
	assert.deepEqual(
		findings.map((f) => f.code),
		['variant-unknown'],
	)
	assert.match(findings[0].reason, /about-light/)
})

test('声明 orchard 却用了 default 顶栏会挂', (t) => {
	const dir = stageVariantAsset(t)
	const findings = gateVariantLock({ trace: traceWith('orchard'), assetDir: dir, html: goodPageHtml() })
	assert.deepEqual(
		findings.map((f) => f.code),
		['chrome-variant-mismatch'],
	)
	assert.match(findings[0].reason, /navbar/)
})

test('声明 orchard 且顶栏 pattern 对上则放行', (t) => {
	const dir = stageVariantAsset(t)
	// 页级夹具自 `R4-13` 起自带 `navbar.utility-left`，所以这里是**换掉**它而不是再往前插一个
	// 顶栏：插一个会让页上同时挂两个 navbar 层根，`chrome-variant-mismatch` 照旧亮，验的就不是放行了。
	const html = replaceNavbar(goodPageHtml(), 'navbar.orchard-brand')
	assert.deepEqual(gateVariantLock({ trace: traceWith('orchard'), assetDir: dir, html }), [])
})

test('sourceVocabulary 只收非空 sourceId', () => {
	const cov = { pages: [{ sourceId: 'source-01' }, { sourceId: '  ' }, { sourceId: 'source-01' }, {}] }
	assert.deepEqual([...sourceVocabulary(cov)], ['source-01'])
	assert.equal(sourceVocabulary(null).size, 0)
})

test('资产记着来源而 trace 没点名 sourceId 会挂', (t) => {
	const dir = stageSourceAsset(t)
	const findings = gateVariantLock({ trace: traceFrom(undefined), assetDir: dir, html: goodPageHtml() })
	assert.deepEqual(
		findings.map((f) => f.code),
		['source-id-undeclared'],
	)
	assert.match(findings[0].reason, /source-01/)
})

test('词表外的 sourceId 会挂', (t) => {
	const dir = stageSourceAsset(t)
	const findings = gateVariantLock({ trace: traceFrom('source-99'), assetDir: dir, html: goodPageHtml() })
	assert.deepEqual(
		findings.map((f) => f.code),
		['source-id-unknown'],
	)
	assert.equal(findings[0].sourceId, 'source-99')
})

test('点名资产里有的 sourceId 则放行', (t) => {
	const dir = stageSourceAsset(t)
	assert.deepEqual(gateVariantLock({ trace: traceFrom('source-02'), assetDir: dir, html: goodPageHtml() }), [])
})

test('coverage 没记 sourceId 时来源两条都不开口', (t) => {
	const dir = stageVariantAsset(t)
	// 顶栏要换成 orchard 的：夹具自 `R4-13` 起自带 default 顶栏，不换会先挂 `chrome-variant-mismatch`，
	// 那就验不出「来源两条不开口」。
	const html = replaceNavbar(goodPageHtml(), 'navbar.orchard-brand')
	assert.deepEqual(gateVariantLock({ trace: traceWith('orchard'), assetDir: dir, html }), [])
})

test('接线：lintFloor 能报 source-id-undeclared', (t) => {
	const dir = stageSourceAsset(t)
	const r = lintFloor({ assetDir: dir, html: goodPageHtml(), css: [goodPageCss()], trace: traceFrom(undefined) })
	assert.equal(r.verdict, 'blocked')
	assert.ok(r.findings.some((f) => f.code === 'source-id-undeclared'))
})

test('接线：runAllGates 会带上 source-id-unknown', (t) => {
	const dir = stageSourceAsset(t)
	const closedSet = JSON.parse(fs.readFileSync(path.join(dir, 'closed-set.json'), 'utf8'))
	const findings = runAllGates({
		declarations: [],
		closedSet,
		trace: traceFrom('source-99'),
		assetDir: dir,
		html: goodPageHtml(),
	}).filter((f) => f.gate === 'variant-lock')
	assert.deepEqual(
		findings.map((f) => f.code),
		['source-id-unknown'],
	)
})

test('coverage 块解不开时报 variant-source-unreadable', (t) => {
	const dir = copyFixtureAsset(t)
	fs.appendFileSync(path.join(dir, 'README.md'), '\n```yaml\ncoverage: [\n```\n')
	const findings = gateVariantLock({ trace: traceWith('orchard'), assetDir: dir, html: goodPageHtml() })
	assert.deepEqual(
		findings.map((f) => f.code),
		['variant-source-unreadable'],
	)
})

test('接线：lintFloor 能报 variant-undeclared', (t) => {
	const dir = stageVariantAsset(t)
	const r = lintFloor({ assetDir: dir, html: goodPageHtml(), css: [goodPageCss()], trace: traceWith('') })
	assert.equal(r.verdict, 'blocked')
	assert.ok(r.findings.some((f) => f.code === 'variant-undeclared'))
})

test('接线：runAllGates 会带上 variant-undeclared', (t) => {
	const dir = stageVariantAsset(t)
	const closedSet = JSON.parse(fs.readFileSync(path.join(dir, 'closed-set.json'), 'utf8'))
	const findings = runAllGates({
		declarations: [],
		closedSet,
		trace: traceWith(''),
		assetDir: dir,
		html: goodPageHtml(),
	}).filter((f) => f.gate === 'variant-lock')
	assert.deepEqual(
		findings.map((f) => f.code),
		['variant-undeclared'],
	)
})

test('cohesive 资产允许 targetVariant 留空', (t) => {
	const dir = copyFixtureAsset(t)
	fs.appendFileSync(
		path.join(dir, 'README.md'),
		`\n\`\`\`yaml\n${COVERAGE_BLOCK.replace('mixed-suspected', 'cohesive')}\n\`\`\`\n`,
	)
	assert.deepEqual(gateVariantLock({ trace: traceWith(''), assetDir: dir, html: goodPageHtml() }), [])
})

test('冻结夹具无 coverage 时 variant-undeclared 不开口', () => {
	assert.deepEqual(gateVariantLock({ trace: traceWith(''), assetDir: FIXTURE_ASSET, html: goodPageHtml() }), [])
})

test('hostsOfVariant 按 finalUrl 取 host', (t) => {
	const dir = stageVariantAsset(t)
	const { coverage } = readVariantSources(dir)
	assert.deepEqual([...hostsOfVariant(coverage, 'orchard')], ['orchard.lanyuan-lab.invalid'])
})

test('readChromeMounts 读出 variant 挂载候选', (t) => {
	const dir = stageVariantAsset(t)
	const mounts = readChromeMounts(dir)
	const navbar = mounts.find((m) => m.mount === 'navbar')
	assert.ok(navbar.candidates.has('navbar.utility-left'))
	assert.ok(navbar.candidates.has('navbar.orchard-brand'))
})
