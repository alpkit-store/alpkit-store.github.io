# bike-metaobjects

Bike builder v2 — metaobject-based architecture for the Alpkit Shopify theme.

Replaces the fragile tag-based bike builder with a structured metaobject system. The bike product owns the price; no more £0.00 `-BB` variants.

## Contents

| Path | Description |
|------|-------------|
| `docs/bike-builder-metaobject-refactoring-plan.md` | Architecture design and migration plan |
| `docs/bike-builder-metaobject-data-example.md` | Example metaobject data structures |
| `docs/bike-builder-metaobject-graphql-mutations.md` | GraphQL mutations for metaobject setup |
| `docs/setup-bike-builder-metaobjects.js` | Script to create metaobject definitions in Shopify |
| `docs/migrate-bike-builder-data.js` | Script to migrate existing tag-based data to metaobjects |
| `snippets/bike-builder-v2*.liquid` | Liquid snippets for the builder UI |
| `sections/product-bike-builder-v2.liquid` | Section for the bike builder product page |
| `templates/product.bike-builder-v2.json` | Product template |
| `assets/bike-builder-v2.js` | Compiled JS |
| `assets/_bike-builder-v2.css` | Compiled CSS |
| `src/scripts/` | JS source (modules + page entry point) |
| `src/css/components/_bike-builder-v2.scss` | SCSS source |

## Integration notes

To integrate into the theme:
- Add `@import "components/bike-builder-v2";` to `src/css/style.scss`
- Add `assets/bike-builder-v2.js` and `assets/_bike-builder-v2.css` to the webpack/mix build
- Copy snippets, sections, and template into the target theme
