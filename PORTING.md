# Porting the new design into the generator

Two files change. Both are drop-in replacements that keep the existing
function signatures, so `scripts/build.mjs` and `npm test` work unchanged.

## 1. `site/styles.css`
Replace your current `site/styles.css` with the one in `port/site/styles.css`.
It defines the Alpkit palette, Barlow type, the five category accent tokens
(`--cat-shopify`, `--cat-khaos`, `--cat-ops`, `--cat-marketing`,
`--cat-utilities`) and all component styles for the index and repo pages.
Your existing `site/assets/logo.png` + `favicon.png` are reused as-is.

## 2. `scripts/lib/render.mjs`
Replace with `port/scripts/lib/render.mjs`. It still exports
`renderIndex(repos)`, `renderRepoPage(repo)` and `escapeHtml(s)` with the
same inputs (the repo objects build.mjs already passes). New here:
fonts are pulled from Google Fonts, the hero/stats/filter/quick-jump are
added, and a small `CAT_META` map turns each category into a slug + accent.

## Will new repos "just work"?
Yes. Add the `public-docs` topic and the nightly build renders a new card
and detail page automatically — no per-repo components. Card colour, chip
and detail accent come from the repo's **category**, and the summariser is
constrained to the five known categories (anything else buckets into
Utilities), so nothing can render unstyled.

## Adding a brand-new *category* (rare)
This is the only manual case. Do all three:
1. add it to `CATEGORIES` in `scripts/lib/summarize.mjs`
2. add a `--cat-<name>` colour to `:root` in `site/styles.css`
3. add one line to `CAT_META` in `render.mjs` (`slug` + `accent`)

## Verify locally
```
npm run sync   # or skip if data/ is already populated
npm run build
npm test
```
Then open `dist/index.html`.
