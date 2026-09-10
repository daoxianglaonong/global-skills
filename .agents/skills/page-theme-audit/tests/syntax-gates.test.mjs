/**
 * 五道从 generate 照搬的语法门：色值字面量、字体栈、闭集、双闸门的接线。
 *
 * 每条失败用例都从合格产物改一处派生。本文件里各门那条「真会挂的输入」：
 * - color-literal：`border: 1px solid #e5e7eb`
 * - font-stack-literal：`font-family: var(--fontFamily-sans), "Comic Sans MS"`
 * - var-not-in-closed-set：`var(--color-surface-inverse)`
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { lintArtifact } from '../scripts/lint-artifact.mjs'
import { colorLiterals, declaredFontFamilies } from '../scripts/lib/gates.mjs'
import { loadClosedSet } from '../scripts/lib/closed-set.mjs'
import { FIXTURE_ASSET, goodHtml, goodCss, mutateCss } from './helpers.mjs'

const lint = (css, extra = {}) =>
	lintArtifact({
		assetDir: FIXTURE_ASSET,
		files: [
			{ file: 'floor.html', text: extra.html ?? goodHtml() },
			{ file: 'floor.css', text: css },
		],
		...extra,
	})
const gatesHit = (result) => [...new Set(result.findings.map((f) => f.gate))].sort()

test('合格产物过全部门', () => {
	const r = lint(goodCss())
	assert.equal(r.verdict, 'pass', `合格产物不该挂，实际挂了：\n${r.findings.map((f) => `[${f.gate}] ${f.reason}`).join('\n')}`)
	assert.ok(r.declarationCount > 20, '应当真的扫到了声明，而不是空扫一遍就说通过')
	assert.equal(r.gates.length, 10, 'gates[] 十行恒在')
})

test('色值字面量：复合值里嵌的色也要抓出来', () => {
	const r = lint(mutateCss('border: 1px solid var(--color-border-default);', 'border: 1px solid #e5e7eb;'))
	assert.equal(r.verdict, 'blocked')
	assert.deepEqual(gatesHit(r), ['color-literal'], '只该挂色值字面量这一道')
	assert.equal(r.findings[0].value, '#e5e7eb')
})

test('色值字面量：命中某个 token 的值也不豁免', () => {
	const r = lint(mutateCss('background-color: var(--color-primary);', 'background-color: #0f7a6c;'))
	assert.equal(r.verdict, 'blocked')
	assert.deepEqual(gatesHit(r), ['color-literal'])
})

test('色值字面量：inherit / currentColor 这类不是色值，不得误伤', () => {
	const r = lint(mutateCss('color: var(--color-text-muted);', 'color: inherit;'))
	assert.equal(r.verdict, 'pass', 'inherit 没有任何 token 能替代它，判它违例会逼生成侧编一个假 token')
})

test('色值字面量：第三方 widget 子树豁免，但必须带得到标记', () => {
	const withMarker = lint(`${goodCss()}\n[data-pt-widget="third-party"] .x { color: #ff0000; }`)
	assert.equal(withMarker.verdict, 'pass', '第三方控件内部色不归本站主题管')

	const withoutMarker = lint(`${goodCss()}\n.some-embed .x { color: #ff0000; }`)
	assert.equal(withoutMarker.verdict, 'blocked', '读不到标记就不豁免，否则「说自己是 widget」会变成一句免检咒语')
})

test('字体栈：资产没声明过的字体族要挂', () => {
	const r = lint(mutateCss('font-family: var(--fontFamily-sans);', 'font-family: "Comic Sans MS", cursive;'))
	assert.equal(r.verdict, 'blocked')
	assert.deepEqual(gatesHit(r), ['font-stack-literal'])
	assert.ok(r.findings.some((f) => f.value === 'comic sans ms'))
})

test('字体栈：var() 打头不等于整串免检', () => {
	const r = lint(mutateCss('font-family: var(--fontFamily-sans);', 'font-family: var(--fontFamily-sans), "Comic Sans MS";'))
	assert.equal(r.verdict, 'blocked')
	assert.deepEqual(gatesHit(r), ['font-stack-literal'], 'var() 那一段是正当引用，只该挂后面那个族')
	assert.ok(r.findings.some((f) => f.value === 'comic sans ms'))
})

test('字体栈：var() 的 fallback 里的族名照样要查', () => {
	const bad = lint(mutateCss('font-family: var(--fontFamily-sans);', 'font-family: var(--fontFamily-sans, "Comic Sans MS");'))
	assert.equal(bad.verdict, 'blocked')
	assert.deepEqual(gatesHit(bad), ['font-stack-literal'])

	const ok = lint(mutateCss('font-family: var(--fontFamily-sans);', 'font-family: var(--fontFamily-sans, var(--fontFamily-sans));'))
	assert.equal(ok.verdict, 'pass', '嵌套 var() 的 fallback 不该被读成一个叫 "var(--fontFamily-sans" 的族')
})

test('字体栈：资产确实声明过的族，字面写也放行', () => {
	const closedSet = loadClosedSet(FIXTURE_ASSET)
	const declared = [...declaredFontFamilies(closedSet)]
	assert.ok(declared.length > 0, '资产应当声明过至少一个字体族，否则本条无从验起')

	const r = lint(mutateCss('font-family: var(--fontFamily-sans);', `font-family: "${declared[0]}";`))
	assert.equal(r.verdict, 'pass', `资产声明过 ${declared[0]}，字面写不构成换站`)
})

test('变量解析：引用本资产闭集里没有的变量要挂，且只挂这一道', () => {
	const r = lint(mutateCss('background-color: var(--color-surface-default);', 'background-color: var(--color-surface-inverse);'))
	assert.equal(r.verdict, 'blocked')
	assert.deepEqual(gatesHit(r), ['var-not-in-closed-set'], '只该挂闭集这一道：名字形状完全正当，唯一的问题是查不到')
	assert.ok(r.findings.some((f) => f.var === '--color-surface-inverse'))
})

test('变量解析：刻度越界同样只挂闭集门', () => {
	const r = lint(mutateCss('font-size: var(--dimension-fontSize-2);', 'font-size: var(--dimension-fontSize-99);'))
	assert.equal(r.verdict, 'blocked')
	assert.deepEqual(gatesHit(r), ['var-not-in-closed-set'])
})

test('变量解析：alias 目标的变量名也是合法引用', () => {
	const closedSet = loadClosedSet(FIXTURE_ASSET)
	const aliasVars = closedSet.entries.map((e) => e.aliasVar).filter(Boolean)
	assert.ok(aliasVars.length > 0, 'fixture 应当有 alias 行，否则本条无从验起')
	for (const name of new Set(aliasVars)) assert.ok(closedSet.has(name), `${name} 是 alias 目标，应当算合法引用`)
})

test('变量解析：fallback 与一值两引都要各自查，不能被 core 的剥壳误判', () => {
	const ok = lint(mutateCss('color: var(--color-text-default);', 'color: var(--color-text-default, var(--color-text-muted));'))
	assert.equal(ok.verdict, 'pass', 'fallback 里两个名字都在闭集里，不该挂')

	const bad = lint(mutateCss('color: var(--color-text-default);', 'color: var(--color-text-default, var(--color-nope-9));'))
	assert.equal(bad.verdict, 'blocked', 'fallback 里的名字同样要查')
	assert.ok(bad.findings.some((f) => f.var === '--color-nope-9'))
})

test('色值字面量：命名色是色值，不能因为没写 hex 就放过', () => {
	const r = lint(mutateCss('color: var(--color-text-default);', 'color: white;'))
	assert.equal(r.verdict, 'blocked')
	assert.deepEqual(gatesHit(r), ['color-literal'])
	assert.equal(r.findings[0].value, 'white')
})

test('色值抽取器认得复合值里的各种写法', () => {
	assert.deepEqual(colorLiterals('1px solid #fff'), ['#fff'])
	assert.deepEqual(colorLiterals('0 1px 2px rgba(0,0,0,.2)'), ['rgba(0,0,0,.2)'])
	assert.deepEqual(colorLiterals('linear-gradient(#fff,#000)'), ['#fff', '#000'])
	assert.deepEqual(colorLiterals('oklch(0.7 0.1 200)'), ['oklch(0.7 0.1 200)'])
	assert.deepEqual(colorLiterals('1px solid teal'), ['teal'], '命名色同样要抓')
	assert.deepEqual(colorLiterals('var(--color-primary)'), [], 'var() 引用不是字面量')
	assert.deepEqual(colorLiterals('repeat(3, 360px)'), [], '不得把无关函数当色值')
})

test('色值抽取器不在正当写法上误报', () => {
	assert.deepEqual(colorLiterals('var(--color-teal-2)'), [], '自定义属性名里的色相词不是用色')
	assert.deepEqual(colorLiterals('url(#eeeeee)'), [], 'SVG 片段标识不是 hex')
	assert.deepEqual(colorLiterals('"#fff"'), [], '引号里的是文本内容')
	assert.deepEqual(colorLiterals('Tan, sans-serif', { named: false }), [], '排印属性上按色判必然误报，那一侧另有字体栈门守着')
})

test('嵌入 <style> 的单文件产物同样进射程', () => {
	const single = (css) =>
		lintArtifact({
			assetDir: FIXTURE_ASSET,
			files: [{ file: 'floor.html', text: `${goodHtml()}\n<style>${css}</style>` }],
		})

	const ok = single(goodCss())
	assert.equal(ok.verdict, 'pass')
	assert.ok(ok.declarationCount > 20, '嵌入样式应当被真的扫到，而不是空扫一遍就说通过')

	const bad = single(mutateCss('border: 1px solid var(--color-border-default);', 'border: 1px solid #e5e7eb;'))
	assert.equal(bad.verdict, 'blocked', '藏在 <style> 里的字面量不该有豁免')
	assert.deepEqual(gatesHit(bad), ['color-literal'])
})

test('自定义属性声明不进色值门，但自造的名字会在引用处挂', () => {
	const r = lint(`${goodCss()}\n.x { --my-brand: #f00; color: var(--my-brand); }`)
	assert.equal(r.verdict, 'blocked')
	assert.ok(!gatesHit(r).includes('color-literal'), 'token 层那一片声明的右侧按定义全是字面量，扫它等于要求资产不许有值')
	assert.ok(
		r.findings.every((f) => f.var === '--my-brand'),
		'挂在引用处，不挂在声明处',
	)
	assert.ok(gatesHit(r).includes('var-not-in-closed-set'), '这份资产里没有这个 token')
})
