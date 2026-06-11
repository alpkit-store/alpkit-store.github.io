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
