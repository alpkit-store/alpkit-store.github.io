# Shopify Product Image Browser

A single-file, zero-dependency HTML tool for browsing product images and handles from any public Shopify storefront.

## What it does

Fetches products from a Shopify store's public `products.json` endpoint, paginates through all results (250 products per page), and renders each matching product with:

- **Product handle** and **product type** badge
- **Title** and image count
- **Thumbnail grid** — each thumbnail links to the full-size image on the Shopify CDN

Filtering is applied client-side as pages are fetched, so only matching products are rendered (non-matches are discarded).

## Usage

1. Open `ShopifyProductImages.html` directly in a browser — no server or build step required.
2. Enter the **Storefront base URL** (e.g. `https://yourstore.myshopify.com`).
3. Optionally fill in one or both filters:
   - **Product type** — exact match against the `product_type` field (case-insensitive).
   - **Search text** — substring match against the product handle and title.
4. Click **Fetch**. Results stream in as each page is retrieved.
5. Click **Stop** at any time to halt fetching after the current page completes.

## Requirements

- The target store must expose the public `products.json` endpoint (all Shopify storefronts do by default).
- The browser must be able to reach the storefront URL (no CORS restrictions apply to `products.json` as it is a public endpoint).

## Notes

- Shopify's `products.json` does not support server-side filtering by product type or keyword, so all filtering happens in the browser.
- A 250 ms delay is added between page requests to avoid hammering the storefront.
- Thumbnails are served at 180 px wide via the Shopify CDN `?width=` parameter; clicking a thumbnail opens the original full-resolution image.