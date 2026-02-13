# Member Rewards Update Tool

Processes member discount data from Shopify CSV exports, detects changes against live Klaviyo profiles, and generates output files for Shopify and Klaviyo imports. Changed profiles are uploaded directly to Klaviyo via the bulk import API.

## Requirements

- PHP 8.2 or higher with the `curl` extension enabled
- No Composer or additional dependencies required

## Installation

```bash
# Clone or extract the project
cd /var/www/alpkit/member-rewards-update-tool

# Create required directories
mkdir -p input output logs cache
chmod 755 input output logs cache
```

## Configuration

### config/config.php

#### Input

| Setting | Description |
|---------|-------------|
| `input.customers_csv` | Path to the Customers CSV export |
| `input.discounts_csv` | Path to the Last 7 Days Discount Usage CSV export |

#### Output

| Setting | Description |
|---------|-------------|
| `output.directory` | Directory where output files will be saved |
| `output.archive_directory` | Directory where previous output files are moved on each run |
| `output.filename_pattern` | Customers XLSX filename — `%s` is replaced with the current date |
| `output.customers_copy_to` | Optional path to copy the Customers XLSX to after generation |
| `output.csv_filename_pattern` | Max Value CSV filename — `%s` is replaced with the current date |
| `output.max_value_copy_to` | Optional path to copy the Max Value CSV to after generation |
| `output.reviews_filename_pattern` | For Reviews CSV filename — `%s` is replaced with the current date |
| `output.reviews_copy_to` | Optional path to copy the For Reviews CSV to after generation |

#### Logging

| Setting | Description |
|---------|-------------|
| `log.directory` | Directory for log files |
| `log.level` | Log verbosity: `DEBUG`, `INFO`, `WARNING`, or `ERROR` |
| `processing.timezone` | Timezone for date formatting (default: `Europe/London`) |

#### Klaviyo profile fetch

| Setting | Description |
|---------|-------------|
| `klaviyo.enabled` | Set to `false` to skip Klaviyo comparison and write all rows to CSV |
| `klaviyo.fetch_mode` | `segment` — fetch only active profiles from a segment (default); `all` — fetch all profiles |
| `klaviyo.segment_id` | Klaviyo segment ID used when `fetch_mode` is `segment` (default: `XVnnDX` — ActiveProfiles) |
| `klaviyo.cache_dir` | Directory where the fetched profile index is cached |
| `klaviyo.cache_ttl` | Seconds before the cache is considered stale and re-fetched (default: `86400` — 24 hours) |

#### Klaviyo profile upload

| Setting | Description |
|---------|-------------|
| `klaviyo_upload.enabled` | Set to `true` to upload changed profiles directly to Klaviyo via the bulk import API |
| `klaviyo_upload.dry_run` | Set to `true` to log what would be uploaded without making any API calls |
| `klaviyo_upload.chunk_size` | Profiles per bulk import job (default: `5000`, Klaviyo max: `10000`) |
| `klaviyo_upload.retry_limit` | Maximum retries on a 429 rate limit response (default: `5`) |
| `klaviyo_upload.retry_delay_ms` | Initial back-off in milliseconds on a 429, doubles each retry (default: `500`) |

### config/api.env

Create this file with your Klaviyo API credentials. It is excluded from version control.

```
KLAVIYO_PRIVATE_KEY=pk_your_private_key_here
```

The API key requires the following scopes:
- `profiles:read` — for fetching profiles
- `segments:read` — for fetching segment membership
- `profiles:write` — for updating profile properties
- `lists:write` — required by the bulk import endpoint

## Input Files

The following CSV files must be in place before running (paths configured in `config/config.php`):

- `Customers.csv` — full customer export including discount code metafields
- `Last7daysDiscountUsage.csv` — recent discount usage export

## Usage

```bash
php process.php [--all|--segment] [--dry-run] [--refresh-cache]
```

| Flag | Description |
|------|-------------|
| *(none)* | Use the `fetch_mode` set in `config/config.php` |
| `--segment` | Override: fetch only active profiles from the configured segment |
| `--all` | Override: fetch all Klaviyo profiles |
| `--dry-run` | Enable upload dry-run mode — processes and writes output files normally, but skips the Klaviyo API upload |
| `--refresh-cache` | Delete the cached profile index and force a fresh fetch from the Klaviyo API |

The script will:

1. Load the Klaviyo profile index from cache, or fetch it from the API if the cache is stale
2. Load and index both CSV input files
3. Match recently used discount codes to customer records and move them from available to used
4. Move expired discount codes (expiry date before today) from available to expired
5. Sort remaining available codes by value (descending), then expiry date (descending), then alphabetically
6. Write the **Customers XLSX** — records where discount codes have changed (Shopify import)
7. Write the **Max Value CSV** — profiles that exist in Klaviyo and have changed properties (Klaviyo fallback import)
8. Write the **For Reviews CSV** — all customers who have at least one available discount code
9. Upload changed profiles directly to Klaviyo via the bulk import API (if `klaviyo_upload.enabled` is `true`)

## Output Files

Three files are written to the `output/` directory on each run, each dated with the current date. Previous files are automatically archived to `output/archive/`.

**`customers_YYYY-MM-DD.xlsx`** — Shopify bulk customer import:
- Only contains records where discount codes have changed since the last run
- Columns: `email`, `Command`, `Metafield: alpkit.discountcodes_2021`, `Metafield: alpkit.usedcodes_2021`, `Metafield: alpkit.expiredcodes_2021`

**`max_value_YYYY-MM-DD.csv`** — Klaviyo profile import (fallback / audit):
- Only contains profiles that exist in Klaviyo and have at least one changed property
- Columns: `Email`, `has_dividends`, `discount_code`, `discount_value`, `min_spend`, `multiple_codes`, `number_of_codes`, `balance`, `account_state`, `MBR_date_created`

**`for_reviews_YYYY-MM-DD.csv`** — All customers with active discount codes:
- Only contains customers who have at least one available (non-expired, non-used) discount code after processing
- Columns: `Email`, `Metafield: alpkit.discountcodes_2021`

Each output file can optionally be copied to a secondary location by setting the corresponding `copy_to` path in `config/config.php`.

## Klaviyo Cache

The fetched Klaviyo profile index is saved to `cache/` and reused for 24 hours (configurable via `klaviyo.cache_ttl`). This avoids a lengthy API fetch on every run.

Cache files are named by fetch mode:
- `cache/klaviyo_segment_XVnnDX.json` — segment fetch
- `cache/klaviyo_all.json` — full profile fetch

The cache directory is excluded from version control.

## Logs

Execution logs are written to `logs/process.log`. Each run appends a timestamped summary including:
- Number of Klaviyo profiles loaded (from cache or API)
- Processing time and customer counts
- CSV rows written vs skipped (unchanged/not in Klaviyo)
- Klaviyo upload job count, profile count, and any failures

## Cron Example

To run daily at 6am with healthchecks.io monitoring:

```
0 6 * * * /usr/bin/php /var/www/alpkit/member-rewards-update-tool/process.php >> /dev/null 2>&1
```
