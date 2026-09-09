import type { BasicType } from "hyparquet-writer";

// What a D1 value becomes in the Parquet column.
export type Cell = string | number | boolean | Date | null;

export interface LakeColumn {
  name: string;
  type: BasicType;
  cell: (value: unknown) => Cell;
}

export class LakeValueError extends Error {
  readonly column: string;

  constructor(column: string, value: unknown) {
    super(`${column} holds ${describe(value)}, which the lake has no column type for`);
    this.name = "LakeValueError";
    this.column = column;
  }
}

function describe(value: unknown): string {
  return value === null ? "null" : typeof value;
}

export function text(name: string): LakeColumn {
  return {
    name,
    type: "STRING",
    cell: (value) => {
      if (value === null || typeof value === "string") {
        return value;
      }
      throw new LakeValueError(name, value);
    },
  };
}

export function integer(name: string): LakeColumn {
  return {
    name,
    type: "INT32",
    cell: (value) => {
      if (value === null || typeof value === "number") {
        return value;
      }
      throw new LakeValueError(name, value);
    },
  };
}

// SQLite has no boolean type, so D1 answers with the 0 or 1 the column stores.
export function boolean(name: string): LakeColumn {
  return {
    name,
    type: "BOOLEAN",
    cell: (value) => {
      if (value === null) {
        return null;
      }
      if (value === 0 || value === 1) {
        return value === 1;
      }
      throw new LakeValueError(name, value);
    },
  };
}

// The writer encodes a Date as INT64 TIMESTAMP_MILLIS, which DuckDB reads as a
// timestamp with no cast. GitHub's timestamps are UTC to the second, so the
// epoch milliseconds carry everything the string did.
export function timestamp(name: string): LakeColumn {
  return {
    name,
    type: "TIMESTAMP",
    cell: (value) => {
      if (value === null) {
        return null;
      }
      if (typeof value !== "string") {
        throw new LakeValueError(name, value);
      }

      const date = new Date(value);
      if (Number.isNaN(date.getTime())) {
        throw new LakeValueError(name, value);
      }

      return date;
    },
  };
}
