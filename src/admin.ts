import type { Month } from "./github/windows";
import {
  backfill,
  BACKFILL_START,
  type BackfillResult,
  InvalidMonthError,
  parseMonth,
} from "./sync/backfill";
import { byKind, SYNC_KINDS, type SyncKind } from "./sync/kinds";
import { MissingSecretError } from "./sync/run";
import { lastRuns, recentFailures, type SyncRun } from "./sync/runs";
import { readWatermarks, type Watermark } from "./sync/state";

const FAILURE_LIMIT = 10;

interface KindStatus {
  watermark: Watermark | null;
  lastRun: SyncRun | null;
}

export interface SyncStatus {
  generatedAt: string;
  kinds: Record<SyncKind, KindStatus>;
  failures: SyncRun[];
}

export async function handleSyncStatus(request: Request, env: Env): Promise<Response> {
  const refused = await authorize(request, env);
  if (refused !== null) {
    return refused;
  }

  try {
    const [watermarks, runs, failures] = await Promise.all([
      readWatermarks(env.DB),
      lastRuns(env.DB),
      recentFailures(env.DB, FAILURE_LIMIT),
    ]);

    const status: SyncStatus = {
      generatedAt: new Date().toISOString(),
      kinds: byKind((kind) => ({ watermark: watermarks[kind], lastRun: runs[kind] })),
      failures,
    };
    return Response.json(status);
  } catch (error) {
    // Reading this route is the first step of diagnosing a stuck sync, and a
    // bare 500 sends the reader to the logs to find out what it was.
    return Response.json({ error: String(error) }, { status: 500 });
  }
}

export async function handleBackfill(request: Request, env: Env): Promise<Response> {
  const refused = await authorize(request, env);
  if (refused !== null) {
    return refused;
  }

  const url = new URL(request.url);
  const kind = url.searchParams.get("kind");
  if (!isSyncKind(kind)) {
    return Response.json(
      { error: `kind must be one of ${SYNC_KINDS.join(", ")}` },
      { status: 400 },
    );
  }

  try {
    const from = parseMonth(url.searchParams.get("from") ?? month(BACKFILL_START));
    const result: BackfillResult = await backfill(env, kind, from);
    return Response.json(result);
  } catch (error) {
    if (error instanceof InvalidMonthError) {
      return Response.json({ error: error.message }, { status: 400 });
    }
    if (error instanceof MissingSecretError) {
      return Response.json({ error: error.message }, { status: 503 });
    }
    return Response.json({ error: String(error) }, { status: 500 });
  }
}

function month({ year, month: value }: Month): string {
  return `${year}-${String(value).padStart(2, "0")}`;
}

function isSyncKind(value: string | null): value is SyncKind {
  return SYNC_KINDS.some((kind) => kind === value);
}

// Unset means the route does not exist yet, so an unconfigured deployment
// answers a probe the same way it answers a typo. Null means the request may
// proceed.
async function authorize(request: Request, env: Env): Promise<Response | null> {
  const token = env.ADMIN_TOKEN;
  if (token === undefined || token === "") {
    return new Response("Not Found", { status: 404 });
  }
  if (!(await authorized(request, token))) {
    return new Response("Unauthorized", { status: 401 });
  }
  return null;
}

// timingSafeEqual throws on a length mismatch, which would leak the token's
// length. Digests are always 32 bytes, so comparing those does not.
async function authorized(request: Request, token: string): Promise<boolean> {
  const header = request.headers.get("Authorization");
  if (header === null) {
    return false;
  }
  const [presented, expected] = await Promise.all([digest(header), digest(`Bearer ${token}`)]);
  return crypto.subtle.timingSafeEqual(presented, expected);
}

function digest(value: string): Promise<ArrayBuffer> {
  return crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
}
