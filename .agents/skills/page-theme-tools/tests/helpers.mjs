import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
export const FIXTURES = path.join(here, 'fixtures')
export const ASSET = path.join(FIXTURES, 'asset')
export const CLI = path.join(here, '..', 'scripts', 'theme.mjs')

export function tmpDir() {
	return fs.mkdtempSync(path.join(os.tmpdir(), 'pta-'))
}

/** Copy the fixture asset to a temp dir; `files` overwrites or (with null) deletes entries. */
export function tmpAsset(files = {}) {
	const dir = tmpDir()
	copyDir(ASSET, dir)
	writeFiles(dir, files)
	return dir
}

// fs.cpSync fails with EIO on Windows when the temp path contains non-ASCII characters (Node 24).
function copyDir(from, to) {
	for (const e of fs.readdirSync(from, { withFileTypes: true })) {
		const src = path.join(from, e.name)
		const dst = path.join(to, e.name)
		if (e.isDirectory()) {
			fs.mkdirSync(dst, { recursive: true })
			copyDir(src, dst)
		} else fs.copyFileSync(src, dst)
	}
}

export function writeFiles(dir, files) {
	for (const [rel, content] of Object.entries(files)) {
		const p = path.join(dir, rel)
		if (content === null) {
			fs.rmSync(p, { force: true, recursive: true })
			continue
		}
		fs.mkdirSync(path.dirname(p), { recursive: true })
		fs.writeFileSync(p, typeof content === 'string' ? content : JSON.stringify(content, null, 2))
	}
	return dir
}

export function readTokens(dir = ASSET) {
	return JSON.parse(fs.readFileSync(path.join(dir, 'tokens.json'), 'utf8'))
}

export const codes = (list) => list.map((f) => f.code)

/** Fixture tokens plus a version, a renamed (deprecated) token and a one-component layer. */
export function layeredTokens() {
	const json = readTokens()
	json.version = '1.1.0'
	Object.assign(json.tokens, {
		'color.text.old': { type: 'color', value: '#1f2329', cssVar: '--zz-ink', usage: '旧名', source: 'spec', deprecated: true, replacedBy: 'color.text.default' },
		'component.button.primary.bg': { type: 'color', value: '{color.action.primary}', cssVar: '--zz-button-primary-bg', usage: '主按钮底色', source: 'spec' }
	})
	return json
}

export const COMPONENTS_CSS = '.zz-button--primary { background: var(--zz-button-primary-bg); color: var(--zz-surface); }\n.zz-button--primary:hover, .zz-button--primary.is-hover { background: var(--zz-action-hover); }\n'
export const COMPONENTS_MD = '## 组件清单\n\n| 组件 | 状态 | 来源 | 缺什么 |\n| --- | --- | --- | --- |\n| 按钮 | 已收录 | spec | — |\n| 开关 | 待补充 | 无 | 规范图 |\n\n## 按钮\n\n```html\n<button class="zz-button zz-button--primary">提交</button>\n<button class="zz-button zz-button--primary is-hover">悬停</button>\n```\n\n```html surface=--zz-text\n<button class="zz-button zz-button--primary">深底</button>\n```\n'
