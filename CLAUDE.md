# Code Hub

System of record for GitHub contribution data: pull requests, reviews, issues, and commit counts, archived raw in R2 and published as a code feed to [bendrucker.me](https://github.com/bendrucker/bendrucker.me). Sibling of [activity-hub](https://github.com/bendrucker/activity-hub), which does the same for rides and workouts. See the [README](README.md).

## Stack

Cloudflare Workers (TypeScript), Bun, Wrangler. Storage: D1 (`DB`), R2 (`RAW` for API responses, `LAKE` for Parquet output). `LAKE` is activity-hub's bucket, written under a `github/` prefix so one DuckDB session can join rides against pull requests. An hourly cron drives the sync. Config lives in `wrangler.jsonc`.

## Commands

- `bun run typecheck`: `tsc --noEmit` over `src/` and `test/`
- `bun run test`: runs `vitest run` (uses `@cloudflare/vitest-pool-workers`, config in `vitest.config.ts`)
- `bun run lint`: runs `oxlint --report-unused-disable-directives && ast-grep scan`
- `bun run format` / `bun run format:check`: oxfmt
- `bun run dev`: runs `wrangler dev` for local iteration
- `bun run wrangler <cmd>`: pinned Wrangler binary. Use this over a global `wrangler` install
- `bun run types`: regenerates `worker-configuration.d.ts` from `wrangler.jsonc`

## Deploy

CI runs on every PR and on push to `main` (`.github/workflows/ci.yml`): typecheck, test, lint, format check, and a check that `worker-configuration.d.ts` is current.

Deploys are not wired up. The repository has no `CLOUDFLARE_API_TOKEN` secret, so there is no deploy job yet. Adding one means copying activity-hub's: apply D1 migrations, then `wrangler deploy`, gated on `check` and on push to `main`. Until then, migrations in `migrations/` apply by hand with `wrangler d1 migrations apply code-hub --remote`.

## Cloudflare Configuration

Change Cloudflare resources (R2 buckets, D1 databases, cron triggers, secrets) through `wrangler.jsonc` plus the `wrangler` CLI, never through the Cloudflare dashboard. Dashboard edits drift from what's committed and get silently overwritten on the next deploy.

## Sync

The hourly cron runs one `updated:>` search per event kind plus `contributionsCollection` for the current year. Each search window opens an hour behind that kind's watermark, which covers the lag between a write on GitHub and its appearance in the search index. Kinds run one after another, so the first to reach the rate-limit floor ends the invocation instead of the other two spending their way to the same discovery.

A watermark is an ISO instant meaning synced through, and it moves only after every page is in R2 and every row is in D1. It moves forward only, so a backfill of 2013 cannot rewind a caught-up kind. A kind with no watermark is skipped, because anchoring at now would declare the whole history synced.

Backfill sets the first watermark and fills what the cron never saw:

```sh
curl -X POST -H "Authorization: Bearer $ADMIN_TOKEN" \
  "$WORKER/admin/backfill?kind=pr-authored&from=2012-12"
```

One call walks `BACKFILL_WINDOWS` monthly windows and answers with `next`, which is the `from` for the call after it and null once the walk reaches the present. `kind=contributions` walks the years `contributionYears` reports rather than months, and reads the year out of `from`. 2012-12 is the earliest month that can match.

## Secrets

Worker secrets are set with `wrangler secret put`, never committed. `wrangler dev` reads them from `.dev.vars`, which is gitignored. `GITHUB_TOKEN` signs every GraphQL and search request, and it sees private repositories, so what the feed publishes about them is a decision the ingest path owns. `ADMIN_TOKEN` guards `/admin/sync` and `/admin/backfill`, and both answer 404 while it is unset so an unconfigured deployment has no admin surface. Public, non-sensitive identifiers belong in `wrangler.jsonc` as `vars`: `GITHUB_LOGIN` is whose history the hub reads, and `BACKFILL_WINDOWS` is how many windows one backfill call walks.
