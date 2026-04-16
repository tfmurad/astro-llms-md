# astro-llms-md

[![npm version](https://badge.fury.io/js/astro-llms-md.svg)](https://www.npmjs.com/package/astro-llms-md)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

An **Astro integration** to generate `llms.txt`, `llms-full.txt`, and markdown files from your Astro site.

## What is llms.txt?

The `llms.txt` standard helps language models discover and understand your website's content. It provides:

- **llms.txt** - A lightweight index of your site's pages
- **llms-full.txt** - Complete content from all pages in one file
- **Individual .md files** - Separate markdown files for each page

## Features

- ✅ **Astro Integration** - Seamless integration with Astro build process
- ✅ **Zero-config** - Works out of the box with sensible defaults
- ✅ **Auto-setup** - Automatically creates `llms.json` config on install
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

### 3. Create Config File (Optional)

Create `llms.json` in your project root for customization:

```json
{
  "site_url": "https://your-site.com",
  "name": "Your Site Name",
  "description": "Your site description",
  "generate_individual_md": true,
  "generate_llms_txt": true,
  "generate_llms_full_txt": true
}
```

### 4. Build

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
      // Override llms.json settings
      siteUrl: "https://your-site.com",
      name: "My Site",
      description: "A great website",
      generateIndividualMd: true,
      generateLlmsTxt: true,
      generateLlmsFullTxt: true,
      titleSelector: "h1",
      contentSelector: "main",
      exclude: ["404", "404.html", "_astro"],
      verbose: false,
      autoCreateConfig: true,
    }),
  ],
});
```

## Configuration File (llms.json)

Place `llms.json` in your project root:

```json
{
  "site_url": "https://your-site.com",
  "name": "Your Site Name",
  "description": "Your site description",
  "generate_individual_md": true,
  "generate_llms_txt": true,
  "generate_llms_full_txt": true,
  "title_selector": "h1",
  "content_selector": "main",
  "exclude": ["404", "404.html", "_astro", "**.xml", "**.txt"],
  "verbose": false
}
```

### Configuration Options

| Option                   | Type    | Default   | Description                    |
| ------------------------ | ------- | --------- | ------------------------------ |
| `site_url`               | string  | required  | Your site's base URL           |
| `name`                   | string  | auto      | Site name for llms.txt heading |
| `description`            | string  | auto      | Site description               |
| `generate_individual_md` | boolean | `true`    | Generate individual .md files  |
| `generate_llms_txt`      | boolean | `true`    | Generate llms.txt index        |
| `generate_llms_full_txt` | boolean | `true`    | Generate llms-full.txt         |
| `title_selector`         | string  | `"h1"`    | CSS selector for page title    |
| `content_selector`       | string  | `"main"`  | CSS selector for main content  |
| `exclude`                | array   | see below | Patterns to exclude            |
| `verbose`                | boolean | `false`   | Detailed output                |

### Default Excludes

```json
["404", "404.html", "_astro", "**.xml", "**.txt", "node_modules"]
```

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

### "No site_url specified"

Make sure to either:

- Set `site` in `astro.config.mjs`
- Add `site_url` to `llms.json`
- Pass `siteUrl` to the integration options

### Pages not showing up

Check that your pages have:

1. An `<h1>` tag (or configure `title_selector`)
2. A `<main>` element (or configure `content_selector`)
3. Valid HTML structure

## License

MIT © [Al Murad Uzzaman](https://github.com/tfmurad)
