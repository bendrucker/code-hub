export interface RateLimitOverrides {
  cost?: number;
  remaining?: number;
  resetAt?: string;
}

export function rateLimit(overrides: RateLimitOverrides = {}) {
  return {
    cost: overrides.cost ?? 1,
    remaining: overrides.remaining ?? 4999,
    resetAt: overrides.resetAt ?? "2026-09-09T11:00:00Z",
  };
}

export function repository(name = "code-hub") {
  return {
    id: `R_${name}`,
    name,
    owner: { login: "bendrucker" },
    description: "System of record for GitHub contribution data",
    url: `https://github.com/bendrucker/${name}`,
    stargazerCount: 3,
    primaryLanguage: { name: "TypeScript", color: "#3178c6" },
    createdAt: "2026-08-01T00:00:00Z",
    isFork: false,
    visibility: "PUBLIC",
  };
}

export function pullRequest(number: number) {
  return {
    __typename: "PullRequest",
    id: `PR_${number}`,
    number,
    title: `pull request ${number}`,
    author: { login: "bendrucker" },
    createdAt: "2026-08-02T00:00:00Z",
    mergedAt: "2026-08-03T00:00:00Z",
    closedAt: "2026-08-03T00:00:00Z",
    state: "MERGED",
    additions: 10,
    deletions: 2,
    changedFiles: 3,
    comments: { totalCount: 1 },
    reviews: { totalCount: 2 },
    updatedAt: "2026-08-03T00:00:00Z",
    repository: repository(),
  };
}

export function reviewedPullRequest(number: number) {
  return {
    __typename: "PullRequest",
    id: `PR_${number}`,
    number,
    title: `pull request ${number}`,
    author: { login: "someone" },
    updatedAt: "2026-08-03T00:00:00Z",
    reviews: {
      totalCount: 1,
      nodes: [{ id: `PRR_${number}`, state: "APPROVED", submittedAt: "2026-08-03T00:00:00Z" }],
    },
    repository: repository(),
  };
}

export function issue(number: number) {
  return {
    __typename: "Issue",
    id: `I_${number}`,
    number,
    title: `issue ${number}`,
    author: { login: "bendrucker" },
    createdAt: "2026-08-02T00:00:00Z",
    closedAt: null,
    state: "OPEN",
    comments: { totalCount: 0 },
    updatedAt: "2026-08-02T00:00:00Z",
    repository: repository(),
  };
}

export interface SearchOverrides {
  issueCount?: number;
  endCursor?: string | null;
}

export function searchResponse(nodes: unknown[], overrides: SearchOverrides = {}) {
  const endCursor = overrides.endCursor ?? null;
  return jsonResponse({
    data: {
      search: {
        issueCount: overrides.issueCount ?? nodes.length,
        pageInfo: endCursor === null ? { hasNextPage: false } : { hasNextPage: true, endCursor },
        nodes,
      },
      rateLimit: rateLimit(),
    },
  });
}

export function commitContributions(count: number, dayTotal = 1) {
  return Array.from({ length: count }, (_, index) => ({
    repository: repository(`repo-${index}`),
    contributions: {
      totalCount: dayTotal,
      nodes: [{ commitCount: 4, occurredAt: "2026-08-02T00:00:00Z" }],
    },
  }));
}

export function contributionsResponse(repositoryCount: number, dayTotal = 1) {
  return jsonResponse({
    data: {
      user: {
        contributionsCollection: {
          totalCommitContributions: 120,
          totalPullRequestContributions: 40,
          totalPullRequestReviewContributions: 12,
          totalIssueContributions: 8,
          totalRepositoriesWithContributedCommits: repositoryCount,
          restrictedContributionsCount: 0,
          contributionYears: [2026, 2025],
          commitContributionsByRepository: commitContributions(repositoryCount, dayTotal),
        },
      },
      rateLimit: rateLimit(),
    },
  });
}

export function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export async function requestBody(
  request: Request,
): Promise<{ query: string; variables: Record<string, unknown> }> {
  return request.json();
}
