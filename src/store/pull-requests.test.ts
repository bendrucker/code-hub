import { env } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import { pullRequest, seedRepository } from "../../test/fixtures";
import { upsertPullRequests } from "./pull-requests";

interface StoredPullRequest {
  id: string;
  repository_id: string;
  number: number;
  title: string;
  author: string;
  created_at: string;
  merged_at: string | null;
  closed_at: string | null;
  state: string;
  additions: number;
  deletions: number;
  changed_files: number;
  comment_count: number;
  review_count: number;
  updated_at: string;
  published_at: string | null;
}

function read(id: string): Promise<StoredPullRequest | null> {
  return env.DB.prepare("SELECT * FROM pull_requests WHERE id = ?")
    .bind(id)
    .first<StoredPullRequest>();
}

function publish(id: string): Promise<unknown> {
  return env.DB.prepare("UPDATE pull_requests SET published_at = ? WHERE id = ?")
    .bind("2026-09-09T18:00:00Z", id)
    .run();
}

describe("upsertPullRequests", () => {
  beforeEach(async () => {
    await seedRepository(env.DB);
  });

  it("writes a row that reads back as GitHub described it", async () => {
    const changed = await upsertPullRequests(env.DB, [pullRequest()]);

    expect(changed).toBe(1);
    expect(await read("PR_pull1")).toEqual({
      id: "PR_pull1",
      repository_id: "R_repo1",
      number: 2,
      title: "add README and design doc",
      author: "bendrucker",
      created_at: "2026-09-09T16:00:00Z",
      merged_at: "2026-09-09T16:30:00Z",
      closed_at: "2026-09-09T16:30:00Z",
      state: "MERGED",
      additions: 345,
      deletions: 2,
      changed_files: 2,
      comment_count: 0,
      review_count: 1,
      updated_at: "2026-09-09T16:30:00Z",
      published_at: null,
    });
  });

  it("writes every row in one call", async () => {
    const changed = await upsertPullRequests(env.DB, [
      pullRequest(),
      pullRequest({ id: "PR_pull2", number: 3, title: "add the event schema" }),
    ]);

    expect(changed).toBe(2);
    expect((await read("PR_pull2"))?.title).toBe("add the event schema");
  });

  it("leaves a published row alone when nothing moved", async () => {
    await upsertPullRequests(env.DB, [pullRequest()]);
    await publish("PR_pull1");

    const changed = await upsertPullRequests(env.DB, [pullRequest()]);

    expect(changed).toBe(0);
    expect((await read("PR_pull1"))?.published_at).toBe("2026-09-09T18:00:00Z");
  });

  it("clears the publish marker when a column moved", async () => {
    await upsertPullRequests(env.DB, [pullRequest()]);
    await publish("PR_pull1");

    const changed = await upsertPullRequests(env.DB, [pullRequest({ commentCount: 1 })]);

    expect(changed).toBe(1);
    const stored = await read("PR_pull1");
    expect(stored?.comment_count).toBe(1);
    expect(stored?.published_at).toBeNull();
  });

  it("treats a column going null as a change", async () => {
    await upsertPullRequests(env.DB, [pullRequest()]);
    await publish("PR_pull1");

    const changed = await upsertPullRequests(env.DB, [
      pullRequest({ mergedAt: null, closedAt: null, state: "OPEN" }),
    ]);

    expect(changed).toBe(1);
    expect((await read("PR_pull1"))?.published_at).toBeNull();
  });

  it("rejects a pull request whose repository is not stored", async () => {
    await expect(
      upsertPullRequests(env.DB, [pullRequest({ repositoryId: "R_missing" })]),
    ).rejects.toThrow("FOREIGN KEY constraint failed");
  });
});
