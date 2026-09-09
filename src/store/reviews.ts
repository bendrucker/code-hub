import { type BindValue, upsertRows, upsertSql } from "./upsert";

export type ReviewState = "PENDING" | "COMMENTED" | "APPROVED" | "CHANGES_REQUESTED" | "DISMISSED";

export interface Review {
  id: string;
  repositoryId: string;
  pullRequestNumber: number;
  pullRequestAuthor: string;
  state: ReviewState;
  submittedAt: string;
}

const columns = [
  "id",
  "repository_id",
  "pull_request_number",
  "pull_request_author",
  "state",
  "submitted_at",
] as const;

const sql = upsertSql({
  table: "reviews",
  columns,
  conflict: ["id"],
  compared: columns.filter((column) => column !== "id"),
  clearsPublishedAt: true,
});

export function upsertReviews(db: D1Database, rows: readonly Review[]): Promise<number> {
  return upsertRows(db, sql, rows, bind);
}

function bind(row: Review): BindValue[] {
  return [
    row.id,
    row.repositoryId,
    row.pullRequestNumber,
    row.pullRequestAuthor,
    row.state,
    row.submittedAt,
  ];
}
