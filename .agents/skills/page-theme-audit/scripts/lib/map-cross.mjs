/**
 * 色表与非色表读回交叉门：任一 blocked 即整体 blocked。
 *
 * **交叉判定挂在 `--read-back` 本身上，不挂在可选旗标上。** 两张表由 `--out` 写进同一个
 * 目录，所以对表就在本表旁边：回灌哪一张，都按对表的默认文件名到同目录取它，读回来一起判。
 * 挂在旗标上是一道空门——按硬序跑（各自 `--read-back`、谁也不提对表）时，「色表 pass、
 * 非色表 blocked」照样退 0，而那正是这道门要堵的那一种静默绿。
 *
 * 对表读回件取不到时**不许静默放过**：该不该有对表由同一份产物重算得出（`peerRows`），
 * 有行却读不回就是 `maps-cross-blocked`。判据来自产物而不是文件系统，所以把对表 md 挪走
 * 也绕不过去。生成侧准入早就这么判（`lint-migration.mjs` 的 `type-verdicts-missing`：
 * 拿 `--before` 重算，对表有行就必须给），本包只是把同一条判据搬到回灌这一侧。
 *
 * ## 两个入口，因为对表张数不同（`R4-09` 加）
 *
 * | 入口 | 谁调 | 对表 | 报告里的留痕字段 |
 * | --- | --- | --- | --- |
 * | `crossCheckMaps()` | `value-map.mjs` · `type-map.mjs` | 一张 | `peerMap`（单数对象，零行时 `null`） |
 * | `crossCheckPeers()` | `layout-map.mjs` | 两张（色 + 非色） | `peerMaps[]`（每张一条，恒有条目） |
 *
 * **`crossCheckMaps()` 一个字节不动**：它的 `peerMap` 形状被生成侧 `lint-migration.mjs` 读着，
 * 把它改成数组要连带改那一侧，而那一侧不在本票射程内。两个入口共用 `resolvePeerReadBack()`
 * 与同一个 `maps-cross-blocked` 码——判据只有一套，形状有两套。
 *
 * **布局表这一侧是单向的**：布局回灌会读回色表与非色表，反过来色表 / 非色表**不读布局表**。
 * 理由不是省事：布局表重算要先读得开 `layout-envelope.json`。包络自 `R4-10` 起是**生成侧**准入
 * 必交件，而本包不跑准入（资产合不合格归采集侧校验器），所以一份没投影过包络的资产照样递得
 * 进来。让色表回灌去重算布局行，等于把「这份资产还没投影过包络」变成色链路退 1 的理由，而那件
 * 事与色值一个字都不相干。要谈对称得先在本包补一道资产准入，那是另一件事，见
 * `references/audit.md` §8。
 */

import fs from 'node:fs'
import path from 'node:path'

/** 三张表 `--out` 落盘的文件名，也是同目录取对表时认的那个名字。 */
export const MAP_MD_NAME = { value: 'value-map.md', type: 'type-map.md', layout: 'layout-map.md' }

/**
 * @param {{ verdict?: string, findings?: object[], warnings?: object[], summary?: object, rows?: object[], mapKind?: string }} primary
 * @param {{ verdict?: string, findings?: object[], warnings?: object[], summary?: object, rows?: object[], mapKind?: string } | null} peer
 * @param {{ primaryLabel: string, peerLabel: string, peerMapKind?: string, peerFile?: string | null }} labels
 */
export function combineMapVerdicts(primary, peer, { primaryLabel, peerLabel, peerMapKind, peerFile = null }) {
	const findings = [...(primary.findings ?? [])]
	const warnings = [...(primary.warnings ?? [])]
	if (peer?.verdict === 'blocked') {
		findings.push({
			code: 'maps-cross-blocked',
			level: 'block',
			peer: peer.mapKind ?? peerMapKind ?? peerLabel,
			reason: `${peerLabel} 读回已是 blocked：两张表必须一起 pass，不能只看 ${primaryLabel} 这一张`,
		})
	}
	const verdict = findings.length ? 'blocked' : 'pass'
	return {
		...primary,
		verdict,
		findings,
		warnings,
		peerMap: { mapKind: peer?.mapKind ?? peerMapKind ?? null, file: peerFile, verdict: peer?.verdict ?? null },
	}
}

/**
 * 对表读回件在哪：显式 `--peer-read-back` 优先，否则取本表读回件同目录的对表默认名。
 *
 * @param {{ peerMapKind: 'value' | 'type', readBack: string, peerReadBack?: string | null }} o
 */
export function resolvePeerReadBack({ peerMapKind, readBack, peerReadBack }) {
	const file = peerReadBack || path.join(path.dirname(path.resolve(readBack)), MAP_MD_NAME[peerMapKind])
	return { file, explicit: Boolean(peerReadBack), exists: fs.existsSync(file) }
}

