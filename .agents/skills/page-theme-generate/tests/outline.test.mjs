/**
 * 大纲阶段：序列来源、三列、合法性门、形状提示。
 *
 * 每道阻断门都配一条**只在这一处违例**的输入。坏用例不从别的坏用例派生：两处同时违例的
 * 输入照样会红，于是它证明不了「这一处也会挂」，而门被改窄时它还是绿的。
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readOutlineSources, taxonomyVocabulary, cooccurrence, coCount, matchSkeletons, sequenceFromCooccurrence, buildOutline, checkOutline, OutlineError } from '../scripts/lib/outline.mjs'
import { FIXTURE_ASSET, syntheticAsset } from './helpers.mjs'

const LANDING = [{ pattern: 'hero.centered-pitch' }, { pattern: 'feature.grid-3-cards' }, { pattern: 'cta.centered-band' }]

test('词表闭集查表得来：资产启用哪几层就是哪几层的并集', () => {
	const vocabulary = taxonomyVocabulary(['L1', 'L2'])
	assert.ok(vocabulary.has('pricing'), 'pricing 是 L1 的正当楼层类，即便本资产没采到也在词表内')
	assert.ok(vocabulary.has('credentials'), 'L2 启用了，资质类在词表内')
	assert.ok(!vocabulary.has('product-list'), 'L3 没启用，电商类不在词表内')
	assert.throws(() => taxonomyVocabulary(['L9']), (e) => e instanceof OutlineError && e.code === 'taxonomy-layer-unknown')
	assert.throws(() => taxonomyVocabulary([]), (e) => e.code === 'taxonomy-layer-empty')
})

test('素材面：型目录与骨架型读 floor-index，词表与页序列读 index.yaml 的 taxonomy 一列', () => {
	const s = readOutlineSources(FIXTURE_ASSET)
	assert.equal(s.styleSetId, 'fixture-lanyuan-lab')
	assert.deepEqual([...s.available].sort(), ['cta', 'feature', 'footer', 'hero', 'navbar'])
	assert.deepEqual([...s.content].sort(), ['cta', 'feature', 'hero'], 'chrome 挂载的顶栏页脚不算内容楼层')
	assert.deepEqual(s.skeletons.map((sk) => sk.id), ['sk-landing'], '消费侧读的键叫 skeletons，不是采集侧的 page_skeletons')
	assert.deepEqual(s.pages, [{ id: 'home', taxonomies: ['navbar', 'hero', 'feature', 'cta', 'footer'] }])
})

test('大纲三列由资产查出来，不由调用方填', () => {
	const s = readOutlineSources(FIXTURE_ASSET)
	const outline = buildOutline({ sources: s, steps: LANDING })

	assert.deepEqual(
		outline.map((r) => [r.pattern, r.labelZh, r.keyPoints]),
		[
			['hero.centered-pitch', '首屏·居中主张', '白底居中：主标、副文、一实一线双钮；无媒体、无背景图。'],
			['feature.grid-3-cards', '能力·三列描边卡', '白底三列等宽描边卡：顶部线性图标、卡标题、两行说明；卡内无按钮。'],
			['cta.centered-band', '转化条·居中浅底', '浅灰底居中窄条：一句主张 + 单枚实心钮。'],
		],
	)
})

test('合法性门：词表闭集外的自造词阻断', () => {
	const s = readOutlineSources(FIXTURE_ASSET)
	const { blocking } = checkOutline({ sources: s, steps: [...LANDING, { taxonomy: 'breadcrumb', gapReason: '想加个面包屑' }] })

	assert.deepEqual(blocking.map((b) => b.code), ['taxonomy-invented'])
	assert.match(blocking[0].reason, /breadcrumb/)
})

test('合法性门第二档：词表内、本资产无型 → 不阻断，走形态缺口', () => {
	// 这是本票的核心裁定。`pricing` 是 L1 的正当楼层类，fixture 只是没采到——判它阻断等于
	// 「本站没采到的正当楼层一概不许做」，而全库既有纪律是型库无对应型不得硬失败。
	const s = readOutlineSources(FIXTURE_ASSET)
	const withReason = checkOutline({ sources: s, steps: [...LANDING, { taxonomy: 'pricing', gapReason: '目标页要报价对比，本资产无此型，按形态缺口处理' }] })

	assert.deepEqual(withReason.blocking, [], '词表内的缺口不阻断')
	assert.deepEqual(withReason.gaps.map((g) => g.taxonomy), ['pricing'])
})

test('合法性门第二档：缺口不写理由则阻断', () => {
	// 理由不能省。缺口是要被下游看见的决定，而静默的缺口和「忘了写」长得一模一样。
	const s = readOutlineSources(FIXTURE_ASSET)
	const { blocking } = checkOutline({ sources: s, steps: [...LANDING, { taxonomy: 'pricing' }] })

	assert.deepEqual(blocking.map((b) => b.code), ['gap-without-reason'])
})

test('合法性门第二档：理由写一个标点不算写了理由', () => {
	// 空格挡住了，`?` 却能过，这道门就只是把最短的关门写法换了一个字符。理由要是个词。
	const s = readOutlineSources(FIXTURE_ASSET)
	const { blocking } = checkOutline({ sources: s, steps: [...LANDING, { taxonomy: 'pricing', gapReason: '?' }] })

	assert.deepEqual(blocking.map((b) => b.code), ['gap-without-reason'])
})

test('合法性门第二档：理由写个空格不算写了理由', () => {
	// 一个空格能当理由，等于这道门可以用空格关掉。
	const s = readOutlineSources(FIXTURE_ASSET)
	const { blocking } = checkOutline({ sources: s, steps: [...LANDING, { taxonomy: 'pricing', gapReason: '   ' }] })

	assert.deepEqual(blocking.map((b) => b.code), ['gap-without-reason'])
})

test('哪些层算 chrome 挂载由资产查出来，不是写死一张名单', (t) => {
	// `footer` 的默认角色是 `section`，靠角色表分不出它其实是 chrome 挂载的。所以判据只能来自
	// 资产：有型可用、却不在内容楼层里的就是 chrome 挂载。把同一个 taxonomy 在资产里改成内容
	// 楼层，判定就该跟着变——若判据是写死的名单，这条会红。
	const asset = syntheticAsset(t, {
		floors: [
			{ id: 'hero.only', taxonomy: 'hero', source: 'pattern' },
			{ id: 'footer.only', taxonomy: 'footer', source: 'pattern' },
		],
		skeletons: [{ id: 'sk-bare', labelZh: '光板型', steps: [{ taxonomy: 'hero', required: true, repeat: { min: 1, max: 1 } }], confidence: 'low' }],
		pages: { home: ['hero', 'footer'] },
	})
	const s = readOutlineSources(asset)
	const { blocking } = checkOutline({ sources: s, steps: [{ pattern: 'hero.only' }, { pattern: 'footer.only' }], skeleton: 'sk-bare' })

	assert.deepEqual(blocking.map((b) => b.code), ['skeleton-repeat-violation'])
	assert.match(blocking[0].reason, /footer/, '这份资产把 footer 当内容楼层，它就该受骨架型约束')
})

test('合法性门：指了资产里没有的型 id 阻断', () => {
	const s = readOutlineSources(FIXTURE_ASSET)
	const { blocking } = checkOutline({ sources: s, steps: [{ pattern: 'hero.split-media' }, ...LANDING] })

	assert.deepEqual(blocking.map((b) => b.code), ['pattern-not-in-asset'])
})

test('合法性门：这一步既没 pattern 也没 taxonomy 时阻断', () => {
	const s = readOutlineSources(FIXTURE_ASSET)
	const { blocking } = checkOutline({ sources: s, steps: [...LANDING, {}] })

	assert.deepEqual(blocking.map((b) => b.code), ['taxonomy-missing'])
})

test('自称按某型排的就得落在该型区间内：型不存在阻断', () => {
	const s = readOutlineSources(FIXTURE_ASSET)
	const { blocking } = checkOutline({ sources: s, steps: LANDING, skeleton: 'sk-nope' })

	assert.deepEqual(blocking.map((b) => b.code), ['skeleton-unknown'])
})

test('自称按某型排的就得落在该型区间内：超出 repeat 阻断', () => {
	// 判的不是「排得好不好」，而是「你自己声明的那件事成不成立」——声明与产物对不上是可证伪
	// 的矛盾，没有程度可言，所以这条是阻断而不是提示。
	const s = readOutlineSources(FIXTURE_ASSET)
	const threeFeatures = [{ pattern: 'hero.centered-pitch' }, { pattern: 'feature.grid-3-cards' }, { pattern: 'feature.grid-3-cards' }, { pattern: 'feature.grid-3-cards' }]
	const { blocking } = checkOutline({ sources: s, steps: threeFeatures, skeleton: 'sk-landing' })

	assert.deepEqual(blocking.map((b) => b.code), ['skeleton-repeat-violation'])
	assert.match(blocking[0].reason, /feature.*1–2.*3 次/)
})

test('形状提示只提示：同一份序列不声明骨架型时一条阻断也没有', () => {
	// 自检门那一族全是阻断、无报警档，理由是它们判的都是可证伪的事实。「三个 feature 连着排」
	// 是程度问题——可以是刻意的——所以它另立一族，落在大纲上给拍板的人看，不进自检门。
	const s = readOutlineSources(FIXTURE_ASSET)
	const threeFeatures = [{ pattern: 'hero.centered-pitch' }, { pattern: 'feature.grid-3-cards' }, { pattern: 'feature.grid-3-cards' }, { pattern: 'feature.grid-3-cards' }]
	const { blocking, hints } = checkOutline({ sources: s, steps: threeFeatures })

	assert.deepEqual(blocking, [])
	assert.deepEqual(hints.map((h) => h.code).sort(), ['repeated-taxonomy-run', 'single-pattern-overuse'])
})

test('形状提示：内容楼层太少要提一句', () => {
	const s = readOutlineSources(FIXTURE_ASSET)
	const { hints } = checkOutline({ sources: s, steps: [{ pattern: 'hero.centered-pitch' }] })

	assert.deepEqual(hints.map((h) => h.code), ['too-few-content-floors'])
})

test('序列来源第一档：骨架型装得下就选型，装不下是机械判定', () => {
	const s = readOutlineSources(FIXTURE_ASSET)
	const fits = matchSkeletons(s.skeletons, ['hero', 'feature', 'cta'])
	assert.deepEqual(fits.map((m) => [m.id, m.fits]), [['sk-landing', true]])

	const misses = matchSkeletons(s.skeletons, ['hero', 'pricing'])
	assert.equal(misses[0].fits, false)
	assert.deepEqual(misses[0].missing, ['pricing'], '装不下是因为想要的类不在该型 steps 里，有据可查')
})

test('序列来源第二档：全部型都装不下时走共现回退，不硬失败', (t) => {
	const asset = syntheticAsset(t, {
		floors: [
			{ id: 'navbar.only', taxonomy: 'navbar', source: 'chrome' },
			{ id: 'hero.only', taxonomy: 'hero', source: 'pattern' },
			{ id: 'feature.only', taxonomy: 'feature', source: 'pattern' },
			{ id: 'pricing.only', taxonomy: 'pricing', source: 'pattern' },
			{ id: 'faq.only', taxonomy: 'faq', source: 'pattern' },
			{ id: 'blog.only', taxonomy: 'blog', source: 'pattern' },
			{ id: 'footer.only', taxonomy: 'footer', source: 'chrome' },
		],
		skeletons: [{ id: 'sk-landing', labelZh: '落地型', steps: [{ taxonomy: 'hero', required: true, repeat: { min: 1, max: 1 } }], confidence: 'low' }],
		pages: {
			home: ['navbar', 'hero', 'feature', 'footer'],
			plans: ['navbar', 'hero', 'pricing', 'faq', 'footer'],
			news: ['navbar', 'blog', 'footer'],
		},
	})
	const s = readOutlineSources(asset)

	assert.equal(matchSkeletons(s.skeletons, ['hero', 'pricing', 'faq'])[0].fits, false, '前提：唯一那型装不下这批需求')

	const stats = cooccurrence(s.pages)
	assert.equal(stats.pageCount, 3)
	assert.equal(coCount(stats, 'pricing', 'faq'), 1, 'pricing 与 faq 只在报价页同现过')
	assert.equal(coCount(stats, 'hero', 'feature'), 1)
	assert.equal(coCount(stats, 'blog', 'pricing'), 0, '从未同页出现的两类共现为 0')

	const proposed = sequenceFromCooccurrence(stats, { seed: ['pricing'], content: s.content, size: 3 })
	assert.deepEqual(proposed.taxonomies, ['hero', 'pricing', 'faq'], '共现选谁、平均序位定顺序：hero 在报价页排在 pricing 之前')
	assert.equal(proposed.weak, false, '3 页够算出高低')
})

test('共现回退在页数不够时如实报 weak，而不是静默兜住', () => {
	const s = readOutlineSources(FIXTURE_ASSET)
	const proposed = sequenceFromCooccurrence(cooccurrence(s.pages), { content: s.content, size: 3 })

	assert.equal(proposed.weak, true, '冻结 fixture 只有 1 页，两两共现全是 1，排不出高低')
	assert.deepEqual(proposed.taxonomies, ['hero', 'feature', 'cta'], '照样出结果，不硬失败')
})

test('共现回退不照抄某一页的序列：从未同现的类不会被拉进来', (t) => {
	// 被明确否决过的回退是「挑一个最接近的已采页 sequence 照抄」——那会把那一页的特异性整份
	// 带进新页。统计的区别在于：没有正共现的候选一个都不加，宁可短，不替人编。
	const asset = syntheticAsset(t, {
		floors: [
			{ id: 'hero.only', taxonomy: 'hero', source: 'pattern' },
			{ id: 'feature.only', taxonomy: 'feature', source: 'pattern' },
			{ id: 'blog.only', taxonomy: 'blog', source: 'pattern' },
		],
		pages: { home: ['hero', 'feature'], news: ['blog'] },
	})
	const s = readOutlineSources(asset)
	const proposed = sequenceFromCooccurrence(cooccurrence(s.pages), { seed: ['hero'], content: s.content, size: 3 })

	assert.deepEqual(proposed.taxonomies, ['hero', 'feature'], 'blog 与 hero 从未同页出现，不进提案')
})

test('三列保证要接上共现回退：只给 taxonomy 的步照样落到型', () => {
	// 这是「三列齐全是结构保证」的承重条。共现统计是在 taxonomy 这一层做的，产出没有型 id；
	// 若只在给了 pattern 时才查三列，回退这条路上每一步都会落成「中文标签空着的缺口」——连
	// 本资产明明有型的 hero 也一样，而门还会放它过去，因为「缺口写了理由」。
	const s = readOutlineSources(FIXTURE_ASSET)
	const proposed = sequenceFromCooccurrence(cooccurrence(s.pages), { content: s.content, size: 3 })
	const result = checkOutline({ sources: s, steps: proposed.taxonomies.map((taxonomy) => ({ taxonomy })) })

	assert.deepEqual(result.blocking, [])
	assert.deepEqual(result.gaps, [], '本资产有型的类不是缺口')
	assert.deepEqual(
		result.outline.map((r) => [r.taxonomy, r.pattern, Boolean(r.labelZh), Boolean(r.keyPoints)]),
		[
			['hero', 'hero.centered-pitch', true, true],
			['feature', 'feature.grid-3-cards', true, true],
			['cta', 'cta.centered-band', true, true],
		],
	)
})

test('同一类有多个型时把选择摊出来，不静默替人选掉', (t) => {
	// 替人默默选一个型不诚实，判成阻断又越权——大纲阶段的正解是把多选一印在表上。
	const asset = syntheticAsset(t, {
		floors: [
			{ id: 'hero.centered', taxonomy: 'hero', source: 'pattern' },
			{ id: 'hero.split-media', taxonomy: 'hero', source: 'pattern' },
			{ id: 'feature.only', taxonomy: 'feature', source: 'pattern' },
		],
		pages: { home: ['hero', 'feature'] },
	})
	const s = readOutlineSources(asset)
	const { outline, blocking, hints } = checkOutline({ sources: s, steps: [{ taxonomy: 'hero' }, { taxonomy: 'feature' }] })

	assert.deepEqual(blocking, [])
	assert.equal(outline[0].pattern, 'hero.centered', '取型目录里第一个内容型，判定是确定的')
	assert.deepEqual(hints.map((h) => h.code), ['taxonomy-multiple-types'])
	assert.match(hints[0].reason, /hero\.split-media/, '其余候选要点名，拍板的人才换得动')
})
