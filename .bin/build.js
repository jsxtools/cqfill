import { box } from './internal/color.js'
import { isProcessMeta, getProcessArgOf } from './internal/process.js'
import esbuild from 'esbuild'
import fs from 'fs/promises'
import nodemon from 'nodemon'
import zlib from 'zlib'
import { minify } from 'terser'

/** @typedef {{ [name: string]: string }} Exports */
/** @typedef {{ extension: string, transform(code: string, exports: Exports): string }} Variant */
/** @type {{ [name: string]: Variant }} */
const variants = {
	esm: {
		extension: 'mjs',
		transform(code, exports) {
			/** @type {string[]} */
			const esmExports = []
			for (const name in exports) esmExports.push(`${exports[name]} as ${name}`)
			return (
				esmExports.length
					? `${code}export{${esmExports.join(',')}}`
				: code
			)
		},
	},
	cjs: {
		extension: 'cjs',
		transform(code, exports) {
			/** @type {string[]} */
			const cjsExports = []
			for (const name in exports) cjsExports.push(`${name}:${exports[name]}`)
			return (
				cjsExports.length
					? 'default' in exports
						? `${code}module.exports=Object.assign(${exports.default},{${cjsExports.join(',')}})`
					: `${code}module.exports={${cjsExports.join(',')}}`
				: code
			)
		},
	},
	iife: {
		extension: 'js',
		transform(code, exports) {
			code = code.replace(/;$/, '')
			for (const name in exports) code = `${code};globalThis.${name}=${exports[name]}`
			return code
		},
	},
}

/** @type {(pkgUrl: URL, base: string, opts: Options) => Promise<void>} */
export const build = async (pkgUrl, base, opts) => {
	opts = Object.assign({ only: [] }, opts)

	/** @type {{ name: string }} */
	const { name } = JSON.parse(
		await fs.readFile(
			new URL('package.json', pkgUrl),
			'utf8'
		)
	)

	if (!opts.only.length || opts.only.includes(name)) {
		const srcUrl = new URL(`src/${base}.js`, pkgUrl)
		const outDirUrl = new URL(`${base}/`, pkgUrl)
		const outEsmUrl = new URL(`${base}/${name}.mjs`, pkgUrl)

		// Build ESM version
		const {
			outputFiles: [cmapResult, codeResult],
		} = await esbuild.build({
			entryPoints: [srcUrl.pathname],
			outfile: outEsmUrl.pathname,
			bundle: true,
			format: 'esm',
			sourcemap: 'external',
			write: false,
		})

		// Minify ESM version
		const { code, map } = await minify(codeResult.text, {
			sourceMap: { content: cmapResult.text },
			compress: true,
			keep_fnames: true,
			module: true,
			mangle: true,
			toplevel: true,
		})

		// ensure empty dist directory
		await fs.mkdir(outDirUrl, { recursive: true })

		// write map
		await fs.writeFile(new URL(`${name}.map`, outDirUrl), map)

		// prepare variations
		/** @type {(code: string, index?: number) => [string, string]} */
		const splitByExport = (code, index = code.indexOf('export')) => [code.slice(0, index), code.slice(index)]
		const [lead, tail] = splitByExport(code)

		/** @type {{ [name: string]: string }} */
		const exports = Array.from(tail.matchAll(/([$\w]+) as (\w+)/g)).reduce(
			(exports, each) => Object.assign(exports, { [each[2]]: each[1] }), Object.create(null)
		)

		/** @type {(object: object, name: string) => boolean} */
		const hasOwnProperty = (object, name) => Object.prototype.hasOwnProperty.call(object, name)

		const customExports = {
			cjs: { ...exports },
			iife: { ...exports }
		}

		if (hasOwnProperty(customExports.iife, 'default') && !hasOwnProperty(customExports.iife, base)) {
			customExports.iife[base] = customExports.iife.default

			delete customExports.iife.default
		}

		const size = {
			name: base,
			types: {},
		}

		// write variation builds
		for (const variant in variants) {
			/** @type {Variant} */
			const variantInfo = variants[variant]
			const variantPath = new URL(`${name}.${variantInfo.extension}`, outDirUrl).pathname
			const variantCode = variantInfo.transform(lead, customExports[variant] || exports)
			const variantMins = (Buffer.byteLength(variantCode) / 1000).toFixed(2)
			const variantGzip = Number(zlib.gzipSync(variantCode, { level: 9 }).length / 1000).toFixed(2)

			size.types[variant] = {
				min: variantMins,
				gzp: variantGzip,
			}

			const mapping = variant === 'iife' ? '' : `\n//# sourceMappingUrl=${base}.map`

			await fs.writeFile(variantPath, variantCode + mapping)

			const packageJSON = JSON.stringify({
				private: true,
				type: 'module',
				main: `${name}.cjs`,
				module: `${name}.mjs`,
				jsdelivr: `${name}.js`,
				unpkg: `${name}.js`,
				files: [
					`${name}.cjs`,
					`${name}.js`,
					`${name}.mjs`
				],
				exports: {
					'.': {
						browser: `./${name}.js`,
						import: `./${name}.mjs`,
						require: `./${name}.cjs`,
						default: `./${name}.mjs`
					}
				}
			}, null, '  ')

			await fs.writeFile(new URL('package.json', outDirUrl), packageJSON)
		}

		console.log(box(size))
	}
}

/** @typedef {{ only?: string[] }} Options */

/** @type {(opts: Options) => Promise<void>} */
export const buildAll = async (opts) => {
	const pkgUrl = new URL('../', import.meta.url)
	await build(pkgUrl, 'export', opts)
	await build(pkgUrl, 'postcss', opts)
	await build(pkgUrl, 'postcss-7', opts)
	await build(pkgUrl, 'polyfill', opts)
}

if (isProcessMeta(import.meta)) {
	if (getProcessArgOf('watch').includes(true)) {
		let onlyArgs = getProcessArgOf('only')

		onlyArgs = onlyArgs.length ? ['--only', ...onlyArgs] : onlyArgs

		nodemon(
			[
				'-q',
				`--watch src`,
				`--exec "${['node', './.bin/build.js', ...onlyArgs].join(' ')}"`,
			].join(' '),
		).on('start', () => {
			process.stdout.write('\u001b[3J\u001b[2J\u001b[1J')
			console.clear()
		}).on('quit', () => process.exit()) // prettier-ignore
	} else {
		buildAll({
			only: getProcessArgOf('only'),
		}).catch((error) => {
			console.error(error)

			process.exitCode = 1
		})
	}
}
