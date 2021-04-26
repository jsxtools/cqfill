import assert from 'assert/strict';
import postcss from 'postcss'
import { postcssCQFill } from 'cqfill/postcss'

async function test() {
	const containCssValue = `layout inline-size`
	const containerCssRuleBlock = `{\n\t.card {\n\t\tgrid-template-columns: 1fr 2fr;\n\t\tgrid-template-rows: auto 1fr;\n\t\talign-items: start;\n\t\tcolumn-gap: 20px;\n\t}\n}`

	const sourceCss = `.container {\n\tcontain: ${containCssValue};\n}\n\n@container (min-width: 700px) ${containerCssRuleBlock}`
	const expectCss = `.container {\n\t--css-contain: ${containCssValue};\n\tcontain: ${containCssValue};\n}\n\n@media --css-container and (min-width: 700px) ${containerCssRuleBlock}\n\n@container (min-width: 700px) ${containerCssRuleBlock}`

	const { css: resultCss } = await postcss([
		postcssCQFill
	]).process(sourceCss, { from: './test.css', to: './test.css' })

	try {
		assert.equal(resultCss, expectCss)

		console.log('PostCSS CQFill transformation a complete success!')
	} catch (error) {
		console.error('PostCSS CQFill transformation a complete failure!')
		console.error(error)
	}
}

test()
