import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { discoverHtmlFiles } from "../dist/index.js";

test("discovers HTML and applies include and exclude patterns", async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "llms site-ç-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  for (const file of ["index.html", "blog/post.html", "admin/index.html", "500.html"]) {
    const target = path.join(root, file);
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, "<html></html>");
  }
  const relative = (files) => files.map((file) => path.relative(root, file).replace(/\\/g, "/")).sort();

  assert.deepEqual(relative(await discoverHtmlFiles(root, ["admin", "500.html"])), ["blog/post.html", "index.html"]);
  assert.deepEqual(relative(await discoverHtmlFiles(root, ["admin"], ["blog", "admin"])), ["blog/post.html"]);
});
