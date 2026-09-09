import { type BindValue, upsertRows, upsertSql } from "./upsert";

export interface CommitDay {
  repositoryId: string;
  day: string;
  commitCount: number;
}

const columns = ["repository_id", "day", "commit_count"] as const;

const sql = upsertSql({
  table: "commit_days",
  columns,
  conflict: ["repository_id", "day"],
  compared: ["commit_count"],
});

export function upsertCommitDays(db: D1Database, rows: readonly CommitDay[]): Promise<number> {
  return upsertRows(db, sql, rows, bind);
}

function bind(row: CommitDay): BindValue[] {
  return [row.repositoryId, row.day, row.commitCount];
}
