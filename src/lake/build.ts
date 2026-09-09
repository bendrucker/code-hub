import { failBuild, finishBuild, startBuild } from "./builds";
import { commitDays } from "./commit-days";
import { issues } from "./issues";
import { pullRequests } from "./pull-requests";
import { repositories } from "./repositories";
import { reviews } from "./reviews";
import { encodeTable, type LakeTable } from "./table";

export const LAKE_TABLES: readonly LakeTable[] = [
  repositories,
  pullRequests,
  reviews,
  issues,
  commitDays,
];

// Activity Hub owns the bucket and writes its own tables under `lake/v1/`, so
// this project's prefix keeps one DuckDB session able to read both.
const PREFIX = "github/v1";

const CONTENT_TYPE = "application/vnd.apache.parquet";

export function tableKey(table: LakeTable): string {
  return `${PREFIX}/${table.name}/part-0.parquet`;
}

export interface LakeBuildResult {
  startedAt: string;
  finishedAt: string;
  rowCounts: Record<string, number>;
}

// A full rebuild rather than an incremental merge, which the corpus size makes
// affordable and which keeps a schema change a rerun rather than a migration.
export async function buildLake(
  env: Env,
  startedAt: string = new Date().toISOString(),
): Promise<LakeBuildResult> {
  const id = await startBuild(env.DB, startedAt);

  try {
    const written = await Promise.all(LAKE_TABLES.map((table) => writeTable(env, table)));
    const rowCounts = Object.fromEntries(written.map((table) => [table.name, table.rows]));
    const finishedAt = new Date().toISOString();
    await finishBuild(env.DB, id, rowCounts, finishedAt);

    return { startedAt, finishedAt, rowCounts };
  } catch (error) {
    await failBuild(env.DB, id, message(error), new Date().toISOString());
    throw error;
  }
}

async function writeTable(env: Env, table: LakeTable): Promise<{ name: string; rows: number }> {
  const { buffer, rows } = await encodeTable(env.DB, table);
  await env.LAKE.put(tableKey(table), buffer, { httpMetadata: { contentType: CONTENT_TYPE } });

  return { name: table.name, rows };
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
