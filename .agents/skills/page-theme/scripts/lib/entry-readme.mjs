/**
 * 资产入口文件 `README.md` 生成器〔B-07〕。模板与槽位表见 `.wayfinder/build/s1-readme-template.md`
 * （静态段原文落在同目录 `entry-readme.template.md`，逐字输出，不得改写）。
 * 依据 G-01–G-08 · G-05a · O-03 · O-56。
 *
 * 边界：`coverage` 由 agent 提供（E-01 禁止脚本自己写 coverage / blockers），本模块只做投影与替换。
 *
 *   node scripts/lib/entry-readme.mjs --asset-dir <dir> --coverage <path|-> [--style-set-id <id>]
 */
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { sha256 } from './fsutil.mjs'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const SKILL_ROOT = path.resolve(HERE, '..', '..')
const TEMPLATE_FILE = path.join(HERE, 'entry-readme.template.md')

/** 总纲 §4 资产目录清单 + 一句用途。存在才输出一行（G-05）。 */
const FILE_MAP = [
	['DESIGN.md', "人读的风格说明与 Don't 清单", true],
	['tokens.json', 'DTCG 主 token 表；按路径取，不整盘读', true],
	['tokens.dark.json', '暗色 overlay（有暗色才交）', false],
	['resolver.json', 'DTCG Resolver（有暗色才交）', false],
	['voice.md', '文案语气与禁词', false],
	['patterns/index.yaml', '楼层序列、节奏与骨架型库', true],
	['patterns/chrome.yaml', '页壳（顶栏 / 悬浮件 / 页脚 / 备案条），整站一份', false],
	['site-overrides.yaml', '站点特例选择器（人拥有最终文本）', false],
	['holdout.yaml', '留出声明，机器只读', false],
	['input/design-system/', '用户供给的设计系统原文，机器不碰', false],
	['screenshots/index.json', '截图索引；取图必须经它寻址，不得扫目录', false],
	['raw/', '采集原始数据，按 pageId 分目录；按字段取，不整盘读', false],
	['run-meta.json', '运行日志（append-only），只作台账不当风格源', true]
]

/** 从 SKILL.md 抽 `task_routes` 围栏块与正向纪律三句，按此序拼接后取 sha256（G-05 / G-06）。 */
export function routesFingerprintSource(skillTextRaw) {
	// 行尾统一后再取指纹：CRLF / LF 检出的必须是同一个 routes_sha256
	const skillText = String(skillTextRaw).replace(/\r\n/g, '\n')
	const routes = skillText.match(/```ya?ml\n(task_routes:[\s\S]*?)\n```/)
	if (!routes) throw new Error('SKILL.md 里找不到 task_routes 围栏块，无法计算 routes_sha256')
	const disciplineSection = skillText.split('\n## 正向纪律\n')[1]
	if (!disciplineSection) throw new Error('SKILL.md 里找不到「正向纪律」节，无法计算 routes_sha256')
	const sentences = []
	for (const line of disciplineSection.split('\n')) {
		const m = line.match(/^\d+\.\s+(.*)$/)
		if (m) sentences.push(m[1].trim())
		if (sentences.length === 3) break
	}
	if (sentences.length !== 3) throw new Error('SKILL.md 的正向纪律不是三句，无法计算 routes_sha256')
	// 拼接约定（本项目自定）：task_routes 块原文 + '\n' + 三句各占一行
	return `${routes[1]}\n${sentences.join('\n')}`
}

async function exists(p) {
	try {
		await fs.access(p)
		return true
	} catch {
		return false
	}
}

async function buildFileMap(assetDir) {
	const lines = []
	const missingCore = []
	for (const [rel, purpose, core] of FILE_MAP) {
		if (await exists(path.join(assetDir, rel))) lines.push(`- \`${rel}\` — ${purpose}`)
		else if (core) missingCore.push(`- \`${rel}\` — ${purpose}`)
	}
	// 槽位表缺值处置：扫不出核心四件时仍必须列出它们，避免入口文件把资产契约整段吞掉
	if (missingCore.length) lines.push(...missingCore)
	return lines.join('\n')
}

/** M-37 全键；缺任一键即视为 coverage 不合格（G-05a），本模块不替 agent 编造内容。 */
const COVERAGE_KEYS = ['status', 'holdoutDeclared', 'pages', 'cohesion', 'blockers', 'candidates']

function yamlScalar(v) {
	if (v === null || v === undefined) return 'null'
	if (typeof v === 'boolean' || typeof v === 'number') return String(v)
	const s = String(v)
	// 含 `:` 的串（时间戳、URL）一律加引号，否则 YAML 会读成映射
	return /^[A-Za-z0-9_.\-/]+$/.test(s) && !/^\d+$/.test(s) ? s : JSON.stringify(s)
}

