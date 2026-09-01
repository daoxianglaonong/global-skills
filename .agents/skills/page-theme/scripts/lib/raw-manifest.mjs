/**
 * E-82 无条件文件表 / E-83 条件文件表的机器可读副本 + 对账器。
 * 「一个不多一个不少」是跨件契约（合同 §7），必须能机械核。
 *
 *   node scripts/lib/raw-manifest.mjs --asset-dir <dir>
 *   退出码 0 = 无缺项无多余；1 = 有缺项；2 = 只有多余项
 */
import fs from 'node:fs/promises'
import path from 'node:path'
import { SLOTS } from './viewports.mjs'

/** E-82：`run` = raw/ 根；`page` = raw/{page-id}/ */
export const UNCONDITIONAL = [
	{ file: 'session.json', level: 'run', duty: '采集会话原始事实（E-84）' },
	{ file: 'css-origins.json', level: 'page', duty: '分源 stylesheet + 内联 + adopted + shadow（E-85）' },
	{ file: 'css-frequency.json', level: 'page', duty: 'Wallace 原表（E-04）' },
	{ file: 'css-frequency.normalized.json', level: 'page', duty: '归一频率（E-04）' },
	{ file: 'painted-area.json', level: 'page', duty: '面积权威，按 slot（E-86）' },
	{ file: 'role-candidates.json', level: 'page', duty: '角色候选，judge: script（E-95）' },
	{ file: 'media-queries.json', level: 'page', duty: 'query + 聚类桶（E-87）' },
	{ file: 'custom-properties.json', level: 'page', duty: '亮暗双值（E-88）' },
	{ file: 'first-party-variables.json', level: 'page', duty: '命名证据 + alias 网 + 成套数据（E-88）' },
	{ file: 'landmarks.pc.json', level: 'page', duty: '楼层与几何（E-89）' },
	{ file: 'landmarks.tablet.json', level: 'page', duty: '楼层与几何（E-89）' },
	{ file: 'landmarks.mobile.json', level: 'page', duty: '楼层与几何（E-89）' },
	{ file: 'fonts.json', level: 'page', duty: '@font-face + computed 栈（E-90）' },
	{ file: 'interaction-states.json', level: 'page', duty: '交互态，缺槽 omitted（E-91）' },
	{ file: 'noise-report.json', level: 'page', duty: '丢弃项，色条目齐 T-127 五字段（E-95）' },
	{ file: 'copy-corpus.json', level: 'page', duty: '语料全文，不入库（E-92）' },
	{ file: 'copy-stats.json', level: 'page', duty: '计数 + index，白名单入库（E-92）' },
	...SLOTS.map((slot) => ({ file: `by-viewport/${slot}.json`, level: 'page', duty: `${slot} 档原始采集包（E-82）` }))
]

/** E-83 条件文件；缺席不算缺项。 */
export const CONDITIONAL = [
	{ file: 'motion-reduced.json', level: 'page', when: '该页观测到动效' },
	{ file: 'dark/css-origins.json', level: 'page', when: 'darkMode = supported' },
	{ file: 'dark/css-frequency.json', level: 'page', when: 'darkMode = supported' },
	{ file: 'dark/painted-area.json', level: 'page', when: 'darkMode = supported' },
	{ file: 'dark/custom-properties.json', level: 'page', when: 'darkMode = supported' },
	{ file: 'dark/landmarks.pc.json', level: 'page', when: 'darkMode = supported' },
	{ file: 'supplied-design-system.json', level: 'run', when: '有供给' },
	{ file: 'supply-match.json', level: 'run', when: '有供给' }
]

/** 允许出现在 raw/ 里、但不在 E-82/E-83 表内的东西（E-81 / E-85 明文许可）。 */
const ALLOWED_EXTRA = [/^\.gitignore$/, /^[^/]+\/css-origins\/[0-9a-f]+\.css$/, /^[^/]+\/dark\/css-origins\/[0-9a-f]+\.css$/]

async function listFiles(dir, base = '') {
	const out = []
	let entries = []
	try {
		entries = await fs.readdir(dir, { withFileTypes: true })
	} catch {
		return out
	}
	for (const e of entries) {
		const rel = base ? `${base}/${e.name}` : e.name
		if (e.isDirectory()) out.push(...(await listFiles(path.join(dir, e.name), rel)))
		else out.push(rel)
	}
	return out
}

/**
 * @returns {{pages:string[], missing:object[], extra:string[], conditionalPresent:object[], actual:string[]}}
 */
export async function checkAssetRaw(assetDir) {
	const rawDir = path.join(assetDir, 'raw')
	const actual = await listFiles(rawDir)
	const pages = [
		...new Set(
			actual
				.filter((f) => f.includes('/'))
				.map((f) => f.split('/')[0])
				.filter((d) => d !== 'css-origins')
		)
	]
	const expected = new Set()
	const missing = []
	for (const item of UNCONDITIONAL) {
		if (item.level === 'run') {
			expected.add(item.file)
			if (!actual.includes(item.file)) missing.push({ ...item, at: item.file })
			continue
		}
		for (const pageId of pages) {
			const rel = `${pageId}/${item.file}`
			expected.add(rel)
			if (!actual.includes(rel)) missing.push({ ...item, at: rel })
		}
	}
	const conditionalPresent = []
	for (const item of CONDITIONAL) {
		const targets = item.level === 'run' ? [item.file] : pages.map((p) => `${p}/${item.file}`)
		for (const rel of targets) {
			expected.add(rel)
			if (actual.includes(rel)) conditionalPresent.push({ ...item, at: rel })
		}
	}
	const extra = actual.filter((f) => !expected.has(f) && !ALLOWED_EXTRA.some((re) => re.test(f)))
	return { pages, missing, extra, conditionalPresent, actual }
}

async function cli() {
	const argv = process.argv.slice(2)
	const i = argv.indexOf('--asset-dir')
	const assetDir = i >= 0 ? argv[i + 1] : null
	if (!assetDir) {
		process.stdout.write('用法：node scripts/lib/raw-manifest.mjs --asset-dir <dir>\n')
		process.exit(2)
	}
	const r = await checkAssetRaw(assetDir)
	process.stdout.write(`raw 实有文件 ${r.actual.length} 个，页 ${r.pages.length} 个：${r.pages.join('、') || '无'}\n`)
	process.stdout.write(`E-82 无条件表应有 ${UNCONDITIONAL.length - 1} 项/页 + 1 项/run\n`)
	process.stdout.write(`缺项 ${r.missing.length}：${r.missing.map((m) => m.at).join('、') || '无'}\n`)
	process.stdout.write(`表外多余 ${r.extra.length}：${r.extra.join('、') || '无'}\n`)
	process.stdout.write(`E-83 条件文件已出 ${r.conditionalPresent.length}：${r.conditionalPresent.map((c) => c.at).join('、') || '无'}\n`)
	process.exit(r.missing.length ? 1 : r.extra.length ? 2 : 0)
}

if (process.argv[1] && import.meta.filename === path.resolve(process.argv[1])) {
	cli().catch((err) => {
		process.stderr.write(`${String(err.message || err)}\n`)
		process.exit(1)
	})
}
