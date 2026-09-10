/**
 * 读图 trace 门：非 `high` 档字段若声称读图确认过，必须指名具体字段 + 具体图像文件，
 * 且那张图必须真的在资产里、真的解得开。
 *
 * 本门那条「真会挂的输入」：指名一张资产里不存在的图。
 *
 * 与生成侧只差一处：资产目录是必给项，缺了硬失败，不静默跳过这道门。
 * 不给 --trace 时本门不开口，报告里那一行写 status: "no-input"。
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { gateImageEvidence, isIgnored } from '../scripts/lib/gates.mjs'
import { decodeImage, probeImageFile, ImageProbeError } from '../scripts/lib/image-probe.mjs'
import { lintArtifact } from '../scripts/lint-artifact.mjs'
import { FIXTURE_ASSET, goodHtml, goodCss, goodTrace, copyFixtureAsset, shipThumb, tempDir, writeArtifact, SCRIPTS_DIR } from './helpers.mjs'

// `artifact.kind` 是 `R4-15` 之后 trace 的必写项：不写，包络门先报 `artifact-kind-missing`，
// 本文件那几条「只该亮读图门」的断言就会验成两道门。产物是单层楼层，故声明 floor。
const traceWith = (field) => ({ artifact: { kind: 'floor' }, floors: [{ id: 'feature.grid-3-cards', fields: [field] }] })

const REAL_PNG = Buffer.from(
	'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
	'base64',
)

const PNG_SIG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
const be32 = (n) => {
	const b = Buffer.alloc(4)
	b.writeUInt32BE(n)
	return b
}
const pngChunk = (type, data = Buffer.alloc(0)) => Buffer.concat([be32(data.length), Buffer.from(type, 'latin1'), data, Buffer.alloc(4)])
const ihdrData = (w, h) => {
	const d = Buffer.alloc(13)
	d.writeUInt32BE(w, 0)
	d.writeUInt32BE(h, 4)
	d[8] = 8
	d[9] = 6
	return d
}
const buildPng = (...chunks) => Buffer.concat([PNG_SIG, ...chunks])
const IHDR_1x1 = pngChunk('IHDR', ihdrData(1, 1))
const IDAT_STUB = pngChunk('IDAT', Buffer.from([0x78, 0x9c, 0x63, 0x00, 0x00, 0x00, 0x02, 0x00, 0x01]))

const REAL_JPEG = Buffer.concat([
	Buffer.from([0xff, 0xd8]),
	Buffer.from([0xff, 0xe0, 0x00, 0x10]),
	Buffer.from('JFIF\0\x01\x01\0\0\x01\0\x01\0\0', 'latin1'),
	Buffer.from([0xff, 0xc0, 0x00, 0x11, 0x08, 0x00, 0x02, 0x00, 0x03, 0x03, 0x01, 0x22, 0x00, 0x02, 0x11, 0x01, 0x03, 0x11, 0x01]),
	Buffer.from([0xff, 0xd9]),
])

const lintWith = ({ assetDir = FIXTURE_ASSET, trace, hasTrace } = {}) =>
	lintArtifact({
		assetDir,
		files: [
			{ file: 'floor.html', text: goodHtml() },
			{ file: 'floor.css', text: goodCss() },
		],
		trace,
		hasTrace,
	})

test('合格 trace 不亮门', () => {
	const findings = gateImageEvidence(goodTrace(), FIXTURE_ASSET)
	assert.deepEqual(findings, [], '本资产无采集运行，合格 trace 里一条读图声称都不该有，门因此静默通过')
})

test('声称读图但指名的图不存在 → 挂', () => {
	const findings = gateImageEvidence(
		traceWith({ field: 'variant.columns', confidence: 'medium', imageConfirmed: true, image: 'screenshots/home/floors/pc--sec-03.jpg' }),
		FIXTURE_ASSET,
	)
	assert.equal(findings.length, 1)
	assert.equal(findings[0].gate, 'image-evidence')
	assert.equal(findings[0].code, 'image-missing')
	assert.equal(findings[0].field, 'variant.columns')
})

test('声称读图但没指名是哪张图 → 挂', () => {
	const findings = gateImageEvidence(traceWith({ field: 'variant.columns', confidence: 'medium', imageConfirmed: true }), FIXTURE_ASSET)
	assert.equal(findings.length, 1)
	assert.match(findings[0].reason, /没指名是哪张图/)
})

test('声称读图但没指名是哪个字段 → 挂', () => {
	const findings = gateImageEvidence(traceWith({ confidence: 'medium', imageConfirmed: true, image: 'a.jpg' }), FIXTURE_ASSET)
	assert.equal(findings.length, 1)
	assert.match(findings[0].reason, /没指名是哪个字段/)
})

test('图存在但是一坨解不开的字节 → 挂', (t) => {
	const dir = copyFixtureAsset(t)
	shipThumb(dir, 'screenshots/floors/pc--sec-03.png', REAL_PNG.subarray(0, 10))

	const findings = gateImageEvidence(
		traceWith({ field: 'container.max_width_px', confidence: 'medium', imageConfirmed: true, image: 'screenshots/floors/pc--sec-03.png' }),
		dir,
	)
	assert.equal(findings.length, 1)
	assert.equal(findings[0].code, 'image-truncated')
})

test('图真的解得开、且登记在 thumb 一列 → 放行', (t) => {
	const dir = copyFixtureAsset(t)
	shipThumb(dir, 'screenshots/floors/pc--sec-03.jpg', REAL_JPEG)

	const findings = gateImageEvidence(
		traceWith({ field: 'container.max_width_px', confidence: 'medium', imageConfirmed: true, image: 'screenshots/floors/pc--sec-03.jpg' }),
		dir,
	)
	assert.deepEqual(findings, [])
})

test('图在资产里，但不在 index 的 thumb 一列 → 挂', (t) => {
	const dir = copyFixtureAsset(t)
	shipThumb(dir, 'screenshots/floors/pc--sec-03.jpg', REAL_JPEG)
	const orphan = path.join(dir, 'screenshots', 'floors', 'pc--sec-03.png')
	fs.writeFileSync(orphan, REAL_PNG)

	const findings = gateImageEvidence(
		traceWith({ field: 'container.max_width_px', confidence: 'medium', imageConfirmed: true, image: 'screenshots/floors/pc--sec-03.png' }),
		dir,
	)
	assert.equal(findings.length, 1)
	assert.equal(findings[0].code, 'image-not-in-index')
})

test('资产没有 screenshots/index.json → 声称读图就挂', (t) => {
	const dir = copyFixtureAsset(t)
	const img = path.join(dir, 'screenshots', 'floors', 'pc--sec-03.jpg')
	fs.mkdirSync(path.dirname(img), { recursive: true })
	fs.writeFileSync(img, REAL_JPEG)

	const findings = gateImageEvidence(
		traceWith({ field: 'container.max_width_px', confidence: 'medium', imageConfirmed: true, image: 'screenshots/floors/pc--sec-03.jpg' }),
		dir,
	)
	assert.equal(findings.length, 1)
	assert.equal(findings[0].code, 'screenshots-index-missing')
})

test('图在资产内但不在 screenshots/ 下 → 挂', (t) => {
	const dir = copyFixtureAsset(t)
	fs.writeFileSync(path.join(dir, 'cover.png'), REAL_PNG)

	const findings = gateImageEvidence(traceWith({ field: 'rhythm.surface', confidence: 'medium', imageConfirmed: true, image: 'cover.png' }), dir)
	assert.equal(findings.length, 1)
	assert.equal(findings[0].code, 'image-outside-screenshots', '读图证据只能指采集截图')
})

test('指名一张不随资产进 git 的图 → 挂', (t) => {
	const dir = copyFixtureAsset(t)
	shipThumb(dir, 'screenshots/home/pc--viewport.png', REAL_PNG)
	fs.writeFileSync(path.join(dir, 'screenshots', '.gitignore'), '# 只有缩略图随迁\n*.png\n')

	const findings = gateImageEvidence(
		traceWith({ field: 'rhythm.surface', confidence: 'medium', imageConfirmed: true, image: 'screenshots/home/pc--viewport.png' }),
		dir,
	)
	assert.equal(findings.length, 1)
	assert.match(findings[0].reason, /不随资产进 git/, '本地原图是采集期内部字段，资产搬走后必然指空')
})

test('图像引用指到资产目录之外 → 挂', () => {
	const findings = gateImageEvidence(
		traceWith({ field: 'variant.columns', confidence: 'medium', imageConfirmed: true, image: '../../../somewhere/else.png' }),
		FIXTURE_ASSET,
	)
	assert.equal(findings.length, 1)
	assert.match(findings[0].reason, /资产目录之外/)
})

test('high 档字段不在本门射程内', () => {
	const findings = gateImageEvidence(traceWith({ field: 'rhythm.surface', confidence: 'high', imageConfirmed: true, image: 'nope.png' }), FIXTURE_ASSET)
	assert.deepEqual(findings, [])
})

test('没声称读图就不要求指图', () => {
	const findings = gateImageEvidence(traceWith({ field: 'variant.columns', confidence: 'medium', imageConfirmed: false }), FIXTURE_ASSET)
	assert.deepEqual(findings, [], '门验的是声称与实物对不对得上，不是逼着每个字段都去读图')
})

test('不给 trace 时 image-evidence 写 no-input，不是 findings: 0 冒充全绿', () => {
	const r = lintWith({ hasTrace: false })
	assert.equal(r.verdict, 'pass')
	const row = r.gates.find((g) => g.gate === 'image-evidence')
	assert.equal(row.status, 'no-input')
	assert.notEqual(row.status, 'pass', '没给 trace 和给了 trace 全绿必须分得开')
})

test('给了合格 trace 时 image-evidence 是 pass 不是 no-input', () => {
	const r = lintWith({ trace: goodTrace(), hasTrace: true })
	assert.equal(r.verdict, 'pass')
	const row = r.gates.find((g) => g.gate === 'image-evidence')
	assert.equal(row.status, 'pass')
})

test('接线：声称读图但图不存在，lintArtifact 整趟就红', () => {
	const r = lintWith({
		trace: traceWith({ field: 'variant.columns', confidence: 'medium', imageConfirmed: true, image: 'screenshots/home/floors/pc--sec-03.jpg' }),
		hasTrace: true,
	})
	assert.equal(r.verdict, 'blocked')
	assert.deepEqual([...new Set(r.findings.map((f) => f.gate))], ['image-evidence'], '产物本身合格，只该亮读图门')
	assert.equal(r.findings[0].code, 'image-missing')
})

test('接线：CLI 对读图指空的产物退 1', (t) => {
	const art = writeArtifact(path.join(tempDir(t), 'art'))
	const traceFile = path.join(tempDir(t), 'bad-trace.json')
	fs.writeFileSync(
		traceFile,
		JSON.stringify(traceWith({ field: 'variant.columns', confidence: 'medium', imageConfirmed: true, image: 'screenshots/home/floors/pc--sec-03.jpg' })),
	)
	const r = spawnSync(
		process.execPath,
		[path.join(SCRIPTS_DIR, 'lint-artifact.mjs'), '--asset', FIXTURE_ASSET, '--artifact', art.dir, '--trace', traceFile],
		{ encoding: 'utf8' },
	)
	assert.equal(r.status, 1)
	assert.match(r.stdout, /image-evidence/)
	assert.match(r.stdout, /image-missing/)
})

test('缺资产目录硬失败，不许静默跳过读图门', () => {
	const r = lintArtifact({
		files: [
			{ file: 'floor.html', text: goodHtml() },
			{ file: 'floor.css', text: goodCss() },
		],
		trace: traceWith({ field: 'variant.columns', confidence: 'medium', imageConfirmed: true, image: 'nope.jpg' }),
		hasTrace: true,
	})
	assert.equal(r.verdict, 'blocked')
	assert.equal(r.precheck?.code, 'asset-missing')
	assert.equal(r.findings.length, 0, '不在残件上出结论')
	assert.ok(!r.gates, '缺资产时不得跑出门行')
})

test('随迁政策：黑名单式写法不得被读成「全部放行」', () => {
	const blacklistFirst = '*\n!*/\n!.gitignore\n!*.jpg\n'
	assert.equal(isIgnored(blacklistFirst, 'home/pc--viewport.png').ignored, true, 'png 应当被 `*` 兜住')
	assert.equal(isIgnored(blacklistFirst, 'home/floors/pc--sec-03.jpg').ignored, false, 'jpg 被反选放行')

	const allowlistStyle = '*.png\n!*.jpg\n!index.json\n!.gitignore\n'
	assert.equal(isIgnored(allowlistStyle, 'home/pc--viewport.png').ignored, true)
	assert.equal(isIgnored(allowlistStyle, 'home/floors/pc--sec-03.jpg').ignored, false)

	assert.equal(isIgnored('*.jpg\n!home/floors/pc--sec-03.jpg\n', 'home/floors/pc--sec-03.jpg').ignored, false)
})

