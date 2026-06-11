# Members Price

Logged-in customers on the Alpkit Shopify Plus UK store receive a per-product
members price applied automatically in cart, mini-cart, cart drawer, and at
checkout. All logged-in customers are members.

Three artefacts:

| Folder | Deliverable |
|--------|-------------|
| `metafield-definitions/` | `custom.members_price` (money type) product metafield definition + idempotent install script |
| `theme-snippet/` | Liquid snippet + SCSS partial + integration doc for `GloandCo/alpkit` |
| `discount-function/` | TypeScript Shopify Discount Function (`cart.lines.discounts.generate.run` target) |

Design spec: [`docs/superpowers/specs/2026-04-28-members-price-design.md`](docs/superpowers/specs/2026-04-28-members-price-design.md)

## Prerequisites

- Node 20+
- Shopify CLI 3.78+ (`npm install -g @shopify/cli@latest`)
- A custom-app token on `alpkit-sonder.myshopify.com` with `write_products` scope (for metafield install)
- Partner Dashboard access for the Discount Function app

## Deploy order

Each step is independently rollback-able. Steps 1–4 ship the cart/checkout
discount; step 5 ships the PDP display. They can be deployed apart.

### 1. Metafield definition

```bash
cd metafield-definitions
SHOPIFY_STORE=alpkit-sonder \
  SHOPIFY_ADMIN_TOKEN=shpat_... \
  node install.mjs
```

Re-running is safe — the script logs "exists" and exits 0 if already installed.

### 2. Tag and value on a test product

In Shopify Admin → Products → pick a test product:

- Add the tag `members-price`
- Set the `custom.members_price` field to a value below the variant price

### 3. Function deploy

```bash
cd discount-function
shopify app deploy
```

(First-time setup: `shopify app config link` to bind to the existing
`members-price-discount` app, or `shopify app init` to create one.)

### 4. Create the automatic discount

In Shopify Admin → Discounts → Create discount → Function-based discount →
select `members-price-discount` → Save. No expiry, applies to all customers
(eligibility is enforced inside the Function).

### 5. Theme snippet PR

Follow `theme-snippet/INTEGRATION.md`. Five small changes in
`GloandCo/alpkit`, opened as a PR, merged via the existing auto-deploy
workflow.

## Verification

Run against the live UK store after each deploy step. See
[design spec §6](docs/superpowers/specs/2026-04-28-members-price-design.md#6-production-verification-checklist)
for the full 12-item checklist.

## Rollback

| Artefact | How |
|----------|-----|
| Discount function | Toggle off the automatic discount in Admin (instant, no deploy) |
| Function code | `shopify app versions list` → `shopify app release --version=<prev>` |
| Theme snippet | Revert the PR in `GloandCo/alpkit`; auto-deploys |
| Metafield definition | Leave in place (harmless). Manual delete via Admin if required |
| Tag / metafield values | Bulk-clear via Matrixify export → edit → re-import |

## Multi-store rollout (future)

The code is store-agnostic. EU and US deploys are the same five steps with
different `SHOPIFY_STORE` / `SHOPIFY_ADMIN_TOKEN` env vars and a separate
Function app + Admin discount per store. No code changes required.

## Open considerations

- **Cart-line rendering verification.** gloandco-theme's existing cart-line
  template likely already renders `line_item.discount_allocations` (it
  served Discount Ninja allocations until that app was removed). Verify by
  reading the cart drawer/page snippet and checking that `Member price
  −£X.XX` appears beneath an eligible line. If absent, add a minimal
  display.
- **Member-rewards-tool independence.** The PHP `member-rewards-tool`
  generates per-customer discount codes via Klaviyo. These are independent
  of the Function-based members price (different layers — code-based vs
  automatic line discount). No conflict.
- **Localisation.** Snippet labels are hardcoded English at v1. Swap to
  `'…' | t` lookups when EU/US adopts.

## Tests

```bash
# Metafield install script (6 tests)
node --test metafield-definitions/install.test.mjs

# Discount function (8 tests)
cd discount-function/extensions/members-price-discount && npm test
```
