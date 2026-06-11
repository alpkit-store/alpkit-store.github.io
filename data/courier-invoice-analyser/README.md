> Sanitised public copy of this repo's README — internal endpoints replaced with placeholders.

# Courier Analysis

Three connected tools for monitoring courier spend and validating carrier invoices against Khaos dispatch data.

---

## Setup

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r Scripts/requirements.txt
```

The virtual environment must be active before running any script.

### KC Database connection

The scripts query the Khaos Control database directly. Set the following environment variables so the scripts can connect:

| Variable | Value |
|---|---|
| `KC_SERVER` | `<kc-sql-server>,1433` |
| `KC_DATABASE` | KC database name |
| `KC_USER` | SQL login username |
| `KC_PASSWORD` | SQL login password |

**Your machine's IP address must be whitelisted** to connect on port 1433 — contact IT if you need access.

On macOS/Linux, add to your shell profile (`~/.zshrc` or `~/.bash_profile`):

```bash
export KC_SERVER="<kc-sql-server>,1433"
export KC_DATABASE="your_database"
export KC_USER="your_username"
export KC_PASSWORD="your_password"
```

On Windows (PowerShell), set as user environment variables:

```powershell
[System.Environment]::SetEnvironmentVariable("KC_SERVER",   "<kc-sql-server>,1433", "User")
[System.Environment]::SetEnvironmentVariable("KC_DATABASE", "your_database",       "User")
[System.Environment]::SetEnvironmentVariable("KC_USER",     "your_username",       "User")
[System.Environment]::SetEnvironmentVariable("KC_PASSWORD", "your_password",       "User")
```

If the variables are not set or the database is unreachable, the scripts fall back to the CSV exports in `Data/` automatically (a warning is printed to stderr).

---

## Running manually

Always run from the project root with the virtual environment active. Both steps are required — without `source`, the script will fail because the dependencies are not available to system Python.

```bash
cd /path/to/courier-invoice-analyser
source .venv/bin/activate
python3 Scripts/invoice_validator.py --inbox --move
```

To reprocess an invoice that has already been logged:

```bash
cd /path/to/courier-invoice-analyser
source .venv/bin/activate
python3 Scripts/invoice_validator.py --inbox --move --reprocess 75501
```

Replace `75501` with the invoice number to reprocess.

---

## Project Structure

```
Config/
  carriers.json              — carrier config: account codes, column mappings, rate cards, bank details
  kc_query.sql               — KC dispatch export query (update when carrier mapping changes)
Data/
  2025.csv                   — Khaos dispatch export (tab-separated)
  2026.csv                   — Khaos dispatch export (tab-separated)
  DHL_delivery_history.csv   — merged DHL delivery status history
  TDG_delivery_history.csv   — merged TDG delivery status history
  DPD_delivery_history.csv   — merged DPD delivery status history
Inbox/
  *.csv / *.xlsx / *.pdf     — drop carrier invoices and delivery reports here
  processed/                 — files are moved here after processing
Reports/
  invoices/                  — per-invoice markdown + PDF reports
  profile/                   — monthly and rolling courier profile reports
  commentary/                — editable monthly markdown injected into profile reports
  continuum-redown-shipments.csv
Scripts/
  invoice_validator.py       — invoice validation and report generation
  merge_delivery_reports.py  — merge carrier delivery reports into history files
  courier_report.py          — monthly and rolling profile report generation
  validate_invoices.sh       — shell wrapper for KM/cron triggering
```

---

## 1. Invoice Validator

Validates carrier invoices against Khaos dispatch data and carrier delivery reports. Produces a structured markdown and PDF report for each invoice.

**Carriers supported:** DHL Parcel UK, DPD, The Delivery Group (TDG/Yodel)

### Inputs required before running

Before processing a new invoice, ensure the following are up to date:

1. **Khaos dispatch export** — export from Khaos and save to `Data/` as `2025.csv` or `2026.csv`
2. **Carrier delivery reports** — drop new CSVs into `Inbox/` and run the merge script (see section 2)
3. **Invoice files** — drop into `Inbox/` (CSV or XLSX data file, plus PDF if available)

### Usage

```bash
# Process all invoices in Inbox/ and archive them
python3 Scripts/invoice_validator.py --inbox --move

# Process a single file
python3 Scripts/invoice_validator.py Inbox/245803.16909195.csv

