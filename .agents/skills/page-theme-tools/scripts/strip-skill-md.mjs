// postinstall: any SKILL.md under .agents/skills/ gets indexed as a skill, so none may survive in node_modules.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), 'node_modules')
let removed = 0
for (const rel of fs.existsSync(root) ? fs.readdirSync(root, { recursive: true }) : []) {
	if (path.basename(rel) === 'SKILL.md') {
		fs.rmSync(path.join(root, rel), { force: true })
		removed++
	}
}
console.log(`strip-skill-md: removed ${removed} SKILL.md from node_modules`)
