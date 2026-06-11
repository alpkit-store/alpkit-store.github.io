# Shopify Checkout Functions

Shopify Functions for Alpkit checkout rules.

## Extensions

| Extension | Function API | Purpose |
|---|---|---|
| `block-free-items` | Cart Transform | Prevents free items from being purchased unless they belong to a bike build, product bundle, or are explicitly tagged as free. |
| `destination-shipping-restrictions` | Delivery Customization | Hides all delivery options when restricted products are in the cart for the destination country. |
| `mbr-discount-exclusivity` | Discount (automatic) | Rejects all but the first `MBR*` member-reward code entered per order, so only one applies. |
| `app-home` | App Home (UI extension) | Read-only admin landing page summarising the three functions and showing each one's live activation status for the current store. |

## Free Item Validation

The extension runs as a serverless function during Shopify's cart transformation step at checkout. It inspects every cart line and applies the following logic:

1. Scans all cart lines for items with a price of `$0.00`
2. For each free item, checks whether it has a valid reason to be free:
   - `_bikeComponent` cart line attribute is `"true"`
   - `_bundleComponent` cart line attribute is `"true"`
   - Product has the `freeItem` tag
3. If none of those conditions are met, the item is blocked by setting its price to `$999.99` with a message indicating it cannot be purchased separately

Paid items are always left untouched.

## Bundle Pricing

Replaces the legacy Shopify Script `shopify_scripts_bundle price discount.rb` (Scripts platform deprecated 2026-06-30). Runs in the same `block-free-items` Cart Transform extension as the free-item validator — both share one function because Shopify allows only one Cart Transform Function per app per store.

The `alpkit` theme attaches these line item properties when a bundle is added to cart (`src/scripts/modules/product-bundle.js`):

| Property | Role |
|---|---|
| `_bundle_parent` | Marks the bundle header line |
| `_bundle_free` | Marks a bundle child (gets discounted to £0) |
| `_bundle_id` | Bundle product variant ID (informational; the function does not use it) |
| `_bundle_instance_id` | Unique per "add bundle to cart" event — used as the linkage key |

Rules:

| Line state | Result |
|---|---|
| `_bundle_free` line with matching parent (same `_bundle_instance_id`) in cart | Price set to £0, title "Bundle item" |
| `_bundle_free` line with no matching parent (orphan) | Price set to £999.99, title "Bundle parent removed — please re-add bundle" |
| `_bundle_free` line with no `_bundle_instance_id` at all | Treated as orphan (£999.99) — fails closed |
| Any other line | Free-item validation rules apply |

Strict pairing on `_bundle_instance_id` (not `_bundle_id`) prevents an abuse vector where customers add two of the same bundle and remove one parent while keeping both child sets free. Bundle handling runs before the free-item branch — a `_bundle_free` line never falls through to the free-item logic.

## Destination Shipping Restrictions

The delivery customization extension replaces the legacy Shopify Shipping Script that used `hide EU` and `hide INT` product tags.

Rules:

| Destination | Product tag | Result |
|---|---|---|
| EU/EEA | `hide EU` | Hide all delivery options |
| International, excluding UK and EU/EEA | `hide INT` | Hide all delivery options |
| UK (`GB`, `IM`, `JE`, `GG`) | Either tag | No change |

EU/EEA country codes are: `AT`, `BE`, `BG`, `CY`, `CZ`, `EE`, `FI`, `FR`, `DE`, `GR`, `HR`, `HU`, `IE`, `IS`, `IT`, `LI`, `LV`, `LT`, `LU`, `MT`, `NO`, `NL`, `PL`, `PT`, `RO`, `SK`, `SI`, `ES`, `SE`.

### Activation

This is an extension-only app, so the **Settings → Shipping and delivery → Customizations → Add customization** flow lands on a blank app page. The function has to be activated once per store via the `deliveryCustomizationCreate` mutation. The customization persists across deploys.

