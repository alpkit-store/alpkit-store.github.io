> Sanitised public copy of this repo's README — internal endpoints replaced with placeholders.

# Clook Server

Order management, inventory synchronisation, and business intelligence platform for Alpkit. Built as a PHP monolith, it orchestrates data across Khaos Control (ERP), Shopify, Amazon, and multiple third-party services.

## Additional Docs

- Mailer address maintenance and the David Bingle / Outpost-related workflow are documented in `orders/sg/code/README-mailer-addresses.md`.

## Architecture

```
clook-server/
└── orders/sg/code/          # All application code lives here
    ├── config.php            # Environment config (LIVE / TEST / SERVER2)
    ├── functions_*.php       # 29 shared function modules
    ├── inc_*.php             # UI includes (headers, dropdowns, JS)
    ├── load_*.php            # AJAX data loaders for grids/dashboards
    ├── *.php                 # ~400 page/task scripts (see categories below)
    ├── lib/                  # SagePay payment gateway classes
    ├── GrantType/            # OAuth2 grant type implementations
    ├── google/               # Google Sheets/Drive API client
    ├── src/                  # Html2Text, VendAPI utility classes
    ├── crest/                # Campaign Monitor subscriber management
    ├── fpdf/                 # PDF generation (labels, documents)
    ├── paypal/               # PayPal API client & refund processing
    ├── parcelforce/          # Parcel Force shipping WSDL
    ├── schema/ & schema2/    # Royal Mail & CDM WSDL/XSD schemas
    ├── khaosrm/              # Khaos Control data import utilities
    ├── jo_custom/            # Custom scripts (exports, store reports, discounts)
    ├── vendor/               # Composer dependencies (Guzzle, Dropbox, etc.)
    ├── archive/              # Historical shipping label PDFs
    ├── exports/              # Generated CSV/XML export output
    └── tmp/                  # Temporary/cache files
```

## Technology Stack

| Component        | Technology                                    |
|------------------|-----------------------------------------------|
| Language         | PHP (procedural, no framework)                |
| Primary DB       | SQL Server (Khaos Control data)                    |
| Secondary DB     | MySQL (application tables, reporting cache)   |
| Frontend         | SlickGrid, jQuery UI                          |
| Package Manager  | Composer                                      |
| Auth             | Session-based with role-based access control  |
| API Auth         | OAuth2 (custom implementation)                |
| Hosting          | Linux (Apache) with Europe/London timezone    |

## Databases

- **SQL Server** (`gcConn_msi.php`) -- Khaos Control ERP database. Core tables: `SORDER`, `INVOICE`, `STOCK`, `STOCK_SUMMARY`, `SCS_ELEMENT1-4`, `COMPANY`, `PORDER`, `NONWORKING_DAY`.
- **MySQL** (`gcConni.php`) -- Application database. Tables: `stock_table`, `export_items_*`, `export_orders_*`, `shopify_products`, `dd_contacts_khaos`, `gorgias_customers`, `stats2`, `mi_info`, `comm_log`.

## External Integrations

| Service              | Purpose                                | Protocol        |
|----------------------|----------------------------------------|-----------------|
| **Khaos Control**         | ERP -- orders, stock, customers        | SOAP            |
| **Shopify**          | E-commerce storefront (UK, EU, US)     | REST API        |
| **Amazon**           | Marketplace channel                    | API             |
| **PayPal**           | Payment processing & refunds           | REST API        |
| **SagePay**          | Card payment gateway                   | API             |
| **Royal Mail**       | Shipping labels & tracking             | SOAP (WSDL)     |
| **Parcel Force**     | Shipping labels                        | SOAP (WSDL)     |
| **Google Analytics** | Traffic & visitor metrics              | Data API v1beta |
| **Google Sheets**    | Data export/sharing                    | Sheets API      |
| **Gorgias**          | Customer support platform              | REST API        |
| **Klaviyo**          | Email marketing (UK, EU, US)           | REST API        |
| **Campaign Monitor** | Email subscriber management            | REST API        |
| **Klevu**            | Product search/discovery feed          | XML export      |
| **Vend POS**         | Point-of-sale integration              | REST API        |
| **SharePoint**       | BI data export to Microsoft            | API             |
| **Dropbox**          | Cloud file storage                     | API             |
| **Discount Ninja**   | Shopify discount app                   | API             |

## Script Categories

The ~400 PHP scripts in `orders/sg/code/` fall into these functional groups:

### Dashboards & Reporting
Operational and e-commerce dashboards with real-time KPIs.

| Script | Purpose |
|--------|---------|
| `ops_dashboard.php` | Operations: orders received, invoice stages, despatch counts |
| `ecomm_dashboard.php` | E-commerce health: clearance gaps, OOS analysis, pre-orders, cancellations |
| `unfulfilled_report.php` | Shopify unfulfilled order reconciliation with filterable grid |
| `summary.php` / `summary_snap*.php` | Sales summary snapshots (12 variants for different views) |
| `stocktable.php` | Stock table viewer |
| `prices.php` / `prices_comparison.php` | Price list viewing and cross-channel comparison |

