import { parquetMetadata, parquetReadObjects } from "hyparquet";

// `parquetReadObjects` reads through a random-access file rather than a buffer,
// so a buffer in hand is wrapped as one.
function file(buffer: ArrayBuffer) {
  return {
    byteLength: buffer.byteLength,
    slice: (start: number, end?: number) => buffer.slice(start, end),
  };
}

export function readParquet(buffer: ArrayBuffer): Promise<Record<string, unknown>[]> {
  return parquetReadObjects({ file: file(buffer) });
}

export function parquetRows(buffer: ArrayBuffer): number {
  return Number(parquetMetadata(buffer).num_rows);
}

export function parquetCodecs(buffer: ArrayBuffer): string[] {
  return parquetMetadata(buffer).row_groups.flatMap((group) =>
    group.columns.flatMap((column) => (column.meta_data ? [column.meta_data.codec] : [])),
  );
}

export function parquetColumns(buffer: ArrayBuffer): string[] {
  // The first schema element is the root, which names the file rather than a column.
  return parquetMetadata(buffer)
    .schema.slice(1)
    .map((element) => element.name);
}

export async function readLakeObject(bucket: R2Bucket, key: string): Promise<ArrayBuffer | null> {
  const object = await bucket.get(key);

  return object === null ? null : object.arrayBuffer();
}

export async function emptyBucket(bucket: R2Bucket): Promise<void> {
  const listed = await bucket.list();
  await bucket.delete(listed.objects.map((object) => object.key));
}
