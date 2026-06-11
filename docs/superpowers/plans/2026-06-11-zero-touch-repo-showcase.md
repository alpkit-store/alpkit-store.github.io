# Zero-Touch Repo Showcase Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the manually-maintained README mirror with a nightly GitHub Action that discovers org repos tagged `public-docs`, summarises changed READMEs via GitHub Models, and builds a static showcase site deployed to Pages.

**Architecture:** One workflow in this repo does everything: `scripts/sync.mjs` pulls repo metadata + READMEs from the GitHub API (fine-grained PAT), generates plain-English summaries via GitHub Models (free, `GITHUB_TOKEN` with `models: read`) only when a README's hash changes, and caches everything in `data/`. `scripts/build.mjs` renders `data/` to static HTML in `dist/`, deployed via `actions/deploy-pages`. No framework; `marked` is the only dependency.

**Tech Stack:** Node 22 (ESM, `node:test` for tests), marked, GitHub REST API, GitHub Models inference API, GitHub Actions + Pages.

**Spec:** `docs/superpowers/specs/2026-06-11-zero-touch-repo-showcase-design.md`

**Verified API facts (2026-06-11):**
- GitHub Models endpoint: `POST https://models.github.ai/inference/chat/completions`, `Authorization: Bearer <token>`. In Actions, the built-in `GITHUB_TOKEN` works when the workflow declares `permissions: models: read`.
- `openai/gpt-4.1-mini` exists in the free catalog (`https://models.github.ai/catalog/models`).
- Raw README fetch: `GET /repos/{org}/{repo}/readme` with `Accept: application/vnd.github.raw+json`.

---

## File structure

```
package.json                    # type: module, scripts, marked devDependency
.gitignore                      # node_modules/, dist/
scripts/
  sync.mjs                      # orchestrator: fetch -> hash-compare -> summarise -> write data/
  build.mjs                     # data/ -> dist/ static HTML
  lib/
    github.mjs                  # REST API: list opted-in repos, fetch raw README
    summarize.mjs               # GitHub Models call + CATEGORIES taxonomy
    render.mjs                  # HTML templates: index + per-repo page
site/
  styles.css                    # static assets copied verbatim into dist/
  assets/logo.png               # moved from assets/
  assets/favicon.png            # moved from assets/
data/<repo>/README.md           # cached raw README (committed by the workflow)
data/<repo>/meta.json           # description, pushedAt, readmeHash, summary, category
test/
  github.test.mjs
  summarize.test.mjs
  render.test.mjs
.github/workflows/build.yml     # nightly cron + workflow_dispatch
```

---

### Task 1: Project scaffold

**Files:**
- Create: `package.json`
- Create: `.gitignore`

- [ ] **Step 1: Create `package.json`**

```json
{
  "name": "alpkit-store-site",
  "private": true,
  "type": "module",
  "scripts": {
    "test": "node --test test/",
    "sync": "node scripts/sync.mjs",
    "build": "node scripts/build.mjs"
  }
}
```

- [ ] **Step 2: Create `.gitignore`**

```
node_modules/
dist/
```

- [ ] **Step 3: Install marked**

Run: `npm install --save-dev marked`
Expected: `package.json` gains a `devDependencies.marked` entry; `package-lock.json` created.

- [ ] **Step 4: Commit**

```bash
git add package.json package-lock.json .gitignore
git commit -m "chore: scaffold Node project for static site build"
```

---

### Task 2: GitHub API client (`scripts/lib/github.mjs`)

**Files:**
- Create: `scripts/lib/github.mjs`
- Test: `test/github.test.mjs`

- [ ] **Step 1: Write the failing tests**

Create `test/github.test.mjs`:

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { listPublicDocsRepos, fetchReadme } from "../scripts/lib/github.mjs";

function jsonResponse(body, status = 200) {
  return { ok: status < 400, status, json: async () => body, text: async () => JSON.stringify(body) };
}