### Order Processing
Order import, editing, fulfilment, and cancellation.

| Script | Purpose |
|--------|---------|
| `orders.php` / `load_orders.php` | Order list viewer with SlickGrid |
| `dd_import_orders_into_pending.php` | Import Khaos orders into pending queue |
| `despatch_khaos_orders.php` | Despatch management dashboard |
| `edit_order.php` / `edit_order2.php` / `edit_order3.php` | Order editing |
| `fulfill_order.php` / `fulfill_multiple_orders.php` | Shopify fulfilment |
| `cancel_order_to_shopify.php` | Push cancellation to Shopify |
| `import_shopify_orders_to_khaos.php` | Shopify-to-Khaos order import |
| `outstanding_orders.php` | Outstanding order tracking |

### Shopify Integration
Product sync, inventory management, gift cards, and order reconciliation.

| Script | Purpose |
|--------|---------|
| `exports_shopify.php` | Main Shopify export orchestrator |
| `export_items_*_pre_shopify.php` | Product data export (base, extra, post stages) |
| `export_orders_shopify*.php` | Order data export to Shopify |
| `shopify_build*.php` | Product build/sync (UK, EU, US stores) |
| `shopify_giftcards*.php` | Gift card management |
| `shopify_unfulfilled_orders_build*.php` | Unfulfilled order reconciliation |
| `set_shopify_inventory.php` | Inventory level sync |
| `check_shopify_*.php` | Various Shopify data validation checks |

### Amazon Integration
Customer verification and order processing for Amazon marketplace.

| Script | Purpose |
|--------|---------|
| `amazon_check.php` / `amazon_check2.php` / `amazon_check3.php` | Duplicate customer detection |
| `amazon_customers.php` | Amazon customer data processing |
| `amazon_process.php` | Amazon order processing |
| `export_orders_amazon.php` | Amazon order data aggregation |
| `export_items_amazon.php` / `export_items_amazon_titles.php` | Amazon product feed |

### Klaviyo Email Marketing
Profile management, event tracking, and segmentation across UK, EU, and US stores.

| Script | Purpose |
|--------|---------|
| `klaviyo_create_profile.php` / `klaviyo_get_profile.php` | Profile CRUD |
| `klaviyo_create_event.php` | Event creation |
| `klaviyo_create_ordered_events_eu.php` / `_us.php` | Purchase event tracking |
| `klaviyo_get_profiles_eu*.php` / `_us*.php` | Profile retrieval with filters |
| `klaviyo_customers_khaos_update.php` | Khaos-to-Klaviyo customer sync |
| `klaviyo_suppress_profile.php` | Profile suppression |

### Gorgias Customer Support
Customer data sync and ticket metrics for the support platform.

| Script | Purpose |
|--------|---------|
| `gorgias_customers_khaos_update.php` | Sync customer data from Khaos |
| `gorgias_open.php` / `gorgias_closed.php` | Open/closed ticket views |
| `gorgias_update_customers.php` | Customer record updates |
| `gorgias_update_closed_responses.php` | Response time tracking |

### Data Exports & BI
CSV, XML, and SharePoint exports for business intelligence and analytics.

| Script | Purpose |
|--------|---------|
| `export_items_max_bi.php` / `export_orders_csv_bi.php` | BI-specific exports |
| `export_klevu_xml.php` / `export_klevunp_xml.php` | Klevu search engine feeds |
| `export_customers*.php` | Customer data exports |
| `export_clusters.php` | Customer cluster exports |
| `export_product_history.php` | Product sales history |
| `sharepoint_*.php` (20+ files) | SharePoint uploads for BI (items, orders, addresses, products) |

### Customer Analytics & Segmentation
Customer lifecycle analysis, clustering, and reward calculations.

| Script | Purpose |
|--------|---------|
| `calculate_customers.php` | Customer segmentation (Lead, Lapsed, One-timer, AlpFan, etc.) |
| `calculate_member_rewards.php` | Loyalty reward calculation |
| `calculate_shopify_customer_discounts.php` | Shopify discount application |
| `dd_clusters.php` | Customer cluster analysis |
| `dd_load_transactions_kc.php` | Transaction history loading |

### Cron Jobs & Scheduled Tasks
Automated processes for inventory sync, metrics collection, and data maintenance.

| Script | Purpose |
|--------|---------|
| `build_stock_table_cron.php` | Rebuild stock table from Khaos data |
| `update_mi_info_cron.php` | Main KPI snapshot (sales, costs, returns by channel) |
| `update_mi_google_cron.php` | Google Analytics metrics sync |
| `update_mi_gorgias_cron.php` | Gorgias support metrics sync |
| `take_snapshot_cron.php` | Top products/bikes snapshot |
| `take_price_change_snapshot_cron.php` | Price change tracking |
| `khaos_update_preorder_inventory_cron.php` | Pre-order inventory sync to Shopify |
| `khaos_update_gift_cards_shopify_cron.php` | Gift card sync |
| `update_first_responses_cron.php` | Customer service SLA tracking |
| `swap_skus_cron.php` | SKU management automation |

