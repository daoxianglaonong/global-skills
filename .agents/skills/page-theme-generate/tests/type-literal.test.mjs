/**
 * 门十一 `type-literal`：圆角 / 间距 / 描边宽写死 px 数值即阻断。
 *
 * 这道门补的是一个自相矛盾：`SKILL.md` 的产出形状写着「色值 / 字体 / 间距都是 `var()`」，
 * 优化模式一直有 `type-accept-fulfillment` / `type-literal-backing` 管这三类，创造模式却
 * 一条都不扫——`border-radius: 12px` / `gap: 24px` 过全部门，本文件的合格夹具原来就那么写。
 *
 * 失败用例照本包的规矩从合格夹具**改一处**派生（`mutateCss`），并逐条断言「只挂这一道」：
 * 一条会同时点亮别的门的输入，证明不了这道门自己关住了什么。
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { lintFloor } from '../scripts/lint-floor.mjs'
import { gateTypeLiteral } from '../scripts/lib/gates.mjs'
import { kindOf } from '../scripts/lib/type-rows.mjs'
import { loadClosedSet } from '../scripts/lib/closed-set.mjs'
import { FIXTURE_ASSET, goodHtml, goodCss, mutateCss } from './helpers.mjs'

const lint = (css) => lintFloor({ assetDir: FIXTURE_ASSET, html: goodHtml(), css: [{ file: 'floor.css', text: css }] })
const gatesHit = (result) => [...new Set(result.findings.map((f) => f.gate))].sort()

test('圆角写死 px 就挂，且只挂这一道', () => {
	// 票面点名的那条输入。12px 正是 dimension.radius.2 的值——「反正值是对的」不豁免，
	// 与色值门同一条理由：改一次资产，这一处静默地留在旧值上。
	const r = lint(mutateCss('border-radius: var(--shape-radius-container);', 'border-radius: 12px;'))
	assert.equal(r.verdict, 'blocked')
	assert.deepEqual(gatesHit(r), ['type-literal'])
	assert.equal(r.findings[0].prop, 'border-radius')
	assert.equal(r.findings[0].value, '12px')
	assert.equal(r.findings[0].kind, 'radius')
})

test('间距写死 px 就挂：gap 与 padding 同判', () => {
	for (const [from, to, prop] of [
		['gap: var(--dimension-spacing-2);', 'gap: 24px;', 'gap'],
		['padding: var(--dimension-spacing-2);', 'padding: 24px;', 'padding'],
	]) {
		const r = lint(mutateCss(from, to))
		assert.equal(r.verdict, 'blocked', `${to} 应当挂`)
		assert.deepEqual(gatesHit(r), ['type-literal'])
		assert.equal(r.findings[0].prop, prop)
	}
})

test('报错点名该引哪个闭集名：同值、同类目无此值、该类目零 token 三句话各不相同', () => {
	// 判不出该引谁的时候要说「该类目没有」，不能让人以为自己没找对名字——间距在真实资产里
	// 常常只有 primitive、零角色，这三种处境都会真实碰到。
	const exact = lint(mutateCss('border-radius: var(--shape-radius-container);', 'border-radius: 12px;'))
	assert.match(exact.findings[0].reason, /同值可引 `--dimension-radius-2` \/ `--shape-radius-container`/)

	const noSuchValue = lint(mutateCss('padding: var(--dimension-spacing-2);', 'padding: 20px;'))
	assert.match(noSuchValue.findings[0].reason, /space 类目没有 20px，可引的是 `--dimension-spacing-1`\(16px\)/)

	// 这份资产一条 borderWidth token 都没有，所以描边宽那一档只能报「无可引」。
	const noToken = lint(`${goodCss()}\n.pt-feature-grid__card { border-width: 2px; }\n`)
	assert.equal(noToken.verdict, 'blocked')
	assert.deepEqual(gatesHit(noToken), ['type-literal'])
	assert.match(noToken.findings[0].reason, /stroke 类目一条 token 都没有/)
})

test('「名字在闭集内」那一半由门三判，本门不重复报', () => {
	// 本票要的判据是「必须是 var() 且名字在闭集内」，两半分属两道门：本门判是不是字面量，
	// var-not-in-closed-set 扫每条声明里的每个 var()，这几个 prop 一个不漏。
	const r = lint(mutateCss('border-radius: var(--shape-radius-container);', 'border-radius: var(--dimension-radius-99);'))
	assert.equal(r.verdict, 'blocked')
	assert.deepEqual(gatesHit(r), ['var-not-in-closed-set'])
})

test('轨道尺寸一个字不动：布局量不进本门白名单', () => {
	// repeat(3, 360px) 是 patterns yaml 的 responsive 实测值，资产不为它出 token。
	// 收它等于要求楼层几何也去查闭集，而闭集里根本没有那一层东西。
	assert.match(goodCss(), /grid-template-columns: repeat\(3, 360px\);/, '合格夹具的轨道尺寸应当仍是字面量')
	assert.equal(lint(goodCss()).verdict, 'pass')
	for (const prop of ['grid-template-columns', 'width', 'height', 'max-width', 'line-height']) {
		assert.equal(kindOf(prop), null, `${prop} 是布局 / 排印尺寸，不该进非色类目`)
	}
})

test('零值与关键字不误伤', () => {
	// 合格夹具里 `padding: 0` 与 `margin: 0 auto` 原样留着：0 不是主题量，资产不会为它出
	// token，判它违例只会逼人给每个 0 裁一次。
	assert.match(goodCss(), /padding: 0;/)
	assert.match(goodCss(), /margin: 0 auto;/)
	assert.equal(lint(goodCss()).verdict, 'pass')
})

test('射程边界：非 px 长度与复合简写本门放行，与非色表 outOfScope 同口径', () => {
	// 这两条是**已知放行**，不是漏判。写在这里是为了下一个人知道洞在哪：换成 rem 或塞进
	// border 简写都能溜过去。要收它们得先在非色表那侧一起收，否则两侧又是两套标准。
	assert.equal(lint(mutateCss('padding: var(--dimension-spacing-2);', 'padding: 1.5rem;')).verdict, 'pass')
	assert.equal(lint(goodCss()).findings.length, 0, '合格夹具的 `border: 1px solid var(...)` 里的 1px 不判')
})

test('第三方 widget 子树豁免，自定义属性声明不进射程', () => {
	assert.equal(lint(`${goodCss()}\n[data-pt-widget="third-party"] .x { border-radius: 12px; }`).verdict, 'pass')

	// token 层那一片声明的右侧按定义全是字面量，扫它等于要求资产不许有值。不留洞的理由在
	// 别处：就地自造一个名字再引用它，会在引用处被闭集门挡下。
	const r = lint(`${goodCss()}\n.x { --my-space: 24px; gap: var(--my-space); }`)
	assert.deepEqual(gatesHit(r), ['unresolved-var', 'var-not-in-closed-set'])
})

test('判据能被单独喂声明数组，不必现造一份 HTML', () => {
	const closedSet = loadClosedSet(FIXTURE_ASSET)
	const decl = (prop, value) => [{ file: 'x.css', selector: '.x', prop, value }]

	assert.equal(gateTypeLiteral(decl('border-radius', '12px'), closedSet).length, 1)
	assert.equal(gateTypeLiteral(decl('border-radius', 'var(--shape-radius-container)'), closedSet).length, 0)
	assert.equal(gateTypeLiteral(decl('padding', '12px 24px'), closedSet).length, 2, '一条声明里两个字面量各记一条')
	assert.equal(gateTypeLiteral(decl('grid-template-columns', 'repeat(3, 360px)'), closedSet).length, 0)
})
