import { describe, expect, it } from "vitest";
import { stubFetch } from "../../test/fetch-stub";
import { contributionsResponse, jsonResponse, requestBody } from "../../test/github-fixtures";
import { fetchContributions, MAX_REPOSITORIES, UnknownUserError } from "./contributions";

const ENDPOINT = "https://api.github.test/graphql";
const NOW = new Date("2026-09-09T12:00:00Z");

describe("fetchContributions", () => {
  it("returns the collection and its totals", async () => {
    const stub = stubFetch(() => contributionsResponse(3));

    const result = await fetchContributions("t0ken", "bendrucker", 2025, {
      fetch: stub.fetch,
      endpoint: ENDPOINT,
      now: NOW,
    });

    expect(result.year).toBe(2025);
    expect(result.collection).toMatchObject({
      totalCommitContributions: 120,
      totalPullRequestReviewContributions: 12,
      restrictedContributionsCount: 0,
      contributionYears: [2026, 2025],
    });
    expect(result.collection.commitContributionsByRepository).toHaveLength(3);
    expect(result.collection.commitContributionsByRepository[0]?.contributions.nodes).toEqual([
      { commitCount: 4, occurredAt: "2026-08-02T00:00:00Z" },
    ]);
  });

  it("asks for the whole of a past year", async () => {
    const stub = stubFetch(() => contributionsResponse(1));

    await fetchContributions("t0ken", "bendrucker", 2025, {
      fetch: stub.fetch,
      endpoint: ENDPOINT,
      now: NOW,
    });

    await expect(requestBody(stub.requests[0]!)).resolves.toMatchObject({
      variables: {
        login: "bendrucker",
        from: "2025-01-01T00:00:00.000Z",
        to: "2025-12-31T23:59:59.000Z",
      },
    });
  });

  it("stops the current year at now, since a window wider than a year is rejected", async () => {
    const stub = stubFetch(() => contributionsResponse(1));

    await fetchContributions("t0ken", "bendrucker", 2026, {
      fetch: stub.fetch,
      endpoint: ENDPOINT,
      now: NOW,
    });

    await expect(requestBody(stub.requests[0]!)).resolves.toMatchObject({
      variables: { from: "2026-01-01T00:00:00.000Z", to: "2026-09-09T12:00:00.000Z" },
    });
  });

  it("leaves a year under the repository maximum unflagged", async () => {
    const stub = stubFetch(() => contributionsResponse(MAX_REPOSITORIES - 1));

    const result = await fetchContributions("t0ken", "bendrucker", 2025, {
      fetch: stub.fetch,
      endpoint: ENDPOINT,
      now: NOW,
    });

    expect(result.truncated).toBe(false);
  });

  it("flags a year that came back on the repository maximum", async () => {
    const stub = stubFetch(() => contributionsResponse(MAX_REPOSITORIES));

    const result = await fetchContributions("t0ken", "bendrucker", 2025, {
      fetch: stub.fetch,
      endpoint: ENDPOINT,
      now: NOW,
    });

    expect(result.truncated).toBe(true);
    expect(result.collection.totalRepositoriesWithContributedCommits).toBe(MAX_REPOSITORIES);
  });

  it("returns the raw body alongside the parsed collection", async () => {
    const stub = stubFetch(() => contributionsResponse(1));

    const result = await fetchContributions("t0ken", "bendrucker", 2025, {
      fetch: stub.fetch,
      endpoint: ENDPOINT,
      now: NOW,
    });

    expect(JSON.parse(result.body)).toMatchObject({ data: { user: {} } });
  });

  it("throws when the login matches no user", async () => {
    const stub = stubFetch(() =>
      jsonResponse({
        data: {
          user: null,
          rateLimit: { cost: 1, remaining: 4999, resetAt: "2026-09-09T11:00:00Z" },
        },
      }),
    );

    await expect(
      fetchContributions("t0ken", "nobody", 2025, {
        fetch: stub.fetch,
        endpoint: ENDPOINT,
        now: NOW,
      }),
    ).rejects.toThrow(UnknownUserError);
  });
});
