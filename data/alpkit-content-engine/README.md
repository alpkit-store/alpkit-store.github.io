# alpkit-content-engine

Content management tooling for Alpkit. Extracts site content from Shopify into
local markdown files, builds searchable indexes, and packages edits back into
Shopify via Matrixify. No API credentials required.

## What it does

- **shopify-sync** — bidirectional Shopify sync: extract blog posts and collection pages to markdown, build JSON indexes, import edits back via Matrixify
- **seo-report** — weekly/monthly/quarterly SEO insights from SemRush (manual download) ands Search Console and GA4 (API calls)
- **content-review** — scores articles against weekly context for broadcast scheduling and content gap analysis
- **activity-pages** — generates weekly Matrixify import file for all activity hub metaobject entries from broadcast schedule and article index

## Prerequisites

- Python 3.10+
- [Matrixify](https://matrixify.app) installed on your Shopify store

## Setup

This repo sits inside an `Apps/` directory inside the AK-Projects management
repo. The venv and data directories live in AK-Projects, not here.

```bash
# From AK-Projects root:
git clone https://github.com/alpkit/alpkit-content-engine.git Apps/alpkit-content-engine

python3 -m venv .venv
source .venv/bin/activate
pip install -r Apps/alpkit-content-engine/requirements.txt

mkdir -p Data/Shopify Data/Analytics Data/Feedback Data/SEO/Store Data/SEO/Reports Data/indexes
```

## Quick start: sync from Shopify

1. Download a Matrixify Blog Posts export from Shopify and save to `Data/Shopify/`
2. Run the refresh from AK-Projects root:

```bash
source .venv/bin/activate
bash Apps/alpkit-content-engine/workflows/shopify-sync/refresh.sh
```

Extracted content lands in `Apps/alpkit-content-engine/content/` (tracked in git).
Indexes land in `Data/indexes/`. Commit the content as your baseline.

## Import edits back to Shopify

After editing files in `Apps/alpkit-content-engine/content/blogs/`:

```bash
source .venv/bin/activate
python3 Apps/alpkit-content-engine/workflows/shopify-sync/export_to_excel.py
```

Upload the timestamped `Data/Shopify/Import_<date>_<time>.xlsx` to Shopify via Matrixify.

## Structure

```
workflows/
  shopify-sync/     # Extract, index, and import scripts
  seo-report/       # SEO insights pipeline
  content-review/   # Content scoring and recommendations
  activity-pages/   # Weekly metaobject import for activity hub pages
content/            # Extracted site content (tracked in git)
  blogs/
  collections/
# Data lives outside this repo, in AK-Projects/Data/:
#   Data/Shopify/       — Matrixify exports from Shopify and generated imports
#   Data/Analytics/     — GA4 and Search Console CSVs
#   Data/Feedback/      — Rivyo review exports
#   Data/indexes/       — Derived JSON indexes (not committed)
#   Data/SEO/Store/     — Rolling SEO data store
#   Data/SEO/Reports/   — Generated SEO and content review reports
```

## Documentation

Each workflow has a RUNBOOK with full run sequences and field notes:
- [`workflows/shopify-sync/RUNBOOK.md`](workflows/shopify-sync/RUNBOOK.md)
- [`workflows/seo-report/RUNBOOK.md`](workflows/seo-report/RUNBOOK.md)
- [`workflows/content-review/RUNBOOK.md`](workflows/content-review/RUNBOOK.md)
- [`workflows/activity-pages/RUNBOOK.md`](workflows/activity-pages/RUNBOOK.md)
