# astro-llms-md

[![npm version](https://img.shields.io/npm/v/astro-llms-md.svg)](https://www.npmjs.com/package/astro-llms-md)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

Listed on Astro Integrations: [astro-llms-md on astro.build](https://astro.build/integrations/?search=astro-llms-md)

An **Astro integration** to generate `llms.txt`, `llms-full.txt`, and markdown files from your Astro site.

## What is llms.txt?

The `llms.txt` standard helps language models discover and understand your website's content. It provides:

- **llms.txt** - A lightweight index of your site's pages
- **llms-full.txt** - Complete content from all pages in one file
- **Individual .md files** - Separate markdown files for each page

## Features

- ✅ **Astro Integration** - Seamless integration with Astro build process
- ✅ **Zero-config** - Works out of the box with sensible defaults
- ✅ **Smart detection** - Auto-detects Astro site URL from config
- ✅ **TypeScript support** - Full TypeScript type definitions
- ✅ **Smart cleanup** - Removes disabled file types automatically

## Quick Start

### 1. Install

```bash
npm install -D astro-llms-md
```

### 2. Add to Astro Config

```javascript
// astro.config.mjs
import { defineConfig } from "astro/config";
import llms from "astro-llms-md";

export default defineConfig({
  site: "https://your-site.com", // Required: your site URL
  integrations: [
    llms(), // That's it!
  ],
});
```

### 3. Build

```bash
npm run build
```

The integration automatically runs after the build and generates all files in your `dist/` folder.

## Integration Options

Configure the integration in `astro.config.mjs`:

```javascript
import llms from "astro-llms-md";

export default defineConfig({
  site: "https://your-site.com",
  integrations: [
    llms({
      siteUrl: "https://your-site.com",
      name: "My Site",
      description: "A great website",
      generateIndividualMd: true,
      generateLlmsTxt: true,
      generateLlmsFullTxt: true,
      titleSelector: "h1",
      contentSelector: "main",
      exclude: ["404", "404.html", "_astro"],
      excludeSelectors: ["aside", "form", "[data-llms-ignore]"],
      trailingSlash: "always",
      verbose: false,
    }),
  ],
});
```

## Configuration Options

All configuration is defined in `astro.config.mjs` via `llms({...})`. The integration also uses Astro's top-level `site` value when `siteUrl` is not provided.

| Option                 | Type    | Default       | Description                    |
| ---------------------- | ------- | ------------- | ------------------------------ |
| `siteUrl`              | string  | `config.site` | Your site's base URL           |
| `name`                 | string  | auto          | Site name for llms.txt heading |
| `description`          | string  | auto          | Site description               |
| `generateIndividualMd` | boolean | `true`        | Generate individual .md files  |
| `generateLlmsTxt`      | boolean | `true`        | Generate llms.txt index        |
| `generateLlmsFullTxt`  | boolean | `true`        | Generate llms-full.txt         |
| `titleSelector`        | string  | `"h1"`        | CSS selector for page title    |
| `contentSelector`      | string  | `"main"`      | CSS selector for main content  |
| `exclude`              | array   | see below     | File path patterns to exclude  |
| `excludeSelectors`     | array   | `[]`          | CSS selectors to strip from content before HTML → MD conversion (see below) |
| `trailingSlash`        | string  | inherits from Astro | `"always"`, `"never"`, or `"ignore"` — controls trailing slash on emitted page URLs (see below) |
| `verbose`              | boolean | `false`       | Detailed output                |

### Default Excludes

```json
["404", "404.html", "_astro", "**.xml", "**.txt", "node_modules"]
```

### Excluding noise from generated markdown

By default, the integration converts everything inside your
`contentSelector` (e.g. `<main>`) into markdown. On real sites that
often includes sidebars, sign-up forms, navigation rails — all noise
when the audience is an LLM.

`excludeSelectors` is a list of CSS selectors that get **removed from
the parsed content before** the HTML → Markdown conversion runs:

```js
import llms from "astro-llms-md";

llms({
  excludeSelectors: ["aside", "form", "[data-llms-ignore]"],
});
```

#### Always stripped (non-overridable)

Three selectors are always applied regardless of config:

| Selector              | Why                                              |
| --------------------- | ------------------------------------------------ |
| `script`              | JS — never useful in markdown                    |
| `style`               | CSS — same                                       |
| `[data-llms-ignore]`  | Opt-in attribute for ad-hoc markup-side exclusion |

The `[data-llms-ignore]` attribute is the lightweight escape hatch
when you don't want to touch your integration config:

```astro
<aside data-llms-ignore>
  <!-- form, ads, sign-up box, whatever — won't appear in the .md output -->
</aside>
```

#### Opt-in default noise list

If you want the common "strip the obvious noise" preset, spread the
exported `DEFAULT_NOISE_SELECTORS` constant:

```js
import llms, { DEFAULT_NOISE_SELECTORS } from "astro-llms-md";

llms({
  excludeSelectors: [
    ...DEFAULT_NOISE_SELECTORS,
    ".my-custom-noise-class",
  ],
});
```

`DEFAULT_NOISE_SELECTORS` resolves to:

```js
["nav", "aside", "footer", "form", "[aria-hidden='true']", "[hidden]"]
```

It is **not** applied by default — opt-in only, so upgrading to this
release won't change existing markdown output unless you ask for it.

### Trailing slash on emitted URLs

`trailingSlash` controls whether canonical page URLs end with `/`. Accepts
the same three values as Astro's [top-level `trailingSlash`](https://docs.astro.build/en/reference/configuration-reference/#trailingslash):

| Value      | Behavior                                                            |
| ---------- | ------------------------------------------------------------------- |
| `"always"` | Append `/` to every emitted page URL                                |
| `"never"`  | Strip trailing `/` from every emitted page URL                      |
| `"ignore"` | Derive from `build.format` — `directory` → `"always"`, `file` → `"never"` |

`"ignore"` follows Astro's [recommended pairings](https://docs.astro.build/en/reference/configuration-reference/#buildformat)
(`directory + always`, `file + never`) so the emitted canonical lines up with
the actual URL Astro serves for that build format.

When not set, the integration inherits the value from your `astro.config`,
including `build.format`. So a project on Astro defaults (`trailingSlash: "ignore"`
+ `build.format: "directory"`) gets canonicals ending in `/` automatically —
matching what Astro serves on disk:

```js
// astro.config.mjs — Astro defaults
export default defineConfig({
  integrations: [llms()],  // emits https://site.com/about/
});
```

To override explicitly, pass `trailingSlash` to `llms()`:

```js
llms({ trailingSlash: "never" });
```

This only affects page URLs (the `url:` field in individual `.md` files
and the `URL:` line in `llms-full.txt`). The `.md` file links inside
`llms.txt` are file URLs and never carry a trailing slash regardless.

## Output Files

After building, you'll have:

### llms.txt

A lightweight index file:

```markdown
# Your Site Name

> Your site description

This file helps language models discover the most useful content on this site.

## Home

- [Welcome](https://your-site.com/index.md)

## Company

- [About Us](https://your-site.com/about.md): Learn about our company
- [Contact](https://your-site.com/contact.md): Get in touch
```

### llms-full.txt

Complete content from all pages:

```markdown
# Your Site Name

## Welcome

Full content from your homepage...

---

## About Us

Full content from your about page...
```

### Individual .md Files

Each page gets its own markdown file with YAML frontmatter:

```markdown
---
title: "About Us"
url: "https://your-site.com/about"
description: "Learn about our company"
---

Content converted from HTML to Markdown...
```

## Troubleshooting

### "No site URL specified"

Make sure to either:

- Set `site` in `astro.config.mjs`
- Pass `siteUrl` to the integration options

### Pages not showing up

Check that your pages have:

1. An `<h1>` tag (or configure `titleSelector`)
2. A `<main>` element (or configure `contentSelector`)
3. Valid HTML structure

## License

MIT © [Al Murad Uzzaman](https://github.com/tfmurad)
