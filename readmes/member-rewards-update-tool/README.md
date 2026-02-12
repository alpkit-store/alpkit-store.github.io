# Member Rewards Update Tool

Processes member discount data from two CSV exports, detects changes against live Klaviyo profiles, and generates output files for Shopify and Klaviyo imports.

## Requirements

- PHP 8.2 or higher with the `curl` extension enabled
- No Composer or additional dependencies required

## Installation

```bash
# Clone or extract the project
cd /var/www/alpkit/member-rewards-update-tool

# Create required directories
mkdir -p input output logs
chmod 755 input output logs
```

## Configuration

### config/config.php

| Setting | Description |
|---------|-------------|
| `input.customers_csv` | Path to the Customers CSV export |
| `input.discounts_csv` | Path to the Last 7 Days Discount Usage CSV export |
| `output.directory` | Directory where output files will be saved |
| `output.filename_pattern` | Customers XLSX filename — `%s` is replaced with the current date |
| `output.csv_filename_pattern` | Max Value CSV filename — `%s` is replaced with the current date |
| `log.directory` | Directory for log files |
| `processing.timezone` | Timezone for date formatting (default: `Europe/London`) |
| `notifications.enabled` | Enable/disable email notifications on success or failure |
| `klaviyo.enabled` | Set to `false` to skip Klaviyo comparison and write all rows to CSV |
| `klaviyo.segment_id` | Klaviyo segment ID to fetch profiles from (default: `XVnnDX` — ActiveProfiles) |

### config/api.env

Create this file with your Klaviyo API credentials. It is excluded from version control.

```
KLAVIYO_PRIVATE_KEY=pk_your_private_key_here
```

## Input Files

The following CSV files must be in place before running (paths configured in `config/config.php`):

- `Customers.csv` — full customer export including discount code metafields
- `Last7daysDiscountUsage.csv` — recent discount usage export

## Usage

```bash
php process.php
```

The script will:

1. Fetch all profiles in the configured Klaviyo segment and their current custom properties
2. Load and index both CSV input files
3. Match recently used discount codes to customer records
4. Move used codes from available to used metafields
5. Write the Customers XLSX (only records where codes have changed)
6. Write the Max Value CSV (only profiles that exist in Klaviyo and have changed properties)

## Output

Two files are written to the `output/` directory on each run, both dated with the current date.

**`customers_YYYY-MM-DD.xlsx`** — Shopify bulk customer import:
- Only contains records where discount codes have changed since the last run
- Columns: `email`, `Command`, `Metafield: alpkit.discountcodes_2021`, `Metafield: alpkit.usedcodes_2021`

**`max_value_YYYY-MM-DD.csv`** — Klaviyo profile import:
- Only contains profiles that exist in Klaviyo and have at least one changed property
- Columns: `Email`, `has_dividends`, `discount_code`, `discount_value`, `min_spend`, `multiple_codes`, `number_of_codes`, `balance`, `account_state`, `First Name`, `Last Name`, `MBR_date_created`

Old output files are automatically archived to `output/archive/` on each run.

## Logs

Execution logs are written to `logs/process.log`. Each run logs a summary including how many CSV rows were written vs skipped as unchanged.

Log level can be set to `DEBUG`, `INFO`, `WARNING`, or `ERROR` in `config/config.php`.

## Cron Example

To run daily at 6am:

```
0 6 * * * /usr/bin/php /var/www/alpkit/member-rewards-update-tool/process.php
```