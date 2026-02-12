# Cart Validation App

A Shopify Cart Transform Function that prevents free items ($0 price) from being purchased unless they belong to a bike build, product bundle, or are explicitly tagged as free.

## How It Works

The extension runs as a serverless function during Shopify's cart transformation step at checkout. It inspects every cart line and applies the following logic:

1. Scans all cart lines for items with a price of `$0.00`
2. For each free item, checks whether it has a valid reason to be free:
   - `_bikeComponent` cart line attribute is `"true"`
   - `_bundleComponent` cart line attribute is `"true"`
   - Product has the `freeItem` tag
3. If none of those conditions are met, the item is blocked by setting its price to `$999.99` with a message indicating it cannot be purchased separately

Paid items are always left untouched.

## Project Structure

```
cart-validation/
├── shopify.app.toml                          # App configuration
├── package.json                              # Workspace root
└── extensions/
    └── block-free-items/                     # Cart Transform extension
        ├── shopify.extension.toml            # Extension config
        ├── src/
        │   ├── index.js                      # Validation logic
        │   └── run.graphql                   # GraphQL query for cart data
        └── tests/
            ├── default.test.js               # Integration test runner
            └── fixtures/                     # Test fixtures (JSON)
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

# Run tests (watch mode)
npm test

# Run tests once
npm run test:unit
```

### Adding a Test Case

Create a new `.json` file in `extensions/block-free-items/tests/fixtures/`. The test runner auto-discovers all fixture files. Each fixture needs a cart input and the expected operations output.

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