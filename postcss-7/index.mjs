import postcssCQFill from '../dist/postcss.mjs'

export default Object.defineProperties(postcssCQFill, Object.getOwnPropertyDescriptors({
	get postcss() {
		function postcssPlugin(cssRoot) {
			const visitors = postcssCQFill()

			if (typeof visitors.Once === 'function') {
				visitors.Once(cssRoot)
			}

			cssRoot.walk(node => {
				const [visitorType, needle] = {
					atrule: ['AtRule', 'name'],
					comment: ['Comment', 'text'],
					decl: ['Declaration', 'prop'],
					rule: ['Rule', 'selector'],
				}[node.type]

				if (visitorType in visitors) {
					const visitor = visitors[visitorType]

					if (typeof visitor === 'function') visitor(node)
					else if (typeof visitor === 'object' && visitor !== null) {
						for (const term in visitor) {
							const search = node[needle]

							if (term === '*' || term.includes(search)) visitor[term](node)
						}
					}
				}
			})
		}

		postcssPlugin.postcssPlugin = 'cqfill/postcss'
		postcssPlugin.postcssVersion = '8.2.13'

		return postcssPlugin
	}
}))
