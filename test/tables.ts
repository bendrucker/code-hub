import type { BindValue } from "../src/store/upsert";

// Deleting in the order sqlite_master lists tables hits a parent before its
// children, so the batch defers its foreign key checks to the commit, by which
// point every table is empty.
export async function emptyTables(db: D1Database): Promise<void> {
  const { results } = await db
    .prepare(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE 'd1_%' AND name NOT LIKE '_cf_%'",
    )
    .all<{ name: string }>();
  await db.batch([
    db.prepare("PRAGMA defer_foreign_keys = ON"),
    ...results.map((table) => db.prepare(`DELETE FROM ${table.name}`)),
  ]);
}

export function readRow<Row>(
  db: D1Database,
  sql: string,
  ...binds: readonly BindValue[]
): Promise<Row | null> {
  return db
    .prepare(sql)
    .bind(...binds)
    .first<Row>();
}

export const publishedAt = "2026-09-09T18:00:00Z";

export function markPublished(db: D1Database, table: string, id: string): Promise<unknown> {
  return db
    .prepare(`UPDATE ${table} SET published_at = ? WHERE id = ?`)
    .bind(publishedAt, id)
    .run();
}
