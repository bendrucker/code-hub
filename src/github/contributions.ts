import { graphql, type GraphQLOptions } from "./client";
import { CONTRIBUTIONS } from "./queries";
import { contributionsResponse, type ContributionsCollection, type RateLimit } from "./schema";

// `commitContributionsByRepository` is a plain list rather than a connection:
// anything past `maxRepositories` is dropped with no error and no cursor to
// follow. A year coming back at exactly the maximum has probably lost
// repositories, and `totalRepositoriesWithContributedCommits` off the same
// response is the count to check it against.
export const MAX_REPOSITORIES = 100;

export class UnknownUserError extends Error {
  readonly login: string;

  constructor(login: string) {
    super(`GitHub has no user ${login}`);
    this.name = "UnknownUserError";
    this.login = login;
  }
}

export interface ContributionsOptions extends GraphQLOptions {
  now?: Date;
}

export interface ContributionsResult {
  year: number;
  collection: ContributionsCollection;
  truncated: boolean;
  rateLimit: RateLimit;
  body: string;
}

export async function fetchContributions(
  token: string,
  login: string,
  year: number,
  options: ContributionsOptions = {},
): Promise<ContributionsResult> {
  const now = options.now ?? new Date();
  const yearEnd = new Date(Date.UTC(year, 11, 31, 23, 59, 59));

  // The collection takes at most a year per request and rejects a wider window,
  // so the current year stops at now rather than at December.
  const to = now < yearEnd ? now : yearEnd;

  const response = await graphql(
    token,
    CONTRIBUTIONS,
    {
      login,
      from: new Date(Date.UTC(year, 0, 1)).toISOString(),
      to: to.toISOString(),
    },
    options,
  );

  const { user } = contributionsResponse.parse(response.data);
  if (!user) {
    throw new UnknownUserError(login);
  }

  const collection = user.contributionsCollection;

  return {
    year,
    collection,
    truncated: collection.commitContributionsByRepository.length >= MAX_REPOSITORIES,
    rateLimit: response.rateLimit,
    body: response.body,
  };
}
