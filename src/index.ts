import { access, mkdir, readFile, writeFile } from "fs/promises";
import { glob } from "glob";
import { parse } from "node-html-parser";
import { dirname, join, resolve } from "path";
import TurndownService from "turndown";
import { fileURLToPath } from "url";

export interface LlmsIntegrationOptions {
  siteUrl?: string;
  name?: string;
  description?: string;
  generateIndividualMd?: boolean;
  generateLlmsTxt?: boolean;
  generateLlmsFullTxt?: boolean;
  titleSelector?: string;
  contentSelector?: string;
  exclude?: string[];
  excludeSelectors?: string[];
  verbose?: boolean;
}

export interface LlmsConfig {
  inputDir: string;
  outputDir: string;
  siteUrl: string;
  name?: string;
  description?: string;
  generateIndividualMd?: boolean;
  generateLlmsTxt?: boolean;
  generateLlmsFullTxt?: boolean;
  titleSelector?: string;
  contentSelector?: string;
  exclude?: string[];
  excludeSelectors?: string[];
  verbose?: boolean;
}

export interface PageData {
  urlPath: string;
  filePath: string;
  title: string;
  description?: string;
  content: string;
}

interface FormatterConfig {
  name: string;
  description: string;
  siteUrl: string;
}

interface ProcessOptions {
  titleSelector: string;
  contentSelector: string;
  excludeSelectors: string[];
}

interface ResolvedIntegrationConfig {
  siteUrl: string;
  name: string;
  description: string;
  generateIndividualMd: boolean;
  generateLlmsTxt: boolean;
  generateLlmsFullTxt: boolean;
  titleSelector: string;
  contentSelector: string;
  exclude: string[];
  excludeSelectors: string[];
  verbose: boolean;
}

export const BUILT_IN_EXCLUDE_SELECTORS: readonly string[] = [
  "script",
  "style",
  "[data-llms-ignore]",
];

export const DEFAULT_NOISE_SELECTORS: readonly string[] = [
  "nav",
  "aside",
  "footer",
  "form",
  "[aria-hidden='true']",
  "[hidden]",
];

/**
 * Default configuration
 */
const defaultConfig: ResolvedIntegrationConfig = {
  siteUrl: "",
  name: "",
  description: "",
  generateIndividualMd: true,
  generateLlmsTxt: true,
  generateLlmsFullTxt: true,
  titleSelector: "h1",
  contentSelector: "main",
  exclude: ["404", "404.html", "_astro", "**.xml", "**.txt", "node_modules"],
  excludeSelectors: [],
  verbose: false,
};

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

/**
 * Discover HTML files in a directory
 */
async function discoverHtmlFiles(
  inputDir: string,
  excludePatterns: string[],
): Promise<string[]> {
  const pattern = `${inputDir}/**/*.html`;
  const files = await glob(pattern, {
    ignore: excludePatterns.map((p) => `${inputDir}/${p}`),
    absolute: true,
  });
  return files.sort();
}

/**
 * Convert file path to URL path
 */
