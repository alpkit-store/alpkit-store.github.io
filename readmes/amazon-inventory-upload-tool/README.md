# Amazon Inventory Feed Tool

A PHP CLI script that synchronises inventory quantities from a local CSV file to Amazon Seller Central via the **Selling Partner API (SP-API)**, using the `JSON_LISTINGS_FEED` feed type.

## What It Does

1. **Reads a CSV file** (`matrixify/amazon_stock.csv`) containing SKU and quantity columns.
2. **Authenticates** with Amazon using Login with Amazon (LWA) OAuth and AWS Signature Version 4.
3. **Builds a JSON Listings Feed** from the CSV data (partial updates to `fulfillment_availability`).
4. **Submits the feed** to SP-API via the Feeds API (v2021-06-30):
   - Creates a feed document and receives a presigned S3 upload URL.
   - Uploads the JSON payload to S3.
   - Creates the feed referencing the uploaded document.
5. **Polls for completion** (15-second intervals, up to 1 hour).
6. **Downloads the processing report** and saves it locally.
7. **Optionally verifies** updated listings by querying the Listings Items API for specific SKUs.

## Requirements

- **PHP 8.1+** (uses `str_starts_with`, `str_ends_with`, strict types, named arguments)
- **cURL extension** (`php-curl`)
- **JSON extension** (`php-json`) — bundled by default
- **zlib extension** (`php-zlib`) — for gzip-compressed report downloads
- An **Amazon SP-API application** with valid credentials

## Directory Structure

```
amazon-inventory-upload-tool/
├── amazon_inventory_feed.php    # Main script
├── matrixify/
│   └── amazon_stock.csv         # Input CSV (SKU + QTY)
└── spapi_sync_out/              # Created at runtime
    ├── feed_payload.json        # The submitted JSON feed
    ├── feed_processing_report.json
    ├── amazon_listing_state_verify.json  # (if verification enabled)
    └── curl_verbose.log         # cURL debug log
```

## Configuration

### Environment File

The script loads credentials from an `amazon.env` file located **five directories above** the script directory. Adjust the path in the script if your layout differs.

Create the file with the following variables:

```env
# Amazon SP-API / LWA credentials
LWA_CLIENT_ID=amzn1.application-oa2-client.xxxxxxxxxx
LWA_CLIENT_SECRET=your-client-secret
LWA_REFRESH_TOKEN=Atzr|your-refresh-token

# Seller identity
SELLER_ID=AXXXXXXXXXXXXX

# AWS IAM credentials (for SigV4 signing)
AWS_ACCESS_KEY_ID=AKIAXXXXXXXXXXXXXXXX
AWS_SECRET_ACCESS_KEY=your-secret-key
AWS_REGION=eu-west-1

# Optional: STS session token (if using temporary credentials)
# AWS_SESSION_TOKEN=...

# Optional: verify SKUs after feed completes
# VERIFY_SKUS=SKU1,SKU2,SKU3
# VERIFY_COUNT=5
```

All variables except `AWS_SESSION_TOKEN`, `VERIFY_SKUS`, and `VERIFY_COUNT` are **required**.

### Input CSV

Place your CSV at `matrixify/amazon_stock.csv` relative to the script. It must contain at least two columns (case-insensitive headers):

| Column | Description |
|--------|-------------|
| `SKU`  | The seller SKU / merchant SKU |
| `QTY`  | Integer quantity to set |

Example:

```csv
SKU,QTY
WIDGET-001,25
WIDGET-002,0
GADGET-XL,150
```

**Notes:**
- Duplicate SKUs are deduplicated (last occurrence wins).
- Negative quantities are clamped to `0`.
- Non-integer quantities default to `0` with a warning.
- UTF-8 BOM is handled automatically.

## Usage

```bash
php amazon_inventory_feed.php
```

The script outputs timestamped log lines to stdout:

```
[2025-01-15 10:30:00Z] === Amazon Inventory Feed v1.2 (fixed double-poll) ===
[2025-01-15 10:30:00Z] Loading env: /path/to/amazon.env
[2025-01-15 10:30:00Z] Using CSV: /path/to/matrixify/amazon_stock.csv
[2025-01-15 10:30:00Z] Parsed 42 unique SKU(s) from CSV
[2025-01-15 10:30:01Z] Got LWA access token
[2025-01-15 10:30:01Z] Built feed JSON (saved feed_payload.json)
[2025-01-15 10:30:02Z] Created feedDocumentId=amzn1.tortuga.4.na.xxxxxx
[2025-01-15 10:30:03Z] Uploaded feed content
[2025-01-15 10:30:04Z] Submitted feedId=12345678
[2025-01-15 10:30:19Z] ProcessingStatus=IN_PROGRESS (attempt 1/240)
...
[2025-01-15 10:31:04Z] ProcessingStatus=DONE (attempt 4/240)
[2025-01-15 10:31:05Z] Saved processing report: feed_processing_report.json
[2025-01-15 10:31:05Z] All done ✅
```

### Exit Codes

| Code | Meaning |
|------|---------|
| `0`  | Success |
| `1`  | Failed to create the output directory |
| `2`  | Runtime error (auth failure, API error, CSV issue, timeout, etc.) |

## Post-Feed Verification

You can optionally verify that Amazon has applied your inventory changes by setting either:

- **`VERIFY_SKUS`** — a comma/semicolon/newline-separated list of specific SKUs to check.
- **`VERIFY_COUNT`** — an integer; the script will verify the first N SKUs from the CSV.

Verification queries the **Listings Items API** (`GET /listings/2021-08-01/items/{sellerId}/{sku}`) for each SKU and saves the results to `spapi_sync_out/amazon_listing_state_verify.json`.

## Marketplace

The script is preconfigured for the **Amazon UK marketplace** (`A1F83G8C2ARO7P`) and the **EU SP-API endpoint** (`sellingpartnerapi-eu.amazon.com`). To target a different marketplace, update the `$BASE` and `$MARKETPLACE_ID` constants at the top of the main block.

## Error Handling

- **Retries with exponential backoff**: SP-API requests automatically retry up to 3 times on HTTP 429 (throttling) and 5xx (server) errors, with delays of 2s, 4s, and 8s.
- **Feed polling timeout**: If the feed hasn't completed after 240 polls (1 hour), the script exits with an error.
- **Empty processing status**: Fails fast rather than polling indefinitely if Amazon returns a blank status.