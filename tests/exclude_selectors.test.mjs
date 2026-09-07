import assert from "node:assert/strict";
import { test } from "node:test";
import { processHtml } from "../dist/index.js";

function wrap(inner) {
  return `<html><body><main>${inner}</main></body></html>`;
}

test("[data-llms-ignore] is always stripped", async () => {
  const html = wrap(
    "<p>Keep this.</p><section data-llms-ignore><p>Drop this.</p></section>",
  );
  const { content } = await processHtml(html);
  assert.equal(content.trim(), "Keep this.");
});

test("excludeSelectors strips matching elements before conversion", async () => {
  const html = wrap(
    '<p>Keep this.</p><div class="promo"><p>Drop this.</p></div><form><input></form>',
  );
  const { content } = await processHtml(html, {
    exclude_selectors: [".promo", "form"],
  });
  assert.equal(content.trim(), "Keep this.");
});

test("nothing extra is stripped without excludeSelectors", async () => {
  const html = wrap('<p>Keep this.</p><div class="promo"><p>And this.</p></div>');
  const { content } = await processHtml(html);
  assert.equal(content.trim(), "Keep this.\n\nAnd this.");
});
