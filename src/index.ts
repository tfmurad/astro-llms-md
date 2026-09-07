import { glob } from "glob";
import { minimatch } from "minimatch";
import { parse } from "node-html-parser";
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import TurndownService from "turndown";
import { fileURLToPath } from "url";

/* ──────────────────────────────────────────────────────────────────────────────
   Types
   ───────────────────────────────────────────────────────────────────────────── */

export interface SiteConfig {
  base_url: string;
  base_path?: string;
  title: string;
}

export interface MetadataConfig {
  meta_description?: string;
}

export interface LlmsInternalConfig {
  generate_individual_md?: boolean;
  generate_llms_txt?: boolean;
  generate_llms_full_txt?: boolean;
  title_selector?: string;
  content_selector?: string;
  exclude?: string[];
  include?: string[];
}

export interface ProjectConfig {
  site: SiteConfig;
  metadata?: MetadataConfig;
  llms: LlmsInternalConfig;
}

export interface LlmsIntegrationOptions {
  configPath?: string;
  siteUrl?: string;
  name?: string;
  description?: string;
  generateIndividualMd?: boolean;
  generateLlmsTxt?: boolean;
  generateLlmsFullTxt?: boolean;
  titleSelector?: string;
  contentSelector?: string;
  exclude?: string[];
  include?: string[];
  verbose?: boolean;
}

export interface PageData {
  urlPath: string;
  filePath: string | null;
  title: string;
  description: string;
  content: string;
  source: "prerendered" | "ssr";
}

export interface GenerateOptions {
  config: ProjectConfig;
  distFolder: string;
  verbose?: boolean;
}

/* ──────────────────────────────────────────────────────────────────────────────
   Constants
   ───────────────────────────────────────────────────────────────────────────── */

// ─── Default patterns to always skip ────────────────────────────────────────
const DEFAULT_EXCLUDES = [
  "node_modules",
  "_astro",
  "404",
  "404.html",
  "**/*.xml",
  "**/*.txt",
];

// ─── URL path prefixes that are API / system routes ──────────────────────────
const API_ROUTE_PREFIXES = ["/api/", "/_", "/cdn-cgi/"];

// ─── Temporary server management ──────────────────────────────────────────────
const TEMP_PORT = 14321;
const TEMP_HOST = "127.0.0.1";

/* ──────────────────────────────────────────────────────────────────────────────
   Helpers
   ───────────────────────────────────────────────────────────────────────────── */

function isApiRoute(urlPath: string): boolean {
  return API_ROUTE_PREFIXES.some((prefix) => urlPath.startsWith(prefix));
}

// ─── Config ──────────────────────────────────────────────────────────────────

export function getConfig(configPath?: string): ProjectConfig {
  const CONFIG_PATH =
    configPath ||
    path.join(process.cwd(), "src", "config", "config.json");

  if (!fs.existsSync(CONFIG_PATH)) {
    throw new Error("config.json not found");
  }

  const config: ProjectConfig = JSON.parse(fs.readFileSync(CONFIG_PATH, "utf8"));

  if (!config.llms) {
    throw new Error("llms configuration not found in config.json");
  }

  return config;
}

// ─── Path helpers ─────────────────────────────────────────────────────────────

/**
 * Returns the Astro static-asset output directory.
 * In SSR mode (output: "server") Astro puts static files in dist/client/.
 * In static mode (output: "static") they go directly in dist/.
 */
export function getClientDir(distFolder: string): string {
  const clientDir = path.join(distFolder, "client");
  return fs.existsSync(clientDir) ? clientDir : distFolder;
}

/**
 * Astro's `astro:build:done` hook receives dist/client/ for server builds.
 * Normalize that hook path back to dist/ so SSR server and source paths resolve.
 */
export function resolveDistFolder(buildOutputDir: string): string {
  const resolvedDir = path.resolve(buildOutputDir);
  const parentDir = path.dirname(resolvedDir);

  if (
    path.basename(resolvedDir) === "client" &&
    fs.existsSync(path.join(parentDir, "server", "entry.mjs"))
  ) {
    return parentDir;
  }

  return resolvedDir;
}

