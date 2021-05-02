import { transformRanges } from './lib/transformRanges'

function postcssCQFill() {
	return {
		postcssPlugin: 'PostCSS CQFill',
		Declaration: {
			contain(
				/** @type {PostCSSDeclaration} */
				cssDeclaration
			) {
				cssDeclaration.cloneBefore({
					prop: '--css-contain'
				})
			}
		},
		AtRule: {
			container(
				/** @type {PostCSSAtRule} */
				cssAtRule
			) {
				cssAtRule.params = transformRanges(cssAtRule.params)

				cssAtRule.cloneBefore({
					name: 'media',
					params: `--css-container and ${cssAtRule.params}`
				})
			}
		}
	}
}

postcssCQFill.postcss = true

export default postcssCQFill

/** @typedef {{ name: string, params: string, cloneBefore(opts: Partial<PostCSSAtRule>): PostCSSAtRule }} PostCSSAtRule */
/** @typedef {{ prop: string, cloneBefore(opts: Partial<PostCSSDeclaration>): PostCSSDeclaration }} PostCSSDeclaration */
