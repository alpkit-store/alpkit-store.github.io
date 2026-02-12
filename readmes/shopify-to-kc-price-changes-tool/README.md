# Shopify to KC Price Changes Tool

A PHP pipeline that imports Shopify product variant prices from Matrixify CSV exports, tracks only meaningful price changes in MySQL, and exports an actionable CSV of ADD/UPDATE/DELETE operations by cross-referencing against a KC pricelist in MS SQL Server.

## How It Works

Shopify (via Matrixify) frequently exports variant data, but not every update represents an actual price change. This tool forms a three-stage pipeline:

1. **Import** — bulk-loads all variant price data from a Matrixify CSV into MySQL
2. **Process** — filters incoming CSV data to record only genuine price changes (ignoring non-price Shopify updates)
3. **Export** — cross-references the last 25 hours of detected price changes against a KC pricelist in MS SQL Server and writes a CSV with ADD, UPDATE, or DELETE semantics

## Scripts

### 1. `import_variant_prices.php` — Initial / Bulk Import

- **Purpose:** First-run or full-reload import of all variant prices from the Matrixify CSV into MySQL
- **Input:** `./matrixify/Export/variant_prices.csv`
- **Output:** Populates the `shopify_variant_prices` MySQL table
- **Behaviour:**
  - Creates the `shopify_variant_prices` table if it doesn't exist
  - Parses every CSV row and inserts it in a single atomic transaction
  - Uses `ON DUPLICATE KEY UPDATE` so re-importing the same file is safe
  - Skips rows with missing dates, variant IDs, SKUs, or prices
- **Monitoring:** Pings HealthChecks.io on start, success, or fatal error

### 2. `process_variant_price_changes.php` — Delta Processor

- **Purpose:** Recurring import that only records rows where the price or compare-at price has actually changed
- **Input:** `./matrixify/Export/variant_prices.csv`
- **Output:** Inserts only changed rows into the `shopify_variant_prices` MySQL table
- **Behaviour:**
  - For each CSV row, looks up the most recent database record for that variant
  - **New variant** (no prior record) — always inserted
  - **No price change** (price and compare-at price match the last record) — skipped
  - **Real price change** (either value differs) — inserted
  - Uses string comparison for decimal precision safety
  - Runs in a single transaction with rollback on error
- **Monitoring:** Pings HealthChecks.io on start, success, or fatal error

### 3. `export_price_changes_25h.php` — Export with ADD/UPDATE/DELETE Semantics

- **Purpose:** Produces a CSV of actionable price changes for the KC system by comparing recent Shopify price changes against the existing KC pricelist
- **Input:** MySQL `shopify_variant_prices` table (last 25 hours) + MS SQL Server `STOCK` / `STRUC_DISCOUNTS` tables
- **Output:** `./tmp/price_changes_last_25_hours.csv` with columns `STOCK_CODE` and `WEB_GBP`
- **Behaviour:**
  1. Connects to MS SQL Server and fetches all SKUs in the KC pricelist (where `COMPCLASS_ID = 45`)
  2. Connects to MySQL and retrieves the latest price record per variant from the last 25 hours
  3. Excludes variants with SKUs ending in `-BB`
  4. Applies the following rules for each changed variant:

     | Condition | In KC Pricelist? | `compare_at_price` | Action | `WEB_GBP` value |
     |-----------|-----------------|---------------------|--------|-----------------|
     | UPDATE | Yes | Not null | Write row | The price value |
     | DELETE | Yes | Null | Write row | `DELETE` |
     | ADD | No | Not null | Write row | The price value |
     | Ignore | No | Null | Skip | — |

  5. Outputs a summary of added, updated, deleted, and ignored rows

## Pipeline Sequence

The scripts are designed to run in order. Steps 2 and 3 are the recurring pipeline:

