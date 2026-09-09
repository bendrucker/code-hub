import { type BindValue, upsertWriter } from "./upsert";

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

type Column = (typeof columns)[number];

// `fetched_at` is written but not compared. Comparing it would make every upsert
// a change, since it moves on every fetch by definition. It therefore records the
// fetch that last produced different values rather than the last fetch that read
// the repository.
export const upsertRepositories = upsertWriter(
  {
    table: "repositories",
    columns,
    conflict: ["id"],
    compared: columns.filter((column) => column !== "id" && column !== "fetched_at"),
  },
  bind,
);

function bind(row: Repository): Record<Column, BindValue> {
  return {
    id: row.id,
    owner: row.owner,
    name: row.name,
    description: row.description,
    url: row.url,
    stargazer_count: row.stargazerCount,
    primary_language: row.primaryLanguage,
    primary_language_color: row.primaryLanguageColor,
    created_at: row.createdAt,
    is_fork: row.isFork ? 1 : 0,
    visibility: row.visibility,
    fetched_at: row.fetchedAt,
  };
}
