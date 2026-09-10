/**
 * 测试共用的落脚点。
 *
 * 一切行为断言都以**冻结 fixture 资产**为输入，不用真实站点资产：后者随重采漂移，
 * 一漂移测试就红，红的原因还跟被测代码无关。fixture 的 URL 走 `.invalid` 顶级域
 * （RFC 2606，永不解析），谁也没法对它重采，所以它是稳定的。
 */

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

export const FIXTURE_ASSET = path.resolve(import.meta.dirname, '..', '..', 'page-theme-workspace', 'fixtures', 'fixture-lanyuan-lab')
export const SCRIPTS_DIR = path.resolve(import.meta.dirname, '..', 'scripts')
const FIXTURES = path.join(import.meta.dirname, 'fixtures')

export const goodHtml = () => fs.readFileSync(path.join(FIXTURES, 'floor-good.html'), 'utf8')
export const goodCss = () => fs.readFileSync(path.join(FIXTURES, 'floor-good.css'), 'utf8')
export const goodTrace = () => JSON.parse(fs.readFileSync(path.join(FIXTURES, 'generate-trace.good.json'), 'utf8'))

export const goodPageHtml = () => fs.readFileSync(path.join(FIXTURES, 'page-good.html'), 'utf8')
export const goodPageCss = () => fs.readFileSync(path.join(FIXTURES, 'page-good.css'), 'utf8')
export const goodPageTrace = () => JSON.parse(fs.readFileSync(path.join(FIXTURES, 'page-good-trace.json'), 'utf8'))

