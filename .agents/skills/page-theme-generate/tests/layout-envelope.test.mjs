/**
 * 门十二 `layout-envelope`：资产 `layout-envelope.json` 的**阻断层**逐维落成判据。
 *
 * 本文件的组织方式是票面要求的形状：**阻断层每一维各附一条真的会挂的输入**，逐条断言到
 * 具体 code。只断言「整体退 1」不行——那样卸掉任意一维，别的维照样把用例撑成红的，一道空门
 * 可以躲在里面躲很久。逐维断言 code 之后，「卸掉某一维的判据，恰好这一维的用例转红」才是
 * 可复现的实验（实验记录在 `docs/tickets-page-theme-r4/R4-06.md`）。
 *
 * 另外三条守的是本门的边界，不是它的能力：
 * · **报警层不进门**——包络的 `advisory` 与产物公然打架，门仍全绿，且删掉整块 advisory 结果
 *   一个字节都不差。它是观测投影不是阈值，读它就是越界。
 * · **降级层不进门**——层籍由投影脚本判：一条规律落进 `demoted`，本门当场不再判它。
 * · **观测不当阈值**——第二维只判「contained 有宽 / full-bleed 无宽」两个方向，宽度值落不落在
 *   包络枚举出的集合里一个字不问。
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { admitAsset } from '../scripts/admit-asset.mjs'
import { lintFloor } from '../scripts/lint-floor.mjs'
import { scanArtifact } from '../scripts/lib/css-scan.mjs'
import { ARTIFACT_KINDS, checkLayoutEnvelope } from '../scripts/lib/layout-envelope-gate.mjs'
import {
	FIXTURE_ASSET,
	SCRIPTS_DIR,
	copyFixtureAsset,
	ctaFirstCss,
	ctaFirstHtml,
	goodCss,
	goodHtml,
	goodPageCss,
	goodPageHtml,
	goodPageTrace,
	kindTrace,
	patchFloorIndex,
	writeLayoutEnvelope,
} from './helpers.mjs'

/** 一份带包络的资产拷贝。两个 patch 各自可选：一个改资产漂移，一个改包络本身。 */
function assetWithEnvelope(t, { floorIndex, envelope } = {}) {
	const dir = copyFixtureAsset(t)
	writeLayoutEnvelope(dir, envelope)
	if (floorIndex) patchFloorIndex(dir, floorIndex)
	return dir
}

/**
 * 直接喂门。页级默认用合格页夹具，需要时换 html / css。
 *
 * `trace` 默认是「声明 page」的最小 trace：页级两维自 `R4-15` 起只判声明 `page` 的产物，默认
 * 不传就等于把维四第二码与维六整块关掉，那样下面七维里有两维验的是空气。
 */
function gate(assetDir, { html = goodPageHtml(), css = goodPageCss(), file = 'page.html', trace = kindTrace('page') } = {}) {
	const { declarations } = scanArtifact({ html, htmlFile: file, css: [{ file: 'page.css', text: css }] })
	return checkLayoutEnvelope({ htmlFiles: [{ file, text: html }], declarations, assetDir, trace })
}

const codes = (r) => r.findings.map((f) => f.code).sort()

const rootCount = (html) => (html.match(/data-pattern=/g) ?? []).length

/** 往整页里插一层，落在页脚之前。插在页脚之后会把页壳顶下末位，那是维四的靶子不是本维的。 */
function insertBeforeFooter(html, fragment) {
	const anchor = '<footer class="pt-footer"'
	if (!html.includes(anchor)) throw new Error('页级夹具里找不到页脚层根，插层用例造不出来')
	return html.replace(anchor, `${fragment}\n${anchor}`)
}

/** 从页级夹具上摘掉一端页壳。摘不掉就抛，不让「什么都没摘」冒充「摘干净了」。 */
function stripShell(html, tag) {
	const out = html.replace(new RegExp(`<${tag} class="pt-(?:navbar|footer)"[\\s\\S]*?</${tag}>\\s*`), '')
	if (rootCount(out) !== rootCount(html) - 1) throw new Error(`页级夹具里摘不掉 <${tag}> 页壳，缺页壳用例造不出来`)
	return out
}

