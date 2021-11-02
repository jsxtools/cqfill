# Changes to CQFill

### 0.6.0 (May 3, 2021)

-   Adds support for automatic polyfilling.
-   Fixes an issue where container values were case-sensitive.
-   Fixes an issue where container queries worked on axes not allowed by `contain`.
-   Reduces how often the CSSOM is updated.

### 0.5.0 (April 28, 2021)

-   Adds support for non-px query values — `(width >= 25em)`.
-   Adds support for external stylesheets from the same origin.

### 0.4.0 (April 26, 2021)

-   Adds PostCSS support for the range syntax — `(width >= 700px)`.

### 0.3.1 (April 26, 2021)

-   Adds an `"export"` in `package.json` for `"./postcss-7"`.

### 0.3.0 (April 26, 2021)

-   Changes the PostCSS plugin to be the default export.
-   Adds a PostCSS 7 version of the plugin for increased tooling compatibility.

### 0.2.1 (April 26, 2021)

-   Fixes PostCSS usage instructions.

### 0.2.0 (April 26, 2021)

-   Adds a PostCSS plugin.
-   Prevent script from throwing in non-DOM environments.

### 0.1.1 (April 25, 2021)

-   Fixes the IIFE export.

### 0.1.0 (April 25, 2021)

Initial beta.