const firstFeatureSection = (html) => {
	const m = html.match(/<section class="pt-feature-grid[\s\S]*?<\/section>/)
	if (!m) throw new Error('页级夹具找不到第一层 feature，cta 打头夹具派生不出来')
	return m[0]
}

const featureGridCssFrom = (css) => {
	const i = css.indexOf('.pt-feature-grid {')
	if (i < 0) throw new Error('页级夹具 CSS 找不到 .pt-feature-grid，cta 打头夹具派生不出来')
	return css.slice(i)
}

/** cta 打头是另一条合格序列，feature 卡与 .pt-feature-grid* 从 page-good 派生，不手抄。 */
export const ctaFirstHtml = () => {
	const band = fs.readFileSync(path.join(FIXTURES, 'fragments', 'cta-band.html'), 'utf8').trimEnd()
	const feature = firstFeatureSection(goodPageHtml()).replace('pt-feature-grid--default', 'pt-feature-grid--muted')
	return `${band}\n${feature}\n`
}

export const ctaFirstCss = () => {
	const band = fs.readFileSync(path.join(FIXTURES, 'fragments', 'cta-band.css'), 'utf8').trimEnd()
	return `${band}\n\n${featureGridCssFrom(goodPageCss())}`
}

export const ctaFirstTrace = () => JSON.parse(fs.readFileSync(path.join(FIXTURES, 'page-cta-first-trace.json'), 'utf8'))

/**
 * 只带产物粒度声明的最小 trace（`R4-15`）。`kind` 传 `null` 得到「给了 trace 却没写 kind」，
 * 那是 `artifact-kind-missing` 的靶子；整个不传 trace 是另一件事，用 `trace: null` 表达。
 */
export const kindTrace = (kind) => ({ schemaVersion: 1, styleSetId: 'fixture-lanyuan-lab', targetVariant: '', artifact: kind === null ? { html: 'x.html', css: [] } : { kind, html: 'x.html', css: [] }, floors: [] })

/**
 * 把合格 CSS 改一处，得到一份只在该处违例的坏 CSS。
 *
 * 坏用例必须从合格产物派生而不是各写一份：手写的「近乎相同」会在改判据时漏同步一半，
 * 于是某道门的失败用例悄悄变成了两处违例，而它本该证明的是「只这一处也会挂」。
 */
export function mutateCss(from, to) {
	const css = goodCss()
	if (!css.includes(from)) throw new Error(`夹具里找不到锚点，坏用例造不出来：${from}`)
	return css.replace(from, to)
}

const mutateText = (src, from, to, label) => {
	if (!src.includes(from)) throw new Error(`${label}里找不到锚点，坏用例造不出来：${from}`)
	return src.replace(from, to)
}

export function mutatePageCss(from, to) {
	return mutateText(goodPageCss(), from, to, '页级夹具 CSS')
}

export function mutatePageHtml(from, to) {
	return mutateText(goodPageHtml(), from, to, '页级夹具 HTML')
}

export function mutateCtaFirstCss(from, to) {
	return mutateText(ctaFirstCss(), from, to, 'cta 打头夹具 CSS')
}

export function mutateCtaFirstHtml(from, to) {
	return mutateText(ctaFirstHtml(), from, to, 'cta 打头夹具 HTML')
}

/** 从合格页 / cta 打头 trace 派生，不手写第二份。 */
export function mutatePageTrace(fn) {
	const t = structuredClone(goodPageTrace())
	fn(t)
	return t
}

export function mutateCtaFirstTrace(fn) {
	const t = structuredClone(ctaFirstTrace())
	fn(t)
	return t
}

/**
 * 布局包络的夹具与「把它装进一份可改的资产拷贝」。
 *
 * 冻结 fixture 资产**自带一份** `layout-envelope.json`（`R4-10`：包络升进准入 `REQUIRED_FILES`
 * 之后，一份过不了准入的 fixture 就不配当本包的正例；那一份是采集侧 `build-envelope.mjs` 从
 * fixture 自己的 `patterns/` 投影出来的，不是手写）。但门要判的输入不是它——fixture 的包络
 * 与本包夹具页不是配套的，所以要判这道门的用例仍自己拷一份资产、把**夹具包络**写进去；要造
 * 「缺包络」那一支的用例，拷一份再删掉它。
 *
 * 夹具本体是 `fixtures/layout-envelope.fixture.json`，与 page-theme-audit 那份逐字节相同
 * （`copied-layout-envelope.test.mjs` 锁着）：两侧喂同一份包络，才谈得上「同一份越界产物两侧
 * 同样退 1」。
 */
export const LAYOUT_ENVELOPE_FIXTURE = path.join(FIXTURES, 'layout-envelope.fixture.json')

export const layoutEnvelopeFixture = () => JSON.parse(fs.readFileSync(LAYOUT_ENVELOPE_FIXTURE, 'utf8'))

/** 把包络写进某份资产目录；`mutate` 用来造「包络本身不对」这类输入。 */
export function writeLayoutEnvelope(assetDir, mutate) {
	const doc = layoutEnvelopeFixture()
	if (mutate) mutate(doc)
	fs.writeFileSync(path.join(assetDir, 'layout-envelope.json'), JSON.stringify(doc, null, 2))
	return doc
}

/** 改一处 `floor-index.json`，用来造「资产漂移了，包络还在原地」这类输入。 */
export function patchFloorIndex(assetDir, mutate) {
	const file = path.join(assetDir, 'floor-index.json')
	const doc = JSON.parse(fs.readFileSync(file, 'utf8'))
	mutate(doc, new Map(doc.floors.map((f) => [f.id, f])))
	fs.writeFileSync(file, JSON.stringify(doc, null, 2))
	return doc
}

/** 造一个临时目录并在测试结束时删掉。用于「资产残缺」「图被截断」这类必须落盘的输入。 */
export function tempDir(t, prefix = 'page-theme-generate-') {
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix))
	t.after(() => fs.rmSync(dir, { recursive: true, force: true }))
	return dir
}

/**
 * 把 fixture 资产拷一份到临时目录，供「删掉某个必交件」这类破坏性输入使用。
 *
 * 不用 `fs.cpSync`：在用户名含非 ASCII 字符的 Windows 临时路径上，它会抛
 * `EIO / Access is denied`。报错文本看着像权限问题，实际是它内部那条 `\\?\` 长路径的
 * 处理，改权限或换目标都没用，只能不走它。逐文件拷不受影响。
 */
