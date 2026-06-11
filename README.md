# alpkit-store.github.io

Public showcase of Alpkit's in-house tools, generated automatically from repo READMEs.
Live at <https://alpkit-store.github.io>.

## How a repo gets on the site

Add the **`public-docs`** topic to the repo (repo page → ⚙ next to About → Topics).
That's it — the nightly build picks it up. Remove the topic to take it down.

> Adding the topic publishes the repo's README **verbatim** on the public internet.
> Check it for hostnames, URLs, credentials and anything else sensitive first.
> The AI-generated card summary is instructed to exclude such details, but the full README is shown as-is.

## How it works

`.github/workflows/build.yml` runs nightly (02:17 UTC), on push to `main`, and on manual dispatch:

1. `scripts/sync.mjs` — lists org repos tagged `public-docs`, fetches READMEs,
   and (only when a README changed) generates a plain-English summary + category
   via GitHub Models (`openai/gpt-4.1-mini`, free tier). Results are cached in `data/`.
2. `scripts/build.mjs` — renders `data/` to static HTML in `dist/` (index of summary
   cards grouped by category + one page per repo with the full README).
3. Deploys `dist/` to GitHub Pages.

Run locally: `$env:ORG_READ_TOKEN = gh auth token; npm run sync; npm run build`
(your `gh` token usually works for the Models call too; if it fails, the card falls back to the repo description and the next Actions run generates the real summary).
Tests: `npm test`.

## Operations

| Thing | Detail |
|---|---|
| `ORG_READ_TOKEN` secret | Fine-grained PAT, resource owner `alpkit-store`, all repos, **Contents: read** + **Metadata: read**. Max expiry is 1 year — **renew annually** (calendar reminder!). |
| Models auth | The workflow's own `GITHUB_TOKEN` with `models: read` — nothing to renew. |
| Stale cron | GitHub suspends scheduled workflows after ~60 days without repo activity. A `workflow_dispatch` run re-enables it. |
| Failures | GitHub emails the repo admins when the workflow fails. A Models outage degrades gracefully to cached/fallback summaries (failed summaries are retried on the next run). |
| `readmes/` (legacy) | Old push-synced READMEs. ~10 source repos still have push-workflows committing here; once those are removed, delete this folder. |
