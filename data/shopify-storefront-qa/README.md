# shopify-storefront-qa

QA harnesses for the Alpkit Shopify storefront, run against the **live site** through
[Browserbase](https://browserbase.com) cloud browsers (which pass the storefront's
Cloudflare bot protection — plain scripted fetches do not).

## Bike basket sweep

Verifies that every Sonder bike can genuinely be added to the basket: for each bike in
`/collections/sonder-bikes`, a real browser loads the PDP, selects an in-stock
size/colour through the actual UI radios, clicks the real **Add to basket** button,
confirms via `/cart.js` that the bike landed with its `_bundleProduct_*` component
properties, then clears the cart. No orders are created; carts are not left populated.

This complements the in-theme bike-builder audit page (`/pages/bike-builder-audit`):
the audit validates component data; the sweep validates the shopper-facing outcome.

### Setup

```
npm install
```

Credentials (User-scope env vars on Windows, or export in shell):

- `BROWSERBASE_API_KEY`
- `BROWSERBASE_PROJECT_ID`

### Run

```
npm run sweep              # all bikes (~30-50 min, ~1-2 Browserbase browser-hours)
npm run sweep:smoke        # first 5 bikes (~3 min) — sanity check
node src/sweep.js --collection sonder-bikes --workers 3 --base https://alpkit.com
```

Output goes to `reports/<timestamp>/`:

- `summary.md` — human-readable result, failures with Browserbase session-replay links,
  plus the list of bikes whose first-choice size/colour was out of stock
- `summary.json` — machine-readable equivalent
- `attempts.jsonl` — every attempt with timing, combo chosen, bundle-prop count

Exit code: `0` all verified, `1` genuine failures remain after retries, `2` crash/config.

### How it copes with live-site noise (learned the hard way)

- **Out-of-stock sizes are not disabled in the DOM** — the theme JS silently blocks
  submit. The sweep reads the frame product's `/products/<frame>.js` (frame handle
  comes from the bike's `default_Frame_Frame_*` tag) and selects a known in-stock
  combo; if that fails it falls back to walking combos, detecting blocked submits as
  "no POST to /cart/add within the timeout".
- **US geo modal** — sessions run on US IPs (proxies need a paid Browserbase plan), so
  the "Redirect to Alpkit US Store?" prompt is dismissed on every page load.
- **Shopify 429s** on `/cart/add` after rapid add/clear cycles → small session batches,
  failed bikes retried in pristine one-bike sessions (2 retry passes).
- **Slow PDPs** (Transmitter/Dial/camino-al-v3 can take 100s+) → generous timeouts,
  session batches of 6 so one slow page can't poison a long session.
- After form submit, wait for the `/cart` redirect before fetching `/cart.js` —
  fetching mid-navigation destroys the evaluate context.

### Cost note

A full sweep uses roughly 1–2 Browserbase browser-hours. The free plan includes
60 min/month, so regular scheduled runs need a paid plan.
