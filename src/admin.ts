import { byKind, type SyncKind } from "./sync/kinds";
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

// Unset means the route does not exist yet, so an unconfigured deployment
// answers a probe the same way it answers a typo.
export async function handleSyncStatus(request: Request, env: Env): Promise<Response> {
  const token = env.ADMIN_TOKEN;
  if (token === undefined || token === "") {
    return new Response("Not Found", { status: 404 });
  }
  if (!(await authorized(request, token))) {
    return new Response("Unauthorized", { status: 401 });
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