const lintPage = (assetDir, { html = goodPageHtml(), css = goodPageCss(), trace = goodPageTrace() } = {}) =>
	lintFloor({ assetDir, html, htmlFile: 'page-good.html', css: [{ file: 'page-good.css', text: css }], trace })

/* ---------------------------------------------------------------- */
/* 开口条件                                                          */
/* ---------------------------------------------------------------- */

test('包络不存在时整门不开口，但准入已经把这份资产挡在前面了', (t) => {
	// `R4-10` 之后这一支不再是「容忍缺席」：包络在 `REQUIRED_FILES` 里，缺它准入就 incomplete /
	// reject，`lint-floor` 走不到这儿。门里留着它，是为了不在门内私造第二套准入——所以这条用例
	// 必须同时钉住两头：门不开口 **且** 同一份资产在准入被拒。只钉前一头，就是把降级路径留着。
	const dir = copyFixtureAsset(t)
	fs.rmSync(path.join(dir, 'layout-envelope.json'))
	const r = gate(dir)
	assert.equal(r.status, 'no-input')
	assert.deepEqual(r.findings, [])

	const admission = admitAsset(dir)
	assert.equal(admission.verdict, 'incomplete', '门不开口的那份资产必须在准入就被拒，否则两套口径并存')
	assert.equal(admission.nextAction, 'reject')
	assert.ok(admission.missing.includes('layout-envelope.json'))
})

test('冻结 fixture 自带包络，且过得了准入', () => {
	assert.ok(fs.existsSync(path.join(FIXTURE_ASSET, 'layout-envelope.json')), 'fixture 是本包的正例，缺必交件就当不了正例')
	assert.equal(admitAsset(FIXTURE_ASSET).verdict, 'ok')
})

test('合格页 + 包络：十二道门全绿', (t) => {
	const dir = assetWithEnvelope(t)
	const r = lintPage(dir)
	assert.equal(r.verdict, 'pass', `合格页不该挂：\n${r.findings.map((f) => `[${f.gate}] ${f.code ?? ''} ${f.reason}`).join('\n')}`)
	assert.equal(gate(dir).status, 'pass')
})

test('assetDir 缺席时不开口', () => {
	assert.equal(checkLayoutEnvelope({ htmlFiles: [{ file: 'x.html', text: goodPageHtml() }] }).status, 'no-input')
})

test('html 一份都没有时不开口：没有层根就没有序列可判', (t) => {
	const dir = assetWithEnvelope(t)
	assert.equal(checkLayoutEnvelope({ htmlFiles: [], declarations: [], assetDir: dir }).status, 'pass')
	assert.deepEqual(lintFloor({ assetDir: dir, html: goodPageHtml(), css: [], trace: null }).findings.filter((f) => f.gate === 'layout-envelope'), [])
})

/* ---------------------------------------------------------------- */
/* 两层的边界：报警层与降级层都不进门                                  */
/* ---------------------------------------------------------------- */

test('报警层不进门：advisory 与产物公然打架，门仍全绿', (t) => {
	// 夹具那条 advisory 写着「pc 档 5 层全是 1 列」，而合格页的 feature 是三列栅格。
	// 报警层是观测集合的如实投影，不做判定、不参与退出码、不阻断任何东西。
	const dir = assetWithEnvelope(t)
	const doc = JSON.parse(fs.readFileSync(path.join(dir, 'layout-envelope.json'), 'utf8'))
	assert.equal(doc.advisory[0].id, 'columns-pc', '这条 advisory 是本用例的靶子，删了本条就没在验什么')
	assert.equal(gate(dir).status, 'pass')
})

test('报警层不进门：整块 advisory 删掉，结果一个字节都不差', (t) => {
	const withAdvisory = gate(assetWithEnvelope(t))
	const without = gate(assetWithEnvelope(t, { envelope: (e) => { e.advisory = [] } }))
	assert.equal(JSON.stringify(withAdvisory), JSON.stringify(without), '读了报警层的实现，会在这两份输入上产出不同的结果')
})

