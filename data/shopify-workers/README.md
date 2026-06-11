# shopify-workers

Cloudflare Workers gluing Shopify to other services. One worker per folder under `workers/`, each independently deployable with its own `wrangler.jsonc`.

| Worker | Purpose | Used by |
|--------|---------|---------|
| [`gorgias-flow-proxy`](workers/gorgias-flow-proxy/) | Proxies Shopify Flow "Send HTTP request" calls to the Gorgias ticket-creation API, returning a slim response (Flow caps HTTP response size; Gorgias returns the full customer object, which can exceed it) | alpkit.com Flow workflow "Order note → Gorgias ticket" |

## Working on a worker

```sh
cd workers/<name>
npm install
npm run check    # wrangler types + tsc
npm run dev      # local dev server
npm run deploy   # deploy to Cloudflare
```

Secrets are managed per-worker via `wrangler secret put` — see each worker's README. Never commit `.dev.vars`.
