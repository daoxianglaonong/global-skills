#!/usr/bin/env node
/**
 * 布局映射双份产出。与色值那份（`value-map.mjs`）、非色那份（`type-map.mjs`）**三家分立**：
 * 三张表、三套 id 前缀（`vm-` / `tm-` / `lm-`）、三份文件（`value-map.*` / `type-map.*` /
 * `layout-map.*`），谁也不写进谁的 `--out`。
 *
 *   node scripts/layout-map.mjs --asset <资产目录> --artifact <文件或目录> --out <目录>
 *   node scripts/layout-map.mjs --asset <资产目录> --artifact <文件或目录>
 *        --read-back <layout-map.md> [--peer-read-back-value 路径] [--peer-read-back-type 路径] [--json 路径]
 *
 * `--out` 与 `--read-back` 互斥；两者都不给也是用法错误，与既有两张表同构。回灌不回写这两份
 * 文件，人填的那份是输入。报警落 `warnings[]`，**不进 findings、不影响退出码**。
 *
 * 回灌**恒做三表交叉判定**：默认取 `--read-back` 同目录的 `value-map.md` 与 `type-map.md`
 * （三张表由 `--out` 落在同一个目录），两个 `--peer-read-back-*` 只是对表不在同目录时的显式
 * 指路。对表重算有行却读不回即 `maps-cross-blocked`，见 `lib/map-cross.mjs`。
 *

 * **读面只有产物与 `layout-envelope.json`（外加 `tokens.json` 的 `breakpoints` 组）。本脚本没有
 * `--trace`，也不去产物目录里找 trace**：读 trace 会当场撞 `prose-invariance` 那四条断言。
 * `tests/layout-map.test.mjs` 附一条同形断言——两份只在 trace 自由文本上不同的输入，
 * 双份产出字节相同。
 *
 * ## 退出码
 *
 * | 情况 | 码 |
 * | --- | --- |
 * | 出表成功（哪怕表里全是阻断层越界行） | `0` |
 * | 回灌读回、裁决全合法（哪怕三档行数都非零、报警一堆） | `0` |
 * | 用法错误（缺 `--asset` / `--artifact`；`--out` 与 `--read-back` 同时给或都不给；读不回） | `1` |
 * | 资产读不开（`precheckAsset` 那四份必读件） | `1` |
 * | **收不到产物**（`--artifact` 下一份 `.html` / `.css` 都没有） | `1` |
 * | **读不开包络**（缺件 / 解不开 / 形状不对） | `1` |
 * | 回灌有阻断（裁决自身不成立，或对表 blocked） | `1` |
 *
 * 中间那两条是 `R4-07` 钉死的两条路：**不以「零行」全绿交差**。反过来，**出表这一半，表里的
 * 行一条都不影响退出码**——报警层是观测投影不做判定，阻断层的门是 `lint-artifact`（`R4-06`），
 * 出表只把越界写出来。回灌退 1 判的是「这份裁决自己不成立」，不是「这份产物越界」。
 */

import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { scanCss, scanHtml } from './lib/css-scan.mjs'
import { loadClosedSet } from './lib/closed-set.mjs'
import { collectArtifactFiles } from './lib/collect-artifact.mjs'
import { precheckAsset } from './lint-artifact.mjs'
import {
	buildLayoutMap,
	renderLayoutMapMarkdown,
	readBackLayoutMap,
	loadLayoutEnvelope,
	LayoutEnvelopeError,
	assetBreakpoints,
	parseFloorRoots,
} from './lib/layout-rows.mjs'
import { buildValueMap, readBackValueMap } from './lib/value-rows.mjs'
import { buildTypeMap, readBackTypeMap, applyClosedSetKindGate } from './lib/type-rows.mjs'
import { crossCheckPeers } from './lib/map-cross.mjs'

const opt = (argv, flag) => {
	const i = argv.indexOf(flag)
	return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : null
}

function relPosix(from, to) {
	return path.relative(from, to).split(path.sep).join('/') || '.'
}

const ENVELOPE_NEXT_ACTION = {
	'layout-envelope-missing': '给这份资产补投影：在采集侧跑 `node scripts/build-envelope.mjs --asset-dir <资产>`，本表读的就是它产出的 layout-envelope.json',
	'layout-envelope-unparseable': '修 layout-envelope.json 使它能被 JSON.parse；它由 build-envelope.mjs 投影产出，不得手写，改坏了就重跑一次投影',
	'layout-envelope-shape': 'layout-envelope.json 缺 blocking / advisory 数组：这多半不是投影出来的那一份，重跑 build-envelope.mjs',
}

/**
 * 收产物面。HTML 既要摊声明（含 `<style>` 与内联 `style=`）又要摊 `data-pattern` 层根，
 * 层根按文件相对路径升序、文件内按文档序——序不稳定的话两次跑出来的表不可比。
 */
function loadArtifact(artifact) {
	const collected = collectArtifactFiles(artifact)
	const declarations = []
	const floorRoots = []
	for (const f of collected.files) {
		const text = fs.readFileSync(f.abs, 'utf8')
		if (/\.html$/i.test(f.rel)) {
			declarations.push(...scanHtml(text, f.rel).declarations)
			floorRoots.push(...parseFloorRoots(text, f.rel))
		} else {
			declarations.push(...scanCss(text, f.rel))
		}
	}
	return { collected, declarations, floorRoots }
}