### Cost & Despatch Calculations
Shipping cost analysis and delivery promise tracking.

| Script | Purpose |
|--------|---------|
| `calculate_despatch1-5.php` | Despatch cost calculations (5 variants) |
| `calculate_bike_aggregate_costs_max.php` | Bike product cost aggregation |
| `calculate_bundle_aggregate_costs_max.php` | Bundle cost aggregation |

### Khaos Control Utilities
Direct Khaos ERP data operations.

| Script | Purpose |
|--------|---------|
| `khaos_keycodes.php` / `khaos_pricelists.php` | Keycode and pricelist management |
| `khaos_price_changes.php` | Price change tracking |
| `khaos_site_list.php` | Site/location management |
| `update_khaos_countries.php` / `update_khaos_couriers.php` | Reference data sync |

### Admin & User Management
Authentication, user administration, and system settings.

| Script | Purpose |
|--------|---------|
| `admin_access.php` | Role-based access control |
| `users.php` / `new_user.php` / `delete_users.php` | User CRUD |
| `toggle_*.php` | Feature toggles (edit mode, check mode, stock expand, etc.) |
| `save_setting.php` | Application settings persistence |

## Function Modules

The 29 `functions_*.php` files provide shared business logic:

| Module | Purpose |
|--------|---------|
| `functions.php` | Core utilities (diff, HTML diff, date processing, file joining) |
| `functions_khaos.php` | Khaos ERP API calls, encoding, site lookup |
| `functions_shopify.php` / `functions_shopify2.php` | Shopify REST API operations |
| `functions_shopify_customers.php` | Shopify customer API |
| `functions_shopify_products.php` | Shopify product API |
| `functions_items.php` | Product/SKU data access |
| `functions_orders.php` | Order data access |
| `functions_products.php` | Product management |
| `functions_api.php` | Royal Mail SOAP API setup with WS-Security |
| `functions_bikes.php` | Bike product handling |
| `functions_categories.php` | Category management |
| `functions_purchases.php` | Purchase order processing |
| `functions_transfers.php` | Stock transfer logic |
| `functions_returns.php` | Returns processing |
| `functions_custom.php` | Custom business logic |
| `functions_despatch_promise.php` | Delivery promise calculations |
| `functions_google.php` | Google Analytics/Sheets API |
| `functions_comm_log.php` | Communication logging |
| `functions_print.php` | Print/label functionality |
| `functions_parcelforce.php` | Parcel Force shipping |
| `functions_load_shopify.php` | Shopify data loading |
| `functions_new_options.php` / `functions_options.php` | Product options |
| `functions_multiple.php` / `functions_multiple2.php` | Batch operations |
| `functions_support.php` | Support/CS utilities |
| `klaviyo_functions.php` | Klaviyo API utilities |
| `sharepoint_functions.php` | SharePoint upload utilities |

## Environment Configuration

The application supports three environments controlled by `config.php`:

| Setting | LIVE | TEST | SERVER2 |
|---------|------|------|---------|
| Domain | alpkit.com | <dev-domain> | (alternate) |
| Shopify | alpkit-sonder.myshopify.com | test store | -- |
| Khaos SOAP | <khaos-soap-host>:<port> | local | -- |

Key config flags:
- `THIS_SITE` -- environment selector
- `KHAOS_PROCESSING_OFF` -- maintenance mode toggle
- `PRICELIST` -- active price list (e.g. `SALE_GBP`)

## Data Flow

```
                    ┌─────────────┐
                    │  Khaos Control   │ (ERP - SQL Server)
                    │  (SOAP API) │
                    └──────┬──────┘
                           │
              ┌────────────┼────────────┐
              ▼            ▼            ▼
        ┌──────────┐ ┌──────────┐ ┌──────────┐
        │  Shopify  │ │  Amazon  │ │  Stores  │
        │ (UK/EU/US)│ │          │ │(POS/Vend)│
        └──────────┘ └──────────┘ └──────────┘
              │            │            │
              └────────────┼────────────┘
                           ▼
                    ┌─────────────┐
                    │ clook-server│ (this system)
                    │   MySQL DB  │
                    └──────┬──────┘
                           │
         ┌─────────┬───────┼───────┬──────────┐
         ▼         ▼       ▼       ▼          ▼
    ┌────────┐┌────────┐┌──────┐┌───────┐┌──────────┐
    │Klaviyo ││Gorgias ││Google││SharePt││  Klevu   │
    │(Email) ││(Support)││(GA)  ││ (BI)  ││(Search)  │
    └────────┘└────────┘└──────┘└───────┘└──────────┘
```

## Sub-READMEs

- [`orders/sg/code/README.md`](Development/Alpkit/clook-server/orders/sg/code/README.md) -- Main application code overview
- [`orders/sg/code/jo_custom/README.md`](Development/Alpkit/clook-server/orders/sg/code/jo_custom/README.md) -- Custom scripts (store reports, exports, discounts)
- [`orders/sg/code/lib/README.md`](Development/Alpkit/clook-server/orders/sg/code/lib/README.md) -- SagePay payment gateway library
