# CQFill

**CQFill** is a polyfill for [CSS Container Queries].

```sh
npm install cqfill
```

## Demos

<table><tr><td><a href="https://codepen.io/jonneal/full/rNjRBOX"><img src="https://user-images.githubusercontent.com/188426/116027454-ed950f80-a622-11eb-94f5-be5b9307705b.png" alt="Component Query Card Demo" width="340" /></a></td></tr></table>

<table><tr><td><a href="https://codepen.io/jonneal/full/WNRPBQg"><img src="https://user-images.githubusercontent.com/188426/116027093-f76a4300-a621-11eb-9530-e67727e7fd71.png" alt="Article - QC" width="340" /></a></td></tr></table>

<table><tr><td><a href="https://codepen.io/jonneal/full/YzNBber"><img src="https://user-images.githubusercontent.com/188426/116027091-f6d1ac80-a621-11eb-9c20-2322c1b2a2c8.png" alt="Balloon G-OPAW" width="340" /></a></td></tr></table>

## Usage

Add the CQFill script to your page:

```html
<script src="https://unpkg.com/cqfill"></script>

<!-- After the stylesheets have been declared... -->
<script>cqfill()</script>
```

Or, add the CQFill script to your NodeJS project:

```js
import { cqfill } from 'cqfill'

// after the stylesheets have been declared
cqfill()
```

Now, use some CSS container queries:

```css
.container {
  contain: layout inline-size;
}

@container (min-width: 700px) {
  .contained {
    /* styles applied when a container is at least 700px */
  }
}
```

## Creating Polyfillable CSS with PostCSS

Use the included PostCSS plugin to process your CSS:

```js
const { postcssCQFill } = require('cqfill')
const postcss = require('postcss')

postcss([ postcssCQFill ])
```

To transform CSS with PostCSS and without any other tooling:

```js
import fs from 'fs'
import postcss from 'postcss'
import { postcssCQFill } from 'cqfill/postcss'

const from = './test/readme.css'
const fromCss = fs.readFileSync(from, 'utf8')

const to = './test/readme.polyfilled.css'

postcss([ postcssCQFill ]).process(fromCss, { from, to }).then(
  ({ css }) => fs.writeFileSync(to, css)
)
```

## Creating Polyfillable CSS with Yourself

Add a fallback property to support the CSS [`contain`] property.

```css
/* before */
.container {
  contain: layout inline-size;
}

/* after */
.container {
  --css-contain: layout inline-size;
  contain: layout inline-size;
}
```

Duplicate container queries using a fallback rule.

```css
/* before */
@container (min-width: 700px) {
  .contained {
    /* styles applied when a container is at least 700px */
  }
}

/* after */
@media --css-container and (min-width: 700px) {
  .contained {
    /* styles applied when a container is at least 700px */
  }
}

@container (min-width: 700px) {
  .contained {
    /* styles applied when a container is at least 700px */
  }
}
```

[`contain`]: https://developer.mozilla.org/en-US/docs/Web/CSS/contain
[CSS Container Queries]: https://css.oddbird.net/rwd/query/explainer/
