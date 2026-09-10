/**
 * 断点锁的抽取器。只抽不判——比对与 code（`media-condition-added`）在 `migration-gates.mjs`。
 *
 * 判据的两边都**现读**：`--before` 的条件集合与 `--after` 的逐条比，谁都不是写死的白名单。
 * 本文件里**一个断点数字都不许出现**——源站改版、断点值变了，这道门必须零代码改动跟着走
 * （`migration-breakpoint.test.mjs` 有一条扫本文件源码的断言钉着这句话）。
 *
 * 不扫 `css-scan.mjs`：那份被 audit 的 `copied-helpers.test.mjs` 逐字锁着，而且它递归进
 * `@media` 抽声明时**把条件丢掉了**。所以这里从原始 CSS / HTML 文本自己抽 `@media` 前奏。
 *
 * 归一：整条条件小写、去掉全部空白。`(min-width: 768px)` 与 `(min-width:768px)` 是同一条，
 * `@media screen and (…)` 与 `@media (…)` 也是同一条——媒体类型不是断点。
 *
 * 抓得住：`min-width` / `max-width` / 区间语法（`(width >= 48em)`）/ `device-width`，
 * 凡条件里含 `width` 的都收。
 *
 * 抓不住（射程边界，不许让门看起来更大）：
 *
 * - **不换算单位、不归一数值**：`48em` 与 `768px`、`768.0px` 与 `768px` 各算一条。误报方向是
 *   「把改写法报成加断点」，出路是把写法改回去，不是放宽判据。
 * - **不含 `width` 的条件不收**：`prefers-color-scheme` / `orientation` / `@media print` 都不是断点。
 * - **`@container` 不是 `@media`**，容器查询不进射程。
 * - 按原始文本扫，所以 `<script>` 里字符串拼出来的 `@media (...)  {` 会被当成条件。方向保守
 *   （只会多报），但如实记：本门不解析 JS。
 */

function stripComments(text) {
	return String(text)
		.replace(/\/\*[\s\S]*?\*\//g, ' ')
		.replace(/<!--[\s\S]*?-->/g, ' ')
}

/** 一条括号里的媒体条件：含 `width` 的才是断点条件，归一成无空白小写串。 */
function normalizeWidthCondition(raw) {
	const flat = String(raw).toLowerCase().replace(/\s+/g, '')
	return flat.includes('width') ? flat : null
}

/** 一份文本里全部 `@media` 宽度条件，按文档序，可重复。 */
export function extractMediaWidthConditions(text) {
	const src = stripComments(text)
	const out = []
	for (const at of src.matchAll(/@media\b([^{;]*)\{/gi)) {
		for (const group of at[1].matchAll(/\(([^()]*)\)/g)) {
			const cond = normalizeWidthCondition(group[1])
			if (cond) out.push(cond)
		}
	}
	return out
}

/** 一批 `{ file, text }` 的条件并集。`--before` 那一侧只需要集合，不需要序。 */
export function collectMediaWidthConditions(sources) {
	const set = new Set()
	for (const f of sources ?? []) {
		for (const cond of extractMediaWidthConditions(f?.text)) set.add(cond)
	}
	return set
}
