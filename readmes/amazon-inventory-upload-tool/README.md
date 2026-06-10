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

---

# Buy Box Gap Report (`amazon_buybox_report.php`)

A sibling read-only CLI that lists SKUs **with sellable stock but no featured offer ("buy box")**, with the reason and the price you'd need to win it. It reuses the same `amazon.env`, auth (LWA + SigV4), and retry/backoff helpers as the feed tool.

## What it does

1. Reads `matrixify/amazon_stock.csv` and keeps SKUs with `qty > 0` (your inventory truth — all offers are merchant-fulfilled, no FBA).
2. **`getListingOffersBatch`** (Product Pricing v0, 20 SKUs/call) — determines whether *your* offer holds the featured offer (`MyOffer` + `IsBuyBoxWinner`), your landed price, the buy-box price, and whether the buy box is suppressed.
3. For SKUs you don't hold: **`getFeaturedOfferExpectedPriceBatch`** (Product Pricing 2022-05-01, 40 SKUs/call) — the FOEP price at/below which you'd become the featured offer.
4. Writes `spapi_sync_out/buybox_report_<UTCstamp>.csv`.

## Usage

```bash
php amazon_buybox_report.php [--limit=N] [--no-foep] [--no-email] [--customer-type=Consumer|Business]
```

| Flag | Effect |
|------|--------|
| `--limit=N` | Only check the first N in-stock SKUs (quick test run). |
| `--no-foep` | Skip the slow FOEP pass (omits the price-to-win column). |
| `--no-email` | Don't email the report even if `REPORT_EMAIL_TO` is set. |
| `--customer-type=` | `Consumer` (default) or `Business`. |

Start with `--limit=5` to confirm auth and output before a full run.

## Emailing the report

On successful completion the CSV is emailed (as an attachment) if `REPORT_EMAIL_TO` is set in `amazon.env`. Sending uses the server's local MTA via PHP `mail()` — the same deliverable `noreply@alpkit.com` sender pattern as the clook-server notifications — so no SMTP setup is needed.

```env
# Email the finished report (optional). Comma-separated for multiple recipients.
REPORT_EMAIL_TO=james@alpkit.com,ops@alpkit.com
# Optional; defaults to noreply@alpkit.com
REPORT_EMAIL_FROM=noreply@alpkit.com
```

Emailing is **best-effort**: if it's unset, skipped (`--no-email`), or `mail()` fails, the run still completes and the report stays on disk — a mail problem never discards a report. Combine with `--limit=5` to test the email path quickly.

## Output columns

`sku, asin, qty, holds_buybox, your_landed_price, buybox_price, foep_target_price, reason`

The CSV contains **only** SKUs without the buy box. A one-line summary (checked / held / without) is written to stderr.

Reason values: `Buy box suppressed (no featured offer)`, `Not featured-offer eligible …`, `Price not competitive (buy box vs your landed price)`, `Lost featured offer (non-price: handling time / metrics)`, `ASIN not eligible …`, or `error: <message>` for per-SKU API failures.

## Rate limits

`getListingOffersBatch` is throttled to **0.5 req/s** (script paces ~2s/batch); `getFeaturedOfferExpectedPriceBatch` to **0.033 req/s** (one call per ~30s). The FOEP pass only runs on the no-buy-box subset, but on a large catalogue it dominates wall-clock — use `--no-foep` for a fast first look.

The Product Pricing quota is a tiny per-account/app bucket (burst 1) **separate** from the Feeds quota the inventory feed uses — so the two tools don't compete, but **don't run two reports at once**, and give the bucket a minute to refill before re-running an aborted one. A `QuotaExceeded` 429 means the bucket is empty; the script backs off 30s/60s to wait out the refill.

## Resilience on long runs

A full-catalogue run can take ~50–60 min, which is around the LWA token lifetime, so the script is built to survive long runs:

- **Token auto-refresh** — the LWA access token is re-minted once it's >40 min old (it expires at 60 min), before every batch in both passes.
- **Best-effort FOEP** — a FOEP batch that fails (throttle/expiry/transient) just leaves `foep_target_price` blank for those SKUs; it never aborts the run.
- **CSV always written** — the report is built from pass-1 data regardless of what pass 2 does, so a late failure can't discard the whole run.
- **Pass-1 batch failures** are recorded as `error: <message>` rows and the run continues.
- **Throttle-aware backoff** — 429s back off 30s/60s (matched to the refill), other retriable errors 2s/4s/8s.