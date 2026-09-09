import { GitHubResponseError, graphql, validate, type GraphQLOptions } from "./client";
import { CONTRIBUTIONS, MAX_REPOSITORIES, NESTED_PAGE_SIZE } from "./queries";
import { contributionsResponse, type ContributionsCollection, type RateLimit } from "./schema";

export { MAX_REPOSITORIES } from "./queries";

export class UnknownUserError extends GitHubResponseError {
  readonly login: string;

  constructor(login: string, body: string) {
    super("UnknownUserError", `GitHub has no user ${login}`, body);
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

// Two fixed lists with no cursor between them: anything past the limit each was
// given is dropped with no error and nothing to follow. The repository list is
// checked against that limit, and each repository's daily contributions against
// the total the same response reports, since a repository committed to on more
// than a page of days in one year returns only the first page.
// `totalRepositoriesWithContributedCommits` is the count to cross-check the
// first against.
export function contributionsTruncated(collection: ContributionsCollection): boolean {
  return (
    collection.commitContributionsByRepository.length >= MAX_REPOSITORIES ||
    collection.commitContributionsByRepository.some(
      ({ contributions }) => contributions.totalCount > NESTED_PAGE_SIZE,
    )
  );
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

  const { user } = validate(contributionsResponse, response.data, response.body);
  if (!user) {
    throw new UnknownUserError(login, response.body);
  }

  const collection = user.contributionsCollection;

  return {
    year,
    collection,
    truncated: contributionsTruncated(collection),
    rateLimit: response.rateLimit,
    body: response.body,
  };
}
