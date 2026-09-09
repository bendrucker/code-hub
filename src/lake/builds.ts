import { z } from "zod";

export interface LakeBuild {
  id: number;
  startedAt: string;
  finishedAt: string | null;
  rowCounts: Record<string, number>;
  error: string | null;
}

const rowCounts = z.record(z.string(), z.number());

export async function startBuild(db: D1Database, at: string): Promise<number> {
  const { meta } = await db
    .prepare("INSERT INTO lake_builds (started_at) VALUES (?)")
    .bind(at)
    .run();

  return meta.last_row_id;
}

export async function finishBuild(
  db: D1Database,
  id: number,
  counts: Record<string, number>,
  at: string,
): Promise<void> {
  await db
    .prepare("UPDATE lake_builds SET finished_at = ?1, row_counts = ?2 WHERE id = ?3")
    .bind(at, JSON.stringify(counts), id)
    .run();
}

// The build itself rethrows, so the row records what went wrong rather than
// standing as one that never finished.
export async function failBuild(
  db: D1Database,
  id: number,
  error: string,
  at: string,
): Promise<void> {
  await db
    .prepare("UPDATE lake_builds SET finished_at = ?1, error = ?2 WHERE id = ?3")
    .bind(at, error, id)
    .run();
}

export async function readLatestBuild(db: D1Database): Promise<LakeBuild | null> {
  const row = await db
    .prepare(
      "SELECT id, started_at, finished_at, row_counts, error FROM lake_builds" +
        " ORDER BY started_at DESC, id DESC LIMIT 1",
    )
    .first<{
      id: number;
      started_at: string;
      finished_at: string | null;
      row_counts: string | null;
      error: string | null;
    }>();

  if (row === null) {
    return null;
  }

  return {
    id: row.id,
    startedAt: row.started_at,
    finishedAt: row.finished_at,
    rowCounts: parseCounts(row.row_counts),
    error: row.error,
  };
}

// A build still running, and one that failed, both carry no counts. A value
// that no longer parses reads as none rather than failing the status route over
// a field nothing depends on.
function parseCounts(value: string | null): Record<string, number> {
  if (value === null) {
    return {};
  }

  try {
    const parsed = rowCounts.safeParse(JSON.parse(value));
    return parsed.success ? parsed.data : {};
  } catch {
    return {};
  }
}
