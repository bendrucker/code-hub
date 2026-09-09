// Validated GitHub nodes in, store rows out. Nothing here converts a value:
// timestamps stay the strings GitHub returned, so a row reads back as what the
// archived page said.
import type {
  ContributionsCollection,
  IssueNode,
  PullRequestNode,
  Repository as RepositoryNode,
  ReviewedPullRequestNode,
} from "../github/schema";
import type { CommitDay, Issue, PullRequest, Repository, Review } from "../store";

// Every author column is NOT NULL and no GitHub login is empty, so an empty
// string is how a node whose account was deleted reads back.
const DELETED_AUTHOR = "";

// `commit_days` is keyed by day, so an `occurredAt` keeps only its date part.
const DAY_LENGTH = "2026-09-09".length;

function login(author: { login: string } | null): string {
  return author?.login ?? DELETED_AUTHOR;
}

export function repositoryRow(node: RepositoryNode, fetchedAt: string): Repository {
  return {
    id: node.id,
    owner: node.owner.login,
    name: node.name,
    description: node.description,
    url: node.url,
    stargazerCount: node.stargazerCount,
    primaryLanguage: node.primaryLanguage?.name ?? null,
    primaryLanguageColor: node.primaryLanguage?.color ?? null,
    createdAt: node.createdAt,
    isFork: node.isFork,
    visibility: node.visibility,
    fetchedAt,
  };
}

export interface PullRequestRows {
  repository: Repository;
  pullRequest: PullRequest;
}

export function pullRequestRows(node: PullRequestNode, fetchedAt: string): PullRequestRows {
  return {
    repository: repositoryRow(node.repository, fetchedAt),
    pullRequest: {
      id: node.id,
      repositoryId: node.repository.id,
      number: node.number,
      title: node.title,
      author: login(node.author),
      createdAt: node.createdAt,
      mergedAt: node.mergedAt,
      closedAt: node.closedAt,
      state: node.state,
      additions: node.additions,
      deletions: node.deletions,
      changedFiles: node.changedFiles,
      commentCount: node.comments.totalCount,
      reviewCount: node.reviews.totalCount,
      updatedAt: node.updatedAt,
    },
  };
}

export interface ReviewRows {
  repository: Repository;
  reviews: Review[];
}

// A `reviewed-by:` search matches the pull request, so one node carries every
// review that login left on it. A review still awaiting submission has no
// `submittedAt` and is not yet an event, so it is dropped rather than dated.
export function reviewRows(node: ReviewedPullRequestNode, fetchedAt: string): ReviewRows {
  const pullRequestAuthor = login(node.author);

  return {
    repository: repositoryRow(node.repository, fetchedAt),
    reviews: node.reviews.nodes.flatMap((review) =>
      review.submittedAt === null
        ? []
        : {
            id: review.id,
            repositoryId: node.repository.id,
            pullRequestNumber: node.number,
            pullRequestAuthor,
            state: review.state,
            submittedAt: review.submittedAt,
          },
    ),
  };
}

export interface IssueRows {
  repository: Repository;
  issue: Issue;
}

export function issueRows(node: IssueNode, fetchedAt: string): IssueRows {
  return {
    repository: repositoryRow(node.repository, fetchedAt),
    issue: {
      id: node.id,
      repositoryId: node.repository.id,
      number: node.number,
      title: node.title,
      author: login(node.author),
      createdAt: node.createdAt,
      closedAt: node.closedAt,
      state: node.state,
      commentCount: node.comments.totalCount,
      updatedAt: node.updatedAt,
    },
  };
}

export interface ContributionRows {
  repositories: Repository[];
  commitDays: CommitDay[];
}

export function contributionRows(
  collection: ContributionsCollection,
  fetchedAt: string,
): ContributionRows {
  const byRepository = collection.commitContributionsByRepository;

  return {
    repositories: byRepository.map((entry) => repositoryRow(entry.repository, fetchedAt)),
    commitDays: byRepository.flatMap((entry) =>
      entry.contributions.nodes.map((contribution) => ({
        repositoryId: entry.repository.id,
        day: contribution.occurredAt.slice(0, DAY_LENGTH),
        commitCount: contribution.commitCount,
      })),
    ),
  };
}
