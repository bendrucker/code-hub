// Every table here writes the same shape: insert the row, and on a key
// collision update it only when a stored column actually moved. An upsert
// matching what D1 already holds writes no row at all, which is what keeps
// re-normalizing an archived R2 page from touching the database.

export type BindValue = string | number | null;

export interface UpsertSpec {
  table: string;
  columns: readonly string[];
  conflict: readonly string[];
  // Columns compared to decide whether the stored row changed. One left out is
  // still written when something else moves, but never causes a write itself.
  compared: readonly string[];
  // Tables carrying a publish marker clear it on every change, which is what
  // returns the row to the publisher's queue.
  clearsPublishedAt?: boolean;
}

export function upsertSql(spec: UpsertSpec): string {
  const placeholders = spec.columns.map((_, index) => `?${index + 1}`).join(", ");
  const assignments = spec.columns
    .filter((column) => !spec.conflict.includes(column))
    .map((column) => `${column} = excluded.${column}`);
  if (spec.clearsPublishedAt) {
    assignments.push("published_at = NULL");
  }
  // IS NOT is SQLite's null-safe inequality. Plain != evaluates to unknown when
  // either side is null, which would read a column going null as unchanged.
  const changed = spec.compared
    .map((column) => `${spec.table}.${column} IS NOT excluded.${column}`)
    .join(" OR ");
  return [
    `INSERT INTO ${spec.table} (${spec.columns.join(", ")})`,
    `VALUES (${placeholders})`,
    `ON CONFLICT (${spec.conflict.join(", ")}) DO UPDATE SET ${assignments.join(", ")}`,
    `WHERE ${changed}`,
  ].join(" ");
}

// Answers how many rows the write actually changed.
export async function upsertRows<Row>(
  db: D1Database,
  sql: string,
  rows: readonly Row[],
  bind: (row: Row) => BindValue[],
): Promise<number> {
  if (rows.length === 0) {
    return 0;
  }
  const statement = db.prepare(sql);
  const results = await db.batch(rows.map((row) => statement.bind(...bind(row))));
  return results.reduce((total, result) => total + result.meta.changes, 0);
}
