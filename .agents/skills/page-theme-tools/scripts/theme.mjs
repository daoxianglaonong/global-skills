#!/usr/bin/env node
// The single tool entry for page-theme assets. JSON on stdout; exit 0 ok, 1 blocking findings, 2 usage / runtime error.
import fs from 'node:fs'
import path from 'node:path'
import { checkAsset, readJson } from './lib/check-asset.mjs'
import { buildCss, validateTokens } from './lib/tokens.mjs'
import { lintArtifacts, compareFiles, requireFiles } from './lib/lint.mjs'
import { inventory, inventoryMarkdown } from './lib/inventory.mjs'
import { snapshotHtml } from './lib/baseline.mjs'
import { listFiles } from './lib/css-scan.mjs'
import { previewHtml } from './lib/preview.mjs'
import { guardOutputs, protectedPaths, writeAtomic } from './lib/write.mjs'

const USAGE = `usage: node theme.mjs <command> ...
  check <asset-dir>                                   asset structure, tokens, tokens.css, Markdown refs
  css <asset-dir> [--check]                           write (or verify) tokens.css from tokens.json
  css <asset-dir> --out <file> [--scope <sel>] [--layer <name>]
                                                      consumer copy outside the asset
  preview <asset-dir> --out <file.html> [--components-only]
                                                      swatch / type review page; or the component gallery alone
  capture <url|file>... [--out <dir>] [--widths 1440,768,375] [--timeout <s>] [--png]
                                                      screenshots + evidence.json (needs Playwright)
  sample <image> --at x,y [--at x,y ...]              pixel colours, e.g. spec swatches (needs Playwright)
  lint --asset <asset-dir> <file|dir>... [--baseline <baseline.json>]
                                                      product lint (.html .htm .css .vue .svelte .jsx .tsx);
                                                      no scannable file is a usage error
  inventory <file|dir>... [--asset <asset-dir>] [--format md]
                                                      source values by value x usage, with candidate tokens
  baseline snapshot <html>... --out <baseline.json>   lock text / links / images / DOM before re-theming
  baseline compare <baseline.json> <html>...          drift check after re-theming`

class UsageError extends Error {}

function parse(argv) {
	const positional = []
	const flags = {}
	for (let i = 0; i < argv.length; i++) {
		const a = argv[i]
		if (!a.startsWith('--')) { positional.push(a); continue }
		const key = a.slice(2)
		if (['check', 'png', 'components-only'].includes(key)) { flags[key] = true; continue }
		const value = argv[++i]
		if (value === undefined) throw new UsageError(`--${key} needs a value`)
		flags[key] = key === 'at' ? [...(flags.at || []), value] : value
	}
	return { positional, flags }
}

const need = (cond, msg) => { if (!cond) throw new UsageError(msg) }
const print = (obj) => process.stdout.write(JSON.stringify(obj, null, 2) + '\n')

