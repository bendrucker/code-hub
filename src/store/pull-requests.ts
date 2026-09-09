import { type BindValue, upsertRows, upsertSql } from "./upsert";

export type PullRequestState = "OPEN" | "CLOSED" | "MERGED";

export interface PullRequest {
  id: string;
  repositoryId: string;
  number: number;
  title: string;
  author: string;
  createdAt: string;
  mergedAt: string | null;
  closedAt: string | null;
  state: PullRequestState;
  additions: number;
  deletions: number;
  changedFiles: number;
  commentCount: number;
  reviewCount: number;
  updatedAt: string;
}

const columns = [
  "id",
  "repository_id",
  "number",
  "title",
  "author",
  "created_at",
  "merged_at",
  "closed_at",
  "state",
  "additions",
  "deletions",
  "changed_files",
  "comment_count",
  "review_count",
  "updated_at",
] as const;

// `updated_at` is compared along with everything else. It is GitHub's own
// updatedAt rather than a local write time, so a move in it is GitHub saying
// the pull request changed, and the feed should carry the row again even when
// what changed is a field this table does not store.
const sql = upsertSql({
  table: "pull_requests",
  columns,
  conflict: ["id"],
  compared: columns.filter((column) => column !== "id"),
  clearsPublishedAt: true,
});

export function upsertPullRequests(db: D1Database, rows: readonly PullRequest[]): Promise<number> {
  return upsertRows(db, sql, rows, bind);
}

function bind(row: PullRequest): BindValue[] {
  return [
    row.id,
    row.repositoryId,
    row.number,
    row.title,
    row.author,
    row.createdAt,
    row.mergedAt,
    row.closedAt,
    row.state,
    row.additions,
    row.deletions,
    row.changedFiles,
    row.commentCount,
    row.reviewCount,
    row.updatedAt,
  ];
}
