import { CATEGORIES } from "./summarize.mjs";

export function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function formatDate(iso) {
  if (!iso) return "unknown";
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

// Category → URL slug (for #anchors / quick-jump) + CSS accent variable.
// The accent vars are defined in site/styles.css (:root). Adding a NEW category
// means: add it to CATEGORIES in summarize.mjs, add a --cat-* var to styles.css,
// and add one line here. New *repos* need nothing.
const CAT_META = {
  "Shopify":                { slug: "shopify",   accent: "var(--cat-shopify)" },
  "Khaos Control":          { slug: "khaos",     accent: "var(--cat-khaos)" },
  "Operations & monitoring":{ slug: "ops",       accent: "var(--cat-ops)" },
  "Marketing & members":    { slug: "marketing", accent: "var(--cat-marketing)" },
  "Utilities":              { slug: "utilities", accent: "var(--cat-utilities)" },
};

// Any category the model returns that isn't in CATEGORIES is bucketed into Utilities.
function resolveCategory(category) {
  return CATEGORIES.includes(category) ? category : "Utilities";
}
function catMeta(category) {
  return CAT_META[resolveCategory(category)] || CAT_META["Utilities"];
}

const SEARCH_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="7"></circle><line x1="21" y1="21" x2="16.5" y2="16.5"></line></svg>';
const GITHUB_SVG = '<svg viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0016 8c0-4.42-3.58-8-8-8z"/></svg>';

function layout({ title, root, body }) {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)}</title>
<link rel="icon" type="image/png" href="${root}/assets/favicon.png">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Barlow+Semi+Condensed:wght@500;600;700;800&family=Barlow:wght@300;400;500;600;700&display=swap">
<link rel="stylesheet" href="${root}/styles.css">
</head>
<body>
<header class="masthead">
  <div class="wrap masthead__inner">
    <a class="brand" href="${root}/">
      <img src="${root}/assets/logo.png" alt="Alpkit">
      <span class="brand__sep"></span>
      <span class="brand__txt">
        <strong>Custom Dev</strong>
        <small>In-house tools &amp; integrations</small>
      </span>
    </a>
    <span class="masthead__spacer"></span>
    <a class="masthead__link" href="https://github.com/alpkit-store" rel="noreferrer">GitHub org</a>
  </div>
</header>
${body}
<footer class="footer">
  <div class="wrap footer__inner">
    <span class="footer__badge"><span class="pulse"></span>Auto-built nightly from repo READMEs</span>
    <span class="footer__spacer"></span>
    <span><strong>Alpkit Custom Dev</strong> &mdash; repos are private; summaries are public.</span>
  </div>
</footer>
</body>
</html>
`;
}

export function renderIndex(repos) {
  const present = CATEGORIES.filter((cat) => repos.some((r) => resolveCategory(r.category) === cat));
  const total = repos.length;
  const lastUpdated = repos.map((r) => r.pushedAt).filter(Boolean).sort().pop();
  const lastUpdatedStr = formatDate(lastUpdated);
  const [lastDay, ...lastRest] = lastUpdatedStr.split(" ");

  const chips = present.map((cat) => {
    const m = catMeta(cat);
    const n = repos.filter((r) => resolveCategory(r.category) === cat).length;
    return `<a class="chip" href="#${m.slug}" style="--dot:${m.accent}"><span class="dot"></span>${escapeHtml(cat)} <span class="n">${n}</span></a>`;
  }).join("\n        ");

  const sections = present.map((cat) => {
    const m = catMeta(cat);
    const list = repos.filter((r) => resolveCategory(r.category) === cat);
    const cards = list.map((r) => {
      const text = escapeHtml(`${r.name} ${r.description || ""} ${r.summary}`.toLowerCase());
      const desc = r.description ? `\n          <p class="card__desc">${escapeHtml(r.description)}</p>` : "";
      return `<a class="card" href="./${encodeURIComponent(r.name)}/" data-card data-text="${text}">
          <span class="card__tag"><span class="dot"></span>${escapeHtml(cat)}</span>
          <h3 class="card__name">${escapeHtml(r.name)}</h3>${desc}
          <p class="card__summary">${escapeHtml(r.summary)}</p>
          <span class="card__foot">
            <span class="card__meta">Updated ${formatDate(r.pushedAt)}</span>
            <span class="card__arrow">Open &rarr;</span>
          </span>
        </a>`;
    }).join("\n        ");
    return `<section class="category" id="${m.slug}" data-category style="--accent:${m.accent}">
        <div class="category__head">
          <h2>${escapeHtml(cat)}</h2>
          <span class="category__count">${list.length} tool${list.length === 1 ? "" : "s"}</span>
          <span class="category__spacer"></span>
        </div>
        <div class="cards">
        ${cards}
        </div>
      </section>`;
  }).join("\n\n      ");

  const body = `<section class="hero">
  <div class="wrap hero__inner">
    <p class="hero__eyebrow">The Alpkit dev workshop</p>
    <h1>What our small team builds <em>in&#8209;house.</em></h1>
    <p class="hero__lede">The tools that connect Shopify, Khaos Control, Amazon and everything in between &mdash; quietly keeping stock, orders, prices and members in sync. Click any card for the full story.</p>
    <div class="hero__stats">
      <div class="stat">
        <div class="stat__num">${total}</div>
        <div class="stat__label">Tools documented</div>
      </div>
      <div class="stat">
        <div class="stat__num">${present.length}</div>
        <div class="stat__label">Categories</div>
      </div>
      <div class="stat">
        <div class="stat__num">${escapeHtml(lastDay)}<span class="unit">${escapeHtml(lastRest.join(" "))}</span></div>
        <div class="stat__label">Last updated</div>
      </div>
    </div>
  </div>