const commands = {
	check([dir]) {
		need(dir, 'check needs <asset-dir>')
		const r = checkAsset(dir)
		print(r)
		return r.ok ? 0 : 1
	},
	css([dir], flags) {
		need(dir, 'css needs <asset-dir>')
		const json = readJson(path.join(dir, 'tokens.json'))
		const errors = validateTokens(json)
		if (errors.length) { print({ ok: false, errors }); return 1 }
		if (flags.out) {
			need(!flags.check, '--check verifies the asset\'s own tokens.css; drop --out')
			guardOutputs([flags.out], { assets: [dir] })
			writeAtomic(flags.out, buildCss(json, { scope: flags.scope, layer: flags.layer }))
			print({ ok: true, file: flags.out, scope: flags.scope || ':root', layer: flags.layer || null })
			return 0
		}
		need(!flags.scope && !flags.layer, '--scope / --layer are for consumer copies; add --out <file> outside the asset')
		const file = path.join(dir, 'tokens.css')
		const css = buildCss(json)
		const current = fs.existsSync(file) ? fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n') : null
		if (flags.check) { print({ ok: current === css, file }); return current === css ? 0 : 1 }
		writeAtomic(file, css)
		print({ ok: true, file, changed: current !== css })
		return 0
	},
	preview([dir], flags) {
		need(dir && flags.out, 'preview needs <asset-dir> and --out <file.html>')
		const json = readJson(path.join(dir, 'tokens.json'))
		const errors = validateTokens(json)
		if (errors.length) { print({ ok: false, errors }); return 1 }
		guardOutputs([flags.out], { assets: [dir] })
		const optional = (f) => (fs.existsSync(path.join(dir, f)) ? fs.readFileSync(path.join(dir, f), 'utf8') : '')
		const componentsOnly = Boolean(flags['components-only'])
		need(!componentsOnly || (optional('components.css') && optional('components.md')), '--components-only needs components.css and components.md in the asset')
		writeAtomic(flags.out, previewHtml(json, { componentsCss: optional('components.css'), componentsMd: optional('components.md'), componentsOnly }))
		print({ ok: true, out: flags.out })
		return 0
	},
	async capture(targets, flags) {
		need(targets.length, 'capture needs at least one URL or file')
		const { capture } = await import('./lib/capture.mjs')
		const widths = flags.widths ? flags.widths.split(',').map(Number) : undefined
		need(!widths || widths.every((w) => w > 0), '--widths must be positive integers')
		const timeout = flags.timeout === undefined ? undefined : Number(flags.timeout) * 1000
		need(timeout === undefined || timeout > 0, '--timeout takes seconds, a positive number')
		const r = await capture(targets, { out: flags.out, widths, timeout, format: flags.png ? 'png' : 'jpg' })
		print({ out: r.out, evidence: path.join(r.out, 'evidence.json'), targets: r.targets.map((t) => ({ input: t.input, url: t.url, ok: t.ok, title: t.title, screenshots: t.screenshots, overflow: t.overflow, lowContrast: t.lowContrast?.length, fontSizeCount: t.fontSizeCount, failures: t.failures, error: t.error })) })
		return r.targets.some((t) => t.ok) ? 0 : 1
	},
	async sample([image], flags) {
		need(image && flags.at, 'sample needs <image> and --at x,y')
		const points = flags.at.map((p) => { const [x, y] = p.split(',').map(Number); return { x, y } })
		need(points.every((p) => Number.isInteger(p.x) && Number.isInteger(p.y)), '--at takes integer x,y')
		const { sampleImage } = await import('./lib/capture.mjs')
		print({ image, points: await sampleImage(image, points) })
		return 0
	},
	lint(inputs, flags) {
		need(flags.asset && inputs.length, 'lint needs --asset <asset-dir> and at least one file or dir')
		const baseline = flags.baseline ? readJson(flags.baseline) : undefined
		const r = lintArtifacts(flags.asset, inputs, { baseline })
		print(r)
		return r.ok ? 0 : 1
	},
	inventory(inputs, flags) {
		need(inputs.length, 'inventory needs at least one file or dir')
		const r = inventory(inputs, { assetDir: flags.asset })
		if (flags.format === 'md') process.stdout.write(inventoryMarkdown(r))
		else print(r)
		return 0
	},
	baseline([mode, ...rest], flags) {
		if (mode === 'snapshot') {
			need(rest.length && flags.out, 'baseline snapshot needs <html>... and --out')
			const files = requireFiles(rest, (f) => /\.html?$/i.test(f))
			guardOutputs([flags.out], { protect: protectedPaths(rest) })
			const doc = { files: files.map((f) => ({ file: path.relative(process.cwd(), f).replace(/\\/g, '/'), ...snapshotHtml(fs.readFileSync(f, 'utf8')) })) }
			writeAtomic(flags.out, JSON.stringify(doc, null, 2))
			print({ ok: true, out: flags.out, files: doc.files.map((f) => f.file) })
			return 0
		}
		need(mode === 'compare' && rest.length >= 2, 'baseline needs snapshot|compare')
		const r = compareFiles(readJson(rest[0]), listFiles(rest.slice(1)).filter((f) => /\.html?$/i.test(f)))
		print(r)
		return r.ok ? 0 : 1
	}
}

async function main() {
	const [name, ...argv] = process.argv.slice(2)
	try {
		need(commands[name], name ? `unknown command ${name}` : 'missing command')
		const { positional, flags } = parse(argv)
		process.exitCode = await commands[name](positional, flags)
	} catch (e) {
		process.stderr.write(e instanceof UsageError ? `${e.message}\n${USAGE}\n` : e.input ? `${e.message}\n` : `${e.stack || e}\n`)
		process.exitCode = 2
	}
}

main()
