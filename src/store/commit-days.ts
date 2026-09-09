import { type BindValue, upsertWriter } from "./upsert";

export interface CommitDay {
  repositoryId: string;
  day: string;
  commitCount: number;
}

const columns = ["repository_id", "day", "commit_count"] as const;

type Column = (typeof columns)[number];

export const upsertCommitDays = upsertWriter(
  { table: "commit_days", columns, conflict: ["repository_id", "day"] },
  bind,
);

function bind(row: CommitDay): Record<Column, BindValue> {
  return {
    repository_id: row.repositoryId,
    day: row.day,
    commit_count: row.commitCount,
  };
}
