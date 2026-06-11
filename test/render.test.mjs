import { test } from "node:test";
import assert from "node:assert/strict";
import { renderIndex, renderRepoPage, escapeHtml } from "../scripts/lib/render.mjs";

const repo = {
  name: "kc-order-import-tool",
  summary: "Imports orders into Khaos Control from a spreadsheet.",
  category: "Khaos Control",
  pushedAt: "2026-05-01T10:00:00Z",
  readmeHtml: "<h1>KC Order Import</h1><p>Docs</p>",
};

test("renderIndex groups cards under their category and links to repo pages", () => {
  const html = renderIndex([repo]);
  assert.match(html, /<h2>Khaos Control<\/h2>/);
  assert.match(html, /href="\.\/kc-order-import-tool\/"/);
  assert.match(html, /Imports orders into Khaos Control/);
  assert.doesNotMatch(html, /<h2>Shopify<\/h2>/);
});

test("renderIndex escapes markup in summaries", () => {
  const html = renderIndex([{ ...repo, summary: 'Uses <script> & "quotes"' }]);
  assert.doesNotMatch(html, /Uses <script>/);
  assert.match(html, /Uses &lt;script&gt; &amp; &quot;quotes&quot;/);
});

test("renderRepoPage includes summary, README html, back link and GitHub link", () => {
  const html = renderRepoPage(repo);
  assert.match(html, /<h1>kc-order-import-tool<\/h1>/);
  assert.match(html, /<h1>KC Order Import<\/h1>/);
  assert.match(html, /github\.com\/alpkit-store\/kc-order-import-tool/);
  assert.match(html, /requires access/);
  assert.match(html, /href="\.\.\/"/);
});

test("escapeHtml escapes markup", () => {
  assert.equal(escapeHtml('<b>&"'), "&lt;b&gt;&amp;&quot;");
  assert.equal(escapeHtml("it's"), "it&#39;s");
});

test("renderIndex buckets unknown categories into Utilities", () => {
  const html = renderIndex([{ ...repo, category: "Legacy category" }]);
  assert.match(html, /<h2>Utilities<\/h2>/);
  assert.match(html, /kc-order-import-tool/);
});
