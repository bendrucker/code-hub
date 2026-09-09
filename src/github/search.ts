import type { z } from "zod";
import { graphql, validate, type GraphQLOptions } from "./client";
import { ISSUE_SEARCH, PULL_REQUEST_SEARCH, REVIEWED_PULL_REQUEST_SEARCH } from "./queries";
import {
  issueSearchPage,
  pullRequestSearchPage,
  reviewedPullRequestSearchPage,
  type IssueNode,
  type PullRequestNode,
  type RateLimit,
  type ReviewedPullRequestNode,
  type SearchPage,
} from "./schema";

export const SEARCH_PAGE_SIZE = 100;

// The search connection caps at 1,000 results and says nothing when a query
// matched more. A window reporting the cap has probably lost rows, and the flag
// is the only signal there is short of the contributions cross-check.
export const SEARCH_MAX_RESULTS = 1000;

const MAX_PAGES = SEARCH_MAX_RESULTS / SEARCH_PAGE_SIZE;

export interface SearchPageResult<T> {
  page: number;
  nodes: T[];
  issueCount: number;
  truncated: boolean;
  rateLimit: RateLimit;
  body: string;
}

export interface SearchOptions extends GraphQLOptions {
  token: string;
  searchQuery: string;
}

interface DocumentOptions<T> extends SearchOptions {
  document: string;
  schema: z.ZodType<SearchPage<T>>;
  variables?: Record<string, unknown>;
}

async function* searchPages<T>(options: DocumentOptions<T>): AsyncGenerator<SearchPageResult<T>> {
  let after: string | null = null;
  let page = 0;
  let remaining = true;

  // A cursor loop rather than for...of: each request depends on the cursor the
  // response before it returned, so the pages cannot be issued together. The
  // page bound is the second stop: GitHub rejects a cursor past the 1,000th
  // result, so a window that keeps announcing successors ends here rather than
  // on that error.
  while (remaining && page < MAX_PAGES) {
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

    const { search } = validate(options.schema, response.data, response.body);
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

export function pullRequestPages(
  options: SearchOptions,
): AsyncGenerator<SearchPageResult<PullRequestNode>> {
  return searchPages({ ...options, document: PULL_REQUEST_SEARCH, schema: pullRequestSearchPage });
}

// A `reviewed-by:` document filters the reviews sub-connection by author, so the
// login is part of the query rather than only of the search string. Taking it
// as a required field is what keeps a caller from sending the document without
// the variable it declares.
export function reviewedPullRequestPages(
  options: SearchOptions & { login: string },
): AsyncGenerator<SearchPageResult<ReviewedPullRequestNode>> {
  return searchPages({
    ...options,
    document: REVIEWED_PULL_REQUEST_SEARCH,
    schema: reviewedPullRequestSearchPage,
    variables: { login: options.login },
  });
}

export function issuePages(options: SearchOptions): AsyncGenerator<SearchPageResult<IssueNode>> {
  return searchPages({ ...options, document: ISSUE_SEARCH, schema: issueSearchPage });
}
