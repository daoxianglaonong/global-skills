/**
 * 确定性算法的可复跑自测集：`npm run selftest`（或 `node lib/selftest.mjs`）。
 * 覆盖 O-37 测试向量全表 8 条、合同裁决 3 的八条归一化规则、E-99 pageId 对照表 8 行、
 * 全仓唯一 YAML 解析器的子集边界与三条保留行为〔B-21 / B-27〕，
 * 以及主题一致性体检的分歧判定纪律〔M-42a / B-34 / B-35〕。
 * 被测模块各自也支持 `--selftest` 单跑。
 */
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const SUITES = [
	{ name: 'normalize-url（合同裁决 3 · 八条归一化规则）', file: path.join(HERE, '..', 'normalize-url.mjs') },
	{ name: 'style-set-id（O-37 · 测试向量全表）', file: path.join(HERE, '..', 'style-set-id.mjs') },
	{ name: 'page-id（E-99 · pageId 对照表）', file: path.join(HERE, 'page-id.mjs') },
	{ name: 'yaml（B-21 合并后的唯一解析器 · 子集边界与三条保留行为）', file: path.join(HERE, 'yaml.mjs') },
	{ name: 'cohesion（M-42a · B-34 三条判定纪律 · B-35 字体轴判据）', file: path.join(HERE, 'derive.mjs') }
]

let failed = 0
for (const suite of SUITES) {
	process.stdout.write(`\n=== ${suite.name} ===\n`)
	const res = spawnSync(process.execPath, [suite.file, '--selftest'], { encoding: 'utf8' })
	process.stdout.write(res.stdout || '')
	if (res.stderr) process.stderr.write(res.stderr)
	if (res.status !== 0) failed++
}
process.stdout.write(`\n自测总计：${SUITES.length - failed}/${SUITES.length} 个套件通过\n`)
process.exit(failed ? 1 : 0)
