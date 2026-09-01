/**
 * 第一方变量表（E-43–E-49、E-88）。无条件采集；筛选门是 alias 网参与，不是前缀聚类（E-45）。
 * 本模块不认公开设计系统，不写体系名（E-49）。
 */
import { parseCssColor, srgbToOklch } from './color.mjs'

const VAR_DECL = /(--[A-Za-z0-9_-]+)\s*:\s*([^;}]+)/g
const VAR_REF = /var\(\s*(--[A-Za-z0-9_-]+)/g
/** 族名词干：剥掉末尾的序数或档名后缀。档名集是**语法形状**不是某站数据 */
const SCALE_SUFFIX = /^(.*?)[-_](\d{1,4}|xxs|xs|sm|md|lg|xl|xxl|2xl|3xl|4xl|5xl)$/i

/** 从第一方 CSS 原文抽 alias 边与被引用集合。 */
export function scanAliasNet(cssText) {
	const edges = []
	const referenced = new Set()
	const declared = new Set()
	VAR_REF.lastIndex = 0
	for (let m = VAR_REF.exec(cssText); m; m = VAR_REF.exec(cssText)) referenced.add(m[1])
	VAR_DECL.lastIndex = 0
	for (let m = VAR_DECL.exec(cssText); m; m = VAR_DECL.exec(cssText)) {
		const name = m[1]
		declared.add(name)
		const value = m[2]
		const inner = value.matchAll(/var\(\s*(--[A-Za-z0-9_-]+)/g)
		for (const ref of inner) edges.push({ from: name, to: ref[1] })
	}
	return { edges, referenced, declared }
}

function stemOf(name) {
	const m = name.match(SCALE_SUFFIX)
	return m ? `${m[1]}-` : null
}

/**
 * @param {{properties:{name:string,value:string}[]}} computed collectCustomPropertiesInPage 的结果
 * @param {string} firstPartyCss 第一方 CSS 并集原文
 * @param {{href:string,firstParty:boolean,css:string,path?:string}[]} origins 供 E-48 文件名探测
 */
export function buildFirstPartyVariables(computed, firstPartyCss, origins) {
	const { edges, referenced } = scanAliasNet(firstPartyCss)
	const declaresVar = new Set(edges.map((e) => e.from))

	const fromComputed = computed.properties.map((p) => ({
		name: p.name,
		computed: p.value,
		// E-44：只有在 var() 引用链上（被引用或引用别人）才算命名证据
		inAliasNet: referenced.has(p.name) || declaresVar.has(p.name)
	}))

	const byStem = new Map()
	for (const entry of fromComputed) {
		const stem = stemOf(entry.name)
		if (!stem) continue
		const rec = byStem.get(stem) || { stem, members: [], values: new Map() }
		rec.members.push(entry.name)
		rec.values.set(entry.name, entry.computed)
		byStem.set(stem, rec)
	}

	const families = []
	for (const rec of byStem.values()) {
		if (rec.members.length < 2) continue
		const distinct = new Set([...rec.values.values()].map((v) => v.trim().toLowerCase()))
		const measures = []
		for (const [name, raw] of rec.values.entries()) {
			const color = parseCssColor(raw.trim())
			if (color && (color.a === undefined || color.a > 0)) {
				const o = srgbToOklch(color)
				measures.push({ name, oklchL: o ? o.l : null })
				continue
			}
			const px = raw.trim().match(/^(-?[\d.]+)px$/)
			if (px) measures.push({ name, px: Number(px[1]) })
		}
		families.push({
			stem: rec.stem,
			members: rec.members.sort(),
			distinctResolvedCount: distinct.size,
			measures
		})
	}

	// E-48：独立 token 文件探测是加分项，失败必须写 not_found 然后继续纯反推
	const tried = []
	let found = null
	for (const o of origins) {
		if (!o.firstParty || o.type !== 'link') continue
		const href = o.href || ''
		tried.push(href)
		if (!/token|theme|variable|design[-_]?system|palette/i.test(href)) continue
		const text = o.css || ''
		if (/--[A-Za-z0-9_-]+\s*:/.test(text)) {
			found = href
			break
		}
	}

	return {
		fromComputed,
		aliasEdges: edges,
		families: families.sort((a, b) => b.members.length - a.members.length),
		tokenFileProbe: { status: found ? 'found' : 'not_found', file: found, tried: tried.slice(0, 40) }
	}
}

/** E-88 前半：亮暗双值对照。无暗色时 darkValues 为空数组，不得编造。 */
export function buildCustomProperties(light, dark) {
	const darkMap = new Map((dark && dark.properties ? dark.properties : []).map((p) => [p.name, p.value]))
	return {
		schemaVersion: 1,
		rootFontSizePx: light.rootFontSizePx,
		colorScheme: light.colorScheme,
		values: light.properties.map((p) => ({ name: p.name, value: p.value })),
		darkValues: dark ? light.properties.filter((p) => darkMap.has(p.name)).map((p) => ({ name: p.name, value: darkMap.get(p.name) })) : []
	}
}
