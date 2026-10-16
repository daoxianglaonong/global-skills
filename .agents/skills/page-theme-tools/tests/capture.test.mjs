import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { normalizeTarget, loadChromium, summarize } from '../scripts/lib/capture.mjs'
import { FIXTURES, tmpDir } from './helpers.mjs'

test('targets: bare domains, markdown links, quotes and local files normalize; junk is rejected', () => {
	assert.equal(normalizeTarget('example.com/pricing?a=1#x').url, 'https://example.com/pricing?a=1#x')
	assert.equal(normalizeTarget('[站点](https://a.test/x)').url, 'https://a.test/x')
	assert.equal(normalizeTarget('"https://a.test"').url, 'https://a.test/')
	assert.match(normalizeTarget(path.join(FIXTURES, 'page', 'index.html')).url, /^file:\/\//)
	assert.ok(normalizeTarget('ftp://a.test').error)
	assert.ok(normalizeTarget('not a url').error)
})

test('summarize keeps opaque colours ending in 00 and drops only fully transparent ones', () => {
	const s = (color, background) => ({ hasText: true, color, background, border: null, fontFamily: 'Inter', fontSize: '16px', fontWeight: '400', lineHeight: '24px', radius: '0px' })
	const r = summarize({ samples: [s('rgb(0, 0, 0)', 'rgba(0, 0, 0, 0)'), s('rgb(255, 0, 0)', 'rgb(255, 255, 0)')], styles: [], copy: [] }, [], null)
	assert.deepEqual(r.colors.map((c) => c.value).sort(), ['#000000', '#ff0000', '#ffff00'])
	assert.equal(r.fontSizeCount, 1)
})

let chromium = null
try {
	chromium = await loadChromium()
	const b = await chromium.launch()
	await b.close()
} catch {
	chromium = null
}

test('capture + sample against a local page (needs Playwright Chromium)', { skip: !chromium && 'playwright chromium unavailable' }, async () => {
	const { capture, sampleImage } = await import('../scripts/lib/capture.mjs')
	const out = tmpDir()
	const r = await capture([path.join(FIXTURES, 'page', 'index.html')], { out, widths: [800, 375], timeout: 20000 })
	const t = r.targets[0]
	assert.equal(t.ok, true)
	assert.equal(t.title, 'Fixture Page')
	assert.equal(t.screenshots.length, 2)
	for (const s of t.screenshots) assert.ok(fs.existsSync(path.join(out, s)))
	assert.equal(t.customProperties['--site-brand'], '#1a5fd6')
	assert.equal(t.customProperties['--site-action'], 'var(--site-brand)')
	assert.deepEqual(t.resolvedProperties, { '--site-action': '#1a5fd6' })
	assert.ok(t.mediaQueries.some((m) => m.query.includes('max-width: 768px')))
	assert.ok(t.fonts.some((f) => f.value.includes('Inter')))
	assert.ok(t.colors.some((c) => c.value === '#1a5fd6' && c.usage === 'background'))
	assert.ok(t.copy.includes('立即试用'))
	assert.deepEqual(t.overflow, [])
	assert.ok(Array.isArray(t.lowContrast))
	assert.ok(fs.existsSync(path.join(out, 'evidence.json')))

	const scoped = path.join(tmpDir(), 'scoped.html')
	fs.writeFileSync(scoped, '<style>.theme { --x-brand: #123456; --x-action: var(--x-brand); }</style><div class="theme"><p>变量挂在 .theme 下而不是 :root，解析值从声明它的元素上取。</p></div>')
	const sc = await capture([scoped], { out: tmpDir(), widths: [800], timeout: 20000 })
	assert.deepEqual(sc.targets[0].resolvedProperties, { '--x-action': '#123456' })

	const shot = await capture([path.join(FIXTURES, 'page', 'index.html')], { out: tmpDir(), widths: [800], format: 'png' })
	const png = path.join(shot.out, shot.targets[0].screenshots[0])
	const [p] = await sampleImage(png, [{ x: 50, y: 150 }])
	assert.equal(p.hex, '#1a5fd6')
})
