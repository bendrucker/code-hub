import type { ContributionsCollection } from "../github/schema";

// GitHub's own yearly totals against what the event tables hold. A search
// window that hit the silent 1,000-result cap shows up here and nowhere else.
// It is recorded rather than failed on: `restrictedContributionsCount` counts
// contributions the token cannot see, so a gap can be a visibility difference
// instead of lost rows.
export async function crossCheck(
  db: D1Database,
  year: number,
  collection: ContributionsCollection,
): Promise<string | null> {
  const stored = await yearTotals(db, year);
  const reported = {
    "pull requests": collection.totalPullRequestContributions,
    reviews: collection.totalPullRequestReviewContributions,
    issues: collection.totalIssueContributions,
    commits: collection.totalCommitContributions,
  };

  const gaps = TOTALS.filter((name) => reported[name] !== stored[name]).map(
    (name) => `${name} ${reported[name]} vs ${stored[name]}`,
  );
  if (gaps.length === 0) {
    return null;
  }

  return `${year} totals disagree: ${gaps.join(", ")} (restricted ${collection.restrictedContributionsCount})`;
}

const TOTALS = ["pull requests", "reviews", "issues", "commits"] as const;

type Totals = Record<(typeof TOTALS)[number], number>;

const SOURCES: Record<(typeof TOTALS)[number], string> = {
  "pull requests":
    "SELECT COUNT(*) AS total FROM pull_requests WHERE created_at >= ?1 AND created_at < ?2",
  reviews: "SELECT COUNT(*) AS total FROM reviews WHERE submitted_at >= ?1 AND submitted_at < ?2",
  issues: "SELECT COUNT(*) AS total FROM issues WHERE created_at >= ?1 AND created_at < ?2",
  commits:
    "SELECT COALESCE(SUM(commit_count), 0) AS total FROM commit_days WHERE day >= ?1 AND day < ?2",
};

async function yearTotals(db: D1Database, year: number): Promise<Totals> {
  const from = `${year}-01-01`;
  const to = `${year + 1}-01-01`;
  const results = await db.batch<{ total: number }>(
    TOTALS.map((name) => db.prepare(SOURCES[name]).bind(from, to)),
  );

  // batch answers in the order it was given, so each name reads its own count.
  const counted = (name: (typeof TOTALS)[number]): number =>
    results[TOTALS.indexOf(name)]?.results[0]?.total ?? 0;

  return {
    "pull requests": counted("pull requests"),
    reviews: counted("reviews"),
    issues: counted("issues"),
    commits: counted("commits"),
  };
}