test('降级层不进门：层籍由投影脚本判，门跟着包络走', (t) => {
	// 同一份越界资产：容器模式那条留在 blocking 就红，被降级进 demoted 就不判。
	const drift = (d, by) => { by.get('feature.grid-3-cards').container.mode = 'breakout' }
	assert.deepEqual(codes(gate(assetWithEnvelope(t, { floorIndex: drift }))), ['container-mode-out-of-envelope'])

	const demote = (e) => {
		const i = e.blocking.findIndex((r) => r.id === 'container-mode-closed-set')
		e.demoted.push({ ...e.blocking[i], demotedBecause: '出现反例，自动降级' })
		e.blocking.splice(i, 1)
	}
	assert.deepEqual(codes(gate(assetWithEnvelope(t, { floorIndex: drift, envelope: demote }))), [], '降级项被捞回来当门，就是把「反例为零」这张入场券作废')
})

/* ---------------------------------------------------------------- */
/* 包络自身读不动时不放行                                             */
/* ---------------------------------------------------------------- */

test('包络解不开：报 envelope-unreadable，不静默当全绿', (t) => {
	const dir = assetWithEnvelope(t)
	fs.writeFileSync(path.join(dir, 'layout-envelope.json'), '{')
	assert.deepEqual(codes(gate(dir)), ['envelope-unreadable'])
})

test('包络里没有数组形状的 blocking：同样不放行', (t) => {
	const dir = assetWithEnvelope(t, { envelope: (e) => { delete e.blocking } })
	assert.deepEqual(codes(gate(dir)), ['envelope-unreadable'])
})

test('某条规律的 detail 形状不认识：报到那一条上，不整门哑掉', (t) => {
	const dir = assetWithEnvelope(t, {
		envelope: (e) => { e.blocking.find((r) => r.id === 'body-starts-with-hero-or-page-header').detail = { byTaxonomy: 'hero' } },
	})
	const r = gate(dir)
	assert.deepEqual(codes(r), ['envelope-unreadable'])
	assert.equal(r.findings[0].at, 'blocking[body-starts-with-hero-or-page-header].detail.byTaxonomy')
})

test('包络多出一条本门没有判据的规律：报 envelope-rule-unimplemented', (t) => {
	// 反方向的空门：包络长出第八维而门一声不响，那一维就是「写在纸上、没人判」。
	const dir = assetWithEnvelope(t, {
		envelope: (e) => e.blocking.push({ id: 'future-rule', statement: 'x', counterexampleRule: 'y', evidence: { hits: 1, total: 1, unit: 'floor' }, counterexamples: [], detail: {} }),
	})
	const r = gate(dir)
	assert.deepEqual(codes(r), ['envelope-rule-unimplemented'])
	assert.equal(r.findings[0].rule, 'future-rule')
})

test('floor-index 读不出：报 floor-index-unreadable，型级四维不静默判成全绿', (t) => {
	const dir = assetWithEnvelope(t)
	fs.writeFileSync(path.join(dir, 'floor-index.json'), '{')
	const r = gate(dir)
	assert.deepEqual(codes(r), ['floor-index-unreadable'])
})

test('层根的型在资产里查不到：报 floor-pattern-unknown', (t) => {
	const dir = assetWithEnvelope(t)
	const html = goodPageHtml().replace('data-pattern="hero.centered-pitch"', 'data-pattern="pricing.table-3"')
	const r = gate(dir, { html })
	assert.ok(codes(r).includes('floor-pattern-unknown'))
	assert.equal(r.findings.find((f) => f.code === 'floor-pattern-unknown').pattern, 'pricing.table-3')
})

/* ---------------------------------------------------------------- */
/* 阻断层七维，各一条真的会挂的输入                                    */
/* ---------------------------------------------------------------- */

