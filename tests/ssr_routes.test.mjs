import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import {
  discoverSsrPageRoutes,
  routeMatchesPattern,
} from "../dist/index.js";

function makeTree(files) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "astro-llms-md-ssr-"));
  for (const file of files) {
    const fullPath = path.join(dir, file);
    fs.mkdirSync(path.dirname(fullPath), { recursive: true });
    fs.writeFileSync(fullPath, "");
  }
  return dir;
}

function cleanup(dir) {
  fs.rmSync(dir, { recursive: true, force: true });
}

test("discovers plain routes for files and index files", () => {
  const dir = makeTree([
    "index.astro",
    "about.astro",
    "docs/index.astro",
    "docs/guide.md",
  ]);
  try {
    assert.deepEqual(discoverSsrPageRoutes(dir, "/"), [
      "/",
      "/about",
      "/docs",
      "/docs/guide",
    ]);
  } finally {
    cleanup(dir);
  }
});

test("skips dynamic segments, whether file or directory", () => {
  const dir = makeTree([
    "[slug].astro",
    "[slug]/index.astro",
    "[slug]/dev.astro",
    "help/[slug]/index.astro",
    "og/[...path].ts",
  ]);
  try {
    assert.deepEqual(discoverSsrPageRoutes(dir, "/"), []);
  } finally {
    cleanup(dir);
  }
});

test("skips numeric status pages but keeps four-digit and word stems", () => {
  const dir = makeTree([
    "404.astro",
    "429.astro",
    "500.astro",
    "503.astro",
    "2024.astro",
    "about.astro",
  ]);
  try {
    assert.deepEqual(discoverSsrPageRoutes(dir, "/"), ["/2024", "/about"]);
  } finally {
    cleanup(dir);
  }
});

test("skips the api/ directory and files starting with _", () => {
  const dir = makeTree([
    "api/index.astro",
    "api/users.astro",
    "_partial.astro",
    "about.astro",
  ]);
  try {
    assert.deepEqual(discoverSsrPageRoutes(dir, "/"), ["/about"]);
  } finally {
    cleanup(dir);
  }
});

test("excludePatterns removes matching routes", () => {
  const dir = makeTree([
    "preview.astro",
    "internal/index.astro",
    "internal/notes.astro",
    "about.astro",
  ]);
  try {
    assert.deepEqual(
      discoverSsrPageRoutes(dir, "/", ["preview", "internal"]),
      ["/about"],
    );
  } finally {
    cleanup(dir);
  }
});

test("excludePatterns matches an .html suffix pattern", () => {
  const dir = makeTree(["about.astro", "docs/index.astro"]);
  try {
    assert.deepEqual(discoverSsrPageRoutes(dir, "/", ["about.html"]), [
      "/docs",
    ]);
  } finally {
    cleanup(dir);
  }
});

test("includePatterns keeps only matching routes", () => {
  const dir = makeTree(["about.astro", "docs/index.astro", "docs/guide.astro"]);
  try {
    assert.deepEqual(
      discoverSsrPageRoutes(dir, "/", undefined, ["docs"]),
      ["/docs", "/docs/guide"],
    );
  } finally {
    cleanup(dir);
  }
});

test("basePath prefixes routes; excludePatterns still match without the base", () => {
  const dir = makeTree(["index.astro", "about.astro"]);
  try {
    assert.deepEqual(discoverSsrPageRoutes(dir, "/site"), [
      "/site",
      "/site/about",
    ]);
    assert.deepEqual(discoverSsrPageRoutes(dir, "/site", ["about"]), [
      "/site",
    ]);
  } finally {
    cleanup(dir);
  }
});

test("routeMatchesPattern matches routes against name, .html, and directory forms", () => {
  assert.equal(routeMatchesPattern("/about", "about"), true);
  assert.equal(routeMatchesPattern("/about", "about.html"), true);
  assert.equal(routeMatchesPattern("/docs/guide", "docs"), true);
  assert.equal(routeMatchesPattern("/docs/guide", "docs/**"), true);
  assert.equal(routeMatchesPattern("/rss.xml", "**/*.xml"), true);
  assert.equal(routeMatchesPattern("/", "index.html"), true);
});

test("routeMatchesPattern does not match unrelated or partial names", () => {
  assert.equal(routeMatchesPattern("/about", "docs"), false);
  assert.equal(routeMatchesPattern("/aboutus", "about"), false);
});
