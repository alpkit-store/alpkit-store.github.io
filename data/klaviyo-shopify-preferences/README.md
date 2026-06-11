# Klaviyo Shopify Preferences

A Shopify embedded app that allows customers to manage their Klaviyo marketing preferences (categories and interests) from within a Shopify storefront. The system consists of two components: a Shopify app and a Cloudflare Worker proxy.

---

## Architecture

```
Shopify Storefront
      ↓
Shopify App Proxy (/apps/klaviyo-preferences)
      ↓
Cloudflare Worker (klaviyo-prefs-proxy)
  - Validates HMAC signature from Shopify
  - Forwards request to Klaviyo API
      ↓
Klaviyo Profiles API
  - Creates/updates profile with preference data
```

---

## Components

### `klaviyo-preferences` — Shopify App

A Shopify embedded admin app built with [React Router v7](https://reactrouter.com/) and the [Shopify App template](https://github.com/Shopify/shopify-app-template-remix).

**Tech stack:**
- React Router v7 with Vite
- Shopify App Bridge + Polaris UI components
- Prisma ORM with SQLite (session storage)
- Shopify Admin GraphQL API (2026-04)

**Key configuration:**
- App Proxy routes `/apps/klaviyo-preferences` through to the Cloudflare Worker
- OAuth handles merchant authentication and session management
- Webhooks handle `app/uninstalled` and `app/scopes_update` events

**Routes:**

| Route | Purpose |
|-------|---------|
| `/app` | Main layout with App Bridge provider |
| `/app` (index) | Home page |
| `/app/additional` | Secondary page |
| `/auth/login` | Merchant login |
| `/auth/$` | OAuth callback |
| `/webhooks/app/uninstalled` | Clears session on uninstall |
| `/webhooks/app/scopes_update` | Updates session scopes |

**Setup:**

```bash
cd klaviyo-preferences
npm install
npm run setup       # runs Prisma migrations
npm run dev         # starts local dev server with Cloudflare tunnel
```

---

### `klaviyo-prefs-proxy` — Cloudflare Worker

A Cloudflare Worker that acts as a secure proxy between the Shopify App Proxy and the Klaviyo Profiles API. It verifies that requests originate from Shopify before forwarding preference data to Klaviyo.

**Tech stack:**
- Cloudflare Workers (TypeScript)
- Wrangler v4

**Environment secrets** (configured via Wrangler):
- `SHOPIFY_APP_SECRET` — used to verify Shopify HMAC signatures
- `KLAVIYO_PRIVATE_KEY` — Klaviyo private API key

**Endpoints:**

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/apps/klaviyo-preferences` | Returns empty preference arrays (placeholder for prefill) |
| `POST` | `/apps/klaviyo-preferences` | Saves customer preferences to Klaviyo |

**POST request body:**
```json
{
  "email": "customer@example.com",
  "categories": ["promotions", "newsletters"],
  "interests": ["footwear", "accessories"]
}
```

**Request flow:**
1. Shopify signs the request with HMAC-SHA256 using the app secret
2. Worker extracts and validates the signature — returns `401` if invalid
3. Worker parses the JSON payload and validates required fields
4. Worker calls `POST https://a.klaviyo.com/api/profiles/` to create or update the Klaviyo profile with the supplied `categories` and `interests` as custom properties
5. Returns `{ ok: true }` on success

**Error responses:**

| Status | Reason |
|--------|--------|
| `401` | Missing or invalid Shopify HMAC signature |
| `400` | Missing email or malformed JSON |
| `405` | HTTP method not allowed |
| `502` | Klaviyo API call failed |

**Setup:**

```bash
cd klaviyo-prefs-proxy/misty-wave-da35
npm install
npm run dev         # local Wrangler dev server
npm run deploy      # deploy to Cloudflare
```

Set secrets before deploying:
```bash
wrangler secret put SHOPIFY_APP_SECRET
wrangler secret put KLAVIYO_PRIVATE_KEY
```

---

## Data Flow

When a customer submits their preferences:

1. The Shopify storefront sends a POST request to `/apps/klaviyo-preferences`
2. Shopify's App Proxy signs the request and forwards it to the Cloudflare Worker
3. The Worker validates the HMAC signature using `SHOPIFY_APP_SECRET`
4. The Worker calls the Klaviyo Profiles API, setting `categories` and `interests` as custom profile properties on the profile identified by the customer's email address
5. Klaviyo creates the profile if it doesn't exist, or updates it if it does