test('维一 容器模式：型的 container.mode 不在包络列出的模式内', (t) => {
	const dir = assetWithEnvelope(t, { floorIndex: (d, by) => { by.get('feature.grid-3-cards').container.mode = 'breakout' } })
	const r = gate(dir)
	assert.deepEqual(codes(r), ['container-mode-out-of-envelope'])
	assert.equal(r.findings[0].pattern, 'feature.grid-3-cards')
	assert.equal(r.findings[0].mode, 'breakout')
})

test('维一 容器模式：container 整块缺席同判', (t) => {
	const dir = assetWithEnvelope(t, { floorIndex: (d, by) => { delete by.get('hero.centered-pitch').container } })
	assert.deepEqual(codes(gate(dir)), ['container-mode-out-of-envelope', 'container-width-out-of-envelope'].filter((c) => c === 'container-mode-out-of-envelope'))
})

test('维二 容器宽：contained 缺 maxWidthPx', (t) => {
	const dir = assetWithEnvelope(t, { floorIndex: (d, by) => { delete by.get('feature.grid-3-cards').container.maxWidthPx } })
	const r = gate(dir)
	assert.deepEqual(codes(r), ['container-width-out-of-envelope'])
	assert.equal(r.findings[0].pattern, 'feature.grid-3-cards')
})

test('维二 容器宽：full-bleed 带了 maxWidthPx', (t) => {
	const dir = assetWithEnvelope(t, {
		floorIndex: (d, by) => { by.get('hero.centered-pitch').container.mode = 'full-bleed' },
		envelope: (e) => e.blocking.find((r) => r.id === 'container-mode-closed-set').detail.byMode.push({ mode: 'full-bleed', floors: 1 }),
	})
	assert.deepEqual(codes(gate(dir)), ['container-width-out-of-envelope'])
})

test('维二 只判方向，不判宽度值集合：把宽改成包络里没有的数仍放行', (t) => {
	// 包络自己写着「集合本身是观测，两条方向性判断才是本条的判据」。拿观测到的宽度集合当
	// 允许值清单，就是把报警口径偷偷塞进阻断层——这一条钉的就是那个越界。
	const dir = assetWithEnvelope(t, { floorIndex: (d, by) => { by.get('feature.grid-3-cards').container.maxWidthPx = 999 } })
	assert.deepEqual(codes(gate(dir)), [])
})

test('维三 并层间距：层根用负顶外边距把自己并进上一层', (t) => {
	const dir = assetWithEnvelope(t)
	const css = `${goodPageCss()}\n.pt-feature-grid--muted {\n\tmargin-top: calc(-1 * var(--dimension-spacing-2));\n}\n`
	const r = gate(dir, { css })
	assert.deepEqual(codes(r), ['merge-spacing-with-prev'])
	assert.equal(r.findings[0].selector, '.pt-feature-grid--muted')
	assert.equal(r.findings[0].pattern, 'feature.grid-3-cards')
})

test('维三 并层间距：`margin` 简写的顶边分量与裸负值同判', (t) => {
	const dir = assetWithEnvelope(t)
	assert.deepEqual(codes(gate(dir, { css: `${goodPageCss()}\n.pt-hero {\n\tmargin-top: -24px;\n}\n` })), ['merge-spacing-with-prev'])
	assert.deepEqual(codes(gate(dir, { css: `${goodPageCss()}\n.pt-hero {\n\tmargin: -24px auto 0;\n}\n` })), ['merge-spacing-with-prev'])
})

test('维三 并层间距：正当写法一律不误伤', (t) => {
	// 一道爱误报的门用不了几次就会被整体关掉。这三种都是正当写法：token 名字尾巴上的
	// `-2` 不是负号、`margin: 0 auto` 顶边是 0、负的下边距不是「并进上一层」。
	const dir = assetWithEnvelope(t)
	assert.deepEqual(codes(gate(dir, { css: `${goodPageCss()}\n.pt-hero {\n\tmargin-top: var(--dimension-spacing-2);\n}\n` })), [])
	assert.deepEqual(codes(gate(dir, { css: `${goodPageCss()}\n.pt-hero {\n\tmargin: 0 auto;\n}\n` })), [])
	assert.deepEqual(codes(gate(dir, { css: `${goodPageCss()}\n.pt-hero {\n\tmargin-bottom: -24px;\n}\n` })), [])
})

