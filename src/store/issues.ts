import { type BindValue, upsertWriter } from "./upsert";

export type IssueState = "OPEN" | "CLOSED";

export interface Issue {
  id: string;
  repositoryId: string;
  number: number;
  title: string;
  author: string;
  createdAt: string;
  closedAt: string | null;
  state: IssueState;
  commentCount: number;
  updatedAt: string;
}

const columns = [
  "id",
  "repository_id",
  "number",
  "title",
  "author",
  "created_at",
  "closed_at",
  "state",
  "comment_count",
  "updated_at",
] as const;

type Column = (typeof columns)[number];

export const upsertIssues = upsertWriter(
  { table: "issues", columns, conflict: ["id"], clearsPublishedAt: true },
  bind,
);

function bind(row: Issue): Record<Column, BindValue> {
  return {
    id: row.id,
    repository_id: row.repositoryId,
    number: row.number,
    title: row.title,
    author: row.author,
    created_at: row.createdAt,
    closed_at: row.closedAt,
    state: row.state,
    comment_count: row.commentCount,
    updated_at: row.updatedAt,
  };
}
