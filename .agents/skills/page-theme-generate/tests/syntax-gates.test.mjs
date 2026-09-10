/**
 * 三条语法级自检门：色值字面量、字体栈、变量解析。
 *
 * 三条都是「产物在语法层面有没有背叛资产」，都可证伪，所以都不设报警档——一处色值字面量
 * 就是一处色值字面量，没有程度问题。
 *
 * 每条门的失败用例都从合格产物**改一处**派生。这不是为了省事：手写两份「近乎相同」的
 * 输入，改判据时总会漏同步一半，于是某道门的失败用例悄悄变成了两处违例，而它本该证明的
 * 恰恰是「只这一处也会挂」。
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { lintFloor } from '../scripts/lint-floor.mjs'
import { colorLiterals, declaredFontFamilies } from '../scripts/lib/gates.mjs'
import { loadClosedSet } from '../scripts/lib/closed-set.mjs'
import { FIXTURE_ASSET, goodHtml, goodCss, mutateCss } from './helpers.mjs'

const lint = (css) => lintFloor({ assetDir: FIXTURE_ASSET, html: goodHtml(), css: [{ file: 'floor.css', text: css }] })
const gatesHit = (result) => [...new Set(result.findings.map((f) => f.gate))].sort()

test('合格楼层过全部门', () => {
	const r = lint(goodCss())
	assert.equal(r.verdict, 'pass', `合格楼层不该挂，实际挂了：\n${r.findings.map((f) => `[${f.gate}] ${f.reason}`).join('\n')}`)
	assert.ok(r.declarationCount > 20, '应当真的扫到了声明，而不是空扫一遍就说通过')
})

test('色值字面量：复合值里嵌的色也要抓出来', () => {
	// 这一条是最容易漏的：写 `color:` 时人人记得用变量，写 `border:` 简写时顺手就把 hex
	// 打进去了。core 的 parseCssColor 对复合值一律返回 null，所以判据必须自己扫。
	const r = lint(mutateCss('border: 1px solid var(--color-border-default);', 'border: 1px solid #e5e7eb;'))
	assert.equal(r.verdict, 'blocked')
	assert.deepEqual(gatesHit(r), ['color-literal'], '只该挂色值字面量这一道')
	assert.equal(r.findings[0].value, '#e5e7eb')
})

test('色值字面量：命中某个 token 的值也不豁免', () => {
	// #0f7a6c 正是 fixture 里 color.primary 解出来的值。放行「反正值是对的」会造成
	// 一种最难查的失配：改一次资产，这一处静默地留在旧值上。
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
	// 这是本门的头号踩法，也是最像「好意」的一种：前半段规规矩矩引资产变量，后半段顺手
	// 补一个「更安全的系统字体兜底」。整串以 var( 开头就跳过的实现正好放过它。
	const r = lint(mutateCss('font-family: var(--fontFamily-sans);', 'font-family: var(--fontFamily-sans), "Comic Sans MS";'))
	assert.equal(r.verdict, 'blocked')
	assert.deepEqual(gatesHit(r), ['font-stack-literal'], 'var() 那一段是正当引用，只该挂后面那个族')
	assert.ok(r.findings.some((f) => f.value === 'comic sans ms'))
})

test('字体栈：var() 的 fallback 里的族名照样要查', () => {
	// fallback 是会真正生效的字体，不是注释。顺带证明按顶层逗号切没把 var(a, b) 撕成两半。
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
	// 独占失败输入是这道门的关键：--color-surface-inverse 是**合法的** T-46 语义角色名，
	// 反解得干干净净，双闸门都不亮——形状上无可指摘，只是这份资产没有这个 token。
	// 若失败用例挑的是 --color-brand-primary 那种连双闸门也一起亮的名字，那么「拆掉闭集门
	// 也照样红」，这道门到底关住了什么就没人证明得了。
	const r = lint(mutateCss('background-color: var(--color-surface-default);', 'background-color: var(--color-surface-inverse);'))
	assert.equal(r.verdict, 'blocked')
	assert.deepEqual(gatesHit(r), ['var-not-in-closed-set'], '只该挂闭集这一道：名字形状完全正当，唯一的问题是查不到')
	assert.ok(r.findings.some((f) => f.var === '--color-surface-inverse'))
})

test('变量解析：刻度越界同样只挂闭集门', () => {
	// 另一半射程：非颜色的 primitive 名字反解也没问题（`dimension.*` 是正经顶层组），
	// 但这份资产的字号阶只到 fontSize-2。要第 99 阶不是分层错误，是这份资产没有那一阶。
	const r = lint(mutateCss('font-size: var(--dimension-fontSize-2);', 'font-size: var(--dimension-fontSize-99);'))
	assert.equal(r.verdict, 'blocked')
	assert.deepEqual(gatesHit(r), ['var-not-in-closed-set'])
})

test('变量解析：alias 目标的变量名也是合法引用', () => {
	// 契约 §7.1：alias 行的生成写法是 var(--aliasVar)，写的是别名的变量名而不是把链尾
	// hex 拍进去。漏收 aliasVar 会把正当引用判成违例。
	const closedSet = loadClosedSet(FIXTURE_ASSET)
	const aliasVars = closedSet.entries.map((e) => e.aliasVar).filter(Boolean)
	assert.ok(aliasVars.length > 0, 'fixture 应当有 alias 行，否则本条无从验起')
	for (const name of new Set(aliasVars)) assert.ok(closedSet.has(name), `${name} 是 alias 目标，应当算合法引用`)
})

test('变量解析：fallback 与一值两引都要各自查，不能被 core 的剥壳误判', () => {
	// core 的 classifyCssVar 只剥一层最外层 var(，遇到 fallback 会把逗号后面的残串当名字
	// 的一部分切，判出来的 layer 是假的。所以本包自己抽名字，抽出来的每个都单独查。
	const ok = lint(mutateCss('color: var(--color-text-default);', 'color: var(--color-text-default, var(--color-text-muted));'))
	assert.equal(ok.verdict, 'pass', 'fallback 里两个名字都在闭集里，不该挂')

	const bad = lint(mutateCss('color: var(--color-text-default);', 'color: var(--color-text-default, var(--color-nope-9));'))
	assert.equal(bad.verdict, 'blocked', 'fallback 里的名字同样要查')
	assert.ok(bad.findings.some((f) => f.var === '--color-nope-9'))
})

test('色值字面量：命名色是色值，不能因为没写 hex 就放过', () => {
	// `color: white` 与 `color: #fff` 是同一件事。只认 hex 与颜色函数等于门只关了一半，
	// 而漏掉的那一半恰好是手写时最顺手的一半。
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
	// 一道爱误报的门，用不了几次就会被整体关掉，所以这三类必须干净：
	assert.deepEqual(colorLiterals('var(--color-teal-2)'), [], '自定义属性名里的色相词不是用色')
	assert.deepEqual(colorLiterals('url(#eeeeee)'), [], 'SVG 片段标识不是 hex')
	assert.deepEqual(colorLiterals('"#fff"'), [], '引号里的是文本内容')
	assert.deepEqual(colorLiterals('Tan, sans-serif', { named: false }), [], '排印属性上按色判必然误报，那一侧另有字体栈门守着')
})

test('嵌入 <style> 的单文件楼层同样进射程', () => {
	// 楼层完全可以是一个自带样式的单文件 HTML，那时 `--css` 一份都不传。只扫内联 style=
	// 会让这种产物以「零声明」全绿通过——门看起来在，其实一条都没判。
	const single = (css) => lintFloor({ assetDir: FIXTURE_ASSET, html: `${goodHtml()}\n<style>${css}</style>` })

	const ok = single(goodCss())
	assert.equal(ok.verdict, 'pass')
	assert.ok(ok.declarationCount > 20, '嵌入样式应当被真的扫到，而不是空扫一遍就说通过')

	const bad = single(mutateCss('border: 1px solid var(--color-border-default);', 'border: 1px solid #e5e7eb;'))
	assert.equal(bad.verdict, 'blocked', '藏在 <style> 里的字面量不该有豁免')
	assert.deepEqual(gatesHit(bad), ['color-literal'])
})

test('自定义属性声明不进色值门，但自造的名字会在引用处挂', () => {
	// token 层那一片声明的右侧按定义全是字面量，扫它等于要求资产不许有值。放过它不留洞
	// 的理由在别处：就地自造一个变量再引用它，会在引用处被闭集门挡下。
	const r = lint(`${goodCss()}\n.x { --my-brand: #f00; color: var(--my-brand); }`)
	assert.equal(r.verdict, 'blocked')
	assert.ok(!gatesHit(r).includes('color-literal'), 'token 层那一片声明的右侧按定义全是字面量，扫它等于要求资产不许有值')
	assert.ok(
		r.findings.every((f) => f.var === '--my-brand'),
		'挂在引用处，不挂在声明处',
	)
	assert.ok(gatesHit(r).includes('var-not-in-closed-set'), '这份资产里没有这个 token')
})
