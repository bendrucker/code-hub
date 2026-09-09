import { type BindValue, upsertRows, upsertSql } from "./upsert";

export type RepositoryVisibility = "PUBLIC" | "PRIVATE" | "INTERNAL";

export interface Repository {
  id: string;
  owner: string;
  name: string;
  description: string | null;
  url: string;
  stargazerCount: number;
  primaryLanguage: string | null;
  primaryLanguageColor: string | null;
  createdAt: string;
  isFork: boolean;
  visibility: RepositoryVisibility;
  fetchedAt: string;
}

const columns = [
  "id",
  "owner",
  "name",
  "description",
  "url",
  "stargazer_count",
  "primary_language",
  "primary_language_color",
  "created_at",
  "is_fork",
  "visibility",
  "fetched_at",
] as const;

// `fetched_at` is written but not compared. Comparing it would make every
// upsert a change, since it moves on every fetch by definition. It therefore
// records the fetch that last produced different values rather than the last
// fetch that read the repository.
const sql = upsertSql({
  table: "repositories",
  columns,
  conflict: ["id"],
  compared: columns.filter((column) => column !== "id" && column !== "fetched_at"),
});

export function upsertRepositories(db: D1Database, rows: readonly Repository[]): Promise<number> {
  return upsertRows(db, sql, rows, bind);
}

function bind(row: Repository): BindValue[] {
  return [
    row.id,
    row.owner,
    row.name,
    row.description,
    row.url,
    row.stargazerCount,
    row.primaryLanguage,
    row.primaryLanguageColor,
    row.createdAt,
    row.isFork ? 1 : 0,
    row.visibility,
    row.fetchedAt,
  ];
}
