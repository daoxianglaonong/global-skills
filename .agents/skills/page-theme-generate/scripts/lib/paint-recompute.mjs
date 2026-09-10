/**
 * 混搭一致性门：按资产重算涂色。
 *
 * 非 `custom`：喂 `paintSequence` 前重建步骤对象，**丢掉**序列条目上的手写 `surface`。
 * 原样传进去会改变硬跳过层的交替计数，后续层的 n 会左移。
 *
 * `custom`：必须保留手写 `surface`。丢掉会抛 `custom-surface-missing`，而这一档的
 * 独立信源就是页级观测（sequence 上的 `surface`），不是 `n % 2`。
 */

import { paintSequence, PaintError } from '../vendor/page-theme-core/index.mjs'

export function algoStepsForPaint(seqSteps, floorsById, until, { keepHandwrittenSurface = false } = {}) {
	return seqSteps.slice(0, until).map((s) => {
		const f = floorsById.get(s.pattern)
		const step = {
			id: s.id,
			pattern: s.pattern,
			role: f.role,
			taxonomy: f.taxonomy,
			ownSurface: f.paint?.ownSurface ?? null,
		}
		if (keepHandwrittenSurface && s.surface !== undefined && s.surface !== null) {
			step.surface = s.surface
		}
		return step
	})
}

export function algoStepsWithoutHandwrittenSurface(seqSteps, floorsById, until) {
	return algoStepsForPaint(seqSteps, floorsById, until, { keepHandwrittenSurface: false })
}

export function recomputePaint(algoSteps, rhythm) {
	try {
		return { painted: paintSequence(algoSteps, rhythm), error: null }
	} catch (e) {
		if (!(e instanceof PaintError)) throw e
		return { painted: null, error: e }
	}
}

export function skippedByOf(decidedBy) {
	if (decidedBy === 'skip-role') return 'role'
	if (decidedBy === 'skip-taxonomy') return 'taxonomy'
	if (decidedBy === 'hard-skip-surface') return 'surface'
	return null
}
