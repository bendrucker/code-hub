// Every GraphQL document selects `rateLimit` so the extractor reads its
// remaining budget off whatever response it just took.
const gql = (strings: TemplateStringsArray) => strings.raw.join("");

const REPOSITORY_FRAGMENT = gql`
  fragment RepositoryInfo on Repository {
    id
    name
    owner {
      login
    }
    description
    url
    stargazerCount
    primaryLanguage {
      name
      color
    }
    createdAt
    isFork
    visibility
  }
`;

const RATE_LIMIT = gql`
  rateLimit {
    cost
    remaining
    resetAt
  }
`;

export const PULL_REQUEST_SEARCH = `
  ${REPOSITORY_FRAGMENT}

  query PullRequestSearch($searchQuery: String!, $first: Int!, $after: String) {
    search(query: $searchQuery, type: ISSUE, first: $first, after: $after) {
      issueCount
      pageInfo {
        hasNextPage
        endCursor
      }
      nodes {
        __typename
        ... on PullRequest {
          id
          number
          title
          author {
            login
          }
          createdAt
          mergedAt
          closedAt
          state
          additions
          deletions
          changedFiles
          comments {
            totalCount
          }
          reviews {
            totalCount
          }
          updatedAt
          repository {
            ...RepositoryInfo
          }
        }
      }
    }

    ${RATE_LIMIT}
  }
`;

// A `reviewed-by:` search matches the pull request, so the reviews come off the
// node's own connection filtered to one author.
export const REVIEWED_PULL_REQUEST_SEARCH = `
  ${REPOSITORY_FRAGMENT}

  query ReviewedPullRequestSearch(
    $searchQuery: String!
    $login: String!
    $first: Int!
    $after: String
  ) {
    search(query: $searchQuery, type: ISSUE, first: $first, after: $after) {
      issueCount
      pageInfo {
        hasNextPage
        endCursor
      }
      nodes {
        __typename
        ... on PullRequest {
          id
          number
          title
          author {
            login
          }
          updatedAt
          reviews(author: $login, first: 100) {
            totalCount
            nodes {
              id
              state
              submittedAt
            }
          }
          repository {
            ...RepositoryInfo
          }
        }
      }
    }

    ${RATE_LIMIT}
  }
`;

export const ISSUE_SEARCH = `
  ${REPOSITORY_FRAGMENT}

  query IssueSearch($searchQuery: String!, $first: Int!, $after: String) {
    search(query: $searchQuery, type: ISSUE, first: $first, after: $after) {
      issueCount
      pageInfo {
        hasNextPage
        endCursor
      }
      nodes {
        __typename
        ... on Issue {
          id
          number
          title
          author {
            login
          }
          createdAt
          closedAt
          state
          comments {
            totalCount
          }
          updatedAt
          repository {
            ...RepositoryInfo
          }
        }
      }
    }

    ${RATE_LIMIT}
  }
`;

export const CONTRIBUTIONS = `
  ${REPOSITORY_FRAGMENT}

  query Contributions($login: String!, $from: DateTime!, $to: DateTime!) {
    user(login: $login) {
      contributionsCollection(from: $from, to: $to) {
        totalCommitContributions
        totalPullRequestContributions
        totalPullRequestReviewContributions
        totalIssueContributions
        totalRepositoriesWithContributedCommits
        restrictedContributionsCount
        contributionYears
        commitContributionsByRepository(maxRepositories: 100) {
          repository {
            ...RepositoryInfo
          }
          contributions(first: 100) {
            totalCount
            nodes {
              commitCount
              occurredAt
            }
          }
        }
      }
    }

    ${RATE_LIMIT}
  }
`;
