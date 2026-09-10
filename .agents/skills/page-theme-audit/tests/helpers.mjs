/**
 * 测试共用的落脚点。
 *
 * 一切行为断言都以**冻结 fixture 资产**为输入，不用真实站点资产：后者随重采漂移，
 * 一漂移测试就红，红的原因还跟被测代码无关。fixture 的 URL 走 `.invalid` 顶级域
 * （RFC 2606，永不解析），谁也没法对它重采，所以它是稳定的。
 *
 * 冻结 fixture 一个字节都不动。坏输入一律整份拷到临时目录再改一处。
 */

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

export const FIXTURE_ASSET = path.resolve(import.meta.dirname, '..', '..', 'page-theme-workspace', 'fixtures', 'fixture-lanyuan-lab')
export const GENERATE_LIB = path.resolve(import.meta.dirname, '..', '..', 'page-theme-generate', 'scripts', 'lib')
export const SCRIPTS_DIR = path.resolve(import.meta.dirname, '..', 'scripts')
export const AUDIT_LIB = path.join(SCRIPTS_DIR, 'lib')
const FIXTURES = path.join(import.meta.dirname, 'fixtures')

/**
 * 从 generate 整文件拷来的 helper。后两份是 R4-06 的包络门带进来的：判据整份同源，
 * 层根解析也必须是同一份（两包各写一个 `data-pattern` 解析器 = 两套口径，同一份产物会得出
 * 不同的层根序列，「同一份越界产物两侧同样退 1」当场失效）。
 */
export const COPIED_HELPERS = ['css-scan.mjs', 'closed-set.mjs', 'image-probe.mjs', 'source-shape.mjs', 'paint-floors.mjs', 'layout-envelope-gate.mjs']

/** 前六道门从 generate 的 gates.mjs 抠出来逐字对照。整文件不能拷（那边还带着 outline / sequence-approval）。 */
export const COPIED_GATE_FNS = [
	'gateColorLiteral',
	'gateFontStack',
	'gateVarInClosedSet',
	'gatePrimitiveLeak',
	'gateUnresolvedVar',
	'gateImageEvidence',
]
export const COPIED_GATE_CONSTS = ['COLOR_EXEMPT', 'FONT_EXEMPT', 'CSS_NAMED_COLORS']

const lf = (s) => String(s).replace(/\r\n/g, '\n')

/**
 * 抠出 `function name(...) { ... }`（含可选 `export`），跳过默认参数里的 `{}`。
 * 换行归一成 LF：git 在 Windows 上会把 generate 那份转成 CRLF，判据不该跟着漂。
 */
export function extractFunctionSource(src, name) {
	const re = new RegExp(`(?:export\\s+)?function\\s+${name}\\s*\\(`)
	const m = re.exec(src)
	if (!m) throw new Error(`function ${name} 找不到`)
	let depth = 0
	let inParams = false
	for (let j = m.index; j < src.length; j++) {
		const c = src[j]
		if (c === '(') {
			depth++
			inParams = true
		} else if (c === ')') {
			depth--
			if (inParams && depth === 0) {
				const brace = src.indexOf('{', j)
				if (brace < 0) throw new Error(`function ${name} 没有函数体`)
				let d = 0
				for (let k = brace; k < src.length; k++) {
					if (src[k] === '{') d++
					else if (src[k] === '}') {
						d--
						if (d === 0) return lf(src.slice(m.index, k + 1))
					}
				}
				throw new Error(`function ${name} 函数体括号不配对`)
			}
		}
	}
	throw new Error(`function ${name} 参数列表没结束`)
}

/**
 * 抠出 `const name = ...` 到语句结束。生成侧这几份常量没有分号，靠深度归零后的换行收尾。
 */
export function extractConstSource(src, name) {
	const re = new RegExp(`(?:export\\s+)?const\\s+${name}\\s*=`)
	const m = re.exec(src)
	if (!m) throw new Error(`const ${name} 找不到`)
	let depth = 0
	let started = false
	for (let j = src.indexOf('=', m.index) + 1; j < src.length; j++) {
		const c = src[j]
		if (c === '(' || c === '[' || c === '{') {
			depth++
			started = true
		} else if (c === ')' || c === ']' || c === '}') {
			depth--
		} else if (c === ';' && depth === 0) {
			return lf(src.slice(m.index, j + 1))
		} else if ((c === '\n' || c === '\r') && depth === 0 && started) {
			return lf(src.slice(m.index, j))
		}
	}
	throw new Error(`const ${name} 没有收尾`)
}

