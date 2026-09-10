/**
 * 收产物面：`--artifact` 指文件即单文件；指目录则递归收 `*.html` / `*.css`。
 *
 * 跳过 `node_modules` 与点开头目录。按相对路径升序。收到 0 份由调用方报 `artifact-empty`。
 * 本模块不判对错，只摊文件清单。
 */

import fs from 'node:fs'
import path from 'node:path'

const isArtifactName = (name) => /\.(html|css)$/i.test(name)

export function collectArtifactFiles(target) {
	const rootAbs = path.resolve(target)
	if (!fs.existsSync(rootAbs)) return { root: rootAbs, files: [] }
	const st = fs.statSync(rootAbs)
	if (st.isFile()) {
		const rel = path.basename(rootAbs)
		if (!isArtifactName(rel)) return { root: path.dirname(rootAbs), files: [] }
		return { root: path.dirname(rootAbs), files: [{ abs: rootAbs, rel }] }
	}

	const files = []
	const walk = (dir, prefix) => {
		for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
			if (e.name === 'node_modules') continue
			const rel = prefix ? `${prefix}/${e.name}` : e.name
			const full = path.join(dir, e.name)
			if (e.isDirectory()) {
				if (e.name.startsWith('.')) continue
				walk(full, rel)
				continue
			}
			if (!isArtifactName(e.name)) continue
			files.push({ abs: full, rel })
		}
	}
	walk(rootAbs, '')
	files.sort((a, b) => (a.rel < b.rel ? -1 : a.rel > b.rel ? 1 : 0))
	return { root: rootAbs, files }
}
