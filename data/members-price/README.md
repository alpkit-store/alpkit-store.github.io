# Members Price

Logged-in customers on the Alpkit Shopify Plus UK store receive a per-product
members price applied automatically in cart, mini-cart, cart drawer, and at
checkout. All logged-in customers are members.

Three artefacts:

| Folder | Deliverable |
|--------|-------------|
| `metafield-definitions/` | `custom.members_price` (money type) product metafield definition + idempotent install script |
| `theme-snippet/` | Liquid snippet + SCSS partial + integration doc for `alpkit` |
| `discount-function/` | TypeScript Shopify Discount Function (`cart.lines.discounts.generate.run` target) |

Design spec: [`docs/superpowers/specs/2026-04-28-members-price-design.md`](Development/Alpkit/members-price/docs/superpowers/specs/2026-04-28-members-price-design.md)powers/specs/2026-04-28-members-price-design.md)

## Prerequisites

- Node 20+
- Shopify CLI 3.78+ (`npm install -g @shopify/cli@latest`)
- A custom-app token on `alpkit-sonder.myshopify.com` with `write_products` scope (for metafield install)
- Partner Dashboard access for the Discount Function app

## Deploy order

Each step is independently rollback-able. Steps 1–4 ship the cart/checkout
discount; step 5 ships the PDP display. They can be deployed apart.

### 1. Metafield definition

The legacy in-Admin **Settings → Apps → Develop apps** flow that produced
`shpat_...` tokens has been removed. Two current paths:

#### 1a. Recommended: Shopify CLI `store auth` + `store execute` (no token file)

Requires Shopify CLI **3.93.0+** (`shopify version` to check; `npm install -g @shopify/cli@latest` to upgrade).

```bash
shopify store auth --store alpkit-sonder.myshopify.com --scopes write_products
```

Browser opens; log in and approve. Token is cached in the CLI keychain.

**bash / zsh:**

```bash
shopify store execute --store alpkit-sonder.myshopify.com --allow-mutations \
  --query 'mutation CreateMembersPriceDefinition($definition: MetafieldDefinitionInput!) { metafieldDefinitionCreate(definition: $definition) { createdDefinition { id namespace key } userErrors { code field message } } }' \
  --variables '{"definition":{"name":"Members Price","namespace":"custom","key":"members_price","description":"Member-only price for logged-in customers. Applied at checkout via the Members Price discount function when the product is also tagged members-price.","type":"money","ownerType":"PRODUCT","pin":true,"access":{"storefront":"PUBLIC_READ"}}}'
```

**PowerShell** (uses single-quoted here-strings — closing `'@` MUST be at column 0):

```powershell
$query = @'
mutation CreateMembersPriceDefinition($definition: MetafieldDefinitionInput!) {
  metafieldDefinitionCreate(definition: $definition) {
    createdDefinition { id namespace key }
    userErrors { code field message }
  }
}
'@

$variables = @'
{"definition":{"name":"Members Price","namespace":"custom","key":"members_price","description":"Member-only price for logged-in customers. Applied at checkout via the Members Price discount function when the product is also tagged members-price.","type":"money","ownerType":"PRODUCT","pin":true,"access":{"storefront":"PUBLIC_READ"}}}
'@

shopify store execute --store alpkit-sonder.myshopify.com --allow-mutations --query $query --variables $variables
```

Re-running prints a `TAKEN` userError — harmless, the definition already exists.

#### 1b. Alternative: `install.mjs` script (needs token)

Use when you want the idempotent script behaviour (clean exit 0 on re-run, scripted in CI). Get a token via the [Dev Dashboard](https://shopify.dev/dashboard): create a custom app, add `write_products` scope, install on the store, copy the Admin API access token.

**bash / zsh:**

```bash
SHOPIFY_STORE=alpkit-sonder \
  SHOPIFY_ADMIN_TOKEN=shpat_... \
  npm run install-metafield
```

**PowerShell:**

```powershell
$env:SHOPIFY_STORE = "alpkit-sonder"
$env:SHOPIFY_ADMIN_TOKEN = "shpat_..."
npm run install-metafield
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

Deploy releases only what is on disk. The live version (members-price-discount-5, 29 Apr 2026) also has a
UI extension, `members-price-settings`, that isn't in this repo, so deploying from this checkout removes it
from every store. Add its folder under `discount-function/extensions/` before deploying.

### 4. Create the automatic discount

In Shopify Admin → Discounts → Create discount → Function-based discount →
select `members-price-discount` → Save. No expiry, applies to all customers
(eligibility is enforced inside the Function).

The admin gives the new discount the PRODUCT and ORDER discount classes, and has no setting to change
them. The Function only returns product discounts, but Shopify still counts ORDER when deciding what
combines, so codes that don't combine with order discounts (all Member Rewards codes) get refused for
the whole order. Set it to PRODUCT only straight after creating it:

```powershell
pwsh -File scripts/Set-MembersPriceProductOnly.ps1 -Store <store>.myshopify.com
```

It runs as this app (client credentials grant, asks for the client secret from the Dev Dashboard), so
the store must have approved the app's `write_discounts` scope first: open the app in the admin after
deploying and accept the new permission.

To stack with Member Rewards codes, the discount also needs the tag `members-price` and, under
Combinations, product discounts with "Combine on same product with discounts tagged" `member-rewards`.

### 5. Theme snippet PR

Follow `theme-snippet/INTEGRATION.md`. Five small changes in
`alpkit`, opened as a PR, merged via the existing auto-deploy
workflow.

## Verification

Run agains[design spec §6](Development/Alpkit/members-price/docs/superpowers/specs/2026-04-28-members-price-design.md#6-production-verification-checklist)e/docs/superpowers/specs/2026-04-28-members-price-design.md#6-production-verification-checklist)
for the full 12-item checklist.

## Rollback

| Artefact | How |
|----------|-----|
| Discount function | Toggle off the automatic discount in Admin (instant, no deploy) |
| Function code | `shopify app versions list` → `shopify app release --version=<prev>` |
| Theme snippet | Revert the PR in `alpkit`; auto-deploys |
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
