#!/usr/bin/env bun
// Drives POST /admin/backfill to completion. One call walks BACKFILL_WINDOWS
// windows and answers with where the next one resumes, so the walk over a
// decade of history is a loop out here rather than one long request in there.
//
// Usage: ADMIN_TOKEN=... bun run backfill <base-url> [kind] [--from YYYY-MM]

import { parseArgs } from "node:util";
import { z } from "zod";
import { SYNC_KINDS, type SyncKind } from "../src/sync/kinds";

const USAGE = `usage: ADMIN_TOKEN=... bun run backfill <base-url> [${SYNC_KINDS.join("|")}] [--from YYYY-MM]`;

// The route answers 200 with an `error` for a window that failed mid-walk, so
// the shape is the same either way and the fields decide whether to continue.
const BackfillResult = z.object({
  kind: z.string(),
  windows: z.array(z.string()),
  pages: z.number(),
  rowsChanged: z.number(),
  next: z.string().nullable(),
  error: z.string().nullable(),
});

type BackfillResult = z.infer<typeof BackfillResult>;

const { values: flags, positionals } = parseArgs({
  args: Bun.argv.slice(2),
  options: {
    from: { type: "string" },
  },
  allowPositionals: true,
});

const token = adminToken();
const [target, requested] = positionals;
if (target === undefined) {
  fail(USAGE);
}
if (requested !== undefined && !isSyncKind(requested)) {
  fail(USAGE);
}

const base = parseUrl(target);
const kinds = requested === undefined ? SYNC_KINDS : [requested];

try {
  for (const each of kinds) {
    // Kinds share one GitHub rate limit and one Worker, and a kind that stops
    // on a failed window should stop the run before the next kind spends
    // requests reaching the same wall.
    // eslint-disable-next-line no-await-in-loop
    await walk(each);
  }
} catch (error) {
  fail(error instanceof Error ? error.message : String(error));
}

async function walk(kind: SyncKind): Promise<void> {
  // Undefined leaves `from` off the first request so the route picks its own start.
  let from = flags.from;

  for (;;) {
    // eslint-disable-next-line no-await-in-loop
    const result = await backfill(kind, from);
    console.log(describe(result));

    if (result.error !== null) {
      throw new Error(`${kind} stopped, resume with --from ${result.next ?? "the start"}`);
    }
    if (result.next === null) {
      return;
    }
    // A resume point that repeats the window just asked for would spin here
    // forever, which is what a misconfigured BACKFILL_WINDOWS of 0 produces.
    if (result.next === from) {
      throw new Error(`${kind} did not advance past ${from}`);
    }
    from = result.next;
  }
}

async function backfill(kind: SyncKind, from: string | undefined): Promise<BackfillResult> {
  const url = new URL("/admin/backfill", base);
  url.searchParams.set("kind", kind);
  if (from !== undefined) {
    url.searchParams.set("from", from);
  }

  const response = await fetch(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
  });
  const body = await response.text();
  if (!response.ok) {
    throw new Error(`POST ${url.pathname}${url.search} answered ${response.status}: ${body}`);
  }

  return BackfillResult.parse(JSON.parse(body));
}

function describe(result: BackfillResult): string {
  const first = result.windows[0];
  const last = result.windows.at(-1);
  const range = first === undefined || last === undefined ? "no windows" : `${first}..${last}`;
  const resume = result.next === null ? "done" : `next ${result.next}`;
  const line = [
    result.kind.padEnd(13),
    range.padEnd(17),
    `pages ${result.pages}`.padEnd(11),
    `rows ${result.rowsChanged}`.padEnd(12),
    resume,
  ].join(" ");
  return result.error === null ? line : `${line}  ${result.error}`;
}

function adminToken(): string {
  const value = Bun.env["ADMIN_TOKEN"];
  if (value === undefined || value === "") {
    fail("ADMIN_TOKEN is unset");
  }
  return value;
}

function isSyncKind(value: string): value is SyncKind {
  return SYNC_KINDS.some((each) => each === value);
}

function parseUrl(value: string): URL {
  try {
    return new URL(value);
  } catch {
    fail(`${value} is not a URL`);
  }
}

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}
