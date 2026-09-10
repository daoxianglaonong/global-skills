/**
 * R4-08 合成型身份：三道夹具各挂一种失败，合格 synth 十二道门全绿。
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { lintFloor } from '../scripts/lint-floor.mjs'
import { checkResponsiveInheritance } from '../scripts/lib/responsive-inherit.mjs'
import { findSynthInPatterns, isSynthPattern, synthInheritAllFrom } from '../scripts/lib/synth-identity.mjs'
import {
	copyFixtureAsset,
	goodCss,
	goodHtml,
	goodTrace,
	writeLayoutEnvelope,
	tempDir,
} from './helpers.mjs'

const SYNTH = 'synth:pricing.table-3'
const SOURCE = 'feature.grid-3-cards'

const synthHtml = () => goodHtml().replace(`data-pattern="${SOURCE}"`, `data-pattern="${SYNTH}"`)

const synthTrace = () => {
	const trace = structuredClone(goodTrace())
	trace.floors = [
		{
			id: SYNTH,
			pattern: null,
			skeleton: null,
			fields: [{ field: 'variant.columns', value: 3, confidence: 'medium', imageConfirmed: false }],
			unobservedBreakpoints: synthInheritAllFrom(SOURCE),
		},
	]
	return trace
}

const lintSynth = (t, { trace = synthTrace(), css = goodCss(), html = synthHtml() } = {}) => {
	const dir = copyFixtureAsset(t)
	writeLayoutEnvelope(dir)
	return lintFloor({ assetDir: dir, html, htmlFile: 'floor.html', css: [{ file: 'floor.css', text: css }], trace })
}

test('isSynthPattern 只认 synth: 前缀', () => {
	assert.ok(isSynthPattern('synth:pricing.table-3'))
	assert.ok(!isSynthPattern('pricing.table-3'))
})

test('夹具一：合格 synth + 继承源 + 包络 → lintFloor 退 0', (t) => {
	const r = lintSynth(t)
	assert.equal(r.verdict, 'pass', r.findings.map((f) => `[${f.gate}] ${f.code}`).join('\n'))
})

test('夹具二：缺继承源 → inherit-synth-source-missing，lintFloor 退 1', (t) => {
	const trace = synthTrace()
	trace.floors[0].unobservedBreakpoints = [{ breakpoint: 'pc' }]
	const r = lintSynth(t, { trace })
	assert.equal(r.verdict, 'blocked')
	assert.ok(r.findings.some((f) => f.code === 'inherit-synth-source-missing'))
	const direct = checkResponsiveInheritance({ html: synthHtml(), trace, assetDir: copyFixtureAsset(t) })
	assert.ok(direct.some((f) => f.code === 'inherit-synth-source-missing'))
})

test('夹具三：越包络阻断层（负顶外边距）→ merge-spacing-with-prev，lintFloor 退 1', (t) => {
	const css = `${goodCss()}\n.pt-feature-grid {\n\tmargin-top: calc(-1 * var(--dimension-spacing-2));\n}\n`
	const r = lintSynth(t, { css })
	assert.equal(r.verdict, 'blocked')
	assert.ok(r.findings.some((f) => f.code === 'merge-spacing-with-prev' && f.gate === 'layout-envelope'))
})

test('findSynthInPatterns：patterns/ yaml 内容含 synth: 即违规', (t) => {
	const dir = tempDir(t)
	fs.mkdirSync(path.join(dir, 'patterns'))
	fs.writeFileSync(path.join(dir, 'patterns', 'index.yaml'), 'schema_version: 1\n')
	fs.writeFileSync(path.join(dir, 'patterns', 'pricing.table-3.yaml'), 'id: synth:pricing.table-3\n')
	assert.equal(findSynthInPatterns(dir).length, 1)
})

test('inherit-pattern-unreadable：裸 pricing 仍挂，synth: 前缀不挂', (t) => {
	const dir = copyFixtureAsset(t)
	const bare = checkResponsiveInheritance({
		html: `${goodHtml()}\n<section data-pattern="pricing.table-3"></section>`,
		trace: goodTrace(),
		assetDir: dir,
	})
	assert.ok(bare.some((f) => f.code === 'inherit-pattern-unreadable'))
	const synth = checkResponsiveInheritance({ html: synthHtml(), trace: synthTrace(), assetDir: dir })
	assert.ok(!synth.some((f) => f.code === 'inherit-pattern-unreadable'))
})
