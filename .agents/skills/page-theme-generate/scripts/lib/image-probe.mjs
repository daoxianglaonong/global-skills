/**
 * 纯 Node 的图像可解码探针：只回答「这个文件是不是一张读得开的 PNG / JPEG，多大」。
 *
 * 为什么不复用采集侧那道格式门：它只嗅头 16 字节的魔数，于是「有 PNG 签名但被截断」
 * 会当成合格 PNG 放行。生成侧的读图 trace 门要证明的恰恰是「agent 指名的这张图真的
 * 打得开」，只验魔数等于没验——一个 8 字节的假 PNG 就能骗过整道门。
 *
 * **射程一：结构完整，不是像素流完好。** 走到收尾标记（PNG 的 `IEND` / JPEG 的 `EOI`）为止，
 * 一路校块长不越界。只取宽高是不够的：PNG 的宽高在第 16 字节、JPEG 的在靠前的 SOF 段里，
 * 于是「取到宽高就返回」对「文件后面全没了」这一整类完全失明——而那正是实际会发生的那一类
 * （拷了一半、写盘中断、被换成 git-lfs 指针）。
 *
 * 块长核对不可省：实测「IDAT 长度头虚报成 0xffff」时，把 IDAT 拿去 inflate 照样解得出完整流
 * （后面的 CRC 与 IEND 被当成尾数据吞掉），只有拿声明长度比对剩余字节才抓得住。
 *
 * 有意**不**再往前走到解压像素流。PNG 本可以用内置 `node:zlib` inflate 一遍 IDAT，JPEG 的
 * 哈夫曼流却没有同等便宜的办法，于是那样做会得到一道「PNG 强、JPEG 弱」的门，而随资产进
 * git 的缩略图恰好是 JPEG——门在它真正把关的那种格式上反而更弱，还多一条要解释的射程。
 * 更要紧的是威胁模型：这些图**住在 git 里**，git 逐内容寻址，已提交的字节不会悄悄腐坏。
 * 会发生的是提交之前就写坏／写不全，而那一整类由块长与收尾标记就能抓住。
 *
 * **射程二：不证明 agent 真的看过这张图**，那件事没有纸面办法验。本探针只证明「trace 指名
 * 的这张图存在、结构完整」。声称与实物对不上的那一类作弊抓得住；看都没看就写上正确路径的
 * 那一类抓不住，也不假装抓得住。
 */

import fs from 'node:fs'

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
/** JPEG 里携带宽高的帧头。SOF4 / SOF8 / SOF12 是保留或非帧标记，不在其中。 */
const JPEG_SOF_MARKERS = new Set([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf])

export class ImageProbeError extends Error {
	constructor(code, message) {
		super(message)
		this.name = 'ImageProbeError'
		this.code = code
	}
}

/** 签名 8 + 完整 IHDR 块（长 4 + 类型 4 + 数据 13 + CRC 4）。 */
const PNG_MIN_HEADER = 33

function decodePng(buf) {
	if (buf.length < PNG_MIN_HEADER) throw new ImageProbeError('image-truncated', `PNG 头不完整：签名加一个完整 IHDR 块需要 ${PNG_MIN_HEADER} 字节，只有 ${buf.length}`)
	if (buf.toString('latin1', 12, 16) !== 'IHDR') throw new ImageProbeError('image-corrupt', 'PNG 第一个块不是 IHDR')
	const width = buf.readUInt32BE(16)
	const height = buf.readUInt32BE(20)
	if (!width || !height) throw new ImageProbeError('image-corrupt', `PNG 宽高非法：${width}x${height}`)

	// 块链走一遍：每块是 长(4) + 类型(4) + 数据 + CRC(4)，声明的长度必须放得下。
	let i = 8
	let idatCount = 0
	while (i + 8 <= buf.length) {
		const length = buf.readUInt32BE(i)
		const type = buf.toString('latin1', i + 4, i + 8)
		const next = i + 12 + length
		if (next > buf.length) throw new ImageProbeError('image-truncated', `PNG 的 ${type} 块声明 ${length} 字节，文件里放不下：断在第 ${buf.length} 字节`)
		if (type === 'IDAT') idatCount++
		if (type === 'IEND') {
			if (!idatCount) throw new ImageProbeError('image-corrupt', 'PNG 走到 IEND 也没有任何 IDAT：结构完整但一个像素都没有')
			return { format: 'png', width, height }
		}
		i = next
	}
	throw new ImageProbeError('image-truncated', 'PNG 走到底也没遇到 IEND，文件不完整')
}

/** SOF 之后必须还有 `FF D9`。正常文件它就是最后两字节，所以从尾往前找，命中即返回。 */
function hasEndOfImage(buf, afterIndex) {
	for (let j = buf.length - 2; j > afterIndex; j--) {
		if (buf[j] === 0xff && buf[j + 1] === 0xd9) return true
	}
	return false
}

function decodeJpeg(buf) {
	let i = 2
	while (i + 3 < buf.length) {
		if (buf[i] !== 0xff) {
			i++
			continue
		}
		const marker = buf[i + 1]
		// 填充字节与无长度段：跳过，别把它们当段头去读长度。
		if (marker === 0xff || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd9)) {
			i += 2
			continue
		}
		const length = buf.readUInt16BE(i + 2)
		if (length < 2) throw new ImageProbeError('image-corrupt', `JPEG 段长非法：${length}`)
		if (JPEG_SOF_MARKERS.has(marker)) {
			if (i + 9 > buf.length) throw new ImageProbeError('image-truncated', 'JPEG 帧头被截断，取不到宽高')
			const height = buf.readUInt16BE(i + 5)
			const width = buf.readUInt16BE(i + 7)
			if (!width || !height) throw new ImageProbeError('image-corrupt', `JPEG 宽高非法：${width}x${height}`)
			if (!hasEndOfImage(buf, i)) throw new ImageProbeError('image-truncated', 'JPEG 帧头之后没有 EOI 收尾，扫描数据不完整')
			return { format: 'jpeg', width, height }
		}
		i += 2 + length
	}
	throw new ImageProbeError('image-truncated', 'JPEG 走到底也没遇到帧头，文件不完整')
}

/**
 * 解一份图像 buffer，成功返回 `{ format, width, height }`，失败抛 `ImageProbeError`。
 *
 * 只收 PNG 与 JPEG：随资产进 git 的缩略图契约上就是这两种，WebP 下游读图工具解不开，
 * 遇到它要报出来而不是放行。
 */
export function decodeImage(buf) {
	if (!Buffer.isBuffer(buf) || buf.length === 0) throw new ImageProbeError('image-empty', '图像内容为空')
	if (buf.length >= 8 && buf.subarray(0, 8).equals(PNG_SIGNATURE)) return decodePng(buf)
	if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return decodeJpeg(buf)
	if (buf.length >= 12 && buf.toString('latin1', 0, 4) === 'RIFF' && buf.toString('latin1', 8, 12) === 'WEBP') {
		throw new ImageProbeError('image-format-unsupported', 'WebP 不在随迁格式内（下游读图工具解不开），只收 PNG / JPEG')
	}
	throw new ImageProbeError('image-format-unsupported', '既不是 PNG 也不是 JPEG（魔数不匹配）')
}

/** 读盘并解码。文件不存在时抛 `image-missing`，与「存在但解不开」分开归因。 */
export function probeImageFile(file) {
	let buf
	try {
		buf = fs.readFileSync(file)
	} catch (e) {
		throw new ImageProbeError('image-missing', `图像文件读不到：${file}（${e.code ?? e.message}）`)
	}
	return decodeImage(buf)
}