test('维三 并层间距：不是层根的选择器不进射程', (t) => {
	const dir = assetWithEnvelope(t)
	assert.deepEqual(codes(gate(dir, { css: `${goodPageCss()}\n.pt-feature-grid__card {\n\tmargin-top: -8px;\n}\n` })), [], '卡片自己往上挪不是楼层并进上一层')
})

test('维四 页壳两端：顶栏型不在首位', (t) => {
	const dir = assetWithEnvelope(t)
	const html = goodPageHtml().replace('<section class="pt-feature-grid pt-feature-grid--default"', '<section class="pt-navbar" data-pattern="navbar.utility-left"></section>\n<section class="pt-feature-grid pt-feature-grid--default"')
	const r = gate(dir, { html })
	assert.deepEqual(codes(r), ['page-shell-out-of-order'])
	assert.equal(r.findings[0].pattern, 'navbar.utility-left')
})

test('维四 页壳两端：页脚型不在末位', (t) => {
	const dir = assetWithEnvelope(t)
	// 夹在中间而不是放到最前：放最前会连正文起手那一维一起亮，验不出本维独占。
	const html = goodPageHtml().replace('<section class="pt-feature-grid pt-feature-grid--default"', '<footer class="pt-footer" data-pattern="footer.compact-three"></footer>\n<section class="pt-feature-grid pt-feature-grid--default"')
	assert.deepEqual(codes(gate(dir, { html })), ['page-shell-out-of-order'])
})

/**
 * 维四第二码的粒度口径，`R4-15` 之后是**声明**说了算，不是层根数。
 *
 * 三代口径：`R4-13` 之前首末只判位置，无页壳层根即零信号，代价是「整页忘了写页脚」谁也抓不住；
 * `R4-13` 改成「层根 ≥ 2 即按页级判」，代价是多层楼层片段被误伤、只有一层的页仍漏网；`R4-15`
 * 改读 `trace.artifact.kind`，两头代价一起关掉。下面三条各钉一头，缺一条就有一头能悄悄退回去。
 */
test('维四 页壳两端：声明 floor 的产物一条不开，多少层都一样', (t) => {
	const dir = assetWithEnvelope(t)
	const floor = kindTrace('floor')
	assert.deepEqual(codes(gate(dir, { html: goodHtml(), css: goodCss(), trace: floor })), [], '单层楼层片段不是「整页缺页壳」')
	// 这一条就是 `R4-13` 记的那类误伤：两层的楼层片段，按层根数猜会挨两条 ends-missing。
	assert.deepEqual(codes(gate(dir, { html: ctaFirstHtml(), css: ctaFirstCss(), trace: floor })), [], '≥ 2 层的楼层片段声明了 floor 就不该再被当成整页')
	const fiveLayerFragment = gate(dir, { html: goodPageHtml(), css: goodPageCss(), trace: floor })
	assert.deepEqual(codes(fiveLayerFragment), [], '声明与产物打架（5 层整页自称 floor）本门今天不判，见模块头')
})

test('维四 页壳两端：声明 page 的单层产物照判——只有一层的页不再漏网', (t) => {
	const dir = assetWithEnvelope(t)
	// 单层用 hero：它是包络列出的开场型，所以维六不会跟着亮，本条恰好只验维四这一维。
	const one = gate(dir, { html: '<section class="pt-hero" data-pattern="hero.centered-pitch"></section>\n', css: '', trace: kindTrace('page') })
	assert.deepEqual(codes(one), ['page-shell-ends-missing', 'page-shell-ends-missing'])
	assert.deepEqual(
		one.findings.map((f) => [f.end, f.taxonomy]).sort(),
		[
			['first', 'hero'],
			['last', 'hero'],
		],
	)
})

