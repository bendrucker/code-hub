import { parquetWriteBuffer } from "hyparquet-writer";
import type { LakeColumn } from "./columns";

export interface LakeTable {
  // The D1 table, and the prefix segment the Parquet lands under.
  name: string;
  // Ordering for the paged read, which has to be total so no row is read twice
  // or skipped as pages advance.
  key: readonly string[];
  columns: readonly LakeColumn[];
}

// D1 answers one statement comfortably in the low thousands of rows, and the
// corpus is tens of thousands, so a table reads as a handful of pages rather
// than one statement that would be refused at some size nothing here checks.
const PAGE_SIZE = 1000;

// Requesting ZSTD does not fail. The writer records the codec and stores the
// page uncompressed, and nothing can read that file back, so the codec is named
// here rather than left to a default that a later edit could change.
const CODEC = "SNAPPY";

export interface EncodedTable {
  buffer: ArrayBuffer;
  rows: number;
}

export async function encodeTable(db: D1Database, table: LakeTable): Promise<EncodedTable> {
  const rows = await readRows(db, table);

  const buffer = parquetWriteBuffer({
    codec: CODEC,
    columnData: table.columns.map((column) => ({
      name: column.name,
      type: column.type,
      data: rows.map((row) => column.cell(row[column.name])),
    })),
  });

  return { buffer, rows: rows.length };
}

export async function readRows(
  db: D1Database,
  table: LakeTable,
): Promise<Record<string, unknown>[]> {
  const names = table.columns.map((column) => column.name).join(", ");
  const sql =
    `SELECT ${names} FROM ${table.name}` +
    ` ORDER BY ${table.key.join(", ")} LIMIT ${PAGE_SIZE} OFFSET ?`;

  const statement = db.prepare(sql);
  const rows: Record<string, unknown>[] = [];
  let page: Record<string, unknown>[] = [];

  // A cursor loop: each page is asked for only once the one before it came back
  // full, since a short page is the end of the table.
  do {
    // eslint-disable-next-line no-await-in-loop
    const result = await statement.bind(rows.length).all<Record<string, unknown>>();
    page = result.results;
    rows.push(...page);
  } while (page.length === PAGE_SIZE);

  return rows;
}