The mutation must run authenticated as the cart-validation app (a store's GraphiQL App or unrelated custom app won't work — it'll error with "Function ... not found").

#### Dev stores

Easiest path — the Shopify CLI ships a GraphiQL session authenticated as your app:

1. From `cart-validation/`, run `shopify app dev --store <store>.myshopify.com`
2. With dev running, press `g` in that terminal to open GraphiQL
3. Set API version to `2026-04`, then run:

```graphql
mutation {
  deliveryCustomizationCreate(deliveryCustomization: {
    functionHandle: "destination-shipping-restrictions",
    title: "Destination shipping restrictions",
    enabled: true
  }) {
    deliveryCustomization { id title enabled }
    userErrors { field message }
  }
}
```

#### Non-dev stores (e.g. prod / Plus stores)

`shopify app dev` only accepts true development stores, so for prod you need an offline access token and have to call the mutation directly.

One-time setup:

1. Add Postman's OAuth callback to `cart-validation/shopify.app.toml` and deploy:
   ```toml
   [auth]
   redirect_urls = [
     "https://shopify.dev/apps/default-app-home/api/auth",
     "https://oauth.pstmn.io/v1/callback",
   ]
   ```
   Run `shopify app deploy` and release.
2. In Postman, create a request, set Authorization → OAuth 2.0:
   - Auth URL: `https://<store>.myshopify.com/admin/oauth/authorize`
   - Access Token URL: `https://<store>.myshopify.com/admin/oauth/access_token`
   - Client ID: from Dev Dashboard → cart-validation → Settings → Credentials
   - Client Secret: same place (click the eye on Secret)
   - Scope: `write_delivery_customizations`
   - Callback URL: `https://oauth.pstmn.io/v1/callback`
3. Get New Access Token, complete the OAuth flow, copy the resulting `shpat_...` token. It's an offline token — reusable, no expiry under normal use.

Then run the mutation from PowerShell (Shopify Admin API uses the `X-Shopify-Access-Token` header, not OAuth Bearer):

```powershell
$token = 'shpat_...'

$body = @{
  query = 'mutation Create($input: DeliveryCustomizationInput!) { deliveryCustomizationCreate(deliveryCustomization: $input) { deliveryCustomization { id title enabled } userErrors { field message } } }'
  variables = @{
    input = @{
      functionHandle = 'destination-shipping-restrictions'
      title          = 'Destination shipping restrictions'
      enabled        = $true
    }
  }
} | ConvertTo-Json -Depth 5 -Compress

Invoke-RestMethod `
  -Uri 'https://<store>.myshopify.com/admin/api/2026-04/graphql.json' `
  -Method Post `
  -Headers @{ 'X-Shopify-Access-Token' = $token; 'Content-Type' = 'application/json' } `
  -Body $body | ConvertTo-Json -Depth 10
```

Don't paste long JSON literals into the PowerShell terminal — line wrapping breaks the here-string. Build the body via hashtables + `ConvertTo-Json` as above.

#### Verify and manage

Confirm the customization appears as **Active** under **Settings → Shipping and delivery → Customizations**. To disable or delete it later, use `deliveryCustomizationUpdate` / `deliveryCustomizationDelete` via the same channel.

## MBR Discount Exclusivity

`MBR*` codes are per-customer Member Rewards discounts (generated by the `member-rewards-update-tool`; format `MBR*` + alphanumerics, e.g. `MBR*OV76MO55`). Only **one** may apply per order. They may still combine with the automatic Members Price discount and with non-MBR combinable codes — only a *second* MBR code is blocked.

This can't be a Cart and Checkout Validation Function: that function family can't read entered discount codes (no `discountCodes`/`enteredDiscountCodes` field; `DiscountApplication` exposes no code or title). Instead it's a Discount Function on `cart.lines.discounts.generate.run`, deployed as an **automatic** discount. It reads `enteredDiscountCodes`, and when more than one matches `/^MBR\*/i` it rejects every match beyond the first via `enteredDiscountCodesReject` with a custom message. It adds no discount of its own. The reject operation is only available to functions backed by an automatic discount — which is why it's activated as one (below). This works on every surface, including express checkouts (Shop Pay, PayPal, Apple/Google Pay).

### Activation

Like the delivery customization, this is activated once per store via mutation and persists across deploys. The app needs the `write_discounts` scope (already in `shopify.app.toml`).

**The mutation must run authenticated as the `cart-validation` app.** A store's standalone Shopify GraphiQL App or any unrelated custom app will fail with `Function mbr-discount-exclusivity not found` — it doesn't own the function.

#### Dev stores

`shopify app dev --store <store>.myshopify.com` (run from `cart-validation/`), press `g` for the CLI's app-scoped GraphiQL, set API version to `2026-04`, then run:

```graphql
mutation {
  discountAutomaticAppCreate(automaticAppDiscount: {
    title: "Only one Member Rewards discount per order",
    functionHandle: "mbr-discount-exclusivity",
    discountClasses: [PRODUCT],
    startsAt: "2026-05-27T00:00:00Z",
    combinesWith: { orderDiscounts: true, productDiscounts: true, shippingDiscounts: true }
  }) {
    automaticAppDiscount { discountId title status }
    userErrors { field message }
  }
}
```

Expect `status: ACTIVE` and empty `userErrors`.

#### Non-dev stores (e.g. prod / Plus stores)

Use the same Postman OAuth offline-token flow documented above for the delivery customization, with two changes: request scope `write_discounts` (instead of `write_delivery_customizations`), and call `discountAutomaticAppCreate` (above) instead of `deliveryCustomizationCreate`. The PowerShell snippet is identical bar the query/variables.

#### Verify

Confirm the discount appears as **Active** under **Discounts** in the store admin (titled "Only one Member Rewards discount per order").

#### Rollback / disable

The function adds no discount of its own and only inspects entered `MBR*` codes, so it cannot affect the automatic Members Price discount (which is not a code and never appears in `enteredDiscountCodes`). If a conflict nonetheless surfaces on a live store, disabling is instant and needs no redeploy:

- **Fastest (live incident, no credentials):** in the store admin, **Discounts → "Only one Member Rewards discount per order" → Deactivate** (or Delete). It's an ordinary automatic discount in the admin list. This takes effect immediately and anyone with admin access can do it.
- **API, reversible:** deactivate without removing it, then re-enable later. Use the `discountId` returned by `discountAutomaticAppCreate` (a `gid://shopify/DiscountAutomaticNode/...`), via the same app-scoped channel used for activation:

  ```graphql
  mutation { discountAutomaticDeactivate(id: "gid://shopify/DiscountAutomaticNode/REPLACE") { automaticDiscountNode { id } userErrors { field message } } }
  ```

  Re-enable with `discountAutomaticActivate(id: ...)`.
- **Remove entirely:** `discountAutomaticDelete(id: ...)` (returns `deletedAutomaticDiscountId`). Re-add later by re-running `discountAutomaticAppCreate`.
- **Code rollback:** `shopify app versions list`, then `shopify app release --version=<previous>` to revert the deployed function. Note this affects all extensions in the app, and disabling the discount (above) is the targeted way to stop just this rule.

If you don't have the `discountId` to hand, find it in the admin (the discount's detail-page URL contains the node id) or query `automaticDiscountNodes`.