test('随迁政策：看不懂的规则不许静默放行', (t) => {
	const dir = copyFixtureAsset(t)
	shipThumb(dir, 'screenshots/floors/pc--sec-03.jpg', REAL_JPEG)
	fs.writeFileSync(path.join(dir, 'screenshots', '.gitignore'), 'floors/pc--sec-0[0-9].jpg\n')

	assert.equal(isIgnored('floors/pc--sec-0[0-9].jpg\n', 'floors/pc--sec-03.jpg').undecidable, true)

	const findings = gateImageEvidence(
		traceWith({ field: 'variant.columns', confidence: 'medium', imageConfirmed: true, image: 'screenshots/floors/pc--sec-03.jpg' }),
		dir,
	)
	assert.equal(findings.length, 1)
	assert.equal(findings[0].code, 'ship-policy-undecidable', '门要么回答，要么说自己答不了，不许静默回答「没问题」')
})

test('图像探针本身：认得 PNG / JPEG，认得残片，认得不该随迁的格式', (t) => {
	assert.deepEqual(decodeImage(REAL_PNG), { format: 'png', width: 1, height: 1 })
	assert.deepEqual(decodeImage(REAL_JPEG), { format: 'jpeg', width: 3, height: 2 })
	assert.throws(() => decodeImage(REAL_JPEG.subarray(0, 22)), (e) => e.code === 'image-truncated', 'SOI + APP0 齐了但没走到 SOF，不该当成合格 JPEG')

	assert.throws(() => decodeImage(REAL_PNG.subarray(0, 10)), (e) => e instanceof ImageProbeError && e.code === 'image-truncated')
	assert.throws(() => decodeImage(Buffer.alloc(0)), (e) => e.code === 'image-empty')
	assert.throws(() => decodeImage(Buffer.from('RIFF____WEBPVP8 ', 'latin1')), (e) => e.code === 'image-format-unsupported')

	const missing = path.join(tempDir(t), 'nope.png')
	assert.throws(() => probeImageFile(missing), (e) => e.code === 'image-missing')
})

