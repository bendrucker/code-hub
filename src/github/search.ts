import type { z } from "zod";
import { graphql, type GraphQLOptions } from "./client";
import type { RateLimit, SearchPage } from "./schema";

export const SEARCH_PAGE_SIZE = 100;

// The search connection caps at 1,000 results and says nothing when a query
// matched more. A window reporting the cap has probably lost rows, and the flag
// is the only signal there is short of the contributions cross-check.
export const SEARCH_MAX_RESULTS = 1000;

export interface SearchPageResult<T> {
  page: number;
  nodes: T[];
  issueCount: number;
  truncated: boolean;
  rateLimit: RateLimit;
  body: string;
}

export interface SearchOptions<T> extends GraphQLOptions {
  token: string;
  document: string;
  searchQuery: string;
  schema: z.ZodType<SearchPage<T>>;
  variables?: Record<string, unknown>;
}

export async function* searchPages<T>(
  options: SearchOptions<T>,
): AsyncGenerator<SearchPageResult<T>> {
  let after: string | null = null;
  let page = 0;
  let remaining = true;

  // A cursor loop rather than for...of: each request depends on the cursor the
  // response before it returned, so the pages cannot be issued together.
  while (remaining) {
    // eslint-disable-next-line no-await-in-loop
    const response = await graphql(
      options.token,
      options.document,
      {
        ...options.variables,
        searchQuery: options.searchQuery,
        first: SEARCH_PAGE_SIZE,
        after,
      },
      options,
    );

    const { search } = options.schema.parse(response.data);
    page += 1;

    yield {
      page,
      nodes: search.nodes,
      issueCount: search.issueCount,
      truncated: search.issueCount >= SEARCH_MAX_RESULTS,
      rateLimit: response.rateLimit,
      body: response.body,
    };

    remaining = search.pageInfo.hasNextPage;
    after = search.pageInfo.hasNextPage ? search.pageInfo.endCursor : null;
  }
}
