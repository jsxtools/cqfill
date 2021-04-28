export const cqfill = (() => {

if (typeof document === 'undefined') return () => {}

const unmatchableSelector = ':not(*)'

const { every, indexOf, slice } = Array.prototype

/** @type {Set<Element>} */
const layoutContainerSet = new Set()

/** @type {[string, CSSStyleRule, (rect: DOMRect) => boolean][]} */
const containerQueries = []

/** @type {(() => void)[]} */
const onMutationList = []

const onResize = () => {
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

		const lastSelectorText = innerRule.selectorText
		innerRule.selectorText = fulfilledSelectorList.length ? `:is(${containedSelectorText}):where(${fulfilledSelectorList.join(',')})` : unmatchableSelector
	}
}

/** @type {(selectorList: string[]) => string} */
const getSelectorText = (selectorList) => selectorList.length ? `:where(${selectorList.join(',')})` : unmatchableSelector

/** @type {(element: Element) => boolean} */
const hasInlineOuterDisplay = (element) => /inline/i.test(getComputedStyle(element).display)

/** @type {(cssGroup: CSSGroupingRule, cssRule: CSSRule) => number} */
const getCSSRuleIndexOf = (cssGroup, cssRule) => indexOf.call(cssGroup.cssRules || [], cssRule)

/** @type {(cssGroup: CSSGroupingRule | CSSStyleSheet) => CSSRule[]} */
const getCSSRules = (/** @type {CSSGroupingRule} */ cssGroup) => slice.call(cssGroup.cssRules || [])

/** @type {(cssGroup: CSSGroupingRule | CSSStyleSheet, cssText: string, index: number) => CSSRule[]} */
const insertCssRule = (cssGroup, cssText, index) => cssGroup.cssRules[cssGroup.insertRule(cssText, index)]

/** @type {(element: Element) => string} */
const getElementSelectorText = (element) => {
	/** @type {Element} */
	let parent
	let selector = ''
	while (parent = element.parentElement) {
		/** @type {number} */
		const nthChild = indexOf.call(parent.children, element) + 1
		selector = `>:nth-child(${nthChild})${selector}`
		element = parent
	}
	return ':root' + selector
}

/** @type {(cssRule: CSSStyleRule, cssGroup: CSSGroupingRule) => string} */
const addLayoutContainerByCssRule = (cssRule, cssGroup, hasInlineSizeContainment) => {
	const cssRuleIndex = getCSSRuleIndexOf(cssGroup, cssRule)
	const getFallbackCssText = (hasInlineDisplay) => `${unmatchableSelector}{transform:scale3d(1,1,1);${hasInlineSizeContainment ? 'inline-size' : 'block-size'}:${hasInlineDisplay ? 0 : 100}%}`
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

		const elements = document.querySelectorAll(cssRule.selectorText)

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

			cssInlinePolyfillStyleRule.selectorText = getSelectorText(inlineSelectorList)
			cssBlockPolyfillStyleRule.selectorText = getSelectorText(blockSelectorList)

			lastElements = elements
		}
	}

	onMutation()

	onMutationList.push(onMutation)

	mo.observe(document, { attributes: true, childList: true, subtree: true })
}

/** @type {(styleSheet: CSSStyleSheet) => void} */
const polyfillLayoutContainment = (styleSheet) => {
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
				addLayoutContainerByCssRule(cssRule, cssGroup, hasInlineSizeContainment)
			}
		}
	}

	walkCssRules(styleSheet)
}

/** @type {(styleSheet: CSSStyleSheet) => void} */
const polyfillContainerQueries = (styleSheet) => {
	/** @type {(cssGroup: CSSGroupingRule | CSSStyleSheet) => void} */
	const walkCssRules = (cssGroup) => {
		// For each `CSSRule` in a `CSSGroupingRule` or `CSSStyleSheet`;
		for (const cssRule of getCSSRules(cssGroup)) {
			const mediaText = cssRule.media ? cssRule.media.mediaText : ''
			const hasContainerQueryPolyfill = mediaText.indexOf('--css-container') === 0

			if (hasContainerQueryPolyfill) {
				const containerQueryMatcher = /\(\s*(min|max)-(height|width):\s*([^\s]+)\s*\)/

				/** @type {null | [string, 'max' | 'min', 'height' | 'width', `${number}px`]} */
				const containerQueryMatches = cssRule.media[0].match(containerQueryMatcher)

				// If the target rule represents a fallback container query;
				// Parse the container query from the target rule, and;
				if (containerQueryMatches) {
					const [, minMax, axis, size] = containerQueryMatches
					const sizeInt = parseInt(size)

					/** @type {(rect: Element) => boolean} */
					const doesFulfillQuery = (element) => {
						const value = element.getBoundingClientRect()[axis]

						return (
							minMax === 'min'
								? value >= sizeInt
							: value <= sizeInt
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
}

const ro = new ResizeObserver(onResize)

const mo = new MutationObserver(() => {
	for (const onMutation of onMutationList) onMutation()
})

const supportsLayoutContainment = CSS.supports('contain: layout inline-size')

return () => {
	if (!supportsLayoutContainment) {
		for (const styleSheet of document.styleSheets) {
			if (
				!styleSheet.href
				|| styleSheet.href.startsWith(location.origin)
			) {
				polyfillContainerQueries(styleSheet)
				polyfillLayoutContainment(styleSheet)
			}
		}
	}
}

})()
