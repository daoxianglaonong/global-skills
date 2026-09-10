/**
 * 混搭一致性门的编排与 trace 交叉核。
 *
 * 对位在 `paint-floors.mjs`，产物侧底色反查在 `paint-surface.mjs`，
 * `paintSequence` 重算在 `paint-recompute.mjs`。本文件只把三块接起来，
 * 再拿 trace 的 paint 段与同一份重算交叉核。
 *
 * 底色不是楼层的属性，是整条序列的函数。执行体只有 vendored `paintSequence`，
 * rhythm 取 floor-index.json 那份（已归一，不得再调 normalizeRhythm），
 * role / taxonomy / ownSurface 一律从资产 floors[] 取。非 custom 丢掉序列条目上的
 * surface 再喂；custom 必须保留——那一档的独立信源是页级观测，丢掉会 custom-surface-missing。
 *
 * 抓不住什么（射程边界，不许让门看起来比射程大）：
 * - 产物侧只认 `var(--color-surface-*)` 写法。只认闭集本名那一列：path 形如
 *   `color.surface.<X>.$root`，且产物引用的名字等于该条的 cssVar。写 alias 名不算底色。
 *   hex / 命名色 / primitive 变量都读不成 surface 名，报 `surface-unreadable`，不是 mismatch。
 * - 比对用的那条底色仍只认两种命中：选择器整体等于楼层根的某个类选择器（`.类名`），或
 *   `[data-pattern="<型 id>"]`。内联 style= 的选择器是 `<tag inline>`，对不上层根：若那是
 *   该层唯一底色声明，报 `surface-unreadable`（阻断，不是豁免）。
 * - 候选集合另收一层：类选择器、更具体的选择器（`section.x`）、该层根自己的内联 style、
 *   `@media` 块。去重后大于 1 一律报 `surface-ambiguous`，拒绝认证而不是静默放行。
 *   本模式下一层只许有一个底色声明；需要按断点换底色的，本门挡下来，属于已知代价而不是误报。
 * - 后代选择器、`:where()` 不算命中。prop 只取 `background-color` 与 `background`。
 *   简写里嵌在渐变中的 surface 变量会被读成该层底色。
 * - `data-pattern` 只保证对得上是哪一层，不保证 DOM 真是那个 pattern 的形状。对位按该 id
 *   的第 k 次出现，不按「第几个 section」；没有同名 data-pattern 的 wrapper 不错位。
 * - 跳过层期望底色是 resolve 后的 ownSurface；transparent / image / 缺席时不比底色，只核跳过裁定。
 * - `rhythm.scheme` 是 `custom` 时整门**开口**：期望底色取序列手写 `surface`（页级观测），
 *   产物必须对上；参与计数层缺手写 → `paint-recompute-failed`（`custom-surface-missing`）。
 *   只看资产 `floor-index.json` 的 scheme，只在 trace 里写成 `custom` 关不掉本门。
 *   `sequence` 整块不写、没传 trace、assetDir 缺席时不开口。例外：trace 声明
 *   `artifact.kind: "page"` 而无 `sequence` 报 `page-sequence-missing`，**1 个层根的页照报**；
 *   声明 `floor` / `component` 的产物无 `sequence` 一条不开，多少个层根都一样。给了 trace 却
 *   没有闭集内的 `kind` 报 `artifact-kind-missing`，不许猜。
 * - 声明 `floor` / `component` 而产物首层是 `navbar` 型、末层是 `footer` 型时报
 *   `artifact-kind-mismatch`（`R5-B1`）。**判据不数层根**，只判「两端页壳齐全」这一个自我矛盾；
 *   反向（声明 `page` 而形态不足）不判。整份理由与射程边界在 `artifact-kind.mjs` 模块头。
 * - **html 未提供**（`undefined` / `null`，不是空串）时，有 sequence 也不开口去报
 *   `floor-pattern-attr-missing`：那是调用方没传产物，不是产物缺属性。写 `no-input`。
 *   空串是「传了空文档」，按空文档判（对不上层根就报缺属性）。`html = ''` 缺省值会把
 *   这两件事揉成一件，所以本函数与 `runAllGates` / `gatePaintConsistency` 都不得给 html 缺省。
 * - 三处停手，吞噬范围不同：`data-pattern` 缺席或次数对不上，只停该型的所有步，别的型照比；
 *   第一个不在资产里的型只停它自己及其后续层（前面的层照常比对底色与 skip）；
 *   `paintSequence` 抛错则整条不重算。门仍阻断，但涂色错被挡住的那一段本趟不报。
 * - 仍看不见的假阴性：同选择器后一条 hex、JS 运行时、背景图盖住底色。hex / primitive
 *   若是该层唯一底色，报的是 `unreadable` 不是 `mismatch`。
 */

