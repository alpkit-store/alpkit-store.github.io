# kc-order-import-tool

Converts Shopify order exports (via the [Matrixify](https://matrixify.app/) app) into Khaos Control sales order XML format for import.

## Overview

This tool reads a Matrixify Excel export containing Shopify orders (web, POS, and draft orders), applies configurable filtering and mapping rules, and produces a Khaos Control-compatible XML file.

### Processing Pipeline

1. **Load** - Read the Matrixify Excel export into a pandas DataFrame
2. **Group** - Organise rows by Order ID (each order spans multiple rows for line items, transactions, shipping lines, and discounts)
3. **Filter** - Apply include/exclude rules based on source channel, physical location, and web tags
4. **Validate** - Skip orders without successful payment transactions (status=success, kind=capture/sale)
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
python matrixify_to_khaos.py --input "Matrixify Export.xlsx" --config "khaos_mapping.json" --output "khaos_orders.xml"
```

| Argument    | Description                              |
|-------------|------------------------------------------|
| `--input`   | Path to the Matrixify Excel export file  |
| `--config`  | Path to the JSON mapping configuration   |
| `--output`  | Path for the generated XML output        |

The script prints a processing summary on completion, showing counts of orders processed, filtered, exported, and a breakdown by site.

## Files

| File                      | Purpose                                      |
|---------------------------|----------------------------------------------|
| `matrixify_to_khaos.py`   | Main conversion script                       |
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
| `pos_site_defaults`              | Per-store default contact/address info for POS orders                |
| `shipping_method_map`            | Map Shopify shipping method titles to COURIER_DESC values            |
| `payment_mappings`               | Rules matching (source, location, currency, gateway) to payment accounts |
| `source_name_overrides`          | Marketplace-specific overrides (e.g. Debenhams, Decathlon)           |
| `account_name_aliases`           | Normalise account names across channels                              |

### Site Resolution Logic

**POS / Draft Orders:** Physical Location is mapped via `physical_location_site_map`, falling back to `site_when_no_physical_location`.

**Web Orders:** Shopify order tags are checked against `web_location_tags`. A single matching tag routes to the corresponding site. Orders with multiple location tags are skipped if `skip_web_if_multiple_location_tags` is enabled.

### Payment Mapping

Payments are matched using a cascade:

1. **Source name overrides** - Marketplace-specific accounts (highest priority)
2. **Payment mappings table** - Match by (source, location, currency, gateway) with exact location preferred, wildcard (empty location) as fallback
3. **Config defaults** - Last resort

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