/** `col` 是本层键的起始列。数组项的 `- ` 占 2 列，项内键从 `col + 2` 起。 */
function yamlBlock(value, col) {
	if (Array.isArray(value)) {
		if (!value.length) return ' []'
		const pad = ' '.repeat(col)
		return `\n${value
			.map((item) => {
				if (item === null || typeof item !== 'object' || Array.isArray(item)) {
					return `${pad}- ${yamlScalar(item)}`
				}
				const entries = Object.entries(item)
				if (!entries.length) return `${pad}- {}`
				return entries
					.map(([k, v], i) => `${i === 0 ? `${pad}- ` : `${pad}  `}${k}:${yamlBlock(v, col + 4)}`)
					.join('\n')
			})
			.join('\n')}`
	}
	if (value !== null && typeof value === 'object') {
		const entries = Object.entries(value)
		if (!entries.length) return ' {}'
		const pad = ' '.repeat(col)
		return `\n${entries.map(([k, v]) => `${pad}${k}:${yamlBlock(v, col + 2)}`).join('\n')}`
	}
	return ` ${yamlScalar(value)}`
}

/** 根键必须为 `coverage`，形状等于 M-37 全键，2 空格缩进（G-05a）。 */
export function renderCoverageYaml(coverage) {
	if (!coverage || typeof coverage !== 'object') throw new Error('coverage 槽不可缺：未提供 coverage 对象')
	const body = coverage.coverage && typeof coverage.coverage === 'object' ? coverage.coverage : coverage
	const missing = COVERAGE_KEYS.filter((k) => !(k in body))
	if (missing.length) throw new Error(`coverage 缺 M-37 键：${missing.join(' / ')}`)
	const ordered = {}
	for (const k of COVERAGE_KEYS) ordered[k] = body[k]
	return `coverage:${yamlBlock(ordered, 2)}`.replace(/\n+$/, '')
}

/** 主 URL 的可读短名；取不到退回 style_set_id 原值（槽位表缺值处置）。 */
export async function siteShortName(assetDir, styleSetId) {
	try {
		const session = JSON.parse(await fs.readFile(path.join(assetDir, 'raw', 'session.json'), 'utf8'))
		const host = new URL(session.finalUrl || session.url).hostname.replace(/^www\./, '')
		return host || styleSetId
	} catch {
		return styleSetId
	}
}

/**
 * @param {{assetDir:string, styleSetId:string, coverage:object, generatedAt?:string, skillDir?:string}} opts
 * @returns {Promise<string>} README.md 全文
 */
export async function renderEntryReadme(opts) {
	const { assetDir, coverage } = opts
	const skillDir = opts.skillDir || SKILL_ROOT
	const styleSetId = String(opts.styleSetId || '').trim()
	if (!/^[a-z0-9-]+$/.test(styleSetId)) throw new Error(`style_set_id 槽不合法：${JSON.stringify(opts.styleSetId)}`)

	const template = await fs.readFile(TEMPLATE_FILE, 'utf8')
	const skillText = await fs.readFile(path.join(skillDir, 'SKILL.md'), 'utf8')

	const slots = {
		style_set_id: styleSetId,
		generated_at: opts.generatedAt || new Date().toISOString(),
		skill_sha256: sha256(skillText),
		routes_sha256: sha256(routesFingerprintSource(skillText)),
		site_short_name: opts.siteShortName || (await siteShortName(assetDir, styleSetId)),
		file_map: await buildFileMap(assetDir),
		coverage_yaml: renderCoverageYaml(coverage)
	}

	let out = template
	for (const [key, value] of Object.entries(slots)) {
		out = out.split(`{{${key}}}`).join(value)
	}
	// 模板正文里的 `patterns/{id}.notes.md` 等单花括号是静态文本，只有残留的 `{{` 才算生成失败
	if (out.includes('{{')) throw new Error(`入口文件生成失败：仍有未替换的数据槽 ${out.match(/\{\{[^}]*\}\}/g).join(' / ')}`)
	return out
}

/** derived：每次分析段落盘整体覆盖，禁止读旧版再合并（G-04 / O-03）。 */
export async function writeEntryReadme(opts) {
	const text = await renderEntryReadme(opts)
	const file = path.join(opts.assetDir, 'README.md')
	await fs.writeFile(file, text, 'utf8')
	return file
}

async function cli() {
	const argv = process.argv.slice(2)
	const get = (flag) => {
		const i = argv.indexOf(flag)
		return i >= 0 ? argv[i + 1] : null
	}
	const assetDir = get('--asset-dir')
	const coverageArg = get('--coverage')
	if (!assetDir || !coverageArg) {
		process.stdout.write('用法：node scripts/lib/entry-readme.mjs --asset-dir <dir> --coverage <path|-> [--style-set-id <id>]\n')
		process.exit(2)
	}
	let coverageText
	if (coverageArg === '-') {
		const chunks = []
		for await (const c of process.stdin) chunks.push(c)
		coverageText = Buffer.concat(chunks).toString('utf8')
	} else {
		coverageText = await fs.readFile(coverageArg, 'utf8')
	}
	const styleSetId = get('--style-set-id') || path.basename(path.resolve(assetDir))
	const file = await writeEntryReadme({ assetDir, styleSetId, coverage: JSON.parse(coverageText.replace(/^\uFEFF/, '')) })
	process.stdout.write(`已写入入口文件：${file}\n`)
}

const invokedDirectly = process.argv[1] && import.meta.filename === path.resolve(process.argv[1])
if (invokedDirectly) {
	cli().catch((err) => {
		process.stderr.write(`${String(err.message || err)}\n`)
		process.exit(1)
	})
}
