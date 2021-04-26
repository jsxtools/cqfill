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

```html
<script src="https://unpkg.com/cqfill"></script>

<!-- After the stylesheets have been declared... -->
<script>cqfill()</script>
```

Add a fallback property to support the CSS `contain` property.

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
  .whatever-selectors {
  }
}

/* after */
@media --css-container and (min-width: 700px) {
  .whatever-selectors {
  }
}

@container (min-width: 700px) {
  .whatever-selectors {
  }
}
```

This project will soon include a PostCSS plugin to do this for you.
