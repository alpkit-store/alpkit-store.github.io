> Sanitised public copy of this repo's README — internal endpoints replaced with placeholders.

# Member Rewards — Refund Reactivation

When a customer refunds an order that used a Member Rewards (`MBR*`) discount code on the Alpkit UK store
(`alpkit-sonder`), this service reissues an equivalent code for the refunded value and appends it to the
customer's `alpkit.discountcodes_2021` metafield — automating the manual CS task of reactivating a member
reward on return.

## Production — Cloudflare Worker (webhook)

The live system is a Cloudflare Worker subscribed to the store's `refunds/create` webhook.

- **Worker URL:** internal Cloudflare Workers endpoint (not published)

Flow of a request:

```
refunds/create → Worker
  HMAC verify → mint Admin API token (client-credentials)
  → fetch order/refund/customer via Admin GraphQL (one validated query)
  → compute refunded MBR value (per-line allocation, reconciliation-clamped)
  → discountCodeBasicCreate (deterministic MBR*RF<refundId>)
  → metafieldsSet with compareDigest CAS (bounded retry)
  → D1 audit row
```

Behaviour:
- Full **and partial** refunds (partial = pro-rated to the refunded portion of the MBR allocation).
- Original code expired → reissue expires at **refund date + 180 days**; otherwise the original expiry.
- Decimal values; **min spend = 2× value**; scoped to collection `gid://shopify/Collection/317519167593`
  ("Everything except, GV, gas, Trakke, Footwear"); restricted to the customer; one use per customer.
- Idempotent: deterministic code name + metafield "already contains" guard + D1 `refund_id` uniqueness.

### Layout

```
src/            Worker — handler (index), orchestration (process), value math (value/codes/reissue),
                Shopify client (shopify), HMAC (hmac), token (token), D1 audit (audit)
test/           Vitest unit tests + live validation results
migrations/     D1 schema (reissues table)
wrangler.toml   Worker + D1 binding config
flow/           Earlier Shopify Flow POC artifacts — superseded by the Worker (kept for reference)
docs/superpowers/specs|plans/   Design + implementation docs
```

### Operate

- Test: `npm test`
- Deploy: `npm run deploy` (`wrangler deploy`)
- Secrets (`wrangler secret put`): `SHOPIFY_CLIENT_ID`, `SHOPIFY_CLIENT_SECRET`, `SHOPIFY_WEBHOOK_SECRET`, `RESEND_API_KEY`
- Required Admin API scopes (on the custom app): `read_orders`, `read_discounts`, `write_discounts`,
  `read_customers`, `write_customers`, `read_users`
  (there is no `read_webhooks`/`write_webhooks` scope — webhook subscriptions are authorised by the topic's
  resource scope, i.e. `read_orders` for `refunds/create`; `read_users` backs the App Home owner gate)
- D1: `member-rewards-reissues` (binding `DB`); apply schema with
  `wrangler d1 migrations apply member-rewards-reissues --remote`

### Webhook registration & pause

The `refunds/create` webhook is an **app-owned API subscription** (created via `webhookSubscriptionCreate`, not
the admin Notifications UI), so the App Home page can detect it via `webhookSubscriptions` and it is HMAC-signed
with the **app's client secret** — i.e. `SHOPIFY_WEBHOOK_SECRET` is the custom app's client secret.

Manage it with `scripts/register-webhook.mjs` (Node 18+), using the same app credentials:

```bash
SHOPIFY_CLIENT_ID=… SHOPIFY_CLIENT_SECRET=… node scripts/register-webhook.mjs register   # enable
SHOPIFY_CLIENT_ID=… SHOPIFY_CLIENT_SECRET=… node scripts/register-webhook.mjs delete     # pause
SHOPIFY_CLIENT_ID=… SHOPIFY_CLIENT_SECRET=… node scripts/register-webhook.mjs status     # list
```

No dedicated webhook scope is needed — subscribing to `refunds/create` is authorised by `read_orders`. The App
Home extension shows a live **Active / Not activated** badge for this subscription.

### Daily report

A cron trigger (`0 7 * * *`, 07:00 UTC) runs the Worker's `scheduled` handler, which emails a
summary of the previous 24h of `reissued` and `error` audit rows to `the ops mailbox` via Resend.
No email is sent when there is no activity in the window.

- Secret: `wrangler secret put RESEND_API_KEY`
- The sender address must be on a verified domain in Resend (SPF/DKIM DNS records).

## Data model

Codes live in the customer metafields `alpkit.discountcodes_2021` (available), `alpkit.usedcodes_2021` (used),
and `alpkit.expiredcodes_2021` (expired): namespace `alpkit`, type `single_line_text_field`, ` | `-separated
entries of the form `MBR*<CODE>_<VALUE>_<DD/MM/YYYY>`. The real Shopify code is the bare `MBR*<CODE>`; the
`_VALUE_DD/MM/YYYY` suffix is annotation. A daily PHP cron (`member-rewards-update-tool`) also reads/writes
these and preserves each entry's raw string.

## Earlier Flow POC

Before the Worker, a Shopify Flow proof-of-concept validated the core mechanism (reissue + metafield append)
for the full-refund happy path, using the `refunds/create` Flow trigger and Send-Admin-API-request actions.
Its artifacts (validated mutations, Liquid templates, build runbook) remain under `flow/` for reference. The
Worker is the production path and supersedes it.

## Docs

- Production design: `docs/superpowers/specs/2026-06-03-refund-reactivation-webhook-design.md`
- Production plan: `docs/superpowers/plans/2026-06-03-refund-reactivation-webhook.md`
- Flow POC design / plan: `docs/superpowers/specs/2026-06-01-refund-reactivation-flow-poc-design.md`,
  `docs/superpowers/plans/2026-06-01-refund-reactivation-flow-poc.md`
- Live validation results: `test/results-2026-06-03.md`