import fs from 'node:fs'
import path from 'node:path'
import { parseFloorRoots, countBy, kthOf, nthRoot } from './paint-floors.mjs'
import { readSurfaces, readSurfaceCandidates } from './paint-surface.mjs'
import { algoStepsForPaint, recomputePaint, skippedByOf } from './paint-recompute.mjs'
import { isSynthPattern } from './synth-identity.mjs'
import { resolveSynthFloorRecord } from './responsive-inherit.mjs'
import { ARTIFACT_KINDS, readArtifactKind } from './layout-envelope-gate.mjs'
import { checkArtifactKindMismatch } from './artifact-kind.mjs'

const GATE = 'paint-consistency'

const CODE_ORDER = [
	'no-input',
	'artifact-kind-missing',
	'artifact-kind-mismatch',
	'page-sequence-missing',
	'floor-pattern-attr-missing',
	'floor-pattern-attr-count',
	'floor-not-in-sequence',
	'step-surface-handwritten',
	'step-pattern-not-in-asset',
	'paint-recompute-failed',
	'surface-mismatch',
	'surface-unreadable',
	'surface-ambiguous',
	'paint-record-missing',
	'paint-record-output-field',
	'paint-steps-misaligned',
	'paint-rhythm-mismatch',
	'paint-own-surface-mismatch',
	'paint-skip-mismatch',
]

const HARD_SKIP_SURFACES = new Set(['transparent', 'image'])

const finding = (detail) => ({ gate: GATE, level: 'block', ...detail })

const loadFloorIndex = (assetDir) => JSON.parse(fs.readFileSync(path.join(assetDir, 'floor-index.json'), 'utf8'))

const rhythmEqual = (a, b) => {
	if (!a || !b) return false
	return a.scheme === b.scheme && JSON.stringify(a.surfaces) === JSON.stringify(b.surfaces) && JSON.stringify(a.skipRoles) === JSON.stringify(b.skipRoles) && JSON.stringify(a.skipTaxonomies) === JSON.stringify(b.skipTaxonomies)
}

const sortFindings = (findings) =>
	findings
		.map((f, i) => ({ f, i }))
		.sort((a, b) => {
			const atA = a.f.at ?? 1e9
			const atB = b.f.at ?? 1e9
			if (atA !== atB) return atA - atB
			const oA = CODE_ORDER.indexOf(a.f.code)
			const oB = CODE_ORDER.indexOf(b.f.code)
			if (oA !== oB) return (oA < 0 ? 99 : oA) - (oB < 0 ? 99 : oB)
			return a.i - b.i
		})
		.map((x) => x.f)

