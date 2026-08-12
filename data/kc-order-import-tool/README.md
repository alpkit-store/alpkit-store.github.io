# kc-order-import-tool

Converts Shopify order exports (via the [Matrixify](https://matrixify.app/) app) into Khaos Control sales order XML format for import.

## Overview

This tool reads a Matrixify Excel export containing Shopify orders (web, POS, and draft orders), applies configurable filtering and mapping rules, and produces a Khaos Control-compatible XML file.

### Processing Pipeline

1. **Load** - Read the Matrixify Excel export into a pandas DataFrame
2. **Group** - Organise rows by Order ID (each order spans multiple rows for line items, transactions, shipping lines, and discounts)
3. **Filter** - Apply include/exclude rules based on source channel, physical location, web tags, and configurable finance hold tags
4. **Validate** - Skip orders without successful payment transactions (status=success, usually kind=capture/sale, with configurable exceptions such as Cycle to Work authorisations)
5. **Transform** - Map Shopify fields to the Khaos Control schema
6. **Export** - Write formatted XML output

## Requirements

- Python 3
- [pandas](https://pandas.pydata.org/)
- [openpyxl](https://openpyxl.readthedocs.io/) (used by pandas to read `.xlsx` files)

Install dependencies:

```
pip install pandas openpyxl
```

## Usage

```
python matrixify_to_khaos.py --input "Matrixify Export.xlsx" --config "khaos_mapping.json" --output "khaos_orders.xml" --bike-lookup "Matrixify Bike Lookup.xlsx" --variant-sku-lookup "Matrixify Export Variant to SKU.xlsx"
```

| Argument | Description |
|-------------|------------------------------------------|
| `--input` | Path to the Matrixify Excel export file |
| `--config` | Path to the JSON mapping configuration |
| `--output` | Path for the generated XML output |
| `--bike-lookup` | Path to the Matrixify product export used to expand Bike Build pack items. Defaults to `Matrixify Bike Lookup.xlsx` |
| `--variant-sku-lookup` | Path to the Matrixify product export used to map `_bundleProduct_<VariantID>` bike properties back to SKUs. Defaults to `Matrixify Export Variant to SKU.xlsx` |

The script prints a processing summary on completion, showing counts of orders processed, filtered, exported, and a breakdown by site.

Download fresh Bike Lookup and Variant-to-SKU lookup workbooks each time an import is run so Bike Build component packs reflect the latest product and variant data.

## Files

| File                      | Purpose                                      |
|---------------------------|----------------------------------------------|
| `matrixify_to_khaos.py`   | Main conversion script                       |
| `recipients_to_khaos.py`  | Recipient list conversion script (see below) |
| `khaos_mapping.json`      | Mapping rules, filters, and default values   |

Input/output data files (`Matrixify Export.xlsx`, `khaos_orders.xml`) are excluded from version control via `.gitignore`.

## Configuration (`khaos_mapping.json`)

The JSON config drives all filtering, mapping, and default value logic.

### Key Sections

| Section                          | Purpose                                                              |
|----------------------------------|----------------------------------------------------------------------|
| `defaults`                       | Global fallback values (company class, country code, auth codes)     |
| `include_sources` / `exclude_sources` | Filter orders by channel (web, pos, shopify_draft_order)        |
| `include_physical_locations` / `exclude_physical_locations` | Filter by store location            |
| `physical_location_site_map`     | Map Shopify location names to Khaos Control SITE values              |
| `web_location_tags`              | Shopify tags used to route web orders to specific sites              |
| `web_location_tag_site_map`      | Map web location tags to SITE values                                 |
| `web_exclude_tags`               | Tags that cause web orders to be skipped                             |
| `finance_hold_tags`              | Tags that cause any matching order to be held back from export       |
| `pos_site_defaults`              | Per-store default contact/address info for POS orders                |
| `shipping_method_map`            | Map Shopify shipping method titles to COURIER_DESC values            |
| `company_class_by_currency`      | Map order currency to Khaos Control company class                    |
| `cycle_to_work_gateways`         | Gateway names used to classify Cycle to Work orders                  |
| `cycle_to_work_invoice_priority` | Priority label used for Cycle to Work orders                         |
| `note_invoice_priority`          | Priority label used when customer notes are present                  |
| `pos_invoice_priority`           | Priority label used for POS / collection orders, typically `Standard` |
| `standard_invoice_priority`      | Fallback priority label for standard orders                          |
| `pos_force_zero_shipping`        | Force POS orders to export zero shipping totals                      |
| `bike_build_invoice_priority`    | Priority label used for Bike Build orders                            |
| `payment_mappings`               | Rules matching (source, location, currency, gateway) to payment accounts |
| `source_name_overrides`          | Marketplace-specific overrides (e.g. Debenhams, Decathlon)           |
| `account_name_aliases`           | Normalise account names across channels                              |

### Site Resolution Logic

**POS / Draft Orders:** Physical Location is mapped via `physical_location_site_map`, falling back to `site_when_no_physical_location`.

**Web Orders:** Shopify order tags are checked against `web_location_tags`. A single matching tag routes to the corresponding site. Orders with multiple location tags are skipped if `skip_web_if_multiple_location_tags` is enabled.

**Finance Holds:** Orders carrying any tag listed in `finance_hold_tags` are excluded from the export.

### Company Class Mapping

`COMPANY_CLASS` defaults to `defaults.COMPANY_CLASS`, but can be overridden per currency using `company_class_by_currency`.

### Payment Mapping

Payments are matched using a cascade:

1. **Source name overrides** - Marketplace-specific accounts (highest priority)
2. **Payment mappings table** - Match by (source, location, currency, gateway) with exact location preferred, wildcard (empty location) as fallback
3. **Config defaults** - Last resort

Cycle to Work orders are identified from `cycle_to_work_gateways` and may be exported from successful `authorization` transactions even when no `capture` or `sale` exists. Orders on those gateways are also allowed through even when the transaction is still pending, matching the current voucher workflow; in that case the order is exported with an empty `PAYMENTS` block until a successful payment exists.

### Priority Resolution

`INV_PRIORITY` is resolved in this order:

1. Cycle to Work priority
2. Bike Build priority
3. Note-based priority
4. POS / collection priority
5. Store Shipping for web orders routed to a store site
6. Standard priority

### POS Shipping Behaviour

When `pos_force_zero_shipping` is enabled, POS orders always export `DELIVERY_GRS=0`, `DELIVERY_TAX=0`, and use the configured collection courier label instead of any shipping-line-derived value.

## Output Format

The generated XML follows the Khaos Control sales order import schema:

```xml
<SALES_ORDERS>
  <SALES_ORDER>
    <CUSTOMER_DETAIL>...</CUSTOMER_DETAIL>
    <PAYMENTS>...</PAYMENTS>
    <ORDER_HEADER>...</ORDER_HEADER>
    <ORDER_ITEMS>...</ORDER_ITEMS>
  </SALES_ORDER>
</SALES_ORDERS>
```

Each `SALES_ORDER` contains:

- **CUSTOMER_DETAIL** - Customer info, invoice and delivery addresses (with fallback to POS store defaults)
- **PAYMENTS** - One `PAYMENT_DETAIL` per successful transaction, mapped to the correct account
- **ORDER_HEADER** - Order date, site, currency, shipping, courier, discount codes, PO number (POS only)
- **ORDER_ITEMS** - One `ORDER_ITEM` per line item with SKU, quantity, price, and discount percentage

Bundle-specific note: when a line item's `Line: Properties` contains `_bundle_free: true`, the exporter preserves the item's listed price, sets `KSD_DISCOUNT` to `100`, and emits `PRICE_NET=0` to match the current integration behavior.

Bundle groups already present in Matrixify rows also receive `PACK_SORT_ORDER` values based on `_bundle_id`, with the bundle parent first and then remaining rows in source order.

Bike Build note: when a bike header SKU is present in the Bike Lookup workbook, the exporter adds pack component `ORDER_ITEM` rows from product tags in the format `BB_<SKU>_<qty>`. It also expands `_bundleProduct_<VariantID>: qty` properties on the bike header using the Variant-to-SKU workbook. The bike header receives `PACK_SORT_ORDER=100.001` and generated component rows follow as `100.002`, `100.003`, and so on.

## Recipient list imports (`recipients_to_khaos.py`)

Used for free-of-charge fulfilment runs such as the 100 Mile Club, where the source is a flat recipient list rather than a Matrixify order export. There are no Shopify orders behind these rows: no transactions, prices, shipping lines or order IDs.

```
python recipients_to_khaos.py --input "100-mile club recipients 20260810 (local).xlsx" --config "khaos_mapping.json" --output-prefix "khaos_orders_100_mile_club" --order-date 2026-08-11
```

Requires `openpyxl` only (no pandas).

### Input format

One row per recipient per SKU, with these columns on the first worksheet:

`Shipment Ref`, `Tier`, `First name`, `Last name`, `Email`, `Address`, `Address line 2`, `City/Town`, `Post Code`, `Country`, `SKU`, `QTY`

Rows sharing a `Shipment Ref` become a single sales order; repeated SKUs within a shipment are summed.

### Arguments

| Argument | Description |
|----------|-------------|
| `--input` | Path to the recipient list `.xlsx` |
| `--config` | Path to the JSON mapping configuration (only `defaults`, `site_when_no_physical_location` and `standard_invoice_priority` are read) |
| `--output-prefix` | Output path prefix; one file per tier is written as `<prefix>_<tier>.xml` |
| `--order-date` | `ORDER_DATE` / `DELIVERY_DATE`, defaults to today |
| `--site` | `SITE` value, defaults to the config site (`Head Office`) |
| `--sales-source` | `SALES_SOURCE` value, defaults to the `SITE` value |
| `--inv-priority` | `INV_PRIORITY` value, defaults to the config standard priority |
| `--courier` | `COURIER_DESC` value, blank leaves the courier for Khaos Control to set |
| `--currency` | `ORDER_CURRENCY_CODE` value, defaults to `GBP` |
| `--order-note-template` | `ORDER_NOTE` template supporting `{tier}`, `{raw_tier}` and `{ref}` |

### Tier splitting

One output file per tier in `TIER_ORDER` (`100-miles`, `50-miles`, `25-miles`). A recipient who qualified for more than one tier (`100-miles + 50-miles`) is filed under the highest tier they reached, with every line item they are owed on that single order.

### Differences from the Matrixify exporter

- `PAYMENTS` is empty and every money field (`ORDER_AMOUNT`, `PRICE_GRS`, `PRICE_NET`, `KSD_DISCOUNT`, `DELIVERY_GRS`, `DELIVERY_TAX`, `WEIGHT`) is zero.
- `ASSOCIATED_REF` carries the `Shipment Ref` instead of a Shopify order name.
- Invoice and delivery addresses are both the recipient's home address, and include `IADDRESS2` / `DADDRESS2` for the second address line.
- `ITEL` / `DTEL` are empty: the recipient list has no phone number.

### Data cleaning and warnings

- Country free text (`UK`, `England`, `Scotland, UK`, `Reino Unido`, …) maps to `GB`; Isle of Man, Jersey and Guernsey map to `IM`, `JE` and `GG`. Anything unrecognised falls back to `GB` and is warned about.
- Post codes are uppercased and re-spaced before the final three characters.
- Address fragments coerced to dates by Excel (a Glasgow flat number `4/2` read as `2026-04-02`) are rebuilt as `month/day`.
- Missing name, email, address, town or post code, and post codes failing UK format validation, are listed in the warning summary. Rows with no Shipment Ref, SKU or a non-positive quantity are skipped and warned about.