test("listPublicDocsRepos filters to non-archived repos with the public-docs topic", async () => {
  const fetchImpl = async () => jsonResponse([
    { name: "tool-a", archived: false, topics: ["public-docs"], description: "A", pushed_at: "2026-01-01T00:00:00Z" },
    { name: "tool-b", archived: false, topics: [], description: "B", pushed_at: "2026-01-01T00:00:00Z" },
    { name: "tool-c", archived: true, topics: ["public-docs"], description: "C", pushed_at: "2026-01-01T00:00:00Z" },
  ]);
  const repos = await listPublicDocsRepos("tok", fetchImpl);
  assert.deepEqual(repos.map((r) => r.name), ["tool-a"]);
  assert.equal(repos[0].description, "A");
});

test("listPublicDocsRepos paginates until a short page", async () => {
  const page1 = Array.from({ length: 100 }, (_, i) => ({ name: `r${i}`, archived: false, topics: ["public-docs"], pushed_at: null }));
  const page2 = [{ name: "last", archived: false, topics: ["public-docs"], pushed_at: null }];
  const calls = [];
  const fetchImpl = async (url) => { calls.push(url); return jsonResponse(calls.length === 1 ? page1 : page2); };
  const repos = await listPublicDocsRepos("tok", fetchImpl);
  assert.equal(repos.length, 101);
  assert.equal(calls.length, 2);
});

test("listPublicDocsRepos throws on API error", async () => {
  const fetchImpl = async () => jsonResponse({ message: "bad" }, 401);
  await assert.rejects(() => listPublicDocsRepos("tok", fetchImpl), /401/);
});

test("fetchReadme returns raw text", async () => {
  const result = await fetchReadme("tok", "tool-a", async () => ({ ok: true, status: 200, text: async () => "# Hi" }));
  assert.equal(result, "# Hi");
});

