# Zero-touch repo showcase — design

**Date:** 2026-06-11
**Status:** Approved
**Repo:** alpkit-store.github.io

## Problem

The site currently shows READMEs for 10 of ~29 repos in the `alpkit-store` org. Keeping it current requires two manual acts per repo: editing `repos.json` here, and installing a push-workflow in the source repo. Neither has happened for the last ~19 repos. The site should serve two audiences — non-technical Alpkit staff who can't access GitHub, and anyone looking for inspiration on what custom tooling can do — with no manual site management.

## Goals

- A repo appears on the site with exactly one human action: adding a GitHub topic.
- Content is browsable by non-technical staff (plain-English summaries, not dev docs).
- Full READMEs remain available for technical readers.
- Everything runs on GitHub's free plan.

## Non-goals

- Screenshots, guides, or any content beyond what lives in repo READMEs.
- Automated redaction of sensitive README content (the opt-in click is the review gate).
- A JS framework or SSG dependency.

## Inclusion model: opt-in via topic

A repo is published if and only if it carries the GitHub topic **`public-docs`**. Adding/removing the topic (one click in the repo's About box) is the sole management act. This doubles as the safety gate: all org repos are private, and publishing a README is a deliberate act of exposure. Removing the topic removes the repo from the site on the next build.

## Architecture

One scheduled workflow in this repo replaces all per-repo push-workflows.

### Sync + build workflow (`.github/workflows/build.yml`)

- **Triggers:** nightly cron + `workflow_dispatch`.
- **Auth:** `ORG_READ_TOKEN` repo secret — a fine-grained PAT with metadata + contents read across `alpkit-store` repos. Fine-grained PATs expire (max 1 year); the site README documents the annual renewal. Fallback if org policy blocks fine-grained PATs: classic PAT with `repo` scope.
- **Steps:**
  1. List org repos via API; filter to non-archived repos with topic `public-docs`.
  2. For each: fetch README (raw), description, last-push date, topics.
  3. Hash each README; compare against the cached copy in `data/<repo>/`.
  4. For new/changed READMEs, call **GitHub Models** (free tier, authenticated by the workflow's own `GITHUB_TOKEN` with `models: read` permission) to generate a structured summary JSON:
     - `summary` — plain-English "what it does / who it's for / what problem it solves"
     - `category` — one of a fixed taxonomy (e.g. Shopify, Khaos Control, Operations & monitoring, Marketing & members, Utilities) so grouping stays consistent
     - The prompt instructs the model to exclude hostnames, URLs, and credentials from summaries.
  5. Cache summaries + README copies + metadata in `data/` (committed, so unchanged repos cost zero API calls and a Models outage degrades to yesterday's summary).
  6. Run the build script; commit the generated site; deploy to Pages.

### Build script (`scripts/build.mjs`)

Plain Node, no framework. Renders markdown at build time (marked or similar as a devDependency). Outputs:

- **Index page** — hero + summary cards grouped by category. Cards show the AI summary, not the README. A small vanilla-JS filter box searches over a generated index.
- **Per-repo pages** — AI summary on top, full rendered README below, last-updated badge, and a "View on GitHub (requires access)" link (honest labelling: repos are private).

Runnable locally with a token for development; deterministic given `data/`.

### Error handling

- Opted-in repo with no README → skipped, warning in build log.
- Models API failure → cached summary reused; if no cache exists, card shows the GitHub repo description as fallback.
- Workflow failure → GitHub Actions failure email.

## Free-plan compliance

- Pages from a public repo: free.
- Actions in a public repo: free, no minute cap.
- GitHub Models free tier: included with every account; per-day caps far exceed worst-case ~29 summary calls.
- Two one-time org-settings checks: allow fine-grained PATs (Third-party Access → Personal access tokens) and enable Models for org repos.

## Migration

1. Build and prove the new pipeline (manual `workflow_dispatch` runs).
2. Add `public-docs` topics to the repos that should be listed (starting with the current 10+).
3. Retire `repos.json`, `readmes/`, and the runtime-rendering `index.html`.
4. Remove the push-workflows from the ~10 source repos (separate sweep; until then they harmlessly commit into a folder nothing reads — delete `readmes/` only after the sweep).

## Testing

- Build script runs locally against committed `data/` fixtures; generated HTML spot-checked.
- First runs via `workflow_dispatch` with one or two opted-in repos before rolling out topics org-wide.
- Sanity check: every card on the index links to a per-repo page that renders.
