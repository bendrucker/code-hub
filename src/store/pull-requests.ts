import { type BindValue, upsertWriter } from "./upsert";

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

type Column = (typeof columns)[number];

// `updated_at` is compared along with everything else. It is GitHub's own
// updatedAt rather than a local write time, so a move in it is GitHub saying the
// pull request changed, and the feed should carry the row again even when what
// changed is a field this table does not store.
export const upsertPullRequests = upsertWriter(
  { table: "pull_requests", columns, conflict: ["id"], clearsPublishedAt: true },
  bind,
);

function bind(row: PullRequest): Record<Column, BindValue> {
  return {
    id: row.id,
    repository_id: row.repositoryId,
    number: row.number,
    title: row.title,
    author: row.author,
    created_at: row.createdAt,
    merged_at: row.mergedAt,
    closed_at: row.closedAt,
    state: row.state,
    additions: row.additions,
    deletions: row.deletions,
    changed_files: row.changedFiles,
    comment_count: row.commentCount,
    review_count: row.reviewCount,
    updated_at: row.updatedAt,
  };
}