export function normalizePattern(baseDir: string, pattern: string): string {
  const cleanPattern = pattern.replace(/^\/+/,"");
  const fullPath = path.join(baseDir, cleanPattern);

  try {
    if (fs.statSync(fullPath).isDirectory()) {
      return path.join(fullPath, "**/*.html");
    }
  } catch {
    // treat as glob pattern
  }

  return fullPath;
}

export async function discoverHtmlFiles(
  clientDir: string,
  excludePatterns?: string[],
  includePatterns?: string[],
): Promise<string[]> {
  const patterns =
    includePatterns && includePatterns.length > 0
      ? includePatterns.map((p) => normalizePattern(clientDir, p))
      : [path.join(clientDir, "**/*.html")];

  const userExcludes = (excludePatterns || []).map((p) =>
    normalizePattern(clientDir, p),
  );

  const ignore = [
    ...DEFAULT_EXCLUDES.map((p) => path.join(clientDir, p)),
    ...userExcludes,
  ];

  let files = await glob(patterns, { ignore, absolute: true });

  files = files.filter((f) => fs.statSync(f).isFile() && f.endsWith(".html"));

  return files.sort();
}

export function fileToUrlPath(filePath: string, clientDir: string): string {
  const relativePath = filePath.replace(path.resolve(clientDir), "");
  let urlPath = relativePath.replace(/\\/g, "/").replace(/^\//, "");

  urlPath = urlPath.replace(/\.html$/, "");

  if (urlPath.endsWith("/index") || urlPath === "index") {
    urlPath = urlPath.replace(/\/index$/, "").replace(/^index$/, "");
  }

  return "/" + urlPath;
}

// ─── HTML parsing helpers ─────────────────────────────────────────────────────

export function getTitle(
  root: ReturnType<typeof parse>,
  titleSelector?: string,
): string {
  let el;
  if (titleSelector) el = root.querySelector(titleSelector);
  if (!el) el = root.querySelector("h1");
  if (!el) el = root.querySelector("h2");
  if (!el) el = root.querySelector("h3");
  if (!el) el = root.querySelector("title");
  return el?.text?.trim() || "";
}

export function getContentElement(
  root: ReturnType<typeof parse>,
  contentSelector?: string,
): ReturnType<typeof parse> | null {
  let el;
  if (contentSelector) el = root.querySelector(contentSelector);
  if (!el) el = root.querySelector("main");
  if (!el) el = root.querySelector("body");
  if (!el) el = root.querySelector("html");
  return el;
}

function isHeaderRow(row: HTMLTableRowElement): boolean {
  return Array.from(row.childNodes).every((cell) => cell.nodeName === "TH");
}

function cellText(cell: ChildNode): string {
  return (cell.textContent || "").trim().replace(/\s+/g, " ").replace(/\|/g, "\\|");
}

// Turndown has no built-in table support. Rather than pull in
// turndown-plugin-gfm for a handful of addRule() calls we already have the
// API for, convert tables directly. Handles two shapes:
//  - a real header row (every cell in row 0 is <th>) -> a GFM pipe table
//  - no header row (e.g. a spec table using <th scope="row"> + <td> per
//    row) -> a flat "label: value" list, since a pipe table would
//    misrepresent it and turndown-plugin-gfm's own rule just leaves tables
//    like this as unconverted raw HTML
function addTableRule(turndownService: TurndownService): void {
  turndownService.addRule("table", {
    filter: "table",
    replacement: (_content, node) => {
      const rows = Array.from((node as HTMLTableElement).rows);
      if (rows.length === 0) return "";

      if (isHeaderRow(rows[0])) {
        const headerCells = Array.from(rows[0].childNodes);
        const header = `| ${headerCells.map(cellText).join(" | ")} |`;
        const divider = `| ${headerCells.map(() => "---").join(" | ")} |`;
        const body = rows
          .slice(1)
          .map((row) => `| ${Array.from(row.childNodes).map(cellText).join(" | ")} |`)
          .join("\n");
        return `\n\n${[header, divider, body].filter(Boolean).join("\n")}\n\n`;
      }

      const lines = rows
        .map((row) => {
          const cells = Array.from(row.childNodes).map(cellText).filter(Boolean);
          if (cells.length === 0) return "";
          const [label, ...rest] = cells;
          return `- ${label.replace(/:\s*$/, "")}: ${rest.join(" ")}`;
        })
        .filter(Boolean);
      return `\n\n${lines.join("\n")}\n\n`;
    },
  });
}

const BLOCK_LEVEL_ELEMENTS = [
  "ADDRESS", "ARTICLE", "ASIDE", "BLOCKQUOTE", "DD", "DIV", "DL", "DT",
  "FIELDSET", "FIGCAPTION", "FIGURE", "FORM", "H1", "H2", "H3", "H4", "H5",
  "H6", "HEADER", "HGROUP", "LI", "OL", "P", "PRE", "SECTION", "TABLE", "UL",
];

// Collects visible text, inserting a space at block boundaries so
// "<h3>Hi</h3><p>d</p>" becomes "Hi d" rather than "Hid".
function flattenText(node: ChildNode): string {
  if (node.nodeType === 3) return node.textContent || "";
  const inner = Array.from(node.childNodes).map(flattenText).join("");
  return BLOCK_LEVEL_ELEMENTS.includes(node.nodeName) ? ` ${inner} ` : inner;
}

// A valid-in-HTML <a> can wrap block elements (a heading card, a whole
// section). Block rules inside it inject newlines into the link text, which
// most markdown renderers then refuse to parse as a link at all. Emit a
// single inline link with flattened plain text instead.
// Mirrors turndown's own inline-link escaping for href/title.
function addBlockInLinkRule(turndownService: TurndownService): void {
  turndownService.addRule("linkWithBlocks", {
    filter: (node) =>
      node.nodeName === "A" &&
      !!node.getAttribute("href") &&
      Array.from(node.querySelectorAll("*")).some((el) =>
        BLOCK_LEVEL_ELEMENTS.includes(el.nodeName),
      ),
    replacement: (_content, node) => {
      const text = flattenText(node)
        .replace(/\s+/g, " ")
        .trim()
        .replace(/([\\[\]])/g, "\\$1");
      if (!text) return "";
      let href = (node.getAttribute("href") || "").replace(/([<>()])/g, "\\$1");
      if (href.includes(" ")) href = `<${href}>`;
      const title = (node.getAttribute("title") || "")
        .replace(/(\n+\s*)+/g, "\n")
        .replace(/"/g, '\\"');
      return `[${text}](${href}${title ? ` "${title}"` : ""})`;
    },
  });
}

export async function processHtml(
  html: string,
  llmsConfig?: LlmsInternalConfig,
): Promise<Omit<PageData, "urlPath" | "filePath" | "source">> {
  const root = parse(html);

  const title = getTitle(root, llmsConfig?.title_selector);

  const metaDescription = root.querySelector('meta[name="description"]');
  const description = metaDescription?.getAttribute("content") || "";

  const contentElement = getContentElement(root, llmsConfig?.content_selector);
  let content = "";

  if (contentElement) {
    contentElement
      .querySelectorAll("script, style, noscript, iframe, svg")
      .forEach((el) => el.remove());

    const turndownService = new TurndownService({
      headingStyle: "atx",
      codeBlockStyle: "fenced",
      bulletListMarker: "-",
    });
    addTableRule(turndownService);
    addBlockInLinkRule(turndownService);

    turndownService.addRule("removeChrome", {
      filter: ["nav", "footer", "header", "aside"],
      replacement: () => "",
    });

    content = turndownService.turndown(contentElement.innerHTML);
  }

  return { title, description, content };
}

export async function processHtmlFile(
  filePath: string,
  llmsConfig?: LlmsInternalConfig,
): Promise<Omit<PageData, "urlPath" | "filePath" | "source">> {
  const html = fs.readFileSync(filePath, "utf8");
  return processHtml(html, llmsConfig);
}

/**
 * Fetches a page from a server and processes it as HTML.
 * Returns null if the fetch fails or the page returns an error status.
 */
export async function fetchAndProcessPage(
  url: string,
  llmsConfig?: LlmsInternalConfig,
): Promise<Omit<PageData, "urlPath" | "filePath" | "source"> | null> {
  try {
    const response = await fetch(url, {
      headers: { Accept: "text/html" },
      signal: AbortSignal.timeout(10_000),
    });

    if (!response.ok) return null;

    const html = await response.text();
    return processHtml(html, llmsConfig);
  } catch {
    return null;
  }
}

// ─── Temporary server management ──────────────────────────────────────────────

/**
 * Checks if a server is already reachable at the given URL.
 */
export async function isServerRunning(url: string): Promise<boolean> {
  try {
    const r = await fetch(url + "/", {
      signal: AbortSignal.timeout(2_000),
      headers: { Accept: "text/html" },
    });
    return r.status < 500;
  } catch {
    return false;
  }
}

/**
 * Spawns dist/server/entry.mjs on TEMP_PORT and waits until it's ready.
 * Returns { process, baseUrl } or null if it can't be started.
 */
export async function startTempServer(
  distFolder: string,
): Promise<{ process: ReturnType<typeof spawn>; baseUrl: string } | null> {
  const entryPath = path.join(distFolder, "server", "entry.mjs");

  if (!fs.existsSync(entryPath)) {
    console.log(
      "   ⚠️  No standalone server entry (dist/server/entry.mjs) found.",
    );
    return null;
  }

  console.log(
    `   Spawning built server on port ${TEMP_PORT} to render SSR pages...`,
  );

  const serverProcess = spawn(process.execPath, [entryPath], {
    env: {
      ...process.env,
      PORT: String(TEMP_PORT),
      HOST: TEMP_HOST,
    },
    stdio: ["ignore", "pipe", "pipe"],
    detached: false,
  });

  serverProcess.stderr.on("data", (d) => {
    // Suppress noise but keep it available for debugging
    if (process.env.LLMS_DEBUG) process.stderr.write(d);
  });

  const tempBaseUrl = `http://${TEMP_HOST}:${TEMP_PORT}`;

  // Poll until the server responds or timeout
  const ready = await new Promise<boolean>((resolve) => {
    const TIMEOUT_MS = 20_000;
    const POLL_MS = 400;

    const deadline = setTimeout(() => {
      clearInterval(poll);
      resolve(false);
    }, TIMEOUT_MS);

    const poll = setInterval(async () => {
      try {
        const r = await fetch(tempBaseUrl + "/", {
          signal: AbortSignal.timeout(1_000),
        });
        if (r.status < 500) {
          clearInterval(poll);
          clearTimeout(deadline);
          resolve(true);
        }
      } catch {
        // not ready yet
      }
    }, POLL_MS);

    serverProcess.on("error", () => {
      clearInterval(poll);
      clearTimeout(deadline);
      resolve(false);
    });

    serverProcess.on("exit", (code) => {
      if (code !== null) {
        clearInterval(poll);
        clearTimeout(deadline);
        resolve(false);
      }
    });
  });

  if (!ready) {
    console.log("   ⚠️  Temp server did not become ready in time.");
    serverProcess.kill();
    return null;
  }

  console.log(`   ✓ Temp server ready at ${tempBaseUrl}`);
  return { process: serverProcess, baseUrl: tempBaseUrl };
}

export function stopTempServer(
  serverHandle: { process: ReturnType<typeof spawn> } | null,
): void {
  if (serverHandle?.process) {
    serverHandle.process.kill();
    console.log("   Stopped temporary server.\n");
  }
}

// ─── SSR page discovery from source ──────────────────────────────────────────

/**
 * Matches a route against the same path patterns `exclude` and `include` use
 * for static HTML, so the SSR route list honors them too. A route has no file
 * yet, so it is matched by the names its HTML could take: `about`,
 * `about.html`, `about/index.html`, and anything under `about/`.
 */
export function routeMatchesPattern(
  routePath: string,
  pattern: string,
): boolean {
  const relative = routePath.replace(/^\/+/, "");
  const candidates = relative
    ? [relative, `${relative}.html`, `${relative}/index.html`]
    : ["index.html"];
  const cleanPattern = pattern.replace(/^\/+/, "").replace(/\/+$/, "");

  return candidates.some(
    (candidate) =>
      minimatch(candidate, cleanPattern) ||
      minimatch(candidate, `${cleanPattern}/**`),
  );
}

/**
 * Scans src/pages/ for static (non-dynamic) route files and returns their
 * URL paths. Dynamic routes ([slug].astro, [slug]/), status pages (404, 500…)
 * and the api/ folder are excluded since they either already have HTML files
 * or are not pages. `excludePatterns` and `includePatterns` are the same
 * patterns `discoverHtmlFiles` applies to static HTML.
 */
export function discoverSsrPageRoutes(
  srcPagesDir: string,
  basePath: string,
  excludePatterns?: string[],
  includePatterns?: string[],
): string[] {
  if (!fs.existsSync(srcPagesDir)) return [];

  const routes: string[] = [];
  const base = basePath === "/" ? "" : basePath.replace(/\/$/, "");
  const excludes = [...DEFAULT_EXCLUDES, ...(excludePatterns || [])];
  const includes = includePatterns || [];

  function isWanted(relativeRoute: string): boolean {
    if (
      includes.length > 0 &&
      !includes.some((p) => routeMatchesPattern(relativeRoute, p))
    ) {
      return false;
    }

    return !excludes.some((p) => routeMatchesPattern(relativeRoute, p));
  }

  function scanDir(dir: string, urlPrefix: string) {
    const entries = fs.readdirSync(dir, { withFileTypes: true });

    for (const entry of entries) {
      const name = entry.name;

      // Skip hidden items, dynamic segments, and the api/ directory
      if (name.startsWith(".") || name.startsWith("[") || name === "api") {
        continue;
      }

      const fullPath = path.join(dir, name);

      if (entry.isDirectory()) {
        scanDir(fullPath, `${urlPrefix}/${name}`);
      } else if (
        entry.isFile() &&
        /\.(astro|md|mdx|ts|js)$/.test(name) &&
        !name.startsWith("_")
      ) {
        const stem = name.replace(/\.(astro|md|mdx|ts|js)$/, "");

        // Status pages (404, 500, …) render for errors, not at their own URL
        if (/^\d{3}$/.test(stem)) continue;

        const relativeRoute =
          stem === "index" ? urlPrefix || "/" : `${urlPrefix}/${stem}`;
        const normalizedRoute =
          relativeRoute === "/" ? base || "/" : `${base}${relativeRoute}`;

        if (isApiRoute(normalizedRoute)) continue;
        if (!isWanted(relativeRoute)) continue;

        routes.push(normalizedRoute);
      }
    }
  }

  scanDir(srcPagesDir, "");

  return [...new Set(routes)].sort();
}

// ─── Output generators ────────────────────────────────────────────────────────

export function generateMarkdownFile(page: PageData, siteUrl: string): string {
  const url = `${siteUrl}${page.urlPath}`.replace(/(?<=.)\/$/, "");

  let md = "---\n";
  md += `title: "${page.title.replace(/"/g, '\\"')}"\n`;
  md += `url: "${url}"\n`;
  if (page.description) {
    md += `description: "${page.description.replace(/"/g, '\\"')}"\n`;
  }
  md += "---\n\n";
  md += page.content;

  return md;
}

export function generateLlmsTxtContent(
  pages: PageData[],
  siteUrl: string,
  siteName: string,
  siteDescription: string,
  generateIndividualMd: boolean,
): string {
  let content = `# ${siteName}\n\n`;

  if (siteDescription) {
    content += `> ${siteDescription}\n\n`;
  }

  content +=
    "This file helps language models discover the most useful content on this site.\n\n";

  const grouped: Record<string, PageData[]> = {};
  pages.forEach((page) => {
    const parts = page.urlPath.split("/").filter(Boolean);
    const group = parts.length === 0 ? "Home" : parts[0];

    if (!grouped[group]) grouped[group] = [];
    grouped[group].push(page);
  });

  const sortedGroups = Object.keys(grouped).sort((a, b) => {
    if (a === "Home") return -1;
    if (b === "Home") return 1;
    return a.localeCompare(b);
  });

  sortedGroups.forEach((group) => {
    const groupName = group.charAt(0).toUpperCase() + group.slice(1);
    content += `## ${groupName}\n\n`;

    grouped[group].forEach((page) => {
      let linkUrl: string;
      if (generateIndividualMd) {
        const mdPath =
          page.urlPath === "/" ? "/home.md" : `${page.urlPath}.md`;
        linkUrl = `${siteUrl}${mdPath}`.replace(/([^:])\/\//g, "$1/");
      } else {
        linkUrl = `${siteUrl}${page.urlPath}`.replace(/(?<=.)\/$/, "");
      }
      const linkText = page.title || page.urlPath;

      if (page.description) {
        content += `- [${linkText}](${linkUrl}): ${page.description}\n`;
      } else {
        content += `- [${linkText}](${linkUrl})\n`;
      }
    });

    content += "\n";
  });

  return content;
}

export function generateLlmsFullTxtContent(
  pages: PageData[],
  siteUrl: string,
  siteName: string,
): string {
  let content = `# ${siteName}\n\n`;
  content += `URL: ${siteUrl}\n\n`;

  pages.forEach((page, index) => {
    const url = `${siteUrl}${page.urlPath}`.replace(/(?<=.)\/$/, "");
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

// ─── Main ─────────────────────────────────────────────────────────────────────

export async function generateLlmsFiles(options: GenerateOptions): Promise<void> {
  const { config, distFolder, verbose = false } = options;
  const llms = config.llms;

  if (!fs.existsSync(distFolder)) {
    console.error("❌ dist/ folder does not exist. Run 'astro build' first.");
    process.exit(1);
  }

  // In SSR mode static assets live in dist/client/; in static mode in dist/
  const clientDir = getClientDir(distFolder);
  const isSSR = clientDir !== distFolder;

  const targetDirs = [clientDir];
  const vercelStaticDir = path.join(
    path.dirname(distFolder),
    ".vercel",
    "output",
    "static",
  );
  if (fs.existsSync(vercelStaticDir)) {
    targetDirs.push(vercelStaticDir);
  }

  console.log(
    `📂 Output mode: ${isSSR ? "SSR (dist/client)" : "Static (dist)"}`,
  );
  if (targetDirs.length > 1) {
    console.log(
      `📂 Target directories: ${targetDirs
        .map((d) => path.relative(path.dirname(distFolder), d))
        .join(", ")}`,
    );
  }

  const siteUrl = config.site.base_url.replace(/\/$/, "");
  const basePath = (config.site.base_path || "/").replace(/\/$/, "") || "/";
  const siteName = config.site.title;
  const siteDescription = config.metadata?.meta_description || "";

  // Helper to write to all target directories
  const writeToTargets = (relPath: string, content: string) => {
    for (const dir of targetDirs) {
      const fullPath = path.join(dir, relPath);
      const parentDir = path.dirname(fullPath);
      if (!fs.existsSync(parentDir)) {
        fs.mkdirSync(parentDir, { recursive: true });
      }
      fs.writeFileSync(fullPath, content, "utf8");
    }
  };

  // ── Step 1: Discover pre-rendered HTML files ────────────────────────────
  console.log("\n🔍 Discovering pre-rendered HTML files...");
  const htmlFiles = await discoverHtmlFiles(
    clientDir,
    llms.exclude,
    llms.include,
  );
  console.log(`   Found ${htmlFiles.length} pre-rendered HTML files`);

  const pages: PageData[] = [];
  const seenPaths = new Set<string>();

  for (const file of htmlFiles) {
    try {
      const urlPath = fileToUrlPath(file, clientDir);

      if (isApiRoute(urlPath)) {
        console.log(`   ⤷ Skipping API route: ${urlPath}`);
        continue;
      }

      if (seenPaths.has(urlPath)) continue;
      seenPaths.add(urlPath);

      const pageData = await processHtmlFile(file, llms);

      if (!pageData.title) {
        console.log(`   ⚠️  No title found for ${urlPath}, skipping`);
        continue;
      }

      pages.push({
        urlPath,
        filePath: file,
        source: "prerendered",
        ...pageData,
      });
      console.log(`   ✓ [static] ${urlPath}: "${pageData.title}"`);
    } catch (error) {
      console.error(
        `   ✗ Error processing ${file}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  // ── Step 2: Fetch SSR-only pages ───────────────────────────────────────
  if (isSSR) {
    const srcPagesDir = path.join(path.dirname(distFolder), "src", "pages");
    const ssrRoutes = discoverSsrPageRoutes(
      srcPagesDir,
      basePath,
      llms.exclude,
      llms.include,
    );
    const missingRoutes = ssrRoutes.filter((r) => !seenPaths.has(r));

    if (missingRoutes.length === 0) {
      console.log("\n✓ All source routes already captured by static HTML.");
    } else {
      console.log(
        `\n🌐 Fetching ${missingRoutes.length} SSR-only route(s): ${missingRoutes.join(", ")}`,
      );

      // Determine which server to use: the configured siteUrl or a temp server
      let fetchBase: string | null = null;
      let tempServerHandle: { process: ReturnType<typeof spawn>; baseUrl: string } | null = null;

      if (await isServerRunning(siteUrl)) {
        fetchBase = siteUrl;
        console.log(`   Using running server at ${fetchBase}`);
      } else {
        tempServerHandle = await startTempServer(distFolder);
        if (tempServerHandle) {
          fetchBase = tempServerHandle.baseUrl;
        } else {
          console.log(
            "   ⚠️  No server available. SSR pages will be skipped.\n" +
              "       Run 'yarn preview' before 'yarn generate-llms' to include them.",
          );
        }
      }

      if (fetchBase) {
        for (const route of missingRoutes) {
          const url = `${fetchBase}${route}`;
          process.stdout.write(`   ⤷ Fetching ${route} ... `);

          const pageData = await fetchAndProcessPage(url, llms);

          if (!pageData) {
            console.log("❌ failed");
            continue;
          }

          if (!pageData.title) {
            console.log("⚠️  no title, skipping");
            continue;
          }

          seenPaths.add(route);
          pages.push({
            urlPath: route,
            filePath: null,
            source: "ssr",
            ...pageData,
          });
          console.log(`✓ "${pageData.title}"`);
        }
      }

      stopTempServer(tempServerHandle);
    }
  }

  // Sort pages: home first, then alphabetically
  pages.sort((a, b) => {
    if (a.urlPath === "/") return -1;
    if (b.urlPath === "/") return 1;
    return a.urlPath.localeCompare(b.urlPath);
  });

  console.log(`\n   ✅ Total pages processed: ${pages.length}\n`);

  // ── Step 3: Generate individual .md files ──────────────────────────────
  if (llms.generate_individual_md) {
    console.log("📝 Generating individual .md files...");

    for (const page of pages) {
      // Home → home.md, everything else → <url-path>.md
      const mdRelative =
        page.urlPath === "/" ? "home" : page.urlPath.replace(/^\//, "");
      const relPath = mdRelative + ".md";

      const mdContent = generateMarkdownFile(page, siteUrl);
      writeToTargets(relPath, mdContent);
      console.log(`   ✓ ${relPath}`);
    }

    console.log(`   Created ${pages.length} .md files\n`);
  }

  // ── Step 4: Generate llms.txt ──────────────────────────────────────────
  if (llms.generate_llms_txt) {
    console.log("📋 Generating llms.txt...");

    const llmsTxtContent = generateLlmsTxtContent(
      pages,
      siteUrl,
      siteName,
      siteDescription,
      !!llms.generate_individual_md,
    );
    writeToTargets("llms.txt", llmsTxtContent);
    console.log(`   ✓ llms.txt\n`);
  }

  // ── Step 5: Generate llms-full.txt ────────────────────────────────────
  if (llms.generate_llms_full_txt) {
    console.log("📚 Generating llms-full.txt...");

    const llmsFullContent = generateLlmsFullTxtContent(
      pages,
      siteUrl,
      siteName,
    );
    writeToTargets("llms-full.txt", llmsFullContent);
    console.log(`   ✓ llms-full.txt\n`);
  }

  // ── Summary ────────────────────────────────────────────────────────────
  console.log("✅ LLMS generation complete!\n");
  console.log("Summary:");
  console.log(`  Pages processed : ${pages.length}`);
  console.log(
    `  Sources         : ${pages.filter((p) => p.source === "prerendered").length} static HTML, ${pages.filter((p) => p.source === "ssr").length} SSR-fetched`,
  );
  if (llms.generate_individual_md) {
    console.log(
      `  .md files       : ${pages.length} (in ${path.relative(distFolder, clientDir)}/)`,
    );
  }
  if (llms.generate_llms_txt) {
    console.log(
      `  llms.txt        : ${path.relative(distFolder, path.join(clientDir, "llms.txt"))}`,
    );
  }
  if (llms.generate_llms_full_txt) {
    console.log(
      `  llms-full.txt   : ${path.relative(distFolder, path.join(clientDir, "llms-full.txt"))}`,
    );
  }
}

// ─── Astro integration wrapper ───────────────────────────────────────────────

/**
 * Maps camelCase integration options to the internal snake_case config shape
 * used by the main generateLlmsFiles function.
 */
function mapOptionsToConfig(
  options: LlmsIntegrationOptions,
  astroSiteUrl: string,
  astroBasePath: string,
  projectConfig?: ProjectConfig,
): ProjectConfig {
  const projectLlms = projectConfig?.llms || {};

  return {
    site: {
      base_url:
        options.siteUrl ?? projectConfig?.site.base_url ?? astroSiteUrl ?? "",
      base_path:
        projectConfig?.site.base_path ?? astroBasePath ?? "/",
      title: options.name ?? projectConfig?.site.title ?? "Site",
    },
    metadata: {
      meta_description:
        options.description ?? projectConfig?.metadata?.meta_description ?? "",
    },
    llms: {
      generate_individual_md:
        options.generateIndividualMd ?? projectLlms.generate_individual_md ?? true,
      generate_llms_txt:
        options.generateLlmsTxt ?? projectLlms.generate_llms_txt ?? true,
      generate_llms_full_txt:
        options.generateLlmsFullTxt ?? projectLlms.generate_llms_full_txt ?? true,
      title_selector: options.titleSelector ?? projectLlms.title_selector,
      content_selector: options.contentSelector ?? projectLlms.content_selector,
      exclude: options.exclude ?? projectLlms.exclude ?? [],
      include: options.include ?? projectLlms.include ?? [],
    },
  };
}

/**
 * Astro integration for generating llms.txt and markdown files.
 */
export default function llmsIntegration(options: LlmsIntegrationOptions = {}) {
  let astroSiteUrl = "";
  let astroBasePath = "/";

  return {
    name: "astro-llms-md",
    hooks: {
      "astro:config:setup": async ({
        config,
        logger,
      }: {
        config: {
          site?: URL | string;
          base?: string;
          trailingSlash?: string;
          build?: { format?: string };
        };
        logger: { info: (message: string) => void };
      }) => {
        logger.info("Setting up astro-llms-md integration...");
        astroSiteUrl = config.site?.toString?.() || "";
        astroBasePath = config.base || "/";
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
          const distDir = resolveDistFolder(fileURLToPath(dir));
          const configPath =
            options.configPath ||
            path.join(process.cwd(), "src", "config", "config.json");
          const projectConfig = fs.existsSync(configPath)
            ? getConfig(configPath)
            : undefined;
          const mappedConfig = mapOptionsToConfig(
            options,
            astroSiteUrl,
            astroBasePath,
            projectConfig,
          );

          if (!mappedConfig.site.base_url) {
            logger.warn(
              "No site URL found. Set `site` in astro.config.mjs or pass `siteUrl` to llms().",
            );
            return;
          }

          await generateLlmsFiles({
            config: mappedConfig,
            distFolder: distDir,
            verbose: options.verbose || false,
          });

          logger.info("✅ astro-llms-md: Generation complete!");
        } catch (error) {
          const message =
            error instanceof Error ? error.message : String(error);
          logger.error(`❌ astro-llms-md: ${message}`);
          if (options.verbose && error instanceof Error) {
            logger.error(error.stack || "");
          }
        }
      },
    },
  };
}
