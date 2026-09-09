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

CI runs on every push and PR (`.github/workflows/ci.yml`): typecheck, test, lint, format check, and a check that `worker-configuration.d.ts` matches `wrangler.jsonc`.

Deploys are not wired up. The repository has no `CLOUDFLARE_API_TOKEN` secret, so there is no deploy job yet. Adding one means copying activity-hub's: apply D1 migrations, then `wrangler deploy`, gated on `check` and on push to `main`. Until then, migrations in `migrations/` apply by hand with `wrangler d1 migrations apply code-hub --remote`.

## Cloudflare Configuration

Change Cloudflare resources (R2 buckets, D1 databases, cron triggers, secrets) through `wrangler.jsonc` plus the `wrangler` CLI, never through the Cloudflare dashboard. Dashboard edits drift from what's committed and get silently overwritten on the next deploy.

## Secrets

Worker secrets are set with `wrangler secret put`, never committed. `GITHUB_TOKEN` will be the first: the GraphQL and search APIs both need it, and it sees private repositories, so what the feed publishes about them is a decision the ingest path owns. Public, non-sensitive identifiers belong in `wrangler.jsonc` as `vars`.