function fileToUrlPath(filePath: string, inputDir: string): string {
  const relativePath = filePath.replace(resolve(inputDir), "");
  let urlPath = relativePath.replace(/\\/g, "/").replace(/^\//, "");

  // Remove .html extension
  urlPath = urlPath.replace(/\.html$/, "");

  // Handle index files
  if (urlPath.endsWith("/index") || urlPath === "index") {
    urlPath = urlPath.replace(/\/index$/, "").replace(/^index$/, "");
  }

  return "/" + urlPath;
}

/**
 * Process a single HTML file
 */
async function processHtmlFile(
  filePath: string,
  options: ProcessOptions,
): Promise<Omit<PageData, "urlPath" | "filePath">> {
  const { titleSelector, contentSelector, excludeSelectors } = options;

  const html = await readFile(filePath, "utf8");
  const root = parse(html);

  // Extract title
  const titleElement = root.querySelector(titleSelector);
  const title = titleElement?.text?.trim() || "";

  // Extract description from meta tag
  const metaDescription = root.querySelector('meta[name="description"]');
  const description = metaDescription?.getAttribute("content") || "";

  // Extract content
  const contentElement = root.querySelector(contentSelector);
  let content = "";

  if (contentElement) {
    // Strip noise elements before conversion. BUILT_IN_EXCLUDE_SELECTORS
    // is always applied (script/style/[data-llms-ignore]); user-supplied
    // selectors extend it. De-duped so explicit overlaps don't cost a
    // second pass.
    const selectors = Array.from(
      new Set([...BUILT_IN_EXCLUDE_SELECTORS, ...excludeSelectors]),
    ).join(", ");
    if (selectors) {
      contentElement.querySelectorAll(selectors).forEach((el) => el.remove());
    }

    // Convert HTML to markdown
    const turndownService = new TurndownService({
      headingStyle: "atx",
      codeBlockStyle: "fenced",
    });

    content = turndownService.turndown(contentElement.innerHTML);
  }

  return {
    title,
    description,
    content,
  };
}

/**
 * Generate markdown file content for a page
 */
function generateMarkdownFile(page: PageData, config: FormatterConfig): string {
  const { siteUrl } = config;
  const url = `${siteUrl}${page.urlPath}`.replace(/\/$/, "");

  let md = "---\n";
  md += `title: "${page.title}"\n`;
  md += `url: "${url}"\n`;
  if (page.description) {
    md += `description: "${page.description}"\n`;
  }
  md += "---\n\n";
  md += page.content;

  return md;
}

/**
 * Generate llms.txt content
 */
function generateLlmsTxtContent(
  pages: PageData[],
  config: FormatterConfig,
): string {
  const { name, description, siteUrl } = config;

  let content = `# ${name}\n\n`;

  if (description) {
    content += `> ${description}\n\n`;
  }

  content +=
    "This file helps language models discover the most useful content on this site.\n\n";

  // Group pages by directory
  const grouped: Record<string, PageData[]> = {};
  pages.forEach((page) => {
    const parts = page.urlPath.split("/").filter(Boolean);
    const group = parts.length > 1 ? parts[0] : "Home";

    if (!grouped[group]) {
      grouped[group] = [];
    }
    grouped[group].push(page);
  });

  // Generate sections
  Object.keys(grouped)
    .sort()
    .forEach((group) => {
      const groupName = group.charAt(0).toUpperCase() + group.slice(1);
      content += `## ${groupName}\n\n`;

      grouped[group].forEach((page) => {
        const mdUrl = `${siteUrl}${page.urlPath}.md`
          .replace(/\/\//g, "/")
          .replace(":/", "://");
        const linkText = page.title || page.urlPath;

        if (page.description) {
          content += `- [${linkText}](${mdUrl}): ${page.description}\n`;
        } else {
          content += `- [${linkText}](${mdUrl})\n`;
        }
      });

      content += "\n";
    });

  return content;
}

/**
 * Generate llms-full.txt content
 */
function generateLlmsFullTxtContent(
  pages: PageData[],
  config: FormatterConfig,
): string {
  const { name, siteUrl } = config;

  let content = `# ${name}\n\n`;
  content += `URL: ${siteUrl}\n\n`;

  pages.forEach((page, index) => {
    const url = `${siteUrl}${page.urlPath}`.replace(/\/$/, "");
    content += `## ${page.title}\n\n`;
    content += `URL: ${url}\n\n`;

    if (page.description) {
      content += `${page.description}\n\n`;
    }

    content += page.content;

    if (index < pages.length - 1) {
      content += "\n\n---\n\n";
    }
  });

  return content;
}

/**
 * Main function to generate all LLMS files
 */
export async function generateLlmsFiles(config: LlmsConfig): Promise<void> {
  const {
    inputDir,
    outputDir,
    siteUrl,
    name,
    description,
    generateIndividualMd = true,
    generateLlmsTxt = true,
    generateLlmsFullTxt = true,
    titleSelector = "h1",
    contentSelector = "main",
    exclude = defaultConfig.exclude,
    excludeSelectors = defaultConfig.excludeSelectors,
    verbose = false,
  } = config;

  const resolvedInputDir = resolve(inputDir);
  const resolvedOutputDir = resolve(outputDir);

  // Ensure output directory exists
  try {
    await access(resolvedOutputDir);
  } catch {
    throw new Error(`Output directory does not exist: ${outputDir}`);
  }

  if (verbose) {
    console.log("🔍 Discovering HTML files...");
  }

  const htmlFiles = await discoverHtmlFiles(resolvedInputDir, exclude);

  if (verbose) {
    console.log(`   Found ${htmlFiles.length} HTML files`);
  }

  // Process all HTML files
  const pages: PageData[] = [];
  for (const file of htmlFiles) {
    try {
      const urlPath = fileToUrlPath(file, resolvedInputDir);
      const pageData = await processHtmlFile(file, {
        titleSelector,
        contentSelector,
        excludeSelectors,
      });

      if (!pageData.title) {
        if (verbose) {
          console.log(`   ⚠️  Skipping ${urlPath} (no title found)`);
        }
        continue;
      }

      pages.push({
        urlPath,
        filePath: file,
        ...pageData,
      });

      if (verbose) {
        console.log(`   ✓ ${urlPath}: "${pageData.title}"`);
      }
    } catch (error) {
      console.error(`   ✗ Error processing ${file}: ${getErrorMessage(error)}`);
    }
  }

  if (verbose) {
    console.log(`   Processed ${pages.length} pages successfully\n`);
  }

  // Infer site name and description from homepage
  const homePage = pages.find((p) => p.urlPath === "/");
  const siteName = name || homePage?.title || "Site";
  const siteDescription = description || homePage?.description || "";

  const formatterConfig: FormatterConfig = {
    name: siteName,
    description: siteDescription,
    siteUrl: siteUrl.replace(/\/$/, ""),
  };

  // Generate individual .md files
  if (generateIndividualMd) {
    if (verbose) {
      console.log("📝 Generating individual .md files...");
    }

    for (const page of pages) {
      const mdPath = join(
        resolvedOutputDir,
        page.urlPath.replace(/^\//, "") + ".md",
      );

      const mdContent = generateMarkdownFile(page, formatterConfig);

      // Ensure directory exists
      const mdDir = dirname(mdPath);
      try {
        await access(mdDir);
      } catch {
        await mkdir(mdDir, { recursive: true });
      }

      await writeFile(mdPath, mdContent, "utf8");

      if (verbose) {
        console.log(`   ✓ ${mdPath}`);
      }
    }

    if (verbose) {
      console.log(`   Created ${pages.length} .md files\n`);
    }
  }

  // Generate llms.txt
  if (generateLlmsTxt) {
    if (verbose) {
      console.log("📋 Generating llms.txt...");
    }

    const llmsTxtContent = generateLlmsTxtContent(pages, formatterConfig);
    const llmsTxtPath = join(resolvedOutputDir, "llms.txt");

    await writeFile(llmsTxtPath, llmsTxtContent, "utf8");

    if (verbose) {
      console.log(`   ✓ ${llmsTxtPath}\n`);
    }
  }

  // Generate llms-full.txt
  if (generateLlmsFullTxt) {
    if (verbose) {
      console.log("📚 Generating llms-full.txt...");
    }

    const llmsFullContent = generateLlmsFullTxtContent(pages, formatterConfig);
    const llmsFullPath = join(resolvedOutputDir, "llms-full.txt");

    await writeFile(llmsFullPath, llmsFullContent, "utf8");

    if (verbose) {
      console.log(`   ✓ ${llmsFullPath}\n`);
    }
  }

  console.log("✅ Done!");
  console.log("");
  console.log("Summary:");
  console.log(`  - Pages processed: ${pages.length}`);
  if (generateIndividualMd) {
    console.log(`  - .md files created: ${pages.length}`);
  }
  if (generateLlmsTxt) {
    console.log(`  - llms.txt: ${outputDir}/llms.txt`);
  }
  if (generateLlmsFullTxt) {
    console.log(`  - llms-full.txt: ${outputDir}/llms-full.txt`);
  }
}

/**
 * Astro integration for generating llms.txt and markdown files
 * @param options - Integration options
 */
export default function llmsIntegration(options: LlmsIntegrationOptions = {}) {
  let astroSiteUrl = "";

  return {
    name: "astro-llms-md",
    hooks: {
      "astro:config:setup": async ({
        config,
        logger,
      }: {
        config: { site?: URL | string };
        logger: { info: (message: string) => void };
      }) => {
        logger.info("Setting up astro-llms-md integration...");

        astroSiteUrl = config.site?.toString?.() || "";
      },

      "astro:build:done": async ({
        dir,
        logger,
      }: {
        dir: URL;
        logger: {
          info: (message: string) => void;
          warn: (message: string) => void;
          error: (message: string) => void;
        };
      }) => {
        logger.info("Generating llms.txt and markdown files...");

        try {
          const distDir = fileURLToPath(dir);
          const mergedOptions: ResolvedIntegrationConfig = {
            ...defaultConfig,
            ...options,
          };

          const finalConfig: LlmsConfig = {
            inputDir: distDir,
            outputDir: distDir,
            siteUrl: mergedOptions.siteUrl || astroSiteUrl,
            name: mergedOptions.name,
            description: mergedOptions.description,
            generateIndividualMd: mergedOptions.generateIndividualMd,
            generateLlmsTxt: mergedOptions.generateLlmsTxt,
            generateLlmsFullTxt: mergedOptions.generateLlmsFullTxt,
            titleSelector: mergedOptions.titleSelector,
            contentSelector: mergedOptions.contentSelector,
            exclude: mergedOptions.exclude,
            excludeSelectors: mergedOptions.excludeSelectors,
            verbose: mergedOptions.verbose,
          };

          if (!finalConfig.siteUrl) {
            logger.warn(
              "No site URL found. Set `site` in astro.config.mjs or pass `siteUrl` to llms().",
            );
            return;
          }

          await generateLlmsFiles(finalConfig);

          logger.info("✅ astro-llms-md: Generation complete!");
        } catch (error) {
          logger.error(`❌ astro-llms-md: ${getErrorMessage(error)}`);
          if (options.verbose && error instanceof Error) {
            logger.error(error.stack || "");
          }
        }
      },
    },
  };
}