test("fetchReadme returns null on 404", async () => {
  const result = await fetchReadme("tok", "tool-a", async () => ({ ok: false, status: 404, text: async () => "" }));
  assert.equal(result, null);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test`
Expected: FAIL — cannot find module `../scripts/lib/github.mjs`.

- [ ] **Step 3: Implement `scripts/lib/github.mjs`**

```js
const API = "https://api.github.com";
const ORG = "alpkit-store";
const TOPIC = "public-docs";

function headers(token, accept) {
  return { Authorization: `Bearer ${token}`, Accept: accept, "X-GitHub-Api-Version": "2022-11-28" };
}

export async function listPublicDocsRepos(token, fetchImpl = fetch) {
  const repos = [];
  for (let page = 1; ; page++) {
    const res = await fetchImpl(`${API}/orgs/${ORG}/repos?per_page=100&page=${page}`, {
      headers: headers(token, "application/vnd.github+json"),
    });
    if (!res.ok) throw new Error(`Listing org repos failed: ${res.status} ${await res.text()}`);
    const batch = await res.json();
    repos.push(...batch);
    if (batch.length < 100) break;
  }
  return repos
    .filter((r) => !r.archived && (r.topics || []).includes(TOPIC))
    .map((r) => ({
      name: r.name,
      description: r.description || "",
      pushedAt: r.pushed_at,
      topics: r.topics || [],
    }));
}

export async function fetchReadme(token, name, fetchImpl = fetch) {
  const res = await fetchImpl(`${API}/repos/${ORG}/${name}/readme`, {
    headers: headers(token, "application/vnd.github.raw+json"),
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`README fetch failed for ${name}: ${res.status} ${await res.text()}`);
  return await res.text();
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add scripts/lib/github.mjs test/github.test.mjs
git commit -m "feat: GitHub API client for opted-in repos and raw READMEs"
```

---

### Task 3: Summariser (`scripts/lib/summarize.mjs`)

**Files:**
- Create: `scripts/lib/summarize.mjs`
- Test: `test/summarize.test.mjs`

- [ ] **Step 1: Write the failing tests**

Create `test/summarize.test.mjs`:

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { generateSummary, CATEGORIES } from "../scripts/lib/summarize.mjs";

function modelResponse(content) {
  return { ok: true, status: 200, json: async () => ({ choices: [{ message: { content } }] }), text: async () => "" };
}

const repo = { name: "x", description: "" };

test("generateSummary parses the model's JSON", async () => {
  const fetchImpl = async () => modelResponse('{"summary": "Does a thing.", "category": "Shopify"}');
  const result = await generateSummary(repo, "# readme", "tok", fetchImpl);
  assert.deepEqual(result, { summary: "Does a thing.", category: "Shopify" });
});

test("generateSummary extracts JSON wrapped in prose or code fences", async () => {
  const fetchImpl = async () => modelResponse('Here you go:\n```json\n{"summary": "S.", "category": "Utilities"}\n```');
  const result = await generateSummary(repo, "# readme", "tok", fetchImpl);
  assert.equal(result.summary, "S.");
});

test("generateSummary falls back to Utilities for an unknown category", async () => {
  const fetchImpl = async () => modelResponse('{"summary": "S.", "category": "Blockchain"}');
  const result = await generateSummary(repo, "# readme", "tok", fetchImpl);
  assert.equal(result.category, "Utilities");
});

test("generateSummary throws when the response has no JSON or empty summary", async () => {
  await assert.rejects(() => generateSummary(repo, "#", "tok", async () => modelResponse("Sorry, no.")), /no JSON/i);
  await assert.rejects(() => generateSummary(repo, "#", "tok", async () => modelResponse('{"summary": "", "category": "Shopify"}')), /summary missing/i);
});

test("generateSummary throws on API error", async () => {
  const fetchImpl = async () => ({ ok: false, status: 429, text: async () => "rate limited", json: async () => ({}) });
  await assert.rejects(() => generateSummary(repo, "#", "tok", fetchImpl), /429/);
});

test("CATEGORIES is the fixed taxonomy", () => {
  assert.deepEqual(CATEGORIES, ["Shopify", "Khaos Control", "Operations & monitoring", "Marketing & members", "Utilities"]);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test`
Expected: FAIL — cannot find module `../scripts/lib/summarize.mjs`. (github tests still pass.)

- [ ] **Step 3: Implement `scripts/lib/summarize.mjs`**

```js
export const CATEGORIES = ["Shopify", "Khaos Control", "Operations & monitoring", "Marketing & members", "Utilities"];

const ENDPOINT = "https://models.github.ai/inference/chat/completions";
const MODEL = "openai/gpt-4.1-mini";
const README_CHAR_LIMIT = 24000;

const SYSTEM_PROMPT = `You write plain-English summaries of internal software tools for non-technical retail company staff.
Respond with ONLY a JSON object: {"summary": "...", "category": "..."}.
- "summary": 2-3 sentences covering what the tool does, who would use it, and what problem it solves. No jargon, no URLs, no hostnames, no credentials, no installation details.
- "category": exactly one of: ${CATEGORIES.join(", ")}.`;

export async function generateSummary(repo, readme, token, fetchImpl = fetch) {
  const res = await fetchImpl(ENDPOINT, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: MODEL,
      temperature: 0.2,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: `Repo name: ${repo.name}\nDescription: ${repo.description}\n\nREADME:\n${readme.slice(0, README_CHAR_LIMIT)}` },
      ],
    }),
  });
  if (!res.ok) throw new Error(`Models API failed: ${res.status} ${await res.text()}`);
  const data = await res.json();
  const text = data.choices?.[0]?.message?.content || "";
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) throw new Error(`Models response contained no JSON: ${text.slice(0, 200)}`);
  const parsed = JSON.parse(match[0]);
  if (typeof parsed.summary !== "string" || !parsed.summary.trim()) throw new Error("Summary missing in model response");
  return {
    summary: parsed.summary.trim(),
    category: CATEGORIES.includes(parsed.category) ? parsed.category : "Utilities",
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test`
Expected: PASS (11 tests).

- [ ] **Step 5: Commit**

```bash
git add scripts/lib/summarize.mjs test/summarize.test.mjs
git commit -m "feat: plain-English summariser via GitHub Models"
```

---

### Task 4: HTML templates (`scripts/lib/render.mjs`)

**Files:**
- Create: `scripts/lib/render.mjs`
- Test: `test/render.test.mjs`

- [ ] **Step 1: Write the failing tests**

Create `test/render.test.mjs`:

```js
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
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test`
Expected: FAIL — cannot find module `../scripts/lib/render.mjs`.

- [ ] **Step 3: Implement `scripts/lib/render.mjs`**

```js
import { CATEGORIES } from "./summarize.mjs";

export function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function formatDate(iso) {
  if (!iso) return "unknown";
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

function layout({ title, root, body }) {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)}</title>
<link rel="icon" type="image/png" href="${root}/assets/favicon.png">
<link rel="stylesheet" href="${root}/styles.css">
</head>
<body>
<header class="topbar">
  <a class="brand" href="${root}/">
    <img src="${root}/assets/logo.png" alt="Alpkit">
    <span><strong>Alpkit Custom Dev</strong><small>In-house tools &amp; integrations</small></span>
  </a>
</header>
<main class="container">
${body}
</main>
<footer class="footer">Generated automatically from repo READMEs. Repos are private &mdash; summaries are public.</footer>
</body>
</html>
`;
}

export function renderIndex(repos) {
  const sections = CATEGORIES.map((cat) => {
    const cards = repos.filter((r) => r.category === cat);
    if (!cards.length) return "";
    return `<section class="category" data-category>
<h2>${escapeHtml(cat)}</h2>
<div class="cards">
${cards.map((r) => `<a class="card" href="./${encodeURIComponent(r.name)}/" data-card data-text="${escapeHtml((r.name + " " + r.summary).toLowerCase())}">
<h3>${escapeHtml(r.name)}</h3>
<p>${escapeHtml(r.summary)}</p>
<span class="meta">Updated ${formatDate(r.pushedAt)}</span>
</a>`).join("\n")}
</div>
</section>`;
  }).filter(Boolean).join("\n");

  const body = `<p class="intro">What our small dev team builds in-house: tools that connect Shopify, Khaos Control and everything in between. Click any card for the full story.</p>
<input id="filter" type="search" placeholder="Filter tools&hellip;" autocomplete="off" aria-label="Filter tools">
<p id="no-matches" hidden>No matches.</p>
${sections}
<script>
var input = document.getElementById("filter");
input.addEventListener("input", function () {
  var q = input.value.toLowerCase().trim();
  var any = false;
  document.querySelectorAll("[data-card]").forEach(function (card) {
    var show = !q || card.getAttribute("data-text").indexOf(q) !== -1;
    card.hidden = !show;
    if (show) any = true;
  });
  document.querySelectorAll("[data-category]").forEach(function (sec) {
    sec.hidden = !sec.querySelector("[data-card]:not([hidden])");
  });
  document.getElementById("no-matches").hidden = any;
});
</script>`;
  return layout({ title: "Alpkit Custom Dev", root: ".", body });
}

export function renderRepoPage(repo) {
  const body = `<nav class="breadcrumb"><a href="../">&larr; All tools</a></nav>
<article>
<h1>${escapeHtml(repo.name)}</h1>
<div class="summary-box">
<p>${escapeHtml(repo.summary)}</p>
<p class="meta">${escapeHtml(repo.category)} &middot; Updated ${formatDate(repo.pushedAt)} &middot; <a href="https://github.com/alpkit-store/${encodeURIComponent(repo.name)}" rel="noreferrer">View on GitHub (requires access)</a></p>
</div>
<div class="readme">
${repo.readmeHtml}
</div>
</article>`;
  return layout({ title: `${repo.name} — Alpkit Custom Dev`, root: "..", body });
}
```

Note: `repo.readmeHtml` is intentionally NOT escaped — it is build-time-rendered markdown from our own opted-in repos (the opt-in topic is the trust gate, per the spec).

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test`
Expected: PASS (15 tests).

- [ ] **Step 5: Commit**

```bash
git add scripts/lib/render.mjs test/render.test.mjs
git commit -m "feat: HTML templates for index cards and repo pages"
```

---

### Task 5: Static assets and build script

**Files:**
- Create: `site/styles.css`
- Move: `assets/logo.png` → `site/assets/logo.png`
- Move: `assets/favicon.png` → `site/assets/favicon.png`
- Create: `scripts/build.mjs`

- [ ] **Step 1: Move brand assets into `site/`**

```bash
mkdir -p site/assets
git mv assets/logo.png site/assets/logo.png
git mv assets/favicon.png site/assets/favicon.png
```

(`assets/marked.min.js` stays put for now — the old `index.html` still loads it until Task 9.)

- [ ] **Step 2: Create `site/styles.css`**

```css
:root {
  --accent: #95c11f;
  --ink: #1d2521;
  --muted: #5f6b64;
  --line: #e3e8e2;
  --bg: #fafbf9;
  --card: #ffffff;
}

* { box-sizing: border-box; }

body {
  margin: 0;
  font-family: system-ui, -apple-system, "Segoe UI", sans-serif;
  color: var(--ink);
  background: var(--bg);
  line-height: 1.55;
}

.topbar {
  background: var(--ink);
  padding: 14px 24px;
}

.brand {
  display: inline-flex;
  align-items: center;
  gap: 12px;
  color: #fff;
  text-decoration: none;
}

.brand img { height: 34px; }
.brand strong { display: block; font-size: 17px; }
.brand small { display: block; color: #aab8af; font-size: 12px; }

.container {
  max-width: 980px;
  margin: 0 auto;
  padding: 28px 24px 60px;
}

.intro {
  font-size: 17px;
  color: var(--muted);
  max-width: 640px;
}

#filter {
  width: 100%;
  max-width: 360px;
  padding: 10px 14px;
  border: 1px solid var(--line);
  border-radius: 8px;
  font-size: 15px;
  margin: 6px 0 18px;
}

#filter:focus { outline: 2px solid var(--accent); border-color: transparent; }

.category h2 {
  font-size: 15px;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--muted);
  border-bottom: 2px solid var(--accent);
  display: inline-block;
  padding-bottom: 4px;
  margin: 28px 0 14px;
}

.cards {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 14px;
}

.card {
  display: block;
  background: var(--card);
  border: 1px solid var(--line);
  border-radius: 10px;
  padding: 16px 18px;
  text-decoration: none;
  color: inherit;
  transition: border-color 0.15s, transform 0.15s;
}

.card:hover { border-color: var(--accent); transform: translateY(-2px); }
.card h3 { margin: 0 0 6px; font-size: 15px; word-break: break-word; }
.card p { margin: 0 0 10px; font-size: 14px; color: var(--muted); }
.card .meta, .meta { font-size: 12px; color: var(--muted); }

.breadcrumb { margin-bottom: 18px; }
.breadcrumb a { color: var(--muted); text-decoration: none; }
.breadcrumb a:hover { color: var(--ink); }

article h1 { font-size: 26px; margin: 0 0 14px; word-break: break-word; }

.summary-box {
  background: var(--card);
  border-left: 4px solid var(--accent);
  border-radius: 0 8px 8px 0;
  padding: 14px 18px;
  margin-bottom: 28px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);
}

.summary-box p { margin: 0 0 8px; }
.summary-box .meta a { color: var(--muted); }

.readme { border-top: 1px solid var(--line); padding-top: 24px; }
.readme img { max-width: 100%; }
.readme pre {
  background: #f0f3ef;
  border: 1px solid var(--line);
  border-radius: 8px;
  padding: 12px;
  overflow-x: auto;
  font-size: 13px;
}
.readme code { background: #f0f3ef; padding: 1px 5px; border-radius: 4px; font-size: 0.92em; }
.readme pre code { background: none; padding: 0; }
.readme table { border-collapse: collapse; display: block; overflow-x: auto; }
.readme th, .readme td { border: 1px solid var(--line); padding: 6px 10px; font-size: 14px; }
.readme a { color: #3a7d22; }

.footer {
  max-width: 980px;
  margin: 0 auto;
  padding: 18px 24px 40px;
  font-size: 13px;
  color: var(--muted);
  border-top: 1px solid var(--line);
}

[hidden] { display: none !important; }
```

- [ ] **Step 3: Create `scripts/build.mjs`**

```js
import { readdir, readFile, writeFile, mkdir, rm, cp } from "node:fs/promises";
import { marked } from "marked";
import { renderIndex, renderRepoPage } from "./lib/render.mjs";

const DATA = "data";
const DIST = "dist";

await rm(DIST, { recursive: true, force: true });
await mkdir(DIST, { recursive: true });

let entries = [];
try {
  entries = await readdir(DATA, { withFileTypes: true });
} catch {
  console.warn("WARN: no data/ directory yet — building an empty site");
}
const names = entries.filter((d) => d.isDirectory()).map((d) => d.name).sort();

const repos = [];
for (const name of names) {
  const meta = JSON.parse(await readFile(`${DATA}/${name}/meta.json`, "utf8"));
  const md = await readFile(`${DATA}/${name}/README.md`, "utf8");
  repos.push({ ...meta, readmeHtml: marked.parse(md) });
}

await writeFile(`${DIST}/index.html`, renderIndex(repos));
for (const repo of repos) {
  await mkdir(`${DIST}/${repo.name}`, { recursive: true });
  await writeFile(`${DIST}/${repo.name}/index.html`, renderRepoPage(repo));
}
await cp("site", DIST, { recursive: true });

console.log(`Built ${repos.length} repo pages into ${DIST}/`);
```

- [ ] **Step 4: Smoke-test the empty build**

Run: `npm test && npm run build`
Expected: tests PASS; build prints `Built 0 repo pages into dist/`; `dist/index.html`, `dist/styles.css`, `dist/assets/logo.png` exist.

- [ ] **Step 5: Commit**

```bash
git add site scripts/build.mjs
git commit -m "feat: static build script and site styles"
```

(The `git mv` in Step 1 already staged the asset moves, so this commit includes them.)

---

### Task 6: Sync orchestrator (`scripts/sync.mjs`)

**Files:**
- Create: `scripts/sync.mjs`

This is a thin orchestrator over the tested libs; it is exercised end-to-end in Task 8 rather than unit-tested.

- [ ] **Step 1: Create `scripts/sync.mjs`**

```js
import { createHash } from "node:crypto";
import { readdir, readFile, writeFile, mkdir, rm } from "node:fs/promises";
import { listPublicDocsRepos, fetchReadme } from "./lib/github.mjs";
import { generateSummary } from "./lib/summarize.mjs";

const DATA = "data";

const orgToken = process.env.ORG_READ_TOKEN;
if (!orgToken) {
  console.error("ORG_READ_TOKEN is required (a PAT with org repo read access)");
  process.exit(1);
}
const modelsToken = process.env.MODELS_TOKEN || orgToken;

const repos = await listPublicDocsRepos(orgToken);
console.log(`Found ${repos.length} repos with the public-docs topic`);

const keep = new Set();
for (const repo of repos) {
  const readme = await fetchReadme(orgToken, repo.name);
  if (readme === null) {
    console.warn(`WARN: ${repo.name} is opted in but has no README — skipped`);
    continue;
  }
  keep.add(repo.name);

  const readmeHash = createHash("sha256").update(readme).digest("hex");
  const dir = `${DATA}/${repo.name}`;

  let existing = null;
  try {
    existing = JSON.parse(await readFile(`${dir}/meta.json`, "utf8"));
  } catch {}

  let { summary, category, summarizedAt } = existing || {};
  if (!summary || existing.readmeHash !== readmeHash) {
    try {
      ({ summary, category } = await generateSummary(repo, readme, modelsToken));
      summarizedAt = new Date().toISOString();
      console.log(`Summarised ${repo.name} (${category})`);
    } catch (err) {
      console.warn(`WARN: summary failed for ${repo.name}: ${err.message}`);
      if (!summary) {
        summary = repo.description || "No summary available yet.";
        category = "Utilities";
      }
    }
  }

  await mkdir(dir, { recursive: true });
  await writeFile(`${dir}/README.md`, readme);
  await writeFile(
    `${dir}/meta.json`,
    JSON.stringify(
      {
        name: repo.name,
        description: repo.description,
        pushedAt: repo.pushedAt,
        topics: repo.topics,
        readmeHash,
        summary,
        category,
        summarizedAt,
      },
      null,
      2
    ) + "\n"
  );
}

let dataEntries = [];
try {
  dataEntries = await readdir(DATA, { withFileTypes: true });
} catch {}
for (const entry of dataEntries) {
  if (entry.isDirectory() && !keep.has(entry.name)) {
    await rm(`${DATA}/${entry.name}`, { recursive: true });
    console.log(`Removed ${entry.name} (no longer opted in)`);
  }
}

console.log("Sync complete");
```

- [ ] **Step 2: Verify it fails cleanly without a token**

Run: `node scripts/sync.mjs` (with `ORG_READ_TOKEN` unset)
Expected: prints the "ORG_READ_TOKEN is required" message and exits with code 1.

- [ ] **Step 3: Commit**

```bash
git add scripts/sync.mjs
git commit -m "feat: sync orchestrator — fetch, hash-compare, summarise, cache"
```

---

### Task 7: GitHub Actions workflow

**Files:**
- Create: `.github/workflows/build.yml`

- [ ] **Step 1: Create `.github/workflows/build.yml`**

```yaml
name: Build and deploy site

on:
  schedule:
    - cron: "17 2 * * *"
  workflow_dispatch:

permissions:
  contents: write
  models: read
  pages: write
  id-token: write

concurrency:
  group: build-deploy
  cancel-in-progress: false

jobs:
  build:
    runs-on: ubuntu-latest
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: 22

      - run: npm ci

      - run: npm test

      - name: Sync repo data
        run: node scripts/sync.mjs
        env:
          ORG_READ_TOKEN: ${{ secrets.ORG_READ_TOKEN }}
          MODELS_TOKEN: ${{ secrets.GITHUB_TOKEN }}

      - name: Commit data changes
        run: |
          git config user.name "github-actions[bot]"
          git config user.email "github-actions[bot]@users.noreply.github.com"
          git add data
          if ! git diff --cached --quiet; then
            git commit -m "Sync repo data"
            git pull --rebase
            git push
          fi

      - name: Build site
        run: node scripts/build.mjs

      - uses: actions/configure-pages@v5

      - uses: actions/upload-pages-artifact@v3
        with:
          path: dist

      - id: deployment
        uses: actions/deploy-pages@v4
```

Notes for the engineer:
- `models: read` lets the built-in `GITHUB_TOKEN` call the Models inference endpoint — that's why `MODELS_TOKEN` is set to `secrets.GITHUB_TOKEN`, while `ORG_READ_TOKEN` (a separately-created PAT) handles private-repo reads.
- The `git pull --rebase` guards against a source repo's legacy push-workflow committing to `main` mid-run.
- The cron is `02:17 UTC` — an off-peak, non-round time to dodge the top-of-hour Actions rush.

- [ ] **Step 2: Validate YAML parses**

Run: `npx --yes yaml-lint .github/workflows/build.yml`
Expected: `valid YAML file`. (GitHub will also reject an invalid workflow file on push — the Actions tab shows a parse error banner.)

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/build.yml
git commit -m "feat: nightly sync + build + Pages deploy workflow"
```

---

### Task 8: Local end-to-end dry run

**Files:** none created — this validates Tasks 1–6 against real data.

The local `gh` CLI token can read org repos, so it can stand in for `ORG_READ_TOKEN`. It will likely get a 401/404 from the Models endpoint (it lacks the models scope) — that is **expected and useful**: it exercises the description-fallback path. Real summaries are generated on the first Actions run.

- [ ] **Step 1: Opt in a pilot repo**

Run: `gh repo edit alpkit-store/clook-ftp-monitor --add-topic public-docs`
Expected: command succeeds; `gh repo view alpkit-store/clook-ftp-monitor --json repositoryTopics` shows the topic.

- [ ] **Step 2: Run sync locally**

PowerShell:
```powershell
$env:ORG_READ_TOKEN = gh auth token
node scripts/sync.mjs
```
Expected: `Found 1 repos with the public-docs topic`; either `Summarised clook-ftp-monitor (...)` or `WARN: summary failed ... ` followed by a successful write. `data/clook-ftp-monitor/README.md` and `meta.json` exist; `meta.json` has a non-empty `summary` (the repo description if the Models call failed).

- [ ] **Step 3: Build and inspect**

Run: `node scripts/build.mjs`
Expected: `Built 1 repo pages into dist/`.

Open `dist/index.html` in a browser (`Invoke-Item dist/index.html`). Verify: card appears under its category, filter box hides it when typing garbage, clicking the card opens the repo page with rendered README, back link returns to index.

- [ ] **Step 4: Commit the synced data**

```bash
git add data
git commit -m "chore: seed data cache from pilot sync"
```

---

### Task 9: Retire the old site files

**Files:**
- Delete: `index.html`, `styles.css`, `repos.json`, `assets/marked.min.js`
- Keep: `readmes/` (legacy push-workflows in ~10 source repos still commit there; sweep them separately, then delete `readmes/`)

- [ ] **Step 1: Remove superseded files**

```bash
git rm index.html styles.css repos.json assets/marked.min.js
```

- [ ] **Step 2: Run tests + build to confirm nothing referenced them**

Run: `npm test && npm run build`
Expected: PASS / builds.

- [ ] **Step 3: Commit**

```bash
git commit -m "chore: retire runtime-rendered site (replaced by static build)"
```

---

### Task 10: Rewrite README with setup + operations doc

**Files:**
- Modify: `README.md` (currently one line)

- [ ] **Step 1: Replace `README.md` content**

```markdown
# alpkit-store.github.io

Public showcase of Alpkit's in-house tools, generated automatically from repo READMEs.
Live at <https://alpkit-store.github.io>.

## How a repo gets on the site

Add the **`public-docs`** topic to the repo (repo page → ⚙ next to About → Topics).
That's it — the nightly build picks it up. Remove the topic to take it down.

> Adding the topic publishes the repo's README **verbatim** on the public internet.
> Check it for hostnames, URLs, credentials and anything else sensitive first.
> The AI-generated card summary is instructed to exclude such details, but the full README is shown as-is.

## How it works

`.github/workflows/build.yml` runs nightly (02:17 UTC) and on manual dispatch:

1. `scripts/sync.mjs` — lists org repos tagged `public-docs`, fetches READMEs,
   and (only when a README changed) generates a plain-English summary + category
   via GitHub Models (`openai/gpt-4.1-mini`, free tier). Results are cached in `data/`.
2. `scripts/build.mjs` — renders `data/` to static HTML in `dist/` (index of summary
   cards grouped by category + one page per repo with the full README).
3. Deploys `dist/` to GitHub Pages.

Run locally: `$env:ORG_READ_TOKEN = gh auth token; npm run sync; npm run build`
(the Models call may fail locally — the card falls back to the repo description).
Tests: `npm test`.

## Operations

| Thing | Detail |
|---|---|
| `ORG_READ_TOKEN` secret | Fine-grained PAT, resource owner `alpkit-store`, all repos, **Contents: read** + **Metadata: read**. Max expiry is 1 year — **renew annually** (calendar reminder!). |
| Models auth | The workflow's own `GITHUB_TOKEN` with `models: read` — nothing to renew. |
| Stale cron | GitHub suspends scheduled workflows after ~60 days without repo activity. A `workflow_dispatch` run re-enables it. |
| Failures | GitHub emails the repo admins when the workflow fails. A Models outage degrades gracefully to cached/fallback summaries. |
| `readmes/` (legacy) | Old push-synced READMEs. ~10 source repos still have push-workflows committing here; once those are removed, delete this folder. |
```

- [ ] **Step 2: Commit**

```bash
git add README.md
git commit -m "docs: rewrite README for the zero-touch pipeline"
```

---

### Task 11: Manual setup checklist (user actions — cannot be automated)

These are one-time actions for James in the GitHub UI. The implementing engineer should surface this list at the end, not attempt it.

- [ ] Org settings → Third-party Access → Personal access tokens: allow fine-grained PATs (if currently restricted).
- [ ] Create the fine-grained PAT: <https://github.com/settings/personal-access-tokens/new> — resource owner **alpkit-store**, repository access **All repositories**, permissions **Contents: Read-only** + **Metadata: Read-only**, expiry 1 year.
- [ ] Add it as the `ORG_READ_TOKEN` Actions secret on this repo (Settings → Secrets and variables → Actions).
- [ ] Org settings → Models: enable GitHub Models for org repositories.
- [ ] This repo: Settings → Pages → Build and deployment → Source: **GitHub Actions** (currently "Deploy from a branch").
- [ ] Push `main`, then run the workflow once via Actions → "Build and deploy site" → Run workflow. Verify the live site shows the pilot repo with a real AI summary.
- [ ] Add `public-docs` topics to the rest of the repos that should be listed.
- [ ] Later sweep: remove the README push-workflows from the ~10 source repos, then delete `readmes/` here.
```