# Reprocess an already-logged invoice (e.g. after updating delivery history)
python3 Scripts/invoice_validator.py --reprocess 16909195 Inbox/processed/245803.16909195.csv
```

The shell wrapper `validate_invoices.sh` runs `--inbox --move` and is designed for triggering via Keyboard Maestro or cron (handles PATH and venv automatically).

### What the report checks

**Summary and Action Checklist**
A three-column summary table showing invoice totals alongside inline check results. The Action Checklist lists only items requiring active follow-up.

**Section 1: Potential Claims**
- *Undelivered (No Record of Sending)* — invoiced lines with no matching consignment in Khaos and no confirmed delivery. Potential dispute candidates.
- *Undelivered (Outside SLA)* — lines matched in Khaos but not yet confirmed delivered in the carrier report.

**Section 2: System Integrity**
- *Possibly Not Despatched* — consignment ref found in Khaos but not in an ISSUED stage.
- *Unmatched Invoice Lines* — invoiced lines with no consignment match in Khaos, with delivery status from the carrier report.
- *Possibly sent with same courier on different consignment number* — unmatched lines where a same-carrier shipment to the same postcode exists around the same date.
- *Possibly sent with different courier* — unmatched lines where a different-carrier shipment to the same postcode exists around the same date.

**Section 3: Billing Deep Dive**
- *Duplicate Consignment Refs* — refs appearing more than once on the invoice.
- *Surcharge Detail* — breakdown of all surcharge charges per shipment.
- *Pricing Mismatches* — base rates that deviate from the contracted rate card in `carriers.json`.
- *Unrecognised Rate Lines* — service/product combinations with no matching rate rule.

Reports are written to `Reports/invoices/` as `<CARRIER>_<INVOICE>_<DATE>.md` and `.pdf`. A running log is kept in `Reports/invoices/invoice-history.md`.

### Adding a new carrier

Add an entry to `Config/carriers.json` with:
- `account_codes` — for matching invoice files
- `dispatch_carrier_names` — how the carrier appears in the Khaos export
- `invoice_formats` — `csv` or `xlsx`
- `csv` / `xlsx` — column mappings for the invoice format
- `delivery_report` — column mappings and filename pattern for delivery CSVs
- `expected_bank` — bank and VAT details for payment verification
- `rate_card` — contracted rates for pricing validation

---

## 2. Delivery Report Merger

Merges carrier delivery report CSVs into persistent per-carrier history files in `Data/`. The invoice validator reads these history files to enrich invoice lines with delivery status.

Each carrier export covers a limited window (DPD: one week at a time). The merge script applies a newest-status-wins rule so the history file always holds the most up-to-date status per parcel.

### Usage

```bash
# Merge all carriers
python3 Scripts/merge_delivery_reports.py

# Merge one carrier only
python3 Scripts/merge_delivery_reports.py DPD
python3 Scripts/merge_delivery_reports.py DHL
python3 Scripts/merge_delivery_reports.py TDG
```

Drop delivery report CSVs into `Inbox/` before running. Files are moved to `Inbox/processed/` after merging. Name files with a `YYYY-MM-DD_` prefix and the carrier pattern in the filename (e.g. `2026-04-15_DPD_Delivery_Report.csv`) so they are picked up correctly and sorted chronologically.

**Carrier filename patterns:**
| Carrier | Pattern |
|---|---|
| DHL Parcel UK | `DHL_Delivery_Report` or `DHL_UK` |
| TDG | `TDG_Delivery_Report` |
| DPD | `DPD_Delivery_Report` |

---

## 3. Courier Profile Reports

Analyses Khaos dispatch data to produce shipment profile reports broken down by carrier, service, geography, source channel, and order type.

### Usage

```bash
# Single month
python3 Scripts/courier_report.py --month 2026-03

# All months with data (writes one file per month)
python3 Scripts/courier_report.py --all

# Rolling 12-month window
python3 Scripts/courier_report.py --rolling-12

# Year to date
python3 Scripts/courier_report.py --ytd

# Export all CONTINUUM/REDOWN shipments to CSV
python3 Scripts/courier_report.py --continuum-csv
```

Reports are written to `Reports/profile/` as `courier-YYYY-MM.md`, `courier-rolling-12.md`, or `courier-YYYY-ytd.md`.

### Report sections

- **Overview** — total shipments, carriers used, geographic split (domestic / Highlands & Islands / offshore / international)
- **Carrier and service breakdown** — volume and mix by carrier and service type, split by geography and AK location
- **Source channel** — shipments by order source (Online, Ilkley, Edinburgh, etc.)
- **Transfers and replenishments** — internal stock movements separated from customer shipments
- **Weight profile** — shipment volume by weight band per carrier
- **Delivery revenue** — delivery charge recovered vs. shipments sent
- **Special accounts** — CONTINUUM and REDOWN shipment summary
- **Exchanges** — exchange-type shipments
- **Data alerts** — flags anomalies such as missing consignment refs, £0-value customer orders, or unrecognised carriers

### Adding commentary

Create `Reports/commentary/YYYY-MM.md` for any month. The content is injected as a commentary section at the top of that month's report. Use `Reports/commentary/TEMPLATE.md` as a starting point.

---

## Data sources

| File | Source | Notes |
|---|---|---|
| KC database | Khaos Control (live) | Queried via `Config/kc_query.sql`; requires env vars |
| `Data/YYYY.csv` | Khaos dispatch export (fallback) | Tab-separated; used if DB is unreachable |
| `Data/*_delivery_history.csv` | Built by `merge_delivery_reports.py` | Do not edit manually |
| `Inbox/*.csv / *.xlsx` | Carrier portals | Invoice data files |
| `Inbox/*.pdf` | Carrier portals | Invoice PDFs; paired with data file by filename stem |
| `Inbox/*_Delivery_Report*.csv` | Carrier portals | Delivery status exports |
