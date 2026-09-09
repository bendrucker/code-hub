import { byKind, SYNC_KINDS, type SyncKind } from "./kinds";

export interface Watermark {
  window: string;
  updatedAt: string;
}

// `sync_state` is a general key/value table, so the watermarks take a prefix
// rather than the bare kind and leave the rest of the namespace free.
const prefix = "watermark:";

function key(kind: SyncKind): string {
  return `${prefix}${kind}`;
}

// The last window normalized successfully. It advances only once the pages are
// in R2 and the rows are in D1, which is why it is its own call rather than
// something finishing a run does.
export async function advance(
  db: D1Database,
  kind: SyncKind,
  window: string,
  at: string = new Date().toISOString(),
): Promise<void> {
  await db
    .prepare(
      "INSERT INTO sync_state (key, value, updated_at) VALUES (?1, ?2, ?3)" +
        " ON CONFLICT (key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at",
    )
    .bind(key(kind), window, at)
    .run();
}

export async function readWatermark(db: D1Database, kind: SyncKind): Promise<Watermark | null> {
  const row = await db
    .prepare("SELECT value, updated_at FROM sync_state WHERE key = ?")
    .bind(key(kind))
    .first<{ value: string; updated_at: string }>();
  return row === null ? null : { window: row.value, updatedAt: row.updated_at };
}

export async function readWatermarks(db: D1Database): Promise<Record<SyncKind, Watermark | null>> {
  const placeholders = SYNC_KINDS.map(() => "?").join(", ");
  const { results } = await db
    .prepare(`SELECT key, value, updated_at FROM sync_state WHERE key IN (${placeholders})`)
    .bind(...SYNC_KINDS.map(key))
    .all<{ key: string; value: string; updated_at: string }>();

  const stored = new Map(
    results.map((row) => [row.key, { window: row.value, updatedAt: row.updated_at }]),
  );
  return byKind((kind) => stored.get(key(kind)) ?? null);
}