const compareFloorSurface = (findings, { i, id, root, expected, declarations, closedSet }) => {
	if (expected == null || HARD_SKIP_SURFACES.has(expected)) return
	const unique = [...new Set(readSurfaceCandidates(declarations, root, closedSet))]
	if (unique.length >= 2) {
		findings.push(
			finding({
				code: 'surface-ambiguous',
				at: i,
				pattern: id,
				actual: unique,
				reason: `第 ${i} 步 \`${id}\` 读到两个及以上不同的底色（${unique.join(' / ')}）：门不解析级联，判不出哪条生效`,
			}),
		)
		return
	}
	const strict = [...new Set(readSurfaces(declarations, root, closedSet))]
	if (strict.length === 0) {
		findings.push(
			finding({
				code: 'surface-unreadable',
				at: i,
				pattern: id,
				expected,
				reason: `第 ${i} 步 \`${id}\` 重算期望底色 \`${expected}\`，产物侧一条可归属的 --color-surface-* 都读不到：内联 style / 选不中的选择器一律算读不到`,
			}),
		)
	} else if (strict[0] !== expected) {
		findings.push(
			finding({
				code: 'surface-mismatch',
				at: i,
				pattern: id,
				expected,
				actual: strict[0],
				reason: `第 ${i} 步 \`${id}\` 产物底色 \`${strict[0]}\` 与按本次序列重算的 \`${expected}\` 不一致：底色是整条序列的函数，不许照抄 yaml 自带的 surface`,
			}),
		)
	}
}

