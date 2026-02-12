# ShipTheory CSV Import

Imports shipments from a CSV file into [ShipTheory](https://shiptheory.com) via their API.

No external dependencies — uses Node.js built-ins only.

## Setup

Create a `shiptheory.env` file in the project root:

```
EMAIL=you@example.com
PASSWORD=yourpassword
```

Place your shipment CSV at `shipment-data.csv` (or pass a path as an argument).

## Usage

```bash
node import.js
# or with a custom CSV path:
node import.js path/to/shipments.csv
```

## CSV format

One row per product line. Shipments with multiple products share the same `reference` value across multiple rows.

| CSV column | API field |
|---|---|
| `reference` | `reference` |
| `reference2` | `reference2` |
| `reference3` | `reference3` |
| `shipment_weight` | `shipment_detail.weight` |
| `shipment_parcels` | `shipment_detail.parcels` |
| `shipment_value` | `shipment_detail.value` |
| `shipment_currency` | `shipment_detail.currency_code` |
| `shipping_price` | `shipment_detail.shipping_price` |
| `delivery_service` | `delivery_service` |
| `enhancement_id` | `shipment_detail.enhancements[]` |
| `format_id` | `shipment_detail.format_id` |
| `increment_id` | `increment` |
| `shipping_date` | `shipment_detail.ship_date` |
| `duty_tax_number` | `shipment_detail.duty_tax_number` |
| `duty_tax_number_type` | `shipment_detail.duty_tax_number_type` |
| `instructions` | `shipment_detail.instructions` |
| `gift_message` | `shipment_detail.gift_message` |
| `channel_shipservice_name` | `shipment_detail.channel_shipservice_name` |
| `shipment_tags` | `tags` (comma-separated) |
| `product_name` | `products[].name` |
| `product_sku` | `products[].sku` |
| `product_quantity` | `products[].qty` |
| `product_value` | `products[].value` |
| `product_weight` | `products[].weight` |
| `product_barcode` | `products[].barcode` |
| `product_commodity_code` | `products[].commodity_code` |
| `product_commodity_description` | `products[].commodity_description` |
| `product_commodity_manucountry` | `products[].commodity_manucountry` |
| `product_commodity_composition` | `products[].commodity_composition` |
| `product_stock_location` | `products[].stock_location` |
| `product_un_number` | `products[].dangerous_goods.un_number` |
| `product_volume` | `products[].dangerous_goods.volume` |

Empty values (blank, `.`, `N/A`) are omitted from the API payload.

## API reference

https://shiptheory.com/developer/