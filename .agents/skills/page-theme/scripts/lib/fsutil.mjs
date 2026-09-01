/** 落盘工具：UTF-8 JSON、目录、两份白名单式 .gitignore（E-81 / E-32）。 */
import fs from 'node:fs/promises'
import path from 'node:path'
import crypto from 'node:crypto'

/** 本次 run 实际写出的文件清单，供 O-27 短摘要与 E-82 对账 */
export const written = []

export async function ensureDir(dir) {
	await fs.mkdir(dir, { recursive: true })
}

export async function writeJson(filePath, data) {
	await ensureDir(path.dirname(filePath))
	await fs.writeFile(filePath, `${JSON.stringify(data, null, 2)}\n`, 'utf8')
	written.push(filePath)
	return filePath
}

export async function writeText(filePath, text) {
	await ensureDir(path.dirname(filePath))
	await fs.writeFile(filePath, text, 'utf8')
	written.push(filePath)
	return filePath
}

export async function writeBinary(filePath, buf) {
	await ensureDir(path.dirname(filePath))
	await fs.writeFile(filePath, buf)
	written.push(filePath)
	return filePath
}

export async function readTextIfExists(filePath) {
	try {
		return await fs.readFile(filePath, 'utf8')
	} catch {
		return null
	}
}

export async function exists(p) {
	try {
		await fs.access(p)
		return true
	} catch {
		return false
	}
}

export function sha256(text) {
	return crypto.createHash('sha256').update(text, 'utf8').digest('hex')
}

/** E-81：先忽略全部，再放行各页 copy-stats.json 与 .gitignore 自身 */
export const RAW_GITIGNORE = ['*', '!*/', '!.gitignore', '!**/copy-stats.json', ''].join('\n')

/** E-32：忽略 PNG 原图，放行 WebP 缩略、index.json 与 .gitignore 自身 */
export const SHOTS_GITIGNORE = ['*.png', '!*.webp', '!index.json', '!.gitignore', ''].join('\n')

export async function writeGitignores(assetDir) {
	await writeText(path.join(assetDir, 'raw', '.gitignore'), RAW_GITIGNORE)
	await writeText(path.join(assetDir, 'screenshots', '.gitignore'), SHOTS_GITIGNORE)
}

/** 资产根内的相对路径，供 screenshots/index.json 与 landmarks.screenshot 使用 */
export function relFromAsset(assetDir, filePath) {
	return path.relative(assetDir, filePath).split(path.sep).join('/')
}
