#!/usr/bin/env node
/**
 * 值映射双份产出与裁决回灌。
 *
 *   node scripts/value-map.mjs --asset <资产目录> --artifact <文件或目录> --out <目录>
 *   node scripts/value-map.mjs --asset <资产目录> --artifact <文件或目录>
 *        --read-back <value-map.md> [--peer-read-back <type-map.md>] [--json <输出路径>]
 *
 * `--out` 与 `--read-back` 互斥。回灌不回写这两份文件。报警落 warnings[]，不进 findings、
 * 不影响退出码。pending 整列空着退 0。
 *
 * 回灌**恒做两表交叉判定**：默认取 `--read-back` 同目录的 `type-map.md`（两张表由 `--out`
 * 落在同一个目录），`--peer-read-back` 只是对表不在同目录时的显式指路。非色表有行却读不回
 * 即 `maps-cross-blocked`，见 `lib/map-cross.mjs`。
 */

import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { scanCss, scanHtml } from './lib/css-scan.mjs'
import { loadClosedSet } from './lib/closed-set.mjs'
import { collectArtifactFiles } from './lib/collect-artifact.mjs'
import { precheckAsset } from './lint-artifact.mjs'
import { buildValueMap, renderValueMapMarkdown, readBackValueMap } from './lib/value-rows.mjs'
import { buildTypeMap, readBackTypeMap, applyClosedSetKindGate } from './lib/type-rows.mjs'
import { crossCheckMaps } from './lib/map-cross.mjs'

const opt = (argv, flag) => {
	const i = argv.indexOf(flag)
	return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : null
}

function relPosix(from, to) {
	return path.relative(from, to).split(path.sep).join('/') || '.'
}

function loadDeclarations(artifact) {
	const collected = collectArtifactFiles(artifact)
	const declarations = []
	for (const f of collected.files) {
		const text = fs.readFileSync(f.abs, 'utf8')
		if (/\.html$/i.test(f.rel)) declarations.push(...scanHtml(text, f.rel).declarations)
		else declarations.push(...scanCss(text, f.rel))
	}
	return { collected, declarations }
}

function main(argv) {
	const assetDir = opt(argv, '--asset')
	const artifact = opt(argv, '--artifact')
	const out = opt(argv, '--out')
	const readBack = opt(argv, '--read-back')
	const peerReadBack = opt(argv, '--peer-read-back')
	const jsonPath = opt(argv, '--json')
	if (!assetDir || !artifact) {
		console.error('用法：node scripts/value-map.mjs --asset <资产> --artifact <产物> --out <目录>')
		console.error('   或：node scripts/value-map.mjs --asset <资产> --artifact <产物> --read-back <value-map.md> [--peer-read-back 路径] [--json 路径]')
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

	const { collected, declarations } = loadDeclarations(artifact)
	if (!collected.files.length) {
		console.log(JSON.stringify({ verdict: 'blocked', precheck: { code: 'artifact-empty', file: artifact }, findings: [] }, null, 2))
		process.exit(1)
	}

	const root = path.resolve(assetDir)
	const closedSet = loadClosedSet(root)
	const base = out ? path.resolve(out) : process.cwd()
	const doc = buildValueMap({
		declarations,
		closedSet,
		styleSetId: closedSet.styleSetId,
		asset: relPosix(base, root),
		artifactRoot: relPosix(base, collected.root),
	})

	if (out) {
		fs.mkdirSync(base, { recursive: true })
		fs.writeFileSync(path.join(base, 'value-map.json'), JSON.stringify(doc, null, 2))
		fs.writeFileSync(path.join(base, 'value-map.md'), renderValueMapMarkdown(doc))
		process.exit(0)
	}

	let md
	try {
		md = fs.readFileSync(readBack, 'utf8')
	} catch {
		console.error(`读不回：${readBack}`)
		process.exit(1)
	}
	const typeDoc = buildTypeMap({
		declarations,
		closedSet,
		styleSetId: closedSet.styleSetId,
		asset: relPosix(process.cwd(), root),
		artifactRoot: relPosix(process.cwd(), collected.root),
	})
	const cross = crossCheckMaps({
		primary: readBackValueMap(doc, md),
		primaryLabel: '色表',
		peerLabel: '非色表',
		peerMapKind: 'type',
		readBack,
		peerReadBack,
		peerRows: typeDoc.rows.length,
		readPeer: (peerMd) => applyClosedSetKindGate(readBackTypeMap(typeDoc, peerMd), closedSet),
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
