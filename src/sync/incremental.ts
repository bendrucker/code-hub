import { type EventKind, incrementalSearch } from "../github/windows";
import { SEARCH_KINDS } from "./kinds";
import {
  githubToken,
  MissingSecretError,
  syncContributions,
  type SyncOptions,
  type SyncResult,
  syncWindow,
} from "./run";
import { readWatermark } from "./state";

// GitHub's search index lags writes by an unspecified interval, so the window
// opens behind the watermark instead of at it. An hour covers the lag, and the
// overlap costs nothing against upserts keyed on node ID.
const OVERLAP_MS = 60 * 60 * 1000;

export async function syncIncremental(env: Env, options: SyncOptions = {}): Promise<void> {
  const now = options.now ?? new Date();

  try {
    githubToken(env);
  } catch (error) {
    if (!(error instanceof MissingSecretError)) {
      throw error;
    }
    // A cron that throws retries on the next hour and reports nothing useful in
    // between, and no amount of retrying sets a secret.
    console.error(error.message);
    return;
  }

  // The kinds run one after another so the rate-limit floor the first one trips
  // stops the invocation, rather than three concurrent runs each spending their
  // way to the same discovery.
  const remaining = [...SEARCH_KINDS];
  let kind = remaining.shift();
  while (kind !== undefined) {
    // eslint-disable-next-line no-await-in-loop
    const result = await syncKind(env, kind, { ...options, now });
    if (result?.exhausted === true) {
      return;
    }
    kind = remaining.shift();
  }

  await syncContributions(env, now.getUTCFullYear(), { ...options, now });
}

async function syncKind(
  env: Env,
  kind: EventKind,
  options: SyncOptions,
): Promise<SyncResult | null> {
  const watermark = await readWatermark(env.DB, kind);
  if (watermark === null) {
    // Anchoring at now would declare every event before this invocation synced
    // and leave the history unreachable except by replay.
    console.log(`${kind} has no watermark, so a backfill owns its first window`);
    return null;
  }

  const since = new Date(Date.parse(watermark.window) - OVERLAP_MS).toISOString();

  return syncWindow(
    env,
    kind,
    {
      key: `updated:${since}`,
      query: incrementalSearch(kind, env.GITHUB_LOGIN, since),
      through: (options.now ?? new Date()).toISOString(),
    },
    options,
  );
}
