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

## Device matrix

Checks one or more PDPs across emulated phones, tablets and a desktop, all with local
browsers, so it uses no Browserbase minutes. iPhone and iPad presets run in Playwright's
WebKit (Safari's engine), and Android and desktop run in local Chrome. For each device it:

- loads the PDP with an in-stock variant pre-selected, on the live theme or a UAT theme
- where the theme pins the add to basket button (the sticky A/B arm, at 980px and below),
  scrolls through the pin point 2px at a time, down and back up. It checks the button
  changes over once each way without jumping, nothing below it shifts anywhere a customer
  could see, and the empty slot closes up. Scrolled further, it checks the bar sits on
  the bottom edge, the button is tappable at five points along it, and the Gorgias
  launcher doesn't overlap it
- taps the real button, confirms the item reaches `/cart.js` and the cart drawer opens,
  records which handler sent the add, then clears the cart
- records the `alpkit:*` A/B events in Shopify's pixel POSTs
- checks the bar lets go back at the top, and screenshots each device

It removes the cookie banner, the rewards popup and the Shopify preview bar before
measuring. On a preview theme the preview bar's fixed wrapper sits over any fixed-bottom
UI and swallows taps, and customers never see it.

### Setup

Once per machine, after `npm install`:

```
npm run devices:setup      # installs the WebKit build that matches playwright-core
```

Use this, not `npx playwright install webkit`. That pulls the latest `playwright`
package, which can fetch a WebKit build that doesn't match the `playwright-core`
version this repo pins.

### Run

```
npm run devices -- --handles rhythm-ss-cycling-jersey-mens --theme 163500195945
npm run devices -- --handles a,b --devices "iPhone 15,Pixel 7"
npm run devices -- --handles a --devices "Pixel 7,iPhone 15" --safe-area 34
```

In PowerShell, use `npm.cmd run devices -- ...` or `node src/device-matrix.js ...`.
PowerShell strips the `--` when it calls `npm.ps1`, so the flags never reach the script.

Options:

- `--handles a,b`: product handles (required)
- `--theme ID`: run on an unpublished UAT theme via `?preview_theme_id=`
- `--devices`: Playwright device presets, comma separated. The default is iPhone SE (3rd gen),
  iPhone 15, iPhone 15 Pro Max, iPad (gen 7), Pixel 7, Galaxy S24, Galaxy Tab S9 and
  Desktop Chrome.
- `--safe-area N`: fake an N px bottom safe-area inset (the iPhone home indicator is 34).
  This works on Chrome devices only, because WebKit can't emulate it.
- `--delay MS`: pause between devices (default 1500) to stay under Cloudflare's rate limit
- `--no-add`: skip the add to basket step

Output goes to `reports/<timestamp>-devices/`: `summary.md` (a table per device, plus
failures and warnings), `summary.json`, and `*--top.png` / `*--scrolled.png` screenshots.

Exit code: `0` every device passed, `1` at least one failure, `2` crash/config.

### Limits

This is emulation. WebKit on Windows has no iOS toolbar, no home indicator and no
iOS-only tap behaviour, and `env(safe-area-inset-*)` is always 0 there. It catches
layout, stacking, JS and engine differences. A real iPhone, the Xcode iOS Simulator or a
device cloud is still the final word on iOS.

Products whose button the server renders as `BIS_trigger` (closed-but-buyable variants)
fail the drawer check, because their add goes through `product.js`'s bare submit handler
(alpkit-store/alpkit#202). That's a real bug, not harness noise. Upsell products skip
the add step, because their button opens the upsell popup first.