</section>

<div class="toolbar">
  <div class="wrap toolbar__inner">
    <label class="search">
      ${SEARCH_SVG}
      <input id="filter" type="search" placeholder="Filter tools&hellip;" autocomplete="off" aria-label="Filter tools">
    </label>
    <nav class="chips">
        ${chips}
    </nav>
  </div>
</div>

<main class="wrap catalogue">
  <p class="no-matches" id="no-matches" hidden>No tools match that search.</p>

      ${sections}
</main>

<script>
(function () {
  var input = document.getElementById("filter");
  if (!input) return;
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
})();
</script>`;

  return layout({ title: "Alpkit Custom Dev — in-house tools", root: ".", body });
}

export function renderRepoPage(repo) {
  const m = catMeta(repo.category);
  const cat = resolveCategory(repo.category);
  const desc = repo.description
    ? `<span>${escapeHtml(repo.description)}</span>\n        <span class="sep">&bull;</span>\n        `
    : "";
  const topics = repo.topics && repo.topics.length ? escapeHtml(repo.topics.join(", ")) : "&mdash;";

  const body = `<main class="wrap detail" style="--accent:${m.accent}">
  <nav class="breadcrumb"><a href="${"../"}">&larr; All tools</a></nav>

  <div class="detail__grid">
    <article class="article">
      <span class="article__tag"><span class="dot"></span>${escapeHtml(cat)}</span>
      <h1>${escapeHtml(repo.name)}</h1>

      <div class="summary-panel">
        <p class="summary-panel__label">In plain English <span class="ai">AI summary</span></p>
        <p>${escapeHtml(repo.summary)}</p>
      </div>

      <div class="metarow">
        ${desc}<span>Updated ${formatDate(repo.pushedAt)}</span>
        <a class="gh" href="https://github.com/alpkit-store/${encodeURIComponent(repo.name)}" rel="noreferrer">
          ${GITHUB_SVG}
          View on GitHub
        </a>
        <span class="sep">&bull;</span>
        <span>Private &mdash; requires access</span>
      </div>

      <div class="readme">
${repo.readmeHtml}
      </div>
    </article>

    <aside class="aside">
      <div class="aside__head">Quick facts</div>
      <dl style="margin:0">
        <div class="aside__row"><dt>Category</dt><dd><span class="swatch"></span>${escapeHtml(cat)}</dd></div>
        <div class="aside__row"><dt>Last updated</dt><dd>${formatDate(repo.pushedAt)}</dd></div>
        <div class="aside__row"><dt>Topics</dt><dd>${topics}</dd></div>
        <div class="aside__row"><dt>Visibility</dt><dd>Private repo</dd></div>
        <div class="aside__row"><dt>Summary</dt><dd>AI-generated</dd></div>
      </dl>
    </aside>
  </div>
</main>`;

  return layout({ title: `${repo.name} — Alpkit Custom Dev`, root: "..", body });
}
