#!/usr/bin/env node
/**
 * 非色值映射双份产出与裁决回灌。与色值那份（`value-map.mjs`）**分家**：两张表、两套 id
 * 前缀（`tm-` / `vm-`）、两份文件（`type-map.*` / `value-map.*`），谁也不写进谁的 `--out`。
 *
 *   node scripts/type-map.mjs --asset <资产目录> --artifact <文件或目录> --out <目录>
 *   node scripts/type-map.mjs --asset <资产目录> --artifact <文件或目录>
 *        --read-back <type-map.md> [--peer-read-back <value-map.md>] [--json <输出路径>]
 *
 * `--out` 与 `--read-back` 互斥。回灌不回写这两份文件。报警落 warnings[]，不进 findings、
 * 不影响退出码。pending 整列空着退 0。
 *
 * 回灌**恒做两表交叉判定**：默认取 `--read-back` 同目录的 `value-map.md`（两张表由 `--out`
 * 落在同一个目录），`--peer-read-back` 只是对表不在同目录时的显式指路。色表有行却读不回
 * 即 `maps-cross-blocked`，见 `lib/map-cross.mjs`。
 */

import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { scanCss, scanHtml } from './lib/css-scan.mjs'
import { loadClosedSet } from './lib/closed-set.mjs'
import { collectArtifactFiles } from './lib/collect-artifact.mjs'
import { precheckAsset } from './lint-artifact.mjs'
import { buildValueMap, readBackValueMap } from './lib/value-rows.mjs'
import { buildTypeMap, renderTypeMapMarkdown, readBackTypeMap, closedSetKindFindings, applyClosedSetKindGate } from './lib/type-rows.mjs'
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
		console.error('用法：node scripts/type-map.mjs --asset <资产> --artifact <产物> --out <目录>')
		console.error('   或：node scripts/type-map.mjs --asset <资产> --artifact <产物> --read-back <type-map.md> [--peer-read-back 路径] [--json 路径]')
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
	const relAsset = relPosix(base, root)
	const relArtifact = relPosix(base, collected.root)
	const doc = buildTypeMap({
		declarations,
		closedSet,
		styleSetId: closedSet.styleSetId,
		asset: relAsset,
		artifactRoot: relArtifact,
	})

	const kindFindings = closedSetKindFindings(closedSet)
	if (kindFindings.length && out) {
		console.log(JSON.stringify({ verdict: 'blocked', mapKind: 'type', findings: kindFindings }, null, 2))
		process.exit(1)
	}

	if (out) {
		fs.mkdirSync(base, { recursive: true })
		fs.writeFileSync(path.join(base, 'type-map.json'), JSON.stringify(doc, null, 2))
		fs.writeFileSync(path.join(base, 'type-map.md'), renderTypeMapMarkdown(doc))
		process.exit(0)
	}

	let md
	try {
		md = fs.readFileSync(readBack, 'utf8')
	} catch {
		console.error(`读不回：${readBack}`)
		process.exit(1)
	}
	const valueDoc = buildValueMap({
		declarations,
		closedSet,
		styleSetId: closedSet.styleSetId,
		asset: relPosix(process.cwd(), root),
		artifactRoot: relPosix(process.cwd(), collected.root),
	})
	const cross = crossCheckMaps({
		primary: applyClosedSetKindGate(readBackTypeMap(doc, md), closedSet),
		primaryLabel: '非色表',
		peerLabel: '色表',
		peerMapKind: 'value',
		readBack,
		peerReadBack,
		peerRows: valueDoc.rows.length,
		readPeer: (peerMd) => readBackValueMap(valueDoc, peerMd),
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
