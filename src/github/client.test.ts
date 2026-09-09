import { describe, expect, it } from "vitest";
import { jsonResponse, rateLimit, requestBody } from "../../test/github-fixtures";
import { stubFetch } from "../../test/fetch-stub";
import {
  graphql,
  GitHubHttpError,
  GraphQLQueryError,
  RateLimitExhausted,
  type GraphQLOptions,
} from "./client";

const ENDPOINT = "https://api.github.test/graphql";

function options(fetch: typeof globalThis.fetch): GraphQLOptions {
  return { fetch, endpoint: ENDPOINT };
}

describe("graphql", () => {
  it("posts the query and returns the data, body, and rate limit", async () => {
    const stub = stubFetch(() => jsonResponse({ data: { search: {}, rateLimit: rateLimit() } }));

    const response = await graphql("t0ken", "query Q { x }", { first: 100 }, options(stub.fetch));

    expect(response.rateLimit).toEqual(rateLimit());
    expect(response.data).toEqual({ search: {}, rateLimit: rateLimit() });
    expect(JSON.parse(response.body)).toEqual({ data: { search: {}, rateLimit: rateLimit() } });

    const [request] = stub.requests;
    expect(request?.method).toBe("POST");
    expect(request?.url).toBe(ENDPOINT);
    expect(request?.headers.get("Authorization")).toBe("Bearer t0ken");
    expect(request?.headers.get("User-Agent")).toContain("code-hub");
    await expect(requestBody(request!)).resolves.toEqual({
      query: "query Q { x }",
      variables: { first: 100 },
    });
  });

  it("throws a typed error on a non-200", async () => {
    const stub = stubFetch(() => new Response("bad credentials", { status: 401 }));

    await expect(graphql("t0ken", "query Q { x }", {}, options(stub.fetch))).rejects.toThrow(
      GitHubHttpError,
    );
  });

  it("carries the status and body on a non-200", async () => {
    const stub = stubFetch(() => new Response("bad credentials", { status: 401 }));

    const error = await graphql("t0ken", "query Q { x }", {}, options(stub.fetch)).catch(
      (thrown: unknown) => thrown,
    );

    expect(error).toBeInstanceOf(GitHubHttpError);
    expect(error).toMatchObject({ status: 401, body: "bad credentials" });
  });

  it("throws on GraphQL errors even under a 200", async () => {
    const stub = stubFetch(() =>
      jsonResponse({ data: null, errors: [{ message: "Field 'nope' doesn't exist" }] }),
    );

    const error = await graphql("t0ken", "query Q { x }", {}, options(stub.fetch)).catch(
      (thrown: unknown) => thrown,
    );

    expect(error).toBeInstanceOf(GraphQLQueryError);
    expect(error).toMatchObject({ errors: [{ message: "Field 'nope' doesn't exist" }] });
  });

  it("throws the typed error when a request-level failure omits data entirely", async () => {
    const stub = stubFetch(() => jsonResponse({ errors: [{ message: "Query has node limit" }] }));

    const error = await graphql("t0ken", "query Q { x }", {}, options(stub.fetch)).catch(
      (thrown: unknown) => thrown,
    );

    expect(error).toBeInstanceOf(GraphQLQueryError);
    expect(error).toMatchObject({ errors: [{ message: "Query has node limit" }] });
  });

  it("stops on the rate limit floor rather than waiting for a 403", async () => {
    const stub = stubFetch(() =>
      jsonResponse({
        data: { rateLimit: rateLimit({ remaining: 40, resetAt: "2026-09-09T12:00:00Z" }) },
      }),
    );

    const error = await graphql(
      "t0ken",
      "query Q { x }",
      {},
      { ...options(stub.fetch), floor: 100 },
    ).catch((thrown: unknown) => thrown);

    expect(error).toBeInstanceOf(RateLimitExhausted);
    expect(error).toMatchObject({ remaining: 40, resetAt: "2026-09-09T12:00:00Z" });
  });

  it("returns a response sitting exactly on the floor", async () => {
    const stub = stubFetch(() =>
      jsonResponse({ data: { rateLimit: rateLimit({ remaining: 100 }) } }),
    );

    const response = await graphql(
      "t0ken",
      "query Q { x }",
      {},
      { ...options(stub.fetch), floor: 100 },
    );

    expect(response.rateLimit.remaining).toBe(100);
  });

  it("rejects a response that selected no rate limit", async () => {
    const stub = stubFetch(() => jsonResponse({ data: { search: {} } }));

    await expect(graphql("t0ken", "query Q { x }", {}, options(stub.fetch))).rejects.toThrow();
  });
});