test('维四 页壳两端：声明 page 且首末不对，恰好开 page-shell-ends-missing', (t) => {
	const dir = assetWithEnvelope(t)

	// 只缺末层：首层仍是 navbar，所以恰好一条 finding，验得出「这一端」而不是「首末合起来」。
	const noFooter = stripShell(goodPageHtml(), 'footer')
	const one = gate(dir, { html: noFooter })
	assert.deepEqual(codes(one), ['page-shell-ends-missing'])
	assert.equal(one.findings[0].end, 'last')
	assert.equal(one.findings[0].pattern, 'feature.grid-3-cards')
	assert.equal(one.findings[0].at, 'roots[3]')

	// 首末都缺 = `R4-13` 之前那份「页级正例」夹具的原样（hero → feature → feature），两端各一条。
	const noShell = stripShell(noFooter, 'header')
	assert.equal(rootCount(noShell), 3, '派生后必须只剩三层，否则验的不是当年那份无页壳序列')
	const both = gate(dir, { html: noShell })
	assert.deepEqual(codes(both), ['page-shell-ends-missing', 'page-shell-ends-missing'])
	assert.deepEqual(
		both.findings.map((f) => [f.end, f.taxonomy]).sort(),
		[
			['first', 'hero'],
			['last', 'feature'],
		],
	)
})

test('维五 浮层：float-widget 型出现在层根序列里', (t) => {
	const dir = assetWithEnvelope(t, {
		floorIndex: (d, by) => d.floors.push({ ...JSON.parse(JSON.stringify(by.get('navbar.utility-left'))), id: 'float-widget.service-rail', taxonomy: 'float-widget' }),
	})
	// 插在 footer **之前**：追加到整页末尾会把页脚顶下末位，维四那两个 code 一起亮，验不出本维独占。
	const html = insertBeforeFooter(goodPageHtml(), '<aside class="pt-rail" data-pattern="float-widget.service-rail"></aside>')
	const r = gate(dir, { html })
	assert.deepEqual(codes(r), ['float-widget-in-sequence'])
	assert.equal(r.findings[0].pattern, 'float-widget.service-rail')
})

test('维五 浮层：包络点名的 id 也算，改个 taxonomy 溜不掉', (t) => {
	// 伪装的 taxonomy 由 `navbar` 换成 `feature`（型记录改 clone `feature.grid-3-cards`）：`R4-13`
	// 之后一个 navbar taxonomy 的层根落在非首位会独立开维四的 `page-shell-out-of-order`，那样本条
	// 就同时验两维。`feature` 也是更真实的伪装——本条要抓的是「id 被包络点名了，换 taxonomy 无用」。
	const dir = assetWithEnvelope(t, {
		floorIndex: (d, by) => d.floors.push({ ...JSON.parse(JSON.stringify(by.get('feature.grid-3-cards'))), id: 'chat.service-rail', taxonomy: 'feature' }),
		envelope: (e) => { e.blocking.find((r) => r.id === 'float-widget-never-in-sequence').detail.floatWidgetFloors = ['chat.service-rail'] },
	})
	const html = insertBeforeFooter(goodPageHtml(), '<aside class="pt-rail" data-pattern="chat.service-rail"></aside>')
	assert.deepEqual(codes(gate(dir, { html })), ['float-widget-in-sequence'])
})

test('维六 正文起手：cta 打头的页级序列', (t) => {
	// 这一份 `ctaFirstHtml()` 是 cta + feature 两个层根。`R4-13` 之后它按层根数被当成页，于是连维四
	// 那两条缺页壳一起挨上——那是当时如实钉下的误伤。`R4-15` 之后粒度由声明定：**这里声明 page**，
	// 所以它就是一份 cta 打头的整页，维六该开、维四也该开；上面那条同样的 HTML 声明 floor 则一条不开。
	// 两条并排读才是本票的正收益：同一份 HTML，判定跟着声明走。
	const dir = assetWithEnvelope(t)
	const r = gate(dir, { html: ctaFirstHtml(), css: ctaFirstCss(), trace: kindTrace('page') })
	assert.deepEqual(codes(r), ['body-start-out-of-envelope', 'page-shell-ends-missing', 'page-shell-ends-missing'])
	const own = r.findings.filter((f) => f.code === 'body-start-out-of-envelope')
	assert.equal(own.length, 1)
	assert.equal(own[0].taxonomy, 'cta')
	assert.equal(own[0].at, 'roots[0]')
})

