# 100 Mile Club — Shopify App

A Cloudflare Worker app for Alpkit's 100 Mile Club walking challenge (June 2026). Customers log walks through the Shopify app proxy, earn rewards at 25/50/100 mile milestones, and get tagged in Shopify for Flow automation.

## Tech stack

- **Runtime**: Cloudflare Worker + [Hono](https://hono.dev/)
- **Database**: [Turso](https://turso.tech/) (libSQL)
- **Storage**: Cloudflare R2 (walk photos)
- **Shopify**: App proxy + Admin GraphQL API

## Project structure

```
src/
├── index.ts                  # Hono app entry point + cron export
├── scheduled.ts              # Cron handler — pushes stats to Shopify metafields
├── middleware/
│   └── shopify-auth.ts       # HMAC signature verification
├── routes/
│   ├── pages.ts              # Page render routes
│   ├── api.ts                # Walk CRUD + photo upload
│   └── featured-api.ts       # Featured walks CRUD (admin)
├── services/
│   ├── walks.ts              # Walk DB operations
│   ├── milestones.ts         # Milestone detection
│   ├── stats.ts              # Shared stats query (used by admin + cron)
│   ├── metaobjects.ts        # Shopify metaobject CRUD for featured walks
│   └── shopify.ts            # Admin API (customer tagging)
├── db/
│   ├── schema.sql            # Database schema + seed
│   └── client.ts             # Turso client + Env types
└── templates/
    ├── main.ts               # Full page HTML template
    └── components.ts         # Progress bar, form, walk list
```

## Setup

### 1. Install dependencies

```bash
npm install
```

### 2. Create the Turso database and apply schema

```bash
turso db create 100-mile-club
turso db shell 100-mile-club < src/db/schema.sql
```

### 3. Create the R2 bucket

```bash
wrangler r2 bucket create 100-mile-club-photos
```

Enable public access on the bucket in the Cloudflare dashboard and update `R2_PUBLIC_URL` in `wrangler.toml`.

### 4. Set secrets

```bash
wrangler secret put SHOPIFY_API_SECRET
wrangler secret put SHOPIFY_ACCESS_TOKEN
wrangler secret put TURSO_URL
wrangler secret put TURSO_AUTH_TOKEN
```

### 5. Configure the Shopify app proxy

In your Shopify Partner dashboard (or custom app settings):

- **Proxy URL**: `https://100-mile-club.<your-worker>.workers.dev`
- **Proxy sub-path prefix**: `apps`
- **Proxy sub-path**: `100-mile-club`

### 6. Dev

```bash
npm run dev
```

### 7. Deploy

```bash
npm run deploy
```

## Routes

### App proxy (customer-facing)

All requests must include valid Shopify app proxy HMAC params.

| Method | Path | Description |
|--------|------|-------------|
| GET | `/` | Main page (progress, form, history) |
| GET | `/api/walks` | JSON list of walks |
| POST | `/api/walks` | Log a new walk (multipart) |
| DELETE | `/api/walks/:id` | Delete a walk |

### Admin (bearer token auth)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/admin/api/stats` | Dashboard summary numbers |
| GET | `/admin/api/walks` | Paginated walk list |
| GET | `/admin/api/milestones` | All earned milestones |
| PATCH | `/admin/api/milestones/:id` | Mark milestone as fulfilled |
| GET | `/admin/api/config` | Read challenge config |
| POST | `/admin/api/config` | Update challenge config |
| GET | `/admin/api/featured` | List featured walks |
| POST | `/admin/api/walks/:id/feature` | Feature a walk |
| PATCH | `/admin/api/featured/:metaobject_id` | Update display name / sort order |
| DELETE | `/admin/api/featured/:metaobject_id` | Remove from featured |

## Milestone rewards

| Miles | Tag added | Reward (via Shopify Flow) |
|-------|-----------|---------------------------|
| 25 | `100mc-25` | Water Bottle |
| 50 | `100mc-50` | Woven Badge |
| 100 | `100mc-100` | Exclusive Alpkit T-Shirt |

## Featured walks

Admins can feature individual walks to showcase on the storefront. Featured walks are stored as Shopify **metaobjects** (type `featured_walk`) so they're accessible from Liquid without any API calls.

- Feature a walk from the **Walks** tab using the "Feature" button
- Manage featured walks in the **Featured Walks** tab: set a customer display name, reorder with ↑/↓, or remove
- On every create/update/delete, a `100mc.featured_walks_json` shop metafield is synced with the sorted list for use in themes

## Scheduled job (cron)

A cron trigger runs every 10 minutes to push aggregate stats to Shopify shop metafields under the `100mc` namespace:

| Metafield key | Type | Description |
|---------------|------|-------------|
| `total_miles` | `number_decimal` | Sum of all logged miles |
| `total_walks` | `number_integer` | Total walk count |
| `participants` | `number_integer` | Distinct customers who have logged |
| `reached_25` | `number_integer` | Customers who hit the 25-mile milestone |
| `reached_50` | `number_integer` | Customers who hit the 50-mile milestone |
| `reached_100` | `number_integer` | Customers who hit the 100-mile milestone |

These are readable from Liquid via `shop.metafields.100mc.*` and can be used for live stats blocks in the theme.

## Challenge window

Configured in the `challenge_config` table:

```sql
UPDATE challenge_config SET value = '2026-06-01' WHERE key = 'start_date';
UPDATE challenge_config SET value = '2026-06-30' WHERE key = 'end_date';
UPDATE challenge_config SET value = 'true' WHERE key = 'active';
```

### Testing the walk form before June

Shift the start date back to enable the form in the current date:

```bash
turso db shell 100-mile-club "UPDATE challenge_config SET value = '2026-03-01' WHERE key = 'start_date';"
```

Reset when done:

```bash
turso db shell 100-mile-club "UPDATE challenge_config SET value = '2026-06-01' WHERE key = 'start_date';"
```

## Maintenance scripts

### Wipe test data (`scripts/wipe-test-data.mjs`)

One-shot reset for moving from staging/test into a clean state before launch. Clears Turso walks + milestones, the R2 photos referenced by those walks, the `featured_walk` metaobjects, the `100mc/featured_walks_json` shop metafield, and any `100mc-25/50/100` tags on customers. Also resets `challenge_config.start_date` to `2026-06-01`.

Required env (export before running):

```bash
export TURSO_URL="…"
export TURSO_AUTH_TOKEN="…"
export SHOPIFY_ACCESS_TOKEN="…"
```

R2 deletes shell out to `wrangler`, so be logged in: `wrangler login`.

Preview first, then run for real:

```bash
npm run wipe-test-data -- --dry-run
npm run wipe-test-data                # prompts: Type WIPE to proceed
npm run wipe-test-data -- --confirm   # skip the prompt
```

The next cron tick (≤10 min) will refresh `shop.metafields['100mc'].*` to zeros.
