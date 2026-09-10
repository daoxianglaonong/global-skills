/**
 * 读图 trace 门：非 `high` 档字段若声称读图确认过，必须指名**具体字段 + 具体图像文件**，
 * 且那张图必须真的在资产里、真的解得开。
 *
 * 射程先说清楚，免得这道门被当成它不是的东西：**它不证明 agent 真看了图**。那件事没有
 * 纸面办法验，写一道「我读了」的自述门只会把纪律变成咒语。它验的是另一件事——声称与实物
 * 对不对得上。随手写个路径充数、指一张早就不随资产迁移的原图、指一坨读不开的字节，
 * 这三类当场就红。
 *
 * 用例的来源有点特别：冻结 fixture **一张图都没有**（无采集运行，`floor-index.json` 的
 * 字段表是 unknown:forbid 且不含任何图像字段）。所以在这份资产上，任何「我读图确认过」
 * 的声称都必然指不出实物——这反而让失败用例最稳，不依赖任何会漂移的真实资产。
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { gateImageEvidence, isIgnored } from '../scripts/lib/gates.mjs'
import { decodeImage, probeImageFile, ImageProbeError } from '../scripts/lib/image-probe.mjs'
import { FIXTURE_ASSET, goodTrace, copyFixtureAsset, shipThumb, tempDir } from './helpers.mjs'

const traceWith = (field) => ({ floors: [{ id: 'feature.grid-3-cards', fields: [field] }] })

/** 一张 1×1 的真 PNG，用来证明门放行的是「真解得开」而不是「有签名就行」。 */
const REAL_PNG = Buffer.from(
	'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
	'base64',
)

/** PNG 组装件。探针不校 CRC（见 image-probe.mjs 的射程说明），所以 CRC 位补零即可。 */
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

/** 一张 3×2 的最小 JPEG：SOI + APP0 + SOF0 + EOI。缩略图那一列现实里是 jpg，得有一份能过的。 */
const REAL_JPEG = Buffer.concat([
	Buffer.from([0xff, 0xd8]),
	Buffer.from([0xff, 0xe0, 0x00, 0x10]),
	Buffer.from('JFIF\0\x01\x01\0\0\x01\0\x01\0\0', 'latin1'),
	Buffer.from([0xff, 0xc0, 0x00, 0x11, 0x08, 0x00, 0x02, 0x00, 0x03, 0x03, 0x01, 0x22, 0x00, 0x02, 0x11, 0x01, 0x03, 0x11, 0x01]),
	Buffer.from([0xff, 0xd9]),
])

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
	// 一条笼统的「这层我看过图了」无法被复核：复核的人不知道该去核哪个数字。
	const findings = gateImageEvidence(traceWith({ confidence: 'medium', imageConfirmed: true, image: 'a.jpg' }), FIXTURE_ASSET)
	assert.equal(findings.length, 1)
	assert.match(findings[0].reason, /没指名是哪个字段/)
})

test('图存在但是一坨解不开的字节 → 挂', (t) => {
	const dir = copyFixtureAsset(t)
	// 有 PNG 签名，但在 IHDR 之前就断了。采集侧那道只嗅 16 字节魔数的格式门会放行它，
	// 所以本门不能抄那个判据——要走到取得出宽高为止。
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
	// 这是「指错一列」：`path` 那一列是采集期本地原图，不随资产进 git，搬走即指空。
	// 门若只查「文件在不在」，随手拿资产里任意一张图充数也能全绿。
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
	// 冻结 fixture 就是这种资产（无采集运行）。此时任何读图声称都指不出实物，不能因为
	// 「没有政策文件可比」就静默放行——那个方向正好是不安全的那一侧。
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
	// index 登记了它，但资产自己的随迁政策把它排除了——两处打架时按不随迁算。
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
	// 「只有 high 才允许不读图直填」是措辞纪律那一侧的事。本门只管「声称读图」的真伪，
	// 不管「该不该声称 high」——后者要判「这个字段配不配得上 high」，归 page-theme-audit。
	const findings = gateImageEvidence(traceWith({ field: 'rhythm.surface', confidence: 'high', imageConfirmed: true, image: 'nope.png' }), FIXTURE_ASSET)
	assert.deepEqual(findings, [])
})

test('没声称读图就不要求指图', () => {
	const findings = gateImageEvidence(traceWith({ field: 'variant.columns', confidence: 'medium', imageConfirmed: false }), FIXTURE_ASSET)
	assert.deepEqual(findings, [], '门验的是声称与实物对不对得上，不是逼着每个字段都去读图')
})

test('随迁政策：黑名单式写法不得被读成「全部放行」', () => {
	// 现役资产的 screenshots/.gitignore 是 `*.png` + 逐条反选；但同一份资产的
	// raw/.gitignore 用的是 `*` 打头再反选。若哪天截图那侧也改成这种写法，只扫非否定
	// 规则的实现会把「全部忽略、只放行几份」读成「全部放行」——方向正好是不安全的那侧。
	const blacklistFirst = '*\n!*/\n!.gitignore\n!*.jpg\n'
	assert.equal(isIgnored(blacklistFirst, 'home/pc--viewport.png').ignored, true, 'png 应当被 `*` 兜住')
	assert.equal(isIgnored(blacklistFirst, 'home/floors/pc--sec-03.jpg').ignored, false, 'jpg 被反选放行')

	const allowlistStyle = '*.png\n!*.jpg\n!index.json\n!.gitignore\n'
	assert.equal(isIgnored(allowlistStyle, 'home/pc--viewport.png').ignored, true)
	assert.equal(isIgnored(allowlistStyle, 'home/floors/pc--sec-03.jpg').ignored, false)

	// 后匹配者胜：同一条路径先被忽略后被反选，结论是放行。
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
	// JPEG 那条路径必须有实证：宽高不在固定偏移上，得逐段走到 SOF 才取得到。
	assert.deepEqual(decodeImage(REAL_JPEG), { format: 'jpeg', width: 3, height: 2 })
	assert.throws(() => decodeImage(REAL_JPEG.subarray(0, 22)), (e) => e.code === 'image-truncated', 'SOI + APP0 齐了但没走到 SOF，不该当成合格 JPEG')

	assert.throws(() => decodeImage(REAL_PNG.subarray(0, 10)), (e) => e instanceof ImageProbeError && e.code === 'image-truncated')
	assert.throws(() => decodeImage(Buffer.alloc(0)), (e) => e.code === 'image-empty')
	assert.throws(() => decodeImage(Buffer.from('RIFF____WEBPVP8 ', 'latin1')), (e) => e.code === 'image-format-unsupported')

	const missing = path.join(tempDir(t), 'nope.png')
	assert.throws(() => probeImageFile(missing), (e) => e.code === 'image-missing')
})

test('图像探针：文件必须结构完整走到收尾标记，不是取到宽高就算解得开', () => {
	// 取到宽高只证明**头**是完整的。PNG 的宽高在第 16 字节，JPEG 的在 SOF 段里，两者都在
	// 文件极靠前的位置——于是「只走到宽高」这道判据对「文件后面全没了」这一整类完全失明，
	// 而那恰好是实际会发生的那一类：拷了一半、写盘中断、被换成 git-lfs 指针。
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