test('图像探针：文件必须结构完整走到收尾标记，不是取到宽高就算解得开', () => {
	assert.deepEqual(decodeImage(buildPng(IHDR_1x1, IDAT_STUB, pngChunk('IEND'))), { format: 'png', width: 1, height: 1 })

	const cutMidIdat = buildPng(IHDR_1x1, IDAT_STUB).subarray(0, PNG_SIG.length + IHDR_1x1.length + 8)
	assert.throws(() => decodeImage(cutMidIdat), (e) => e.code === 'image-truncated', 'IHDR 齐了、IDAT 断在中途')

	const lyingLength = Buffer.concat([PNG_SIG, IHDR_1x1, be32(9999), Buffer.from('IDAT', 'latin1'), Buffer.from([0x78, 0x9c]), Buffer.alloc(4), pngChunk('IEND')])
	assert.throws(() => decodeImage(lyingLength), (e) => e.code === 'image-truncated', '块长声明超出文件剩余长度')

	assert.throws(() => decodeImage(buildPng(IHDR_1x1, IDAT_STUB)), (e) => e.code === 'image-truncated', '走到底也没遇到 IEND')
	assert.throws(() => decodeImage(buildPng(IHDR_1x1, pngChunk('IEND'))), (e) => e.code === 'image-corrupt', '一个 IDAT 都没有：结构完整但没有像素数据')

	assert.deepEqual(decodeImage(REAL_JPEG), { format: 'jpeg', width: 3, height: 2 })
	assert.throws(() => decodeImage(REAL_JPEG.subarray(0, REAL_JPEG.length - 2)), (e) => e.code === 'image-truncated', 'SOF 之后没有 EOI 收尾')
})