## App Home dashboard

The `app-home` UI extension renders the app's admin landing page (the `admin.app.home.render` target). Opening **cart-validation** in the store admin shows a read-only summary of all three functions plus a live Active / Not-activated badge per function. Status is fetched with the auto-authenticated App Home Standard API `shopify.query` (one query over `cartTransforms`, `deliveryCustomizations`, `discountNodes`) — not `fetch('shopify:admin/...')`, which is the iframe App Home transport and does not resolve in the UI-extension runtime.

It requires the `read_cart_transforms` scope (alongside the existing `write_delivery_customizations` and `write_discounts`, which grant read). Adding a scope must be **deployed** (`shopify app deploy`) and then **approved per store** — managed installation prompts the merchant to grant it on the next app open (or reinstall). A field whose scope isn't granted shows "Status unavailable" for that one badge only; the others still report their real status. The page is read-only — it never changes any function's state. Status matching for the delivery customization and MBR discount is by their activation title, so renaming those records in the admin will show "Not activated on this store" until the titles are realigned.

## Project Structure

```
cart-validation/
├── shopify.app.toml                          # App configuration
├── package.json                              # Workspace root
└── extensions/
    ├── block-free-items/                     # Cart Transform extension
    ├── destination-shipping-restrictions/    # Delivery Customization extension
    ├── mbr-discount-exclusivity/             # Discount Function (automatic)
    └── app-home/                             # App Home UI extension (admin landing page)
```

## Prerequisites

- [Node.js](https://nodejs.org/) (LTS recommended)
- [Shopify CLI](https://shopify.dev/docs/apps/tools/cli)
- A [Shopify Partner account](https://partners.shopify.com/signup)
- A [development store](https://help.shopify.com/en/partners/dashboard/development-stores#create-a-development-store) for testing

## Setup

```bash
# Install dependencies
cd cart-validation
npm install
```

## Development

```bash
# Start local dev server with hot reload
npm run dev

# Build the extension to WASM
npm run build

# Deploy to Shopify
npm run deploy
```

## Testing

Tests use [Vitest](https://vitest.dev/) with Shopify's function test helpers. Each `.json` file in `tests/fixtures/` is a test case containing cart input and expected output.

```bash
cd extensions/block-free-items

npm test -- --run
```

```bash
cd extensions/destination-shipping-restrictions

npm test -- --run
```

### Adding a Test Case

Create a new `.json` file in the extension's `tests/fixtures/` folder. The test runner auto-discovers all fixture files. Each fixture needs a cart input and the expected operations output.

## Validation Rules

| Condition | Result |
|---|---|
| Item price > $0 | No change |
| Item price = $0 with `_bikeComponent: "true"` attribute | Allowed |
| Item price = $0 with `_bundleComponent: "true"` attribute | Allowed |
| Item price = $0 with `freeItem` product tag | Allowed |
| Item price = $0 with none of the above | Blocked ($999.99) |

## Tech Stack

- **JavaScript (ES Modules)** compiled to **WebAssembly**
- **GraphQL** for cart data queries
- **Shopify Function API** (`@shopify/shopify_function` 2.0.0)
- **Vitest** for testing
