import { box } from './internal/color.js'
import { isProcessMeta, getProcessArgOf } from './internal/process.js'
import esbuild from 'esbuild'
import fs from 'fs/promises'
import nodemon from 'nodemon'
import zlib from 'zlib'
import { minify } from 'terser'

const variants = {
	esm: {
		extension: 'mjs',
		transform(code, exports) {
			const esmExports = []
			for (const name in exports) esmExports.push(`${exports[name]} as ${name}`)
			return `${code}export{${esmExports.join(',')}}`
		},
	},
	cjs: {
		extension: 'cjs',
		transform(code, exports) {
			const cjsExports = []
			for (const name in exports) cjsExports.push(`${name}:${exports[name]}`)
			return (
				'default' in exports
					? `${code}module.exports=Object.assign(${exports.default},{${cjsExports.join(',')}})`
				: `${code}module.exports={${cjsExports.join(',')}}`
			)
		},
	},
	iife: {
		extension: 'js',
		transform(code, exports) {
			const iifeExports = []
			for (const name in exports) iifeExports.push(`globalThis.${name}=${exports[name]}`)
			return `(()=>{${code}${iifeExports.join(';')}})()`
		},
	},
}

export const build = async (packageUrl, base, opts) => {
	opts = Object.assign({ only: [] }, opts)

	const initPackageUrl = new URL('src/', packageUrl)
	const distPackageUrl = new URL('dist/', packageUrl)

	const packageJsonUrl = new URL(`package.json`, packageUrl)
	const packageName = JSON.parse(await fs.readFile(packageJsonUrl, 'utf8')).name

	if (!opts.only.length || opts.only.includes(packageName)) {
		const targetPathname = new URL(`${base}.js`, initPackageUrl).pathname
		const outputPathname = new URL(`${base}.js`, distPackageUrl).pathname

		// Build ESM version
		const {
			outputFiles: [cmapResult, codeResult],
		} = await esbuild.build({
			entryPoints: [targetPathname],
			outfile: outputPathname,
			bundle: true,
			format: 'esm',
			sourcemap: 'external',
			write: false,
		})

		// Minify ESM version
		const { code, map } = await minify(codeResult.text, {
			sourceMap: { content: cmapResult.text },
			compress: true,
			module: true,
			mangle: true,
			toplevel: true,
		})

		// ensure empty dist directory
		await fs.mkdir(distPackageUrl, { recursive: true })

		// write map
		await fs.writeFile(new URL(`${base}.map`, distPackageUrl), map)

		// prepare variations
		const splitByExport = (code, index = code.indexOf('export')) => [code.slice(0, index), code.slice(index)]
		const [lead, tail] = splitByExport(code)

		const exports = Array.from(tail.matchAll(/([$\w]+) as (\w+)/g)).reduce((exports, each) => Object.assign(exports, { [each[2]]: each[1] }), Object.create(null))

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
			const variantInfo = variants[variant]
			const variantPath = new URL(`dist/${base}.${variantInfo.extension}`, packageUrl).pathname
			const variantCode = variantInfo.transform(lead, customExports[variant] || exports)
			const variantMins = (Buffer.byteLength(variantCode) / 1000).toFixed(2)
			const variantGzip = Number(zlib.gzipSync(variantCode, { level: 9 }).length / 1000).toFixed(2)

			size.types[variant] = {
				min: variantMins,
				gzp: variantGzip,
			}

			const mapping = variant === 'iife' ? '' : `\n//# sourceMappingUrl=${base}.map`

			await fs.writeFile(variantPath, variantCode + mapping)
		}

		console.log(box(size))
	}
}

export const buildAll = async (opts) => {
	const packageUrl = new URL('../', import.meta.url)
	await build(packageUrl, 'polyfill', opts)
	await build(packageUrl, 'postcss', opts)
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
