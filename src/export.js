export const cqfill = ((
	{ every, indexOf, slice } = Array.prototype,

	defaultRoot = globalThis.document,

	supportsLayoutContainment = defaultRoot && CSS.supports('contain: layout inline-size'),

	unmatchableSelector = ':not(*)',

	containerQueryMatcher = /\(\s*(min|max)-(height|width):\s*([^\s]+)\s*\)/,

	numberMatcher = /^([+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[Ee][+-]?\d+)?)(.*)$/,

	/** @type {Set<Element>} */
	layoutContainerSet = new Set(),

	/** @type {[string, CSSStyleRule, (rect: Element) => boolean][]} */
	containerQueries = [],

	/** @type {(() => void)[]} */
	onMutationList = [],

	/** @type {(selectorList: string[]) => string} */
	getSelectorText = (selectorList) => selectorList.length ? `:where(${selectorList.join(',')})` : unmatchableSelector,

	/** @type {(element: Element) => string} */
	getElementSelectorText = (element) => {
		/** @type {Element} */
		let parent
		let selector = ''
		while (parent = element.parentElement) {
			/** @type {number} */
			const nthChild = indexOf.call(parent.children, element) + 1
			selector = ` > :nth-child(${nthChild})${selector}`
			element = parent
		}
		return ':root' + selector
	},

	/** @type {(element: Element) => boolean} */
	hasInlineOuterDisplay = (element) => /inline/i.test(getComputedStyle(element).display),

	/** @type {(cssGroup: CSSParentRule, cssRule: CSSAnyRule) => number} */
	getCSSRuleIndexOf = (cssGroup, cssRule) => indexOf.call(cssGroup.cssRules || [], cssRule),

	/** @type {(cssGroup: CSSParentRule) => CSSAnyRule[]} */
	getCSSRules = (/** @type {CSSGroupingRule} */ cssGroup) => slice.call(cssGroup.cssRules || []),

	/** @type {(cssGroup: CSSParentRule, cssText: string, index: number) => CSSAnyRule} */
	insertCssRule = (cssGroup, cssText, index) => cssGroup.cssRules[cssGroup.insertRule(cssText, index)],

	onResize = () => {
		for (const [containedSelectorText, innerRule, doesFulfillQuery] of containerQueries) {
			/** @type {Set<Element>} */
			const fulfilledElements = new Set()

			for (const layoutContainer of layoutContainerSet) {
				if (doesFulfillQuery(layoutContainer)) {
					for (const element of layoutContainer.querySelectorAll(containedSelectorText)) {
						fulfilledElements.add(element)
					}
				}
			}

			/** @type {string[]} */
			const fulfilledSelectorList = []

			for (const element of fulfilledElements) {
				const selectorText = getElementSelectorText(element)

				fulfilledSelectorList.push(selectorText)
			}

			const nextSelectorText = fulfilledSelectorList.length ? `:is(${containedSelectorText}):where(${fulfilledSelectorList.join(',')})` : unmatchableSelector
			if (innerRule.selectorText !== nextSelectorText) {
				innerRule.selectorText = nextSelectorText
			}
		}
	},

	/** @type {(root: DocumentOrShadowRoot, cssRule: CSSAnyRule, cssGroup: CSSParentRule, hasInlineSizeContainment: boolean) => string} */
	addLayoutContainerByCssRule = (root, cssRule, cssGroup, hasInlineSizeContainment) => {
		const cssRuleIndex = getCSSRuleIndexOf(cssGroup, cssRule)
		const getFallbackCssText = (
			/** @type {boolean} */
			hasInlineDisplay
		) => (
			`${
				unmatchableSelector
			}{transform:scale3d(1,1,1);${
				hasInlineSizeContainment ? 'inline-size' : 'block-size'
			}:${
				hasInlineDisplay ? 0 : 100
			}%}`
		)
		const fallbackCssText = `@media all{${getFallbackCssText(true)}${getFallbackCssText(false)}}`
		const cssPolyfillGroup = insertCssRule(cssGroup, fallbackCssText, cssRuleIndex)
		const [cssInlinePolyfillStyleRule, cssBlockPolyfillStyleRule] = cssPolyfillGroup.cssRules

		/** @type {Element[]} */
		let lastElements = []

		const onMutation = () => {
			/** @type {string[]} */
			const blockSelectorList = []

			/** @type {string[]} */
			const inlineSelectorList = []

			const elements = root.querySelectorAll(cssRule.selectorText)

			/** @type {(value: Element, index: number) => boolean} */
			const doesMatchElement = (element, index) => element === lastElements[index]

			const doesMatchAllElements = elements.length === lastElements.length && every.call(elements, doesMatchElement)

			if (!doesMatchAllElements) {
				layoutContainerSet.clear()

				ro.disconnect()

				for (const element of elements) {
					layoutContainerSet.add(element)

					const selectorText = getElementSelectorText(element)

					if (hasInlineOuterDisplay(element)) inlineSelectorList.push(selectorText)
					else blockSelectorList.push(selectorText)

					ro.observe(element)
				}

				const nextInlinePolyfillStyleRuleSelectorText = getSelectorText(inlineSelectorList)
				if (cssInlinePolyfillStyleRule.selectorText !== nextInlinePolyfillStyleRuleSelectorText) {
					cssInlinePolyfillStyleRule.selectorText = nextInlinePolyfillStyleRuleSelectorText
				}

				const nextBlockPolyfillStyleRuleSelectorText = getSelectorText(blockSelectorList)
				if (cssBlockPolyfillStyleRule.selectorText !== nextBlockPolyfillStyleRuleSelectorText) {
					cssBlockPolyfillStyleRule.selectorText = nextBlockPolyfillStyleRuleSelectorText
				}

				lastElements = elements
			}
		}

		onMutation()

		onMutationList.push(onMutation)

		mo.observe(root, { attributes: true, childList: true, subtree: true })
	},

	/** @type {(root: DocumentOrShadowRoot, styleSheet: CSSStyleSheet) => void} */
	polyfillLayoutContainment = (root, styleSheet) => {
		/** @type {(cssRule: CSSStyleRule) => string} */
		const getCssStyleRuleContainValue = (cssRule) => cssRule.style ? cssRule.style.getPropertyValue('--css-contain').trim() : ''

		/** @type {(cssGroup: CSSGroupingRule | CSSStyleSheet) => void} */
		const walkCssRules = (cssGroup) => {
			// For each `CSSRule` in a `CSSGroupingRule` or `CSSStyleSheet`;
			for (const cssRule of getCSSRules(cssGroup)) {
				walkCssRules(cssRule)

				const containValue = getCssStyleRuleContainValue(cssRule)

				const hasInlineSizeContainment = containValue === 'layout inline-size'
				const hasBlockSizeContainment = containValue === 'layout block-size'

				// If the target rule represents a style rule, and;
				// If the target rule style contains a fallback contain property, and;
				// If the fallback contain property represents a layout container, then;
				if (hasInlineSizeContainment || hasBlockSizeContainment) {
					// Add the element to the list of layout containers, and;
					// Add a fallback layout containment rule for that specific element.
					addLayoutContainerByCssRule(root, cssRule, cssGroup, hasInlineSizeContainment)
				}
			}
		}

		walkCssRules(styleSheet)
	},

	/** @type {(root: DocumentOrShadowRoot, styleSheet: CSSStyleSheet) => void} */
	polyfillContainerQueries = (root, styleSheet) => {
		/** @type {(cssGroup: CSSParentRule) => void} */
		const walkCssRules = (cssGroup) => {
			// For each `CSSRule` in a `CSSGroupingRule` or `CSSStyleSheet`;
			for (const cssRule of getCSSRules(cssGroup)) {
				/** @type {string} */
				const mediaText = cssRule.media ? cssRule.media.mediaText : ''

				const hasContainerQueryPolyfill = mediaText.indexOf('--css-container') === 0

				if (hasContainerQueryPolyfill) {
					/** @type {null | [string, 'max' | 'min', 'height' | 'width', `${number}${string}`]} */
					const containerQueryMatches = cssRule.media[0].match(containerQueryMatcher)

					// If the target rule represents a fallback container query;
					// Parse the container query from the target rule, and;
					if (containerQueryMatches) {
						const [, minMax, axis, size] = containerQueryMatches

						const [, sizeValue, sizeUnit] = size.match(numberMatcher)

						/** @type {(rect: Element) => boolean} */
						const doesFulfillQuery = (element) => {
							const value = element.getBoundingClientRect()[axis]
							const sized = Number(sizeValue) * (
								sizeUnit === 'em'
									? parseInt(window.getComputedStyle(element).fontSize)
								: sizeUnit === 'rem'
									? parseInt(window.getComputedStyle(root.documentElement).fontSize)
								: sizeUnit === 'vh'
									? window.innerHeight / 100
								: sizeUnit === 'vw'
									? window.innerWidth / 100
								: 1
							)

							return (
								minMax === 'min'
									? value >= sized
								: value <= sized
							)
						}

						const cssRuleIndex = getCSSRuleIndexOf(cssGroup, cssRule)
						const cssPolyfillGroup = insertCssRule(cssGroup, '@media all{}', cssRuleIndex)

						let index = 0

						for (const cssInnerRule of getCSSRules(cssRule)) {
							/** @type {undefined | string} */
							const cssInnerRuleSelectorText = cssInnerRule.selectorText

							if (cssInnerRuleSelectorText) {
								const cssInnerRuleBlock = cssInnerRule.cssText.slice(cssInnerRuleSelectorText.length)
								const cssPolyfillInnerRuleCssText = `${unmatchableSelector}${cssInnerRuleBlock}`

								/** @type {CSSStyleRule} */
								const cssPolyfillInnerRule = insertCssRule(cssPolyfillGroup, cssPolyfillInnerRuleCssText, index++)

								containerQueries.push([
									cssInnerRuleSelectorText,
									cssPolyfillInnerRule,
									doesFulfillQuery
								])
							}
						}
					}
				}

				walkCssRules(cssRule)
			}
		}

		walkCssRules(styleSheet)

		onResize()
	},

	/** @type {ResizeObserver} */
	ro,

	/** @type {MutationObserver} */
	mo,
) => (
	/** @type {DocumentOrShadowRoot | void} */
	root = defaultRoot
) => {
		if (defaultRoot && !supportsLayoutContainment) listen(0)

		function listen(
			/** @type {number} */
			lastNumberOfStyleSheets
		) {
			ro = new ResizeObserver(onResize)
			mo = new MutationObserver(() => {
				for (const onMutation of onMutationList) onMutation()
			})

			/** @type {{ styleSheets: StyleSheetList }} */
			const { styleSheets } = root
			function onframe() {
				const numberOfStyleSheets = styleSheets.length

				if (numberOfStyleSheets !== lastNumberOfStyleSheets) {
					while (lastNumberOfStyleSheets < numberOfStyleSheets) {
						const styleSheet = styleSheets[lastNumberOfStyleSheets++]

						if (
							styleSheet
							&& (
								!styleSheet.href
								|| styleSheet.href.startsWith(location.origin)
							)
						) {
							polyfillContainerQueries(root, styleSheet)
							polyfillLayoutContainment(root, styleSheet)
						}
					}

					lastNumberOfStyleSheets = numberOfStyleSheets
				}

				requestAnimationFrame(onframe)
			}

			onframe()
		}
	}
)()

/** @typedef {CSSStyleRule | CSSImportRule | CSSMediaRule | CSSFontFaceRule | CSSPageRule | CSSNamespaceRule | CSSKeyframesRule | CSSKeyframeRule | CSSSupportsRule} CSSAnyRule */
/** @typedef {CSSStyleSheet | CSSMediaRule | CSSKeyframesRule | CSSSupportsRule} CSSParentRule */