test('维六 正文起手：页壳先跳过再看第一层', (t) => {
	// 顶栏 role 是 chrome，不算正文起手。页级夹具自 `R4-13` 起本身就是 navbar 打头，所以正例
	// 直接用它；不再在前面另插一个顶栏——那会让第二个顶栏落在非首位，反而点亮维四。
	const dir = assetWithEnvelope(t)
	assert.deepEqual(codes(gate(dir)), [])

	// 反向对照，证明「跳过」真发生了：同一份整页把 hero 换成 cta，本维必须报到 cta 那一层
	// （`roots[1]`）而不是顶栏；若顶栏没被跳过，报的会是 `roots[0]` 的 navbar。
	const html = goodPageHtml().replace('<section class="pt-hero" data-pattern="hero.centered-pitch">', '<section class="pt-cta" data-pattern="cta.centered-band">')
	const r = gate(dir, { html })
	assert.deepEqual(codes(r), ['body-start-out-of-envelope'])
	assert.equal(r.findings[0].pattern, 'cta.centered-band')
	assert.equal(r.findings[0].at, 'roots[1]')
})

test('维六 正文起手：声明 floor / component 的产物不判', (t) => {
	// 「跳过页壳之后的第一层」是页才有的位置，片段的第一层就是它自己。粒度由声明定：同一份 cta
	// 打头的 HTML 上面那条声明 page 时开口，这里声明 floor / component 就一条不开。
	const dir = assetWithEnvelope(t)
	for (const kind of ['floor', 'component']) {
		assert.deepEqual(codes(gate(dir, { html: ctaFirstHtml(), css: ctaFirstCss(), trace: kindTrace(kind) })), [], `声明 ${kind} 不该判正文起手`)
	}
})

/* ---------------------------------------------------------------- */
/* 产物粒度声明（`R4-15`）                                            */
/* ---------------------------------------------------------------- */

test('给了 trace 却没有 artifact.kind：报 artifact-kind-missing，不按层根数猜回来', (t) => {
	const dir = assetWithEnvelope(t)
	const r = gate(dir, { html: ctaFirstHtml(), css: ctaFirstCss(), trace: kindTrace(null) })
	assert.deepEqual(codes(r), ['artifact-kind-missing'])
	assert.equal(r.findings[0].at, 'trace.artifact.kind')
	assert.ok(
		!codes(r).includes('page-shell-ends-missing') && !codes(r).includes('body-start-out-of-envelope'),
		'判不出粒度就不判页级两维；留一条「猜回去」的后路等于门有两套粒度口径',
	)
})

test('artifact.kind 写了闭集外的值：与没写同判', (t) => {
	const dir = assetWithEnvelope(t)
	const bad = kindTrace('page')
	bad.artifact.kind = 'section'
	assert.deepEqual(codes(gate(dir, { trace: bad })), ['artifact-kind-missing'], '闭集是三值，第四个值不是「更细的粒度」而是判不出')
	assert.deepEqual(ARTIFACT_KINDS, ['page', 'floor', 'component'])
})

test('压根没给 trace：页级两维整块不判，也不退 1', (t) => {
	// 已知代价（`R4-15` 拍板第 4 项）：**不带 trace 的整页忘了写页脚，本门抓不到了**。
	// `--trace` 是既有可选旗标，把「没给」判成越界是改契约；本票没有那个授权。
	const dir = assetWithEnvelope(t)
	const noFooter = stripShell(goodPageHtml(), 'footer')
	assert.deepEqual(codes(gate(dir, { html: noFooter, trace: null })), [], '无 trace 时写 no-input 语义，不猜')
	assert.deepEqual(codes(gate(dir, { html: noFooter, trace: kindTrace('page') })), ['page-shell-ends-missing'], '同一份产物给了声明就抓得住')
})

