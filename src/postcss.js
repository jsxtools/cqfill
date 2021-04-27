import { transformRanges } from './lib/transformRanges'

function postcssCQFill() {
	return {
		postcssPlugin: 'PostCSS CQFill',
		Declaration: {
			contain(cssDeclaration) {
				cssDeclaration.cloneBefore({
					prop: '--css-contain'
				})
			}
		},
		AtRule: {
			container(cssAtRule) {
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
