/**
 * 内容锁：只抽不判。六样标签序列（可见文本 / href / src / alt / srcset / poster）、
 * CSS 声明里的 `url()` 序列、实体与空白归一、`--after` 多出的 HTML 不判。
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
	extractTextSequence,
	extractAttrSequence,
	extractContentLock,
	extractCssUrlSequence,
	urlArgs,
} from '../scripts/lib/content-lock.mjs'
import { gateContentLock } from '../scripts/lib/migration-gates.mjs'
import { scanCss } from '../scripts/lib/css-scan.mjs'

const SAMPLE = `<section>
	<!-- 注释里的字不该进序列 -->
	<style>.x { color: red; }</style>
	<script>document.title = '运行时拼的字'</script>
	<h2>研究方法</h2>
	<p>你好&amp;世界</p>
	<a href="/docs">文档</a>
	<img src="hero.png" alt="封面">
	<img src='thumb.png' alt='缩略'>
</section>`

test('可见文本：剔 script / style / 注释，解码实体，空白归一，有序序列', () => {
	const text = extractTextSequence(SAMPLE)
	assert.deepEqual(text, ['研究方法', '你好&世界', '文档'])
})

test('可见文本：改缩进与 formatter 空白不改变序列', () => {
	const compact = extractTextSequence('<h2>研究方法</h2><p>你好  世界</p>')
	const spaced = extractTextSequence('<h2>\n  研究方法\n</h2>\n<p>你好   世界</p>')
	assert.deepEqual(compact, ['研究方法', '你好 世界'])
	assert.deepEqual(spaced, compact)
})

test('实体：六条表内解码，&nbsp; 被空白归一吃掉；表外原样留着', () => {
	assert.deepEqual(extractTextSequence('<p>A&nbsp;B</p>'), ['A B'])
	assert.deepEqual(extractTextSequence('<p>A B</p>'), ['A B'])
	assert.deepEqual(extractTextSequence('<p>foo&hellip;</p>'), ['foo&hellip;'])
	assert.deepEqual(extractTextSequence('<p>foo…</p>'), ['foo…'])
	assert.notDeepEqual(extractTextSequence('<p>foo&hellip;</p>'), extractTextSequence('<p>foo…</p>'))
	assert.deepEqual(extractTextSequence('<p>&lt;x&gt; &quot;y&#39;</p>'), ['<x> "y\''])
})

test('href / src / alt：按文档序收，原样比，不归一大小写、不解析相对路径', () => {
	const lock = extractContentLock(SAMPLE)
	assert.deepEqual(lock.href, ['/docs'])
	assert.deepEqual(lock.src, ['hero.png', 'thumb.png'])
	assert.deepEqual(lock.alt, ['封面', '缩略'])
	assert.notDeepEqual(extractAttrSequence('<a href="/Docs">x</a>', 'href'), extractAttrSequence('<a href="/docs">x</a>', 'href'))
	assert.notDeepEqual(extractAttrSequence('<a href="./a">x</a>', 'href'), extractAttrSequence('<a href="a">x</a>', 'href'))
})

test('内容锁模块只抽不判：抽取结果没有 gate / code / verdict', () => {
	const lock = extractContentLock(SAMPLE)
	assert.ok(!('gate' in lock) && !('code' in lock) && !('verdict' in lock))
	for (const seq of [lock.text, lock.href, lock.src, lock.alt, lock.srcset, lock.poster]) {
		assert.ok(Array.isArray(seq))
		assert.ok(seq.every((s) => typeof s === 'string'))
	}
})

test('srcset 按所有开标签收：`<picture><source>` 与 `<img>` 在同一条序列里', () => {
	const lock = extractContentLock(
		'<picture><source srcset="wide.webp 2x" type="image/webp"><img src="narrow.jpg" srcset="narrow.jpg 1x" alt="x"></picture>',
	)
	assert.deepEqual(lock.srcset, ['wide.webp 2x', 'narrow.jpg 1x'])
	assert.deepEqual(lock.src, ['narrow.jpg'])
})

test('srcset 原样比：描述符不拆、不排序、空白不折', () => {
	assert.notDeepEqual(
		extractAttrSequence('<img srcset="a.png 1x, b.png 2x">', 'srcset'),
		extractAttrSequence('<img srcset="a.png 1x,b.png 2x">', 'srcset'),
	)
	assert.notDeepEqual(
		extractAttrSequence('<img srcset="a.png 1x, b.png 2x">', 'srcset'),
		extractAttrSequence('<img srcset="b.png 2x, a.png 1x">', 'srcset'),
	)
})

test('poster 与 src 是两条独立序列', () => {
	const lock = extractContentLock('<video src="a.mp4" poster="cover.jpg"></video>')
	assert.deepEqual(lock.poster, ['cover.jpg'])
	assert.deepEqual(lock.src, ['a.mp4'])
})

test('url() 括号配平：data-URI 里的嵌套括号与分号不把参数截断', () => {
	assert.deepEqual(urlArgs('url("data:image/svg+xml;utf8,<svg fill=\'red\'></svg>")'), [
		"data:image/svg+xml;utf8,<svg fill='red'></svg>",
	])
	assert.deepEqual(urlArgs('linear-gradient(#000, #fff), url(a.png), url("b.png")'), ['a.png', 'b.png'])
})

test('url() 剥一层引号：三种写法在 CSS 里是同一件事', () => {
	assert.deepEqual(urlArgs('url(a.png)'), urlArgs('url("a.png")'))
	assert.deepEqual(urlArgs("url('a.png')"), urlArgs('url( "a.png" )'))
})

test('url() 不 resolve 相对路径、不剥 query：与 src 同族的已知宽度', () => {
	assert.notDeepEqual(urlArgs('url(./a.png)'), urlArgs('url(a.png)'))
	assert.notDeepEqual(urlArgs('url(a.png?v=1)'), urlArgs('url(a.png)'))
})

test('url() 射程收窄四处：data: / #fragment / 自定义属性 / widget 都不进序列', () => {
	const decls = scanCss(
		'.a { background-image: url("data:image/svg+xml;utf8,<svg/>"); }\n' +
			'.b { clip-path: url(#mask); }\n' +
			':root { --icon: url(from-var.png); }\n' +
			'[data-pt-widget="third-party"] .c { background: url(mejs-controls.svg); }\n' +
			'.d { background-image: url("keep.png"); }\n',
		'x.css',
	)
	assert.deepEqual(extractCssUrlSequence(decls).get('x.css'), ['keep.png'])
})

test('url() 序列按文件分组：内联 style= 也算，但不与 .css 混成一条', () => {
	const decls = [
		{ file: 'a.css', selector: '.a', prop: 'background-image', value: 'url(a.png)', widget: false },
		{ file: 'b.html', selector: '<div inline>', prop: 'background-image', value: 'url(b.png)', widget: false },
	]
	const byFile = extractCssUrlSequence(decls)
	assert.deepEqual([...byFile.keys()].sort(), ['a.css', 'b.html'])
	assert.deepEqual(byFile.get('a.css'), ['a.png'])
})

test('--after 多出来的 HTML 不判', () => {
	const before = [{ file: 'keep.html', text: '<p>原句</p>' }]
	const after = [
		{ file: 'keep.html', text: '<p>原句</p>' },
		{ file: 'extra.html', text: '<p>新增页不是改内容</p><a href="/new">x</a>' },
	]
	const findings = gateContentLock({ beforeHtml: before, afterHtml: after })
	assert.deepEqual(findings, [])
})

test('全角半角标点不是空白，抓得住', () => {
	const findings = gateContentLock({
		beforeHtml: [{ file: 'a.html', text: '<p>你好，世界</p>' }],
		afterHtml: [{ file: 'a.html', text: '<p>你好,世界</p>' }],
	})
	assert.ok(findings.some((f) => f.code === 'text-changed'))
})

test('文本中间插换行：原先无空白则归一后多出一个空格，抓得住', () => {
	const findings = gateContentLock({
		beforeHtml: [{ file: 'a.html', text: '<p>你好世界</p>' }],
		afterHtml: [{ file: 'a.html', text: '<p>你好\n世界</p>' }],
	})
	assert.ok(findings.some((f) => f.code === 'text-changed' && f.before === '你好世界' && f.after === '你好 世界'))
})

test('全角空格与半角空格归一后相同，抓不住（与 &nbsp; 同族）', () => {
	const findings = gateContentLock({
		beforeHtml: [{ file: 'a.html', text: '<p>你好 世界</p>' }],
		afterHtml: [{ file: 'a.html', text: '<p>你好　世界</p>' }],
	})
	assert.deepEqual(findings, [])
})
