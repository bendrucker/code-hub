import { type BindValue, upsertRows, upsertSql } from "./upsert";

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

const sql = upsertSql({
  table: "issues",
  columns,
  conflict: ["id"],
  compared: columns.filter((column) => column !== "id"),
  clearsPublishedAt: true,
});

export function upsertIssues(db: D1Database, rows: readonly Issue[]): Promise<number> {
  return upsertRows(db, sql, rows, bind);
}

function bind(row: Issue): BindValue[] {
  return [
    row.id,
    row.repositoryId,
    row.number,
    row.title,
    row.author,
    row.createdAt,
    row.closedAt,
    row.state,
    row.commentCount,
    row.updatedAt,
  ];
}
