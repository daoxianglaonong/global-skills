/**
 * 禁词门：按契约定位 §V3，只取 avoid / forbidden_topics。
 *
 * 真会挂的输入：正文里写「一站式」，而 fixture §V3 的 avoid 表里有它。
 *
 * 抓不住：只按字面匹配，不判语义；图里的字、JS 拼出的文案抓不住。
 * 空 voice.md / 无 §V3 / §V3 没有这两个字段：一律不触发，不是报错。
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { lintArtifact } from '../scripts/lint-artifact.mjs'
import { copyFixtureAsset, FIXTURE_ASSET, goodHtml, goodCss, mutateHtml } from './helpers.mjs'

const lint = ({ assetDir = FIXTURE_ASSET, html = goodHtml(), css = goodCss() } = {}) =>
	lintArtifact({
		assetDir,
		files: [
			{ file: 'floor.html', text: html },
			{ file: 'floor.css', text: css },
		],
	})

test('正文写「一站式」→ 挂 voice-forbidden-term', () => {
	const r = lint({ html: mutateHtml('研究方法', '一站式研究方法') })
	assert.equal(r.verdict, 'blocked')
	const hits = r.findings.filter((f) => f.gate === 'voice-forbidden-term')
	assert.equal(hits.length, 1)
	assert.equal(hits[0].term, '一站式')
	assert.equal(hits[0].source, 'avoid')
	assert.equal(hits[0].assetFile, 'voice.md')
	assert.equal(hits[0].file, 'floor.html')
	assert.ok(hits[0].context.includes('一站式'))
})

test('不得把字段名 avoid 本身当成禁词', () => {
	const r = lint({ html: mutateHtml('研究方法', 'avoid 研究方法') })
	assert.equal(
		r.findings.filter((f) => f.gate === 'voice-forbidden-term').length,
		0,
		'字段名 avoid 不是禁词',
	)
})

test('prefer 表里的词不是禁词', () => {
	const r = lint({ html: mutateHtml('研究方法', '记录研究方法') })
	assert.equal(
		r.findings.filter((f) => f.gate === 'voice-forbidden-term').length,
		0,
	)
})

test('class / script / style 里的字不扫', () => {
	const inClass = lint({ html: mutateHtml('class="pt-feature-grid"', 'class="pt-feature-grid 一站式"') })
	assert.equal(inClass.findings.filter((f) => f.gate === 'voice-forbidden-term').length, 0)

	const inScript = lint({ html: `${goodHtml()}\n<script>const x = "一站式"</script>` })
	assert.equal(inScript.findings.filter((f) => f.gate === 'voice-forbidden-term').length, 0)

	const inStyle = lint({ css: `${goodCss()}\n/* 一站式 */` })
	assert.equal(inStyle.findings.filter((f) => f.gate === 'voice-forbidden-term').length, 0)
})

test('alt / title / aria-label / placeholder 四个属性要扫', () => {
	const r = lint({ html: `${goodHtml()}\n<img alt="一站式平台" />` })
	assert.ok(r.findings.some((f) => f.gate === 'voice-forbidden-term' && f.term === '一站式'))
})

test('yaml 围栏形状：avoid[].term 与 forbidden_topics[].topic', (t) => {
	const dir = copyFixtureAsset(t)
	const voice = fs.readFileSync(path.join(dir, 'voice.md'), 'utf8')
	const replaced = voice.replace(
		/## §V3 词汇[\s\S]*?(?=\n## §V4)/,
		`## §V3 词汇

\`\`\`yaml
avoid:
  - { term: 点击这里, replace: 了解详情 }
forbidden_topics:
  - { topic: 竞品点名贬低 }
\`\`\`

`,
	)
	fs.writeFileSync(path.join(dir, 'voice.md'), replaced)

	const hit = lint({ assetDir: dir, html: mutateHtml('研究方法', '点击这里') })
	assert.ok(hit.findings.some((f) => f.gate === 'voice-forbidden-term' && f.term === '点击这里' && f.source === 'avoid'))

	const topic = lint({ assetDir: dir, html: mutateHtml('研究方法', '竞品点名贬低') })
	assert.ok(topic.findings.some((f) => f.gate === 'voice-forbidden-term' && f.term === '竞品点名贬低' && f.source === 'forbidden_topics'))
})

