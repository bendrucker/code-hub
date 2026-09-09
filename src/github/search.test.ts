import { describe, expect, it } from "vitest";
import { stubFetch, type FetchStub } from "../../test/fetch-stub";
import {
  jsonResponse,
  pullRequest,
  rateLimit,
  requestBody,
  searchResponse,
} from "../../test/github-fixtures";
import { RateLimitExhausted, ResponseValidationError } from "./client";
import { type PullRequestNode } from "./schema";
import {
  pullRequestPages,
  reviewedPullRequestPages,
  SEARCH_MAX_RESULTS,
  SEARCH_PAGE_SIZE,
  type SearchPageResult,
} from "./search";

const ENDPOINT = "https://api.github.test/graphql";

function pages(stub: FetchStub, floor?: number) {
  return pullRequestPages({
    token: "t0ken",
    searchQuery: "is:pr author:bendrucker created:2026-08-01..2026-08-31",
    fetch: stub.fetch,
    endpoint: ENDPOINT,
    floor,
  });
}

async function collect(
  iterator: AsyncGenerator<SearchPageResult<PullRequestNode>>,
): Promise<SearchPageResult<PullRequestNode>[]> {
  const results: SearchPageResult<PullRequestNode>[] = [];
  for await (const result of iterator) {
    results.push(result);
  }
  return results;
}

describe("searchPages", () => {
  it("follows the cursor across two pages", async () => {
    let served = 0;
    const stub = stubFetch(() => {
      served += 1;
      return served === 1
        ? searchResponse([pullRequest(1)], { issueCount: 2, endCursor: "Y3Vy" })
        : searchResponse([pullRequest(2)], { issueCount: 2 });
    });

    const results = await collect(pages(stub));

    expect(results.map((result) => result.page)).toEqual([1, 2]);
    expect(results.flatMap((result) => result.nodes.map((node) => node.id))).toEqual([
      "PR_1",
      "PR_2",
    ]);
  });

  it("sends the cursor the previous page returned", async () => {
    let served = 0;
    const stub = stubFetch(() => {
      served += 1;
      return served === 1
        ? searchResponse([pullRequest(1)], { endCursor: "Y3Vy" })
        : searchResponse([pullRequest(2)]);
    });

    await collect(pages(stub));

    const [first, second] = stub.requests;
    await expect(requestBody(first!)).resolves.toMatchObject({
      variables: {
        after: null,
        first: 100,
        searchQuery: "is:pr author:bendrucker created:2026-08-01..2026-08-31",
      },
    });
    await expect(requestBody(second!)).resolves.toMatchObject({ variables: { after: "Y3Vy" } });
  });

  it("stops on a page that announces no successor", async () => {
    const stub = stubFetch(() => searchResponse([pullRequest(1)]));

    await collect(pages(stub));

    expect(stub.requests).toHaveLength(1);
  });

  it("returns the raw body alongside the parsed nodes", async () => {
    const stub = stubFetch(() => searchResponse([pullRequest(1)]));

    const [result] = await collect(pages(stub));

    expect(JSON.parse(result!.body)).toMatchObject({ data: { rateLimit: rateLimit() } });
  });

  it("leaves a window under the cap unflagged", async () => {
    const stub = stubFetch(() => searchResponse([pullRequest(1)], { issueCount: 999 }));

    const [result] = await collect(pages(stub));

    expect(result?.truncated).toBe(false);
    expect(result?.issueCount).toBe(999);
  });

  it("flags a window that came back on the cap", async () => {
    const stub = stubFetch(() => searchResponse([pullRequest(1)], { issueCount: 1000 }));

    const [result] = await collect(pages(stub));

    expect(result?.truncated).toBe(true);
  });

  it("stops paging when the rate limit drops under the floor", async () => {
    let served = 0;
    const stub = stubFetch(() => {
      served += 1;
      if (served === 1) {
        return searchResponse([pullRequest(1)], { endCursor: "Y3Vy" });
      }
      return jsonResponse({
        data: {
          search: { issueCount: 2, pageInfo: { hasNextPage: false }, nodes: [pullRequest(2)] },
          rateLimit: rateLimit({ remaining: 4, resetAt: "2026-09-09T12:00:00Z" }),
        },
      });
    });

    const iterator = pages(stub, 10);

    const first = await iterator.next();
    expect(first.value?.page).toBe(1);

    const error = await iterator.next().catch((thrown: unknown) => thrown);
    expect(error).toBeInstanceOf(RateLimitExhausted);
    expect(error).toMatchObject({ remaining: 4, resetAt: "2026-09-09T12:00:00Z" });
  });
});

describe("search entry points", () => {
  it("sends the login the reviewed-by document declares", async () => {
    const stub = stubFetch(() => searchResponse([]));

    const iterator = reviewedPullRequestPages({
      token: "t0ken",
      searchQuery: "is:pr reviewed-by:bendrucker created:2026-08-01..2026-08-31",
      login: "bendrucker",
      fetch: stub.fetch,
      endpoint: ENDPOINT,
    });
    await iterator.next();

    await expect(requestBody(stub.requests[0]!)).resolves.toMatchObject({
      variables: { login: "bendrucker" },
    });
  });

  it("stops at the result cap rather than following a cursor GitHub will reject", async () => {
    const stub = stubFetch(() =>
      searchResponse([pullRequest(1)], { issueCount: SEARCH_MAX_RESULTS, endCursor: "Y3Vy" }),
    );

    const results = await collect(pages(stub));

    expect(results).toHaveLength(SEARCH_MAX_RESULTS / SEARCH_PAGE_SIZE);
    expect(results.at(-1)?.truncated).toBe(true);
  });

  it("keeps the raw body reachable when the page fails to validate", async () => {
    const body = JSON.stringify({
      data: {
        search: { issueCount: 1, pageInfo: { hasNextPage: false }, nodes: [{ __typename: 42 }] },
        rateLimit: rateLimit(),
      },
    });
    const stub = stubFetch(() => new Response(body, { status: 200 }));

    const error = await collect(pages(stub)).catch((thrown: unknown) => thrown);

    expect(error).toBeInstanceOf(ResponseValidationError);
    expect(error).toMatchObject({ body });
  });
});
