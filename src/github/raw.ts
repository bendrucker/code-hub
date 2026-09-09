import type { EventKind } from "./windows";

// R2 lists lexicographically, so a page number is padded to keep one fetch's
// pages in the order they were read.
const PAGE_DIGITS = 4;

export function searchKey(
  kind: EventKind,
  window: string,
  fetchedAt: string,
  page: number,
): string {
  return `raw/search/${kind}/${window}/${fetchedAt}/${String(page).padStart(PAGE_DIGITS, "0")}.json`;
}

export function contributionsKey(year: number, fetchedAt: string): string {
  return `raw/contributions/${year}/${fetchedAt}.json`;
}

// An object is written once and never rewritten. Re-running a window writes new
// pages under a new fetch timestamp rather than replacing what a previous run
// saw, which is what keeps a normalization bug diagnosable against the bytes
// that caused it. The conditional put is the enforcement rather than a
// convention, and a false return means the key was already there.
export async function writeOnce(bucket: R2Bucket, key: string, body: string): Promise<boolean> {
  const written = await bucket.put(key, body, {
    onlyIf: { etagDoesNotMatch: "*" },
    httpMetadata: { contentType: "application/json" },
  });

  return written !== null;
}

export interface SearchArchive {
  kind: EventKind;
  window: string;
  fetchedAt: string;
  page: number;
  body: string;
}

export function archiveSearchPage(bucket: R2Bucket, archive: SearchArchive): Promise<boolean> {
  const { kind, window, fetchedAt, page, body } = archive;
  return writeOnce(bucket, searchKey(kind, window, fetchedAt, page), body);
}

export interface ContributionsArchive {
  year: number;
  fetchedAt: string;
  body: string;
}

export function archiveContributions(
  bucket: R2Bucket,
  archive: ContributionsArchive,
): Promise<boolean> {
  return writeOnce(bucket, contributionsKey(archive.year, archive.fetchedAt), archive.body);
}