export const goodHtml = () => fs.readFileSync(path.join(FIXTURES, 'artifact-good.html'), 'utf8')
export const goodCss = () => fs.readFileSync(path.join(FIXTURES, 'artifact-good.css'), 'utf8')
export const goodTrace = () => JSON.parse(fs.readFileSync(path.join(FIXTURES, 'generate-trace.good.json'), 'utf8'))

/**
 * 只带产物粒度声明的最小 trace（`R4-15`）。`kind` 传 `null` 得到「给了 trace 却没写 kind」，
 * 那是 `artifact-kind-missing` 的靶子；整个不传 trace 是另一件事，用 `trace: null` 表达。
 * 与 generate 侧同名 helper 形状一致，两侧喂同一批字节才谈得上「同样退 1」。
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

export function mutateHtml(from, to) {
	const html = goodHtml()
	if (!html.includes(from)) throw new Error(`夹具里找不到锚点，坏用例造不出来：${from}`)
	return html.replace(from, to)
}

/**
 * 布局包络的夹具与「把它装进一份可改的资产拷贝」。
 *
 * 冻结 fixture 资产**自带一份** `layout-envelope.json`（`R4-10` 把包络升进生成侧准入
 * `REQUIRED_FILES` 之后补的，由采集侧 `build-envelope.mjs` 从 fixture 自己的 `patterns/` 投影，
 * 不是手写）。但它与本包夹具页不配套，所以要判这道门的用例仍自己拷一份资产、把**夹具包络**
 * 写进去；要造「缺包络」那一支的用例，拷一份再删掉它。夹具与 page-theme-generate 那份逐字节
 * 相同（`copied-helpers.test.mjs` 锁着）：两侧喂同一份包络，才谈得上「同一份越界产物两侧同样退 1」。
 */
export const LAYOUT_ENVELOPE_FIXTURE = path.join(FIXTURES, 'layout-envelope.fixture.json')

export const layoutEnvelopeFixture = () => JSON.parse(fs.readFileSync(LAYOUT_ENVELOPE_FIXTURE, 'utf8'))

export function writeLayoutEnvelope(assetDir, mutate) {
	const doc = layoutEnvelopeFixture()
	if (mutate) mutate(doc)
	fs.writeFileSync(path.join(assetDir, 'layout-envelope.json'), JSON.stringify(doc, null, 2))
	return doc
}

export function patchFloorIndex(assetDir, mutate) {
	const file = path.join(assetDir, 'floor-index.json')
	const doc = JSON.parse(fs.readFileSync(file, 'utf8'))
	mutate(doc, new Map(doc.floors.map((f) => [f.id, f])))
	fs.writeFileSync(file, JSON.stringify(doc, null, 2))
	return doc
}

/** 造一个临时目录并在测试结束时删掉。用于「资产残缺」「图被截断」这类必须落盘的输入。 */
export function tempDir(t, prefix = 'page-theme-audit-') {
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix))
	t.after(() => fs.rmSync(dir, { recursive: true, force: true }))
	return dir
}

/**
 * 把 fixture 资产拷一份到临时目录，供「删掉某个必交件」这类破坏性输入使用。
 *
 * 不用 `fs.cpSync`：在用户名含非 ASCII 字符的 Windows 临时路径上，它会抛
 * `EIO / Access is denied`。报错文本看着像权限问题，实际是它内部那条 `\\?\\` 长路径的
 * 处理，改权限或换目标都没用，只能不走它。逐文件拷不受影响。
 */
export function copyFixtureAsset(t) {
	const dest = path.join(tempDir(t, 'page-theme-audit-asset-'), 'asset')
	copyDir(FIXTURE_ASSET, dest)
	return dest
}

/**
 * 把一张图按「随资产进 git 的缩略图」那一套装进资产：落盘 + 在 `screenshots/index.json`
 * 的 `thumb` 一列登记。
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

export function writeArtifact(dir, { html = goodHtml(), css = goodCss(), htmlName = 'index.html', cssName = 'index.css' } = {}) {
	fs.mkdirSync(dir, { recursive: true })
	const htmlFile = path.join(dir, htmlName)
	const cssFile = path.join(dir, cssName)
	fs.writeFileSync(htmlFile, html)
	fs.writeFileSync(cssFile, css)
	return { dir, htmlFile, cssFile }
}

export function copyDir(from, to) {
	fs.mkdirSync(to, { recursive: true })
	for (const e of fs.readdirSync(from, { withFileTypes: true })) {
		const src = path.join(from, e.name)
		const dst = path.join(to, e.name)
		if (e.isDirectory()) copyDir(src, dst)
		else fs.copyFileSync(src, dst)
	}
}
