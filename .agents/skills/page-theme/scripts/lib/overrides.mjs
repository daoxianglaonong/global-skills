/**
 * `site-overrides.yaml` 读取（E-69 schema / E-70 proposed 不生效 / E-72 生效时机）。
 * 脚本只读不写：该文件是 curated，追加 `proposed: true` 草稿是 agent 的动作（M-19）。
 * YAML 解析走全仓唯一实现 `lib/yaml.mjs`〔B-21〕；本文件原先那份「无冒号行静默跳过」的
 * 子集解析器已删除——它会把解析故障伪装成字段缺失（B-27 底线）。
 */
import path from 'node:path'
import { readTextIfExists, sha256 } from './fsutil.mjs'
import { parseYaml } from './yaml.mjs'

const EMPTY = {
	present: false,
	effective: false,
	proposed: null,
	consent: [],
	overlays: [],
	wrappers: [],
	floors: [],
	enableL3: false,
	noise: { thirdPartyHosts: [], excludeSelectors: [] },
	hash: null
}

/** E-72：仅当 proposed 不为 true 时，consent / overlays / wrappers / floors / noise / enableL3 才生效。 */
export async function loadSiteOverrides(assetDir) {
	const file = path.join(assetDir, 'site-overrides.yaml')
	const text = await readTextIfExists(file)
	if (text === null) return { ...EMPTY }
	let doc = {}
	try {
		doc = parseYaml(text, file) || {}
	} catch (err) {
		// 解析失败时一律按「本文件不生效」处理并留下原文错误，不猜字段（D3）。
		return { ...EMPTY, present: true, parseError: String(err.message || err), hash: `sha256:${sha256(text)}` }
	}
	const effective = doc.proposed !== true
	const arr = (v) => (Array.isArray(v) ? v : [])
	const noise = doc.noise || {}
	return {
		present: true,
		effective,
		proposed: doc.proposed === undefined ? null : doc.proposed,
		siteSlug: doc.siteSlug || null,
		consent: effective ? arr(doc.consent) : [],
		overlays: effective ? arr(doc.overlays) : [],
		wrappers: effective ? arr(doc.wrappers) : [],
		floors: effective ? arr(doc.floors) : [],
		enableL3: effective ? doc.enableL3 === true : false,
		noise: {
			thirdPartyHosts: effective ? arr(noise.thirdPartyHosts) : [],
			excludeSelectors: effective ? arr(noise.excludeSelectors) : []
		},
		hash: `sha256:${sha256(text)}`
	}
}

/** 面积统计与截图前要 mask 的选择器（E-72）：consent.mask + overlays.mask + noise.excludeSelectors。 */
export function maskSelectors(ov) {
	return [
		...ov.consent.filter((c) => c && c.action === 'mask').map((c) => c.selector),
		...ov.overlays.filter((o) => o && o.action === 'mask').map((o) => o.selector),
		...ov.noise.excludeSelectors
	].filter(Boolean)
}

/** 仅楼层切片瞬间隐藏的选择器（E-72 的 hide-for-floor-shot）。 */
export function floorShotHideSelectors(ov) {
	return ov.overlays.filter((o) => o && o.action === 'hide-for-floor-shot').map((o) => o.selector).filter(Boolean)
}
