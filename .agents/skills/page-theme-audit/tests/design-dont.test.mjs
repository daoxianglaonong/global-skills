/**
 * 门 (b) design-dont-section-missing。
 *
 * 真会挂的输入：一份删掉 `## 8. Do's and Don'ts` 整节的资产（冻结 fixture 的副本）。
 * 不判缺 DESIGN.md（归采集侧），不判节里写得对不对。
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { lintArtifact } from '../scripts/lint-artifact.mjs'
import { hasDesignDontSection } from '../scripts/lib/gates.mjs'
import { copyFixtureAsset, goodHtml, goodCss } from './helpers.mjs'

const lintOn = (assetDir) =>
	lintArtifact({
		assetDir,
		files: [
			{ file: 'floor.html', text: goodHtml() },
			{ file: 'floor.css', text: goodCss() },
		],
	})

test('删掉 §8 Don\'t 整节 → 挂 design-dont-section-missing', (t) => {
	const dir = copyFixtureAsset(t)
	const file = path.join(dir, 'DESIGN.md')
	const text = fs.readFileSync(file, 'utf8')
	assert.ok(/## 8\. Do's and Don'ts/.test(text), 'fixture 必须有这一节，否则本条无从改起')
	fs.writeFileSync(file, text.replace(/## 8\. Do's and Don'ts[\s\S]*$/, ''))

	const r = lintOn(dir)
	assert.equal(r.verdict, 'blocked')
	const hits = r.findings.filter((f) => f.gate === 'design-dont-section-missing')
	assert.equal(hits.length, 1, '只该报一条节缺失')
	assert.equal(hits[0].assetFile, 'DESIGN.md')
	assert.ok(hits[0].unobservedCount >= 1)
	assert.ok(!r.findings.some((f) => f.gate === 'primitive-dont-id'), 'dontId 字段还在，本门不该顺带点亮 (e)')
})

test('冻结 fixture 有 §8 → 本门不开口报错', () => {
	const r = lintOn(path.resolve(import.meta.dirname, '..', '..', 'page-theme-workspace', 'fixtures', 'fixture-lanyuan-lab'))
	assert.equal(
		r.findings.filter((f) => f.gate === 'design-dont-section-missing').length,
		0,
	)
})

test('§8 节定位：无点标题与 §8 标题都算有节；只有 ### Don\'t 不算', () => {
	assert.equal(hasDesignDontSection("## 8. Do's and Don'ts\n"), true)
	assert.equal(hasDesignDontSection("## 8 Do's and Don'ts\n"), true, '规程只要求标题含 8 与 don，不要求点号')
	assert.equal(hasDesignDontSection("## §8 Do's and Don'ts\n"), true)
	assert.equal(hasDesignDontSection("### Don't\n"), false, '没有 8 就不是 §8 节')
	assert.equal(hasDesignDontSection("## 18. Something don't\n"), true, '已知宽度：18 含 8、don\'t 含 don')
})

test('只有 ### Don\'t 没有 ## 8 → 挂 design-dont-section-missing', (t) => {
	const dir = copyFixtureAsset(t)
	const file = path.join(dir, 'DESIGN.md')
	const text = fs.readFileSync(file, 'utf8')
	fs.writeFileSync(file, text.replace(/## 8\. Do's and Don'ts[\s\S]*$/, "### Don't\n\n| id | check | 规则 |\n"))

	const r = lintOn(dir)
	assert.equal(r.verdict, 'blocked')
	assert.equal(r.findings.filter((f) => f.gate === 'design-dont-section-missing').length, 1)
})

test('资产没有任何 observed:false 项时两道 Don\'t 支门都是 no-input', (t) => {
	const dir = copyFixtureAsset(t)
	const tokensFile = path.join(dir, 'tokens.json')
	const raw = fs.readFileSync(tokensFile, 'utf8')
	assert.ok(raw.includes('"observed": false'), 'fixture 应当有未上屏项，否则本条无从改起')
	fs.writeFileSync(tokensFile, raw.replace(/"observed": false/g, '"observed": true'))

	const r = lintOn(dir)
	assert.equal(r.gates.find((g) => g.gate === 'design-dont-section-missing').status, 'no-input')
	assert.equal(r.gates.find((g) => g.gate === 'primitive-dont-id').status, 'no-input')
})
