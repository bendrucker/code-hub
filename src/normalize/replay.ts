// Re-normalizing reads R2 and never calls GitHub, which is what makes a schema
// change cost nothing: bump the shape, replay the archived pages, and the event
// tables rebuild from responses already on disk.
import { z } from "zod";
import { contributionsPrefix, OBJECT_SUFFIX, searchFetchPrefix, searchPrefix } from "../github/raw";
import {
  contributionsResponse,
  issueSearchPage,
  pullRequestSearchPage,
  reviewedPullRequestSearchPage,
} from "../github/schema";
import type { EventKind } from "../github/windows";
import { normalizeContributions, normalizeSearchPage, type RowsChanged } from "./page";
import type { SearchPageNodes } from "./page";

export class RawObjectError extends Error {
  readonly key: string;

  // The name is a literal per subclass rather than the constructor's own, which
  // a minified build would rename.
  constructor(name: string, key: string, message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = name;
    this.key = key;
  }
}

export class RawValidationError extends RawObjectError {
  constructor(key: string, message: string, cause: unknown) {
    super("RawValidationError", key, `${key} did not validate: ${message}`, { cause });
  }
}

export class MissingRawObjectError extends RawObjectError {
  constructor(key: string) {
    super("MissingRawObjectError", key, `${key} is not in the raw bucket`);
  }
}

export interface Replay {
  // Which archived fetch was replayed. It becomes `repositories.fetched_at`, so
  // the row records when GitHub was asked rather than when the replay ran.
  fetchedAt: string;
  rows: RowsChanged;
}

// Null means nothing is archived under the window, which a caller walking every
// month back to 2012 sees for every month it never fetched.
export async function replaySearchWindow(
  db: D1Database,
  bucket: R2Bucket,
  kind: EventKind,
  window: string,
): Promise<Replay | null> {
  const prefix = searchPrefix(kind, window);
  const fetchedAt = await newestFetch(bucket, prefix);
  if (fetchedAt === null) {
    return null;
  }

  const listed = await list(bucket, { prefix: searchFetchPrefix(kind, window, fetchedAt) });
  const pages = await read(bucket, listed.keys);

  return { fetchedAt, rows: await normalizeSearchPage(db, searchNodes(kind, pages), fetchedAt) };
}

export async function replayContributions(
  db: D1Database,
  bucket: R2Bucket,
  year: number,
): Promise<Replay | null> {
  const prefix = contributionsPrefix(year);
  const listed = await list(bucket, { prefix });
  const key = listed.keys.at(-1);
  if (key === undefined) {
    return null;
  }

  const [page] = await read(bucket, [key]);
  if (page === undefined) {
    throw new MissingRawObjectError(key);
  }

  const { user } = parse(contributionsResponse, page);
  if (user === null) {
    throw new RawValidationError(key, "the response carries no user", null);
  }

  const fetchedAt = key.slice(prefix.length, -OBJECT_SUFFIX.length);
  const rows = await normalizeContributions(db, user.contributionsCollection, fetchedAt);

  return { fetchedAt, rows };
}

interface RawPage {
  key: string;
  body: string;
}

function searchNodes(kind: EventKind, pages: readonly RawPage[]): SearchPageNodes {
  switch (kind) {
    case "pr-authored":
      return {
        kind,
        nodes: pages.flatMap((page) => parse(pullRequestSearchPage, page).search.nodes),
      };
    case "pr-reviewed":
      return {
        kind,
        nodes: pages.flatMap((page) => parse(reviewedPullRequestSearchPage, page).search.nodes),
      };
    case "issue":
      return { kind, nodes: pages.flatMap((page) => parse(issueSearchPage, page).search.nodes) };
  }
}

// A fetch timestamp is an ISO string, so R2's lexicographic listing puts the
// newest fetch last. The same ordering puts a fetch's zero-padded pages in the
// order they were read.
async function newestFetch(bucket: R2Bucket, prefix: string): Promise<string | null> {
  const { prefixes } = await list(bucket, { prefix, delimiter: "/" });
  const newest = prefixes.at(-1);

  return newest === undefined ? null : newest.slice(prefix.length, -1);
}

interface Listing {
  keys: string[];
  prefixes: string[];
}

async function list(bucket: R2Bucket, options: R2ListOptions): Promise<Listing> {
  const listing: Listing = { keys: [], prefixes: [] };
  let cursor: string | undefined;
  let remaining = true;

  // A cursor loop rather than for...of: each page of the listing depends on the
  // cursor the one before it returned.
  while (remaining) {
    // eslint-disable-next-line no-await-in-loop
    const listed = await bucket.list({ ...options, cursor });
    listing.keys.push(...listed.objects.map((object) => object.key));
    listing.prefixes.push(...listed.delimitedPrefixes);
    remaining = listed.truncated;
    cursor = listed.truncated ? listed.cursor : undefined;
  }

  return listing;
}

function read(bucket: R2Bucket, keys: readonly string[]): Promise<RawPage[]> {
  return Promise.all(
    keys.map(async (key) => {
      const object = await bucket.get(key);
      if (object === null) {
        throw new MissingRawObjectError(key);
      }

      return { key, body: await object.text() };
    }),
  );
}

// The archived body is the whole GraphQL response, so a page schema applies to
// its `data` rather than to the object on disk.
const envelope = z.object({ data: z.unknown() });

function parse<T>(schema: z.ZodType<T>, page: RawPage): T {
  const { data } = check(envelope, json(page), page.key);

  return check(schema, data, page.key);
}

function json(page: RawPage): unknown {
  try {
    return JSON.parse(page.body);
  } catch (error) {
    throw new RawValidationError(page.key, "the body is not JSON", error);
  }
}

function check<T>(schema: z.ZodType<T>, value: unknown, key: string): T {
  const parsed = schema.safeParse(value);
  if (!parsed.success) {
    throw new RawValidationError(key, parsed.error.message, parsed.error);
  }

  return parsed.data;
}