export function copyFixtureAsset(t) {
	const dest = path.join(tempDir(t, 'page-theme-asset-'), 'asset')
	copyDir(FIXTURE_ASSET, dest)
	return dest
}

/**
 * 把一张图按「随资产进 git 的缩略图」那一套装进资产：落盘 + 在 `screenshots/index.json`
 * 的 `thumb` 一列登记。
 *
 * 两步分开是有用的：读图门只认 `thumb` 那一列，所以「图在资产里但没登记」这类坏用例
 * 必须能单独造出来——直接 `writeFileSync` 就是那一份坏用例。
 */
export function shipThumb(assetDir, rel, buf) {
	const file = path.join(assetDir, rel)
	fs.mkdirSync(path.dirname(file), { recursive: true })
	fs.writeFileSync(file, buf)

	const indexFile = path.join(assetDir, 'screenshots', 'index.json')
	let doc
	try {
		doc = JSON.parse(fs.readFileSync(indexFile, 'utf8'))
	} catch {
		doc = { schemaVersion: 1, items: [] }
	}
	doc.items.push({ path: rel.replace(/\.[a-z]+$/i, '.png'), thumb: rel, kind: 'floor' })
	fs.mkdirSync(path.dirname(indexFile), { recursive: true })
	fs.writeFileSync(indexFile, JSON.stringify(doc, null, 2))
	return rel
}

/**
 * 造一份「多页多型」的临时合成资产，只含大纲阶段要读的那两个文件。
 *
 * 为什么不扩冻结 fixture：它只有 1 页 1 型，两两共现计数全是 1、排不出高低，也造不出
 * 「需求撞不上任何骨架型」——几乎任何落地页都会撞上 `sk-landing`。而扩它就动了行为 eval 的
 * 可复现基线：那份资产之所以能当基线，正因为它一个字都不变。所以共现回退这条路走合成资产，
 * 冻结 fixture 继续只管「骨架选中」那条路。
 *
 * 楼层条目从 fixture 的真实条目派生（只改 id / taxonomy / source），不手写一份精简形状——
 * 手写的会随投影函数漂移，漂了测试还是绿的，那时它证明的就不再是真资产上的行为。
 */
export function syntheticAsset(t, { floors, skeletons = [], pages = {}, layers = ['L1', 'L2'] }) {
	const dir = path.join(tempDir(t, 'page-theme-outline-'), 'asset')
	const template = JSON.parse(fs.readFileSync(path.join(FIXTURE_ASSET, 'floor-index.json'), 'utf8'))

	fs.mkdirSync(path.join(dir, 'patterns'), { recursive: true })
	fs.writeFileSync(
		path.join(dir, 'floor-index.json'),
		JSON.stringify(
			{
				...template,
				styleSetId: 'synthetic',
				floors: floors.map((f) => ({ ...template.floors[0], ...f, labelZh: f.labelZh ?? `${f.taxonomy} 楼层`, summary: f.summary ?? `${f.taxonomy} 的关键内容点` })),
				skeletons,
			},
			null,
			2,
		),
	)

	const pageYaml = Object.entries(pages)
		.map(([id, taxonomies]) => {
			const steps = taxonomies.map((tx, at) => `      - { id: ${id}-${at}, pattern: ${tx}.only, taxonomy: ${tx}, label_zh: ${tx} }`).join('\n')
			return `  ${id}:\n    url: https://synthetic.invalid/${id}\n    title_zh: ${id}\n    sequence:\n${steps}`
		})
		.join('\n')
	fs.writeFileSync(path.join(dir, 'patterns', 'index.yaml'), `schema_version: 1\nstyle_set_id: synthetic\ntaxonomy_layers: [${layers.join(', ')}]\npages:\n${pageYaml}\n`)
	return dir
}

function copyDir(from, to) {
	fs.mkdirSync(to, { recursive: true })
	for (const e of fs.readdirSync(from, { withFileTypes: true })) {
		const src = path.join(from, e.name)
		const dst = path.join(to, e.name)
		if (e.isDirectory()) copyDir(src, dst)
		else fs.copyFileSync(src, dst)
	}
}
