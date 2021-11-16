export const cqfill = ((
	{ every, indexOf, slice } = Array.prototype,

	defaultRoot = globalThis.document,

	supportsLayoutContainment = defaultRoot && CSS.supports('contain: layout inline-size'),

	unmatchableSelector = ':not(*)',

	containerQueryMatcher = /\(\s*(min|max)-(height|width):\s*([^\s]+)\s*\)/,

	numberMatcher = /^([+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[Ee][+-]?\d+)?)(.*)$/,

	/** @type {Set<Element>} */
	layoutContainerSet = new Set(),

	/** @type {Map<Element, string>} */
	layoutContainerMap = new WeakMap(),

	/** @type {[string, CSSStyleRule, (rect: Element, matchableAxis: 'width' | 'height') => boolean, matchableAxis: 'width' | 'height'][]} */
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

	/** @type {(cssParentRule: CSSParentRule, cssRule: CSSAnyRule) => number} */
	getCSSRuleIndexOf = (cssParentRule, cssRule) => indexOf.call(cssParentRule.cssRules || [], cssRule),

	/** @type {(cssParentRule: CSSParentRule) => CSSAnyRule[]} */
	getCSSRules = (cssParentRule) => slice.call(cssParentRule.cssRules || []),

	/** @type {(cssParentRule: CSSParentRule, cssText: string, index: number) => CSSAnyRule} */
	insertCssRule = (cssParentRule, cssText, index) => cssParentRule.cssRules[cssParentRule.insertRule(cssText, index)],

	onResize = () => {
		for (const [containedSelectorText, innerRule, doesFulfillQuery, ] of containerQueries) {
			/** @type {Set<Element>} */
			const fulfilledElements = new Set()

			for (const layoutContainer of layoutContainerSet) {
				if (doesFulfillQuery(layoutContainer, layoutContainerMap.get(layoutContainer))) {
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

	/** @type {(root: DocumentOrShadowRoot, cssRule: CSSAnyRule, cssParentRule: CSSParentRule, hasInlineSizeContainment: boolean, hasBlockSizeContainment: boolean) => string} */
	addLayoutContainerByCssRule = (root, cssRule, cssParentRule, hasInlineSizeContainment, hasBlockSizeContainment) => {
		const cssRuleIndex = getCSSRuleIndexOf(cssParentRule, cssRule)
		const getFallbackCssText = (
			/** @type {boolean} */
			hasInlineDisplay
		) => (
			`${
				unmatchableSelector
			}{transform:scale3d(1,1,1);${
				hasInlineSizeContainment ? (
					`inline-size:${
						hasInlineDisplay ? 0 : 100
					}%;`
				 ) : ''
			}${
				hasBlockSizeContainment ? (
					`block-size:${
						hasInlineDisplay ? 0 : 100
					};`
				) : ''
			}}`
		)
		const fallbackCssText = `@media all{${getFallbackCssText(true)}${getFallbackCssText(false)}}`
		const cssPolyfillGroup = insertCssRule(cssParentRule, fallbackCssText, cssRuleIndex)
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
				// layoutContainerSet.clear()

				ro.disconnect()

				for (const element of elements) {
					layoutContainerSet.add(element)
					layoutContainerMap.set(element, [hasInlineSizeContainment, hasBlockSizeContainment])

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
		/** @type {(cssRule: CSSStyleRule) => string[]} */
		const getCssStyleRuleContainValues = (cssRule) => cssRule.style ? cssRule.style.getPropertyValue('--css-contain').trim().toLowerCase().split(/\s+/) : []

		/** @type {(cssParentRule: CSSParentRule) => void} */
		const walkCssParent = (cssParentRule) => {
			// For each `CSSRule` in a `CSSGroupingRule` or `CSSStyleSheet`;
			for (const cssRule of getCSSRules(cssParentRule)) {
				walkCssParent(cssRule)

				const containValues = getCssStyleRuleContainValues(cssRule)

				const hasLayoutContainment = containValues.includes('layout')
				const hasSizeContainment = containValues.includes('size')
				const hasInlineSizeContainment = hasLayoutContainment && (hasSizeContainment || containValues.includes('inline-size'))
				const hasBlockSizeContainment = hasLayoutContainment && (hasSizeContainment || containValues.includes('block-size'))

				// If the target rule represents a style rule, and;
				// If the target rule style contains a fallback contain property, and;
				// If the fallback contain property represents a layout container, then;
				if (hasInlineSizeContainment || hasBlockSizeContainment) {
					// Add the element to the list of layout containers, and;
					// Add a fallback layout containment rule for that specific element.
					addLayoutContainerByCssRule(root, cssRule, cssParentRule, hasInlineSizeContainment, hasBlockSizeContainment)
				}
			}
		}

		walkCssParent(styleSheet)
	},

	/** @type {(root: DocumentOrShadowRoot, styleSheet: CSSStyleSheet) => void} */
	polyfillContainerQueries = (root, styleSheet) => {
		/** @type {(cssParentRule: CSSParentRule) => void} */
		const walkCssParent = (cssParentRule) => {
			// For each `CSSRule` in a `CSSGroupingRule` or `CSSStyleSheet`;
			for (const cssRule of getCSSRules(cssParentRule)) {
				/** @type {string} */
				const mediaText = cssRule.media ? cssRule.media.mediaText : ''

				const hasContainerQueryPolyfill = mediaText.indexOf('@container') === 0 || mediaText.indexOf('--css-container') === 0

				if (hasContainerQueryPolyfill) {
					/** @type {null | [string, 'max' | 'min', 'height' | 'width', `${number}${string}`]} */
					const containerQueryMatches = cssRule.media[0].match(containerQueryMatcher)

					// If the target rule represents a fallback container query;
					// Parse the container query from the target rule, and;
					if (containerQueryMatches) {
						const [, minMax, axis, size] = containerQueryMatches

						const [, sizeValue, sizeUnit] = size.match(numberMatcher)

						/** @type {(rect: Element, hasInlineSizeContainment: boolean, hasBlockSizeContainment: boolean) => boolean} */
						const doesFulfillQuery = (element, hasInlineSizeContainment, hasBlockSizeContainment) => {
							const fulfillsBlockSizeContainment = (hasBlockSizeContainment !== (axis === 'block-size' || axis === 'height'))
							const fulfillsInlineSizeContainment = (hasInlineSizeContainment !== (axis === 'inline-size' || axis === 'width'))
							if (!fulfillsBlockSizeContainment && !fulfillsInlineSizeContainment) return false
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

						const cssRuleIndex = getCSSRuleIndexOf(cssParentRule, cssRule)
						const cssPolyfillGroup = insertCssRule(cssParentRule, '@media all{}', cssRuleIndex)

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

				walkCssParent(cssRule)
			}
		}

		walkCssParent(styleSheet)

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
		if (defaultRoot && !supportsLayoutContainment) {
			let lastNumberOfStyleSheets = 0

			/** @type {{ styleSheets: StyleSheetList }} */
			const { styleSheets } = root

			const onMutation = () => {
				for (const onMutation of onMutationList) {
					onMutation()
				}
			}

			const onFrame = () => {
				const numberOfStyleSheets = styleSheets.length
				if (numberOfStyleSheets !== lastNumberOfStyleSheets) {
					while (lastNumberOfStyleSheets < numberOfStyleSheets) {
						const styleSheet = styleSheets[lastNumberOfStyleSheets++]

						if (
							styleSheet
							&& (
								!styleSheet.href
								|| styleSheet.href.startsWith(location.origin)
								|| styleSheet.href.startsWith(`blob:${location.origin}`)
							)
						) {
							polyfillContainerQueries(root, styleSheet)
							polyfillLayoutContainment(root, styleSheet)
						}
					}

					lastNumberOfStyleSheets = numberOfStyleSheets
				}

				requestAnimationFrame(onFrame)
			}

			ro = new ResizeObserver(onResize)
			mo = new MutationObserver(onMutation)

			onFrame()
		}
	}
)()

/** @typedef {CSSStyleRule | CSSImportRule | CSSMediaRule | CSSFontFaceRule | CSSPageRule | CSSNamespaceRule | CSSKeyframesRule | CSSKeyframeRule | CSSSupportsRule} CSSAnyRule */
/** @typedef {CSSStyleSheet | CSSMediaRule | CSSKeyframesRule | CSSSupportsRule} CSSParentRule */
