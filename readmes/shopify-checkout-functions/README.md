# Shopify Checkout Functions

Shopify Functions for Alpkit checkout rules.

## Extensions

| Extension | Function API | Purpose |
|---|---|---|
| `block-free-items` | Cart Transform | Prevents free items from being purchased unless they belong to a bike build, product bundle, or are explicitly tagged as free. |
| `destination-shipping-restrictions` | Delivery Customization | Hides all delivery options when restricted products are in the cart for the destination country. |

## Free Item Validation

The extension runs as a serverless function during Shopify's cart transformation step at checkout. It inspects every cart line and applies the following logic:

1. Scans all cart lines for items with a price of `$0.00`
2. For each free item, checks whether it has a valid reason to be free:
   - `_bikeComponent` cart line attribute is `"true"`
   - `_bundleComponent` cart line attribute is `"true"`
   - Product has the `freeItem` tag
3. If none of those conditions are met, the item is blocked by setting its price to `$999.99` with a message indicating it cannot be purchased separately

Paid items are always left untouched.

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

## Project Structure

```
cart-validation/
├── shopify.app.toml                          # App configuration
├── package.json                              # Workspace root
└── extensions/
    ├── block-free-items/                     # Cart Transform extension
    └── destination-shipping-restrictions/    # Delivery Customization extension
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