export function checkPaintConsistency({ html, declarations = [], closedSet = null, trace = null, assetDir = null } = {}) {
	const htmlProvided = html !== undefined && html !== null
	const roots = htmlProvided ? parseFloorRoots(html) : []

	// 声明与产物打架（`R5-B1`）。与「该不该有 sequence」是两件事，所以先算、两条支路都带上：
	// 有 sequence 那条走主流程，没有那条早退——补一条 sequence 不该成为关掉本码的办法。
	// 它的 `at` 是字段路径不是序列位置，进不了下面那个按 `at` 数值排的 sortFindings，所以一律
	// 前置拼接，不混进 findings 数组。
	const kindMismatch = checkArtifactKindMismatch({ roots, trace, assetDir }).map((d) => finding(d))

	if (!trace?.sequence) {
		// 粒度只信 trace 的声明。`readArtifactKind` 与包络门共用一份（同包 import，不是第二套口径）：
		// 每个读者各存一份粒度判据就是分家，而分家不会有任何一侧报错。
		const kind = readArtifactKind(trace)
		if (kind === undefined) return [] // 压根没给 trace：不判粒度，也不退 1
		if (kind === null) {
			return [
				finding({
					code: 'artifact-kind-missing',
					reason: `trace 里读不到闭集内的 artifact.kind（只认 ${ARTIFACT_KINDS.map((k) => `\`${k}\``).join(' / ')}）：本门要判「这份产物该不该有 sequence」，粒度判不出就不放行，也不许按层根数猜回来`,
				}),
			]
		}
		if (htmlProvided && kind === 'page') {
			return [
				finding({
					code: 'page-sequence-missing',
					reason: 'trace 声明 artifact.kind: "page"，却没有 sequence 整块：页级产物必须带这一块，否则本门整段不开口、交替计数无人守。层根只有一个也照报——粒度是声明的，不是数出来的',
				}),
			]
		}
		// 声明 floor / component 的产物本来就没有序列这件事，多少个层根都不判——但「它到底是不是
		// 片段」要判，那就是 kindMismatch 这一条。
		return kindMismatch
	}

	if (!assetDir) return []

	if (!htmlProvided) {
		return [
			finding({
				code: 'no-input',
				reason: '调用方没传 html：本门要比产物侧的 data-pattern 与底色，没有 HTML 就没有产物可对。这条不是「层根缺属性」——缺属性是传了 HTML 却对不上',
			}),
		]
	}

	const floorIndex = loadFloorIndex(assetDir)
	const keepHandwrittenSurface = floorIndex.rhythm?.scheme === 'custom'

	const floorsById = new Map((floorIndex.floors ?? []).map((f) => [f.id, f]))
	const floorRecordOf = (pattern) => {
		if (floorsById.has(pattern)) return floorsById.get(pattern)
		if (isSynthPattern(pattern)) return resolveSynthFloorRecord({ trace, synthId: pattern, assetDir, floorsById })
		return null
	}
	const seqSteps = Array.isArray(trace.sequence.steps) ? trace.sequence.steps : []
	const seqIds = seqSteps.map((s) => s.pattern)
	const seqCount = countBy(seqIds)
	const htmlCount = countBy(roots.map((r) => r.pattern))
	const seqSet = new Set(seqIds)
	const findings = []

	for (let i = 0; i < seqSteps.length; i++) {
		const id = seqSteps[i].pattern
		if ((htmlCount.get(id) ?? 0) === 0) {
			findings.push(
				finding({
					code: 'floor-pattern-attr-missing',
					at: i,
					pattern: id,
					reason: `序列第 ${i} 步的型 \`${id}\` 在产物 HTML 里一个 data-pattern 都对不上：对不上层就不能比底色，缺了这个属性就是阻断`,
				}),
			)
		}
	}

	for (const [id, n] of seqCount) {
		const h = htmlCount.get(id) ?? 0
		if (h > 0 && h !== n) {
			findings.push(
				finding({
					code: 'floor-pattern-attr-count',
					pattern: id,
					reason: `型 \`${id}\` 的 data-pattern 出现 ${h} 次，序列里有 ${n} 条：次数不等就不能按第 k 次对位，整条交替计数会对错层`,
				}),
			)
		}
	}

	for (const root of roots) {
		if (!seqSet.has(root.pattern)) {
			findings.push(
				finding({
					code: 'floor-not-in-sequence',
					pattern: root.pattern,
					reason: `产物里多了一层 data-pattern="${root.pattern}"，它不在本次序列里：多出来的层不受本门管，但会改掉整条交替计数`,
				}),
			)
		}
	}

	let firstUnknownAt = -1
	for (let i = 0; i < seqSteps.length; i++) {
		if (!keepHandwrittenSurface && Object.prototype.hasOwnProperty.call(seqSteps[i], 'surface')) {
			findings.push(
				finding({
					code: 'step-surface-handwritten',
					at: i,
					pattern: seqSteps[i].pattern,
					reason: `sequence.steps[${i}] 上出现了 surface 键：手写会改变 resolve 结果，从而可能改变跳过裁定；值是什么都不看，出现即阻断。scheme: custom 时这一列是观测，不报本码`,
				}),
			)
		}
		if (!floorRecordOf(seqSteps[i].pattern)) {
			if (firstUnknownAt < 0) firstUnknownAt = i
			if (!isSynthPattern(seqSteps[i].pattern)) {
				findings.push(
					finding({
						code: 'step-pattern-not-in-asset',
						at: i,
						pattern: seqSteps[i].pattern,
						reason: `序列里的型 \`${seqSteps[i].pattern}\` 不在本资产 floor-index.json 的 floors[] 里：role / taxonomy / ownSurface 三项取不到；该步及其后的层不比对底色与 skip，前面的层照常比`,
					}),
				)
			}
		}
	}

	const recomputeUntil = firstUnknownAt < 0 ? seqSteps.length : firstUnknownAt
	const algoFloorsById = new Map(floorsById)
	for (let i = 0; i < recomputeUntil; i++) {
		const pat = seqSteps[i].pattern
		if (!algoFloorsById.has(pat) && isSynthPattern(pat)) {
			const rec = resolveSynthFloorRecord({ trace, synthId: pat, assetDir, floorsById })
			if (rec) algoFloorsById.set(pat, rec)
		}
	}
	let painted = null
	if (recomputeUntil > 0) {
		const { painted: next, error } = recomputePaint(
			algoStepsForPaint(seqSteps, algoFloorsById, recomputeUntil, { keepHandwrittenSurface }),
			floorIndex.rhythm,
		)
		if (error) {
			findings.push(
				finding({
					code: 'paint-recompute-failed',
					paintError: error.code,
					reason: `paintSequence 抛出 PaintError（${error.code}）：${error.message}`,
				}),
			)
		} else {
			painted = next
		}
	}

	if (painted) {
		for (let i = 0; i < painted.length; i++) {
			const id = seqSteps[i].pattern
			const h = htmlCount.get(id) ?? 0
			const n = seqCount.get(id) ?? 0
			if (h === 0 || h !== n) continue
			const root = nthRoot(roots, id, kthOf(seqSteps, i))
			if (!root) continue
			compareFloorSurface(findings, { i, id, root, expected: painted[i].surface, declarations, closedSet })
		}
	}

	const paint = trace.paint
	if (!paint) {
		findings.push(
			finding({
				code: 'paint-record-missing',
				reason: 'trace 有 sequence 却没有 paint 整块：没有它就没有可交叉核的那一半，产物与 trace 可以被一起写错',
			}),
		)
	} else {
		const pSteps = Array.isArray(paint.steps) ? paint.steps : []
		const aligned = pSteps.length === seqSteps.length && pSteps.every((p, i) => p.pattern === seqSteps[i].pattern)
		if (!aligned) {
			findings.push(
				finding({
					code: 'paint-steps-misaligned',
					reason: `paint.steps 与 sequence.steps 对不齐（paint ${pSteps.length} 步、sequence ${seqSteps.length} 步）：交叉核必须逐位同型`,
				}),
			)
		}
		if (!rhythmEqual(paint.rhythm, floorIndex.rhythm)) {
			findings.push(
				finding({
					code: 'paint-rhythm-mismatch',
					reason: 'paint.rhythm 与资产 floor-index.json 的 rhythm 不逐字相同：这一条守的是「我按另一套 skip 名单涂的」',
				}),
			)
		}
		const PAINT_OUTPUT_FIELDS = ['surface', 'n', 'decidedBy']
		for (let i = 0; i < pSteps.length; i++) {
			for (const field of PAINT_OUTPUT_FIELDS) {
				if (Object.prototype.hasOwnProperty.call(pSteps[i], field)) {
					findings.push(
						finding({
							code: 'paint-record-output-field',
							at: i,
							pattern: pSteps[i].pattern,
							field,
							reason: `paint.steps[${i}] 上出现了 \`${field}\`：paint 段只存算法输入与跳过裁定，surface / n / decidedBy 是算法输出，写进去就是预存底色`,
						}),
					)
				}
			}
		}
		if (aligned) {
			for (let i = 0; i < seqSteps.length; i++) {
				const floor = floorRecordOf(seqSteps[i].pattern)
				const assetOwn = floor?.paint?.ownSurface ?? null
				const paintOwn = pSteps[i].ownSurface ?? null
				if (assetOwn !== paintOwn) {
					findings.push(
						finding({
							code: 'paint-own-surface-mismatch',
							at: i,
							pattern: seqSteps[i].pattern,
							expected: assetOwn,
							actual: paintOwn,
							reason: `paint.steps[${i}] 的 ownSurface 是 \`${paintOwn}\`，资产该型是 \`${assetOwn}\`：两侧缺席都归一成 null 再比`,
						}),
					)
				}
				if (painted && i < painted.length) {
					const expectedSkip = skippedByOf(painted[i].decidedBy)
					const actualSkip = pSteps[i].skippedBy ?? null
					if (actualSkip !== expectedSkip) {
						findings.push(
							finding({
								code: 'paint-skip-mismatch',
								at: i,
								pattern: seqSteps[i].pattern,
								expected: expectedSkip,
								actual: actualSkip,
								reason: `paint.steps[${i}] 的 skippedBy 是 \`${actualSkip}\`，重算裁定是 \`${expectedSkip}\`：谎报跳过裁定会放行下一条序列`,
							}),
						)
					}
				}
			}
		}
	}

	return [...kindMismatch, ...sortFindings(findings)]
}