test('page-shell-out-of-order 仍不看粒度：floor 片段里的错位顶栏照开', (t) => {
	// `R4-15` 复核后保持 `R4-13` 的原话。这一支判的是「在场的页壳站错了地方」，navbar 该在首位
	// 在片段里同样成立，修法也仍是重排；与「整页该不该有页壳」不是同一个问题。
	const dir = assetWithEnvelope(t)
	const html = `<section class="pt-feature-grid" data-pattern="feature.grid-3-cards"></section>\n<header class="pt-navbar" data-pattern="navbar.utility-left"></header>\n`
	const r = gate(dir, { html, css: '', trace: kindTrace('floor') })
	assert.deepEqual(codes(r), ['page-shell-out-of-order'])
	assert.equal(r.findings[0].pattern, 'navbar.utility-left')
})

test('维七 涂色跳过归属：资产记着参与计数，包络说它该被跳过', (t) => {
	const dir = assetWithEnvelope(t, { floorIndex: (d, by) => { by.get('hero.centered-pitch').paint.participatesInCount = true } })
	const r = gate(dir)
	assert.deepEqual(codes(r), ['paint-skip-out-of-envelope'])
	assert.equal(r.findings[0].pattern, 'hero.centered-pitch')
})

test('维七 涂色跳过归属：反方向同判，且 participatesInCount 读不到布尔值也不放行', (t) => {
	const flip = assetWithEnvelope(t, { floorIndex: (d, by) => { by.get('feature.grid-3-cards').paint.participatesInCount = false } })
	assert.deepEqual(codes(gate(flip)), ['paint-skip-out-of-envelope'])

	const gone = assetWithEnvelope(t, { floorIndex: (d, by) => { delete by.get('feature.grid-3-cards').paint.participatesInCount } })
	assert.deepEqual(codes(gate(gone)), ['paint-skip-out-of-envelope'])
})

test('维七 只判跳过归属，不判交替顺序：改 ownSurface 不进本门射程', (t) => {
	// 交替顺序、交替起点、scheme 成不成立一律不投影也不判（`alternate-muted` 已被单独取证
	// 为不成立，修它是另一票）。「这一层涂了什么」归 paint-consistency。
	const dir = assetWithEnvelope(t, { floorIndex: (d, by) => { by.get('feature.grid-3-cards').paint.ownSurface = 'muted' } })
	assert.deepEqual(codes(gate(dir)), [])
})

/* ---------------------------------------------------------------- */
/* 接线与硬约束                                                       */
/* ---------------------------------------------------------------- */

test('接线：lintFloor 会带出这道门，越界产物退 1', (t) => {
	const dir = assetWithEnvelope(t)
	const r = lintPage(dir, { html: ctaFirstHtml(), css: ctaFirstCss() })
	assert.equal(r.verdict, 'blocked')
	assert.ok(r.findings.some((f) => f.gate === 'layout-envelope' && f.code === 'body-start-out-of-envelope'), '门没接进 runAllGates，判据写得再对也不会跑')
})

test('判据阈值不得升为 CLI 参数：lint-floor 的旗标一个都没多', () => {
	// 门要么按资产里的规律判，要么不判，不存在「这次放宽一点」的入口。多一个旗标就是多一个
	// 让门闭嘴的办法，而闭过嘴的门在报告里与全绿长得一模一样。
	const src = fs.readFileSync(path.join(SCRIPTS_DIR, 'lint-floor.mjs'), 'utf8')
	const flags = [...src.matchAll(/opt\(argv, '(--[a-z-]+)'\)/g)].map((m) => m[1]).sort()
	assert.deepEqual([...new Set(flags)], ['--asset', '--css', '--html', '--trace'])
	assert.ok(!/--envelope|--layout|--skip-/.test(src), '包络那道门不许有任何专属旗标')
})