/**
 * 回灌时的交叉判定。**这是 CLI 侧接线的唯一入口**，两个 CLI 各调一次；卸掉任一处，
 * `tests/maps-cross.test.mjs` 里真 spawn 的那几条当场转红。
 *
 * @param {object} o
 * @param {object} o.primary 本表读回结论
 * @param {string} o.primaryLabel 本表人读名（报错文案用）
 * @param {string} o.peerLabel 对表人读名
 * @param {'value' | 'type'} o.peerMapKind 对表的 `mapKind`
 * @param {string} o.readBack 本表 `--read-back` 路径
 * @param {string | null} o.peerReadBack 显式 `--peer-read-back` 路径
 * @param {number} o.peerRows 对表按同一份产物重算出的行数
 * @param {(md: string) => object} o.readPeer 把对表 md 读成结论
 * @returns {{ doc?: object, fatal?: string }} `fatal` 是用法错误（显式指的对表路径读不到）
 */
export function crossCheckMaps({ primary, primaryLabel, peerLabel, peerMapKind, readBack, peerReadBack, peerRows, readPeer }) {
	const peer = resolvePeerReadBack({ peerMapKind, readBack, peerReadBack })
	if (!peer.exists) {
		if (peer.explicit) return { fatal: `读不回对表：${peer.file}` }
		// 对表一行都没有时它的读回必然 pass，跳过与读回等价；有行就必须读回，不许当没这张表。
		if (!peerRows) return { doc: { ...primary, peerMap: null } }
		const findings = [
			...(primary.findings ?? []),
			{
				code: 'maps-cross-blocked',
				level: 'block',
				peer: peerMapKind,
				reason: `${peerLabel}重算出 ${peerRows} 行待裁决，却在本表读回件同目录取不到它的读回件（${MAP_MD_NAME[peerMapKind]}）：两张表必须一起 pass，不能只读回 ${primaryLabel} 这一张`,
			},
		]
		return {
			doc: {
				...primary,
				verdict: 'blocked',
				findings,
				warnings: [...(primary.warnings ?? [])],
				peerMap: { mapKind: peerMapKind, file: peer.file, verdict: null },
			},
		}
	}
	let md
	try {
		md = fs.readFileSync(peer.file, 'utf8')
	} catch {
		return { fatal: `读不回对表：${peer.file}` }
	}
	return {
		doc: combineMapVerdicts(primary, readPeer(md), { primaryLabel, peerLabel, peerMapKind, peerFile: peer.file }),
	}
}

/**
 * 多对表交叉判定。**布局表专用**：它有两张对表，单数 `peerMap` 装不下两张。
 *
 * 每张对表各判一次，findings 累加（两张都 blocked 就两条 `maps-cross-blocked`，不合并成一条
 * ——报告要说得出是哪一张）。显式指路指不到仍是用法错误、立即 `fatal`，不降级成「没有对表」。
 * 对表重算零行时**照样出一条 `peerMaps` 条目**（`verdict: null` + `rows: 0`），因为
 * 「零行所以跳过」与「读了且是 pass」在报告里必须分得开——这正是 `peerMap` 那一侧留痕的理由。
 *
 * @param {object} o
 * @param {object} o.primary 本表读回结论
 * @param {string} o.primaryLabel 本表人读名
 * @param {string} o.readBack 本表 `--read-back` 路径（同目录取对表的锚点）
 * @param {{ mapKind: 'value' | 'type', label: string, peerReadBack?: string | null, peerRows: number, readPeer: (md: string) => object }[]} o.peers
 * @returns {{ doc?: object, fatal?: string }}
 */
export function crossCheckPeers({ primary, primaryLabel, readBack, peers }) {
	const findings = [...(primary.findings ?? [])]
	const peerMaps = []
	for (const p of peers) {
		const loc = resolvePeerReadBack({ peerMapKind: p.mapKind, readBack, peerReadBack: p.peerReadBack })
		if (!loc.exists) {
			if (loc.explicit) return { fatal: `读不回对表：${loc.file}` }
			if (!p.peerRows) {
				peerMaps.push({ mapKind: p.mapKind, file: null, verdict: null, rows: 0 })
				continue
			}
			findings.push({
				code: 'maps-cross-blocked',
				level: 'block',
				peer: p.mapKind,
				reason: `${p.label}重算出 ${p.peerRows} 行待裁决，却在本表读回件同目录取不到它的读回件（${MAP_MD_NAME[p.mapKind]}）：三张表必须一起 pass，不能只读回 ${primaryLabel} 这一张`,
			})
			peerMaps.push({ mapKind: p.mapKind, file: loc.file, verdict: null, rows: p.peerRows })
			continue
		}
		let md
		try {
			md = fs.readFileSync(loc.file, 'utf8')
		} catch {
			return { fatal: `读不回对表：${loc.file}` }
		}
		const peer = p.readPeer(md)
		if (peer?.verdict === 'blocked') {
			findings.push({
				code: 'maps-cross-blocked',
				level: 'block',
				peer: peer.mapKind ?? p.mapKind,
				reason: `${p.label} 读回已是 blocked：三张表必须一起 pass，不能只看 ${primaryLabel} 这一张`,
			})
		}
		peerMaps.push({ mapKind: p.mapKind, file: loc.file, verdict: peer?.verdict ?? null, rows: p.peerRows })
	}
	return {
		doc: {
			...primary,
			verdict: findings.length ? 'blocked' : 'pass',
			findings,
			warnings: [...(primary.warnings ?? [])],
			peerMaps,
		},
	}
}