```
                    Matrixify CSV Export
                           │
          ┌────────────────┼────────────────┐
          │                │                │
  (first run only)   (recurring)      (after step 2)
          │                │                │
          ▼                ▼                ▼
  ┌──────────────┐ ┌──────────────┐ ┌──────────────────┐
  │  1. import   │ │  2. process  │ │    3. export      │
  │  _variant_   │ │  _variant_   │ │  _price_changes_  │
  │  prices.php  │ │  price_      │ │     25h.php       │
  │              │ │  changes.php │ │                    │
  │  Bulk load   │ │  Delta only  │ │  Cross-ref KC     │
  │  all rows    │ │  into MySQL  │ │  pricelist (MSSQL) │
  │  into MySQL  │ │              │ │  → output CSV     │
  └──────────────┘ └──────┬───────┘ └──────────────────┘
                          │                ▲
                          └────────────────┘
                         runs sequentially
```

## Requirements

- **PHP 7.4+** with extensions: PDO, PDO_MySQL, sqlsrv
- **MySQL / MariaDB** with utf8mb4 support
- **Microsoft SQL Server** (accessed via the `sqlsrv` PHP driver)
- **Connection configs** (not included in repo):
  - `../../../Connections/gcConni.php` — defines `$dbhost`, `$database`, `$dbuser`, `$dbpassword` (MySQL)
  - `../../../Connections/gcConn_msi.php` — defines `$db_ms` via `sqlsrv_connect()` (MS SQL Server)

## Setup

1. Place the Matrixify CSV export at:
   ```
   ./matrixify/Export/variant_prices.csv
   ```

2. Ensure the CSV contains these columns (in order):
   - Updated At (format: `YYYY-MM-DD HH:MM:SS +0000`)
   - Variant ID
   - Variant SKU
   - Variant Price
   - Variant Compare At Price

3. Ensure both database connection config files exist at the expected relative paths.

4. Create the output directory for the export script:
   ```bash
   mkdir -p ./tmp
   ```

## Usage

**Full import** (first run or reload):

```bash
php import_variant_prices.php
```

**Process price changes and export** (recurring):

```bash
php process_variant_price_changes.php
php export_price_changes_25h.php
```

### Example Output

`process_variant_price_changes.php`:
```
Rows in CSV:           1500
New variants tracked:  12
Price changes logged:  34
Non-price updates:     1454
```

`export_price_changes_25h.php`:
```
Pricelist SKUs (MS SQL): 4200
Latest changed variants: 34
Added rows:              3
Updated rows:            28
Deleted rows:            1
Ignored rows:            2
```

## Database Schema

The import and process scripts auto-create a `shopify_variant_prices` table:

| Column | Type | Description |
|--------|------|-------------|
| `id` | BIGINT | Auto-increment primary key |
| `variant_id` | BIGINT | Shopify variant ID (indexed) |
| `variant_sku` | VARCHAR(100) | Variant SKU (indexed) |
| `price` | DECIMAL(10,2) | Current price |
| `compare_at_price` | DECIMAL(10,2) | Compare-at price (nullable) |
| `updated_at` | DATETIME | Shopify update timestamp (indexed) |
| `created_at` | TIMESTAMP | Row creation time |

A composite unique index on `(variant_id, updated_at)` prevents duplicate entries.

## Monitoring

The import and process scripts send start/completion/failure pings to [HealthChecks.io](https://healthchecks.io/) for execution monitoring and alerting. Each script uses its own health check UUID.

## Design Notes

- **Idempotent** — re-running against the same CSV won't create duplicates (`ON DUPLICATE KEY UPDATE`)
- **Transaction-safe** — all inserts run in a single transaction with rollback on error
- **String comparison for prices** — avoids floating-point precision issues when detecting changes
- **Timezone-aware** — correctly parses Shopify's datetime format including UTC offset
- **O(1) pricelist lookup** — KC SKUs are indexed into a hash map for fast membership checks
- **SKU filtering** — variants with SKUs ending `-BB` are excluded from export
- **Zero dependencies** — uses only PHP standard library and database drivers