function main(argv) {
	const assetDir = opt(argv, '--asset')
	const artifact = opt(argv, '--artifact')
	const out = opt(argv, '--out')
	const readBack = opt(argv, '--read-back')
	const peerValue = opt(argv, '--peer-read-back-value')
	const peerType = opt(argv, '--peer-read-back-type')
	const jsonPath = opt(argv, '--json')
	if (!assetDir || !artifact) {
		console.error('用法：node scripts/layout-map.mjs --asset <资产> --artifact <产物> --out <目录>')
		console.error('   或：node scripts/layout-map.mjs --asset <资产> --artifact <产物> --read-back <layout-map.md> [--peer-read-back-value 路径] [--peer-read-back-type 路径] [--json 路径]')
		process.exit(1)
	}
	// 单数那个旗标名不收：本表有两张对表，`--peer-read-back` 指哪一张说不清。静默忽略会让
	// 人以为对表指过路了，所以点名报错。
	if (argv.includes('--peer-read-back')) {
		console.error('布局表有两张对表：用 --peer-read-back-value / --peer-read-back-type 分别指路，--peer-read-back 指哪一张说不清')
		process.exit(1)
	}
	if (out && readBack) {
		console.error('--out 与 --read-back 互斥')
		process.exit(1)
	}
	if (!out && !readBack) {
		console.error('必须给 --out 或 --read-back 之一')
		process.exit(1)
	}

	const pre = precheckAsset(assetDir)
	if (pre) {
		console.log(JSON.stringify(pre, null, 2))
		process.exit(1)
	}

	const root = path.resolve(assetDir)

	// 包络先读：读不开就没有一条候选来源，出一张「零行」的表等于把「没查」报成「没问题」。
	let envelope
	try {
		envelope = loadLayoutEnvelope(root)
	} catch (e) {
		if (!(e instanceof LayoutEnvelopeError)) throw e
		console.log(
			JSON.stringify(
				{
					verdict: 'blocked',
					mapKind: 'layout',
					precheck: { code: e.code, file: relPosix(process.cwd(), path.join(root, 'layout-envelope.json')), nextAction: ENVELOPE_NEXT_ACTION[e.code] },
					findings: [],
				},
				null,
				2,
			),
		)
		process.exit(1)
	}

	const { collected, declarations, floorRoots } = loadArtifact(artifact)
	if (!collected.files.length) {
		console.log(
			JSON.stringify(
				{ verdict: 'blocked', mapKind: 'layout', precheck: { code: 'artifact-empty', file: artifact }, findings: [] },
				null,
				2,
			),
		)
		process.exit(1)
	}

	const closedSet = loadClosedSet(root)
	const base = out ? path.resolve(out) : process.cwd()
	const relAsset = relPosix(base, root)
	const relArtifact = relPosix(base, collected.root)
	const doc = buildLayoutMap({
		declarations,
		floorRoots,
		envelope,
		breakpoints: assetBreakpoints(root),
		styleSetId: closedSet.styleSetId,
		asset: relAsset,
		artifactRoot: relArtifact,
	})

	if (out) {
		fs.mkdirSync(base, { recursive: true })
		fs.writeFileSync(path.join(base, 'layout-map.json'), JSON.stringify(doc, null, 2))
		fs.writeFileSync(path.join(base, 'layout-map.md'), renderLayoutMapMarkdown(doc))
		process.exit(0)
	}

	let md
	try {
		md = fs.readFileSync(readBack, 'utf8')
	} catch {
		console.error(`读不回：${readBack}`)
		process.exit(1)
	}

	// 两张对表按**同一份产物**重算，只为拿到「该不该有对表读回件」那个行数；判据来自产物
	// 而不是文件系统，所以把对表 md 挪走绕不过去。这两份是只读引用，`value-rows.mjs` /
	// `type-rows.mjs` 一个字节不动（那两份与生成侧有逐字同源锁）。
	const valueDoc = buildValueMap({ declarations, closedSet, styleSetId: closedSet.styleSetId, asset: relAsset, artifactRoot: relArtifact })
	const typeDoc = buildTypeMap({ declarations, closedSet, styleSetId: closedSet.styleSetId, asset: relAsset, artifactRoot: relArtifact })
	const cross = crossCheckPeers({
		primary: readBackLayoutMap(doc, md),
		primaryLabel: '布局表',
		readBack,
		peers: [
			{ mapKind: 'value', label: '色表', peerReadBack: peerValue, peerRows: valueDoc.rows.length, readPeer: (peerMd) => readBackValueMap(valueDoc, peerMd) },
			{
				mapKind: 'type',
				label: '非色表',
				peerReadBack: peerType,
				peerRows: typeDoc.rows.length,
				readPeer: (peerMd) => applyClosedSetKindGate(readBackTypeMap(typeDoc, peerMd), closedSet),
			},
		],
	})
	if (cross.fatal) {
		console.error(cross.fatal)
		process.exit(1)
	}
	const back = cross.doc
	const serialized = JSON.stringify(back, null, 2)
	if (jsonPath) {
		fs.mkdirSync(path.dirname(path.resolve(jsonPath)), { recursive: true })
		fs.writeFileSync(jsonPath, serialized)
	}
	console.log(serialized)
	process.exit(back.verdict === 'pass' ? 0 : 1)
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
	main(process.argv.slice(2))
}
