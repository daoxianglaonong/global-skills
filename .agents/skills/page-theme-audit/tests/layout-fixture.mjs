/**
 * 布局表两族用例（出表 `layout-map.test.mjs` / 回灌 `layout-readback.test.mjs`）共用的输入。
 *
 * 包络从哪来：每条用例把 fixture 整份拷到临时目录，**在拷贝上**跑采集侧真正的投影脚本
 * `build-envelope.mjs` 产一份出来——**不手写精简形状**（`references/audit.md` §9：手写的会随
 * schema 漂移，漂了测试还是绿的）。fixture 自 `R4-10` 起自带一份同样投影出来的包络（它是准入
 * 必交件），这里仍在拷贝上重投影一次：本族要的是「投影脚本此刻产出什么」，读 fixture 里那份
 * 会让 schema 改动在本族静默通过。投影结果按整份文本缓存一次，坏输入从这份真产出改一处派生。
 *
 * 抽成一份而不是两族各写一份：两族用同一份包络才谈得上「出表与回灌读的是同一张表」，
 * 各投影一次会让行 id 在两族之间无声地漂。
 */

import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { FIXTURE_ASSET, copyFixtureAsset, copyDir, SCRIPTS_DIR } from './helpers.mjs'

export const LAYOUT_MAP_CLI = path.join(SCRIPTS_DIR, 'layout-map.mjs')
export const BUILD_ENVELOPE = path.resolve(import.meta.dirname, '..', '..', 'page-theme-extract', 'scripts', 'build-envelope.mjs')

let ENVELOPE_TEXT = null
export function fixtureEnvelopeText() {
	if (ENVELOPE_TEXT) return ENVELOPE_TEXT
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'page-theme-audit-envelope-'))
	try {
		const asset = path.join(dir, 'asset')
		copyDir(FIXTURE_ASSET, asset)
		const r = spawnSync(process.execPath, [BUILD_ENVELOPE, '--asset-dir', asset], { encoding: 'utf8' })
		assert.equal(r.status, 0, `采集侧投影脚本跑不起来，本族用例都失去输入：${r.stderr}`)
		ENVELOPE_TEXT = fs.readFileSync(path.join(asset, 'layout-envelope.json'), 'utf8')
	} finally {
		fs.rmSync(dir, { recursive: true, force: true })
	}
	return ENVELOPE_TEXT
}

export const fixtureEnvelope = () => JSON.parse(fixtureEnvelopeText())

/** fixture 资产拷一份，装上投影出来的包络；`mutate` 返回 `null` 表示不装。 */
export function assetWithEnvelope(t, mutate) {
	const dir = copyFixtureAsset(t)
	const text = mutate ? mutate(fixtureEnvelopeText()) : fixtureEnvelopeText()
	if (text != null) fs.writeFileSync(path.join(dir, 'layout-envelope.json'), text)
	return dir
}

/** 一页四层：hero → feature → float-widget → cta，首末都不对，中间还挂着 float-widget。 */
export const CROSS_SITE_PAGE = [
	'<section data-pattern="hero.centered-pitch"><h1>标题</h1></section>',
	'<section data-pattern="feature.grid-3-cards"><h2>能力</h2></section>',
	'<aside data-pattern="float-widget.service-rail"><a href="#x">联系</a></aside>',
	'<section data-pattern="cta.centered-band"><h2>开始</h2></section>',
].join('\n')
