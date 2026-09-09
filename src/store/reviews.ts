import { type BindValue, upsertWriter } from "./upsert";

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

type Column = (typeof columns)[number];

export const upsertReviews = upsertWriter(
  { table: "reviews", columns, conflict: ["id"], clearsPublishedAt: true },
  bind,
);

function bind(row: Review): Record<Column, BindValue> {
  return {
    id: row.id,
    repository_id: row.repositoryId,
    pull_request_number: row.pullRequestNumber,
    pull_request_author: row.pullRequestAuthor,
    state: row.state,
    submitted_at: row.submittedAt,
  };
}
