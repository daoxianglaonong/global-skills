/**
 * 结构锁的抽取器。只抽不判——比对与 code（`tag-changed`）在 `migration-gates.mjs`。
 *
 * 判据只有一条：**开标签名的有序序列**，小写归一，逐位比。不收 class、不收属性、
 * 不收层级深度、不收节点数。另立一个模块而不是塞进 `content-lock.mjs` 的序列表里，
 * 是为了让两道门能**分别**卸掉接线各自转红——本仓库前四次空门都是「卸一处两件事一起哑」。
 *
 * 抓得住：包一层 `<div>`、`<section>` 改 `<div>`、抽掉一层、两段互换（`ul` 与 `h2` 对调）、
 * `h2` 改 `h3`、插一个 `<script>`。
 *
 * 抓不住（射程边界，不许让门看起来更大）：
 *
 * - 只改 class / `id` / `data-*` / 属性顺序——那些不进序列。改选择器的后果由兑现门的
 *   `accept-occurrence-lost` 报，不由本门报。
 * - **「不改路由与接口」在纯 HTML + CSS 产物上不可机检**，所以本门**不占**那个编号：
 *   产物合同只有 `.html` 与 `.css`，没有 JS 入口也没有网络日志；标记里能当路由的只有
 *   `href`（已在内容锁）与 `form[action]`（两侧都没有真样本，本轮不占编号）。REST /
 *   GraphQL / 云 API 在无 JS 的产物上零信号，占 `api-changed` 就是空门。
 * - `<script>` / `<style>` 的**体**不进序列（体里的 `a<b` 会被标签正则读成开标签），
 *   但它们的**开标签名进**——插一个 `<script>` 是换骨架。
 * - **同一条标签序列的不同嵌套**：`<div><p>x</p></div>` 与 `<div></div><p>x</p>` 的开标签
 *   序列都是 `[div, p]`，本门看不出来。只比序列不比树是本门最大的洞，配了用例锁住这句话
 *   （`migration-structure.test.mjs`），不许假装抓得住。要抓它得比树，而比树会把「换一层
 *   标签名」与「挪一层」报成同一条，本轮不做。
 * - `<img>` 与 `<img/>` 同名，formatter 不插标签就不红。HTML 大小写归一。
 * - `<script>` 没有闭标签时它的体不被清空，体里的 `a<b` 会被读成开标签。与内容锁的
 *   `stripScriptAndStyle` 同一条已知宽度。
 * - `--after` 多出来的 HTML 不判、`--before` 有而 `--after` 没有那份由内容锁的
 *   `content-file-missing` 报，本门不重复报同一件事。
 */

function stripComments(html) {
	return String(html).replace(/<!--[\s\S]*?-->/g, '')
}

/** 只清空 `<script>` / `<style>` 的体，保留它们的开闭标签本身。 */
function blankRawTextBodies(html) {
	return String(html)
		.replace(/(<script\b[^>]*>)[\s\S]*?(<\/script>)/gi, '$1$2')
		.replace(/(<style\b[^>]*>)[\s\S]*?(<\/style>)/gi, '$1$2')
}

export function extractTagSequence(html) {
	const src = blankRawTextBodies(stripComments(html))
	const out = []
	const re = /<\s*(\/?)\s*([a-zA-Z][\w-]*)([^>]*?)\/?\s*>/g
	let m
	while ((m = re.exec(src))) {
		if (m[1] === '/') continue
		out.push(m[2].toLowerCase())
	}
	return out
}

export function extractStructureLock(html) {
	return { tag: extractTagSequence(html) }
}