test('空 voice.md / 无 §V3 / §V3 没有这两个字段 → 不触发，不是报错', (t) => {
	const empty = copyFixtureAsset(t)
	fs.writeFileSync(path.join(empty, 'voice.md'), '')
	const rEmpty = lint({ assetDir: empty })
	assert.equal(rEmpty.verdict, 'pass')
	assert.equal(rEmpty.gates.find((g) => g.gate === 'voice-forbidden-term').status, 'no-input')

	const noV3 = copyFixtureAsset(t)
	const voice = fs.readFileSync(path.join(noV3, 'voice.md'), 'utf8')
	fs.writeFileSync(path.join(noV3, 'voice.md'), voice.replace(/## §V3 词汇[\s\S]*?(?=\n## §V4)/, ''))
	const rNo = lint({ assetDir: noV3 })
	assert.equal(rNo.gates.find((g) => g.gate === 'voice-forbidden-term').status, 'no-input')

	const noFields = copyFixtureAsset(t)
	const v2 = fs.readFileSync(path.join(noFields, 'voice.md'), 'utf8')
	fs.writeFileSync(path.join(noFields, 'voice.md'), v2.replace(/## §V3 词汇[\s\S]*?(?=\n## §V4)/, '## §V3 词汇\n\n- prefer：记录\n\n'))
	const rFields = lint({ assetDir: noFields, html: mutateHtml('研究方法', '一站式研究方法') })
	assert.equal(rFields.gates.find((g) => g.gate === 'voice-forbidden-term').status, 'no-input')
	assert.equal(rFields.findings.filter((f) => f.gate === 'voice-forbidden-term').length, 0)
})

test('yaml 围栏解析失败整块跳过（已知盲区：围栏是唯一词源时本门 no-input 报绿）', (t) => {
	const dir = copyFixtureAsset(t)
	const voice = fs.readFileSync(path.join(dir, 'voice.md'), 'utf8')
	fs.writeFileSync(
		path.join(dir, 'voice.md'),
		voice.replace(
			/## §V3 词汇[\s\S]*?(?=\n## §V4)/,
			`## §V3 词汇

\`\`\`yaml
avoid:
  - { term: 点击这里, replace: 了解详情
\`\`\`

`,
		),
	)
	const r = lint({ assetDir: dir, html: mutateHtml('研究方法', '点击这里') })
	assert.equal(r.verdict, 'pass')
	assert.equal(r.gates.find((g) => g.gate === 'voice-forbidden-term').status, 'no-input')
	assert.equal(r.findings.filter((f) => f.gate === 'voice-forbidden-term').length, 0)
})

test('ASCII 词大小写不敏感，含 CJK 的原样比', (t) => {
	const dir = copyFixtureAsset(t)
	const voice = fs.readFileSync(path.join(dir, 'voice.md'), 'utf8')
	fs.writeFileSync(
		path.join(dir, 'voice.md'),
		voice.replace(
			/## §V3 词汇[\s\S]*?(?=\n## §V4)/,
			`## §V3 词汇

- avoid：lorem · 一站式

`,
		),
	)
	const ascii = lint({ assetDir: dir, html: mutateHtml('研究方法', 'Lorem 研究方法') })
	assert.ok(ascii.findings.some((f) => f.gate === 'voice-forbidden-term' && f.term === 'lorem'))

	const cjk = lint({ assetDir: dir, html: mutateHtml('研究方法', '一站式') })
	assert.ok(cjk.findings.some((f) => f.term === '一站式'))
})
