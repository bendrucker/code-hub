import { env } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import {
  contributionsPayload,
  issue,
  pullRequest,
  repository,
  reviewedPullRequest,
  searchPayload,
} from "../../test/github-fixtures";
import { readRow } from "../../test/tables";
import { contributionsKey, searchKey } from "../github/raw";
import type { EventKind } from "../github/windows";
import {
  MissingRawObjectError,
  RawValidationError,
  replayContributions,
  replaySearchWindow,
} from "./replay";

const WINDOW = "2026-08";
const EARLIER = "2026-09-09T11:00:00.000Z";
const LATER = "2026-09-09T12:00:00.000Z";

async function clearRaw(): Promise<void> {
  const listed = await env.RAW.list();
  await env.RAW.delete(listed.objects.map((object) => object.key));
}

beforeEach(clearRaw);

function archive(
  kind: EventKind,
  fetchedAt: string,
  page: number,
  nodes: readonly unknown[],
): Promise<unknown> {
  return env.RAW.put(
    searchKey(kind, WINDOW, fetchedAt, page),
    JSON.stringify(searchPayload(nodes)),
  );
}

function count(table: string): Promise<{ total: number } | null> {
  return readRow<{ total: number }>(env.DB, `SELECT COUNT(*) AS total FROM ${table}`);
}

describe("replaySearchWindow", () => {
  it("normalizes an archived window without calling GitHub", async () => {
    await archive("pr-authored", LATER, 1, [pullRequest(1), pullRequest(2)]);

    const replayed = await replaySearchWindow(env.DB, env.RAW, "pr-authored", WINDOW);

    expect(replayed?.fetchedAt).toBe(LATER);
    expect(replayed?.rows.pullRequests).toBe(2);
    expect(await count("pull_requests")).toEqual({ total: 2 });
  });

  it("stamps the repository with the fetch that produced the page", async () => {
    await archive("pr-authored", LATER, 1, [pullRequest(1)]);

    await replaySearchWindow(env.DB, env.RAW, "pr-authored", WINDOW);

    const stored = await readRow<{ fetched_at: string }>(
      env.DB,
      "SELECT fetched_at FROM repositories WHERE id = ?",
      "R_code-hub",
    );
    expect(stored?.fetched_at).toBe(LATER);
  });

  it("reads the newest fetch and leaves the one before it alone", async () => {
    await archive("issue", EARLIER, 1, [issue(1)]);
    await archive("issue", LATER, 1, [issue(2)]);

    const replayed = await replaySearchWindow(env.DB, env.RAW, "issue", WINDOW);

    expect(replayed?.fetchedAt).toBe(LATER);
    expect(await count("issues")).toEqual({ total: 1 });
    const stored = await readRow<{ id: string }>(env.DB, "SELECT id FROM issues");
    expect(stored?.id).toBe("I_2");
  });

  it("reads every page of the fetch in key order", async () => {
    await archive("issue", LATER, 2, [issue(2)]);
    await archive("issue", LATER, 10, [issue(10)]);
    await archive("issue", LATER, 1, [issue(1)]);

    const replayed = await replaySearchWindow(env.DB, env.RAW, "issue", WINDOW);

    expect(replayed?.rows.issues).toBe(3);
    const { results } = await env.DB.prepare("SELECT id FROM issues ORDER BY number").all<{
      id: string;
    }>();
    expect(results.map((row) => row.id)).toEqual(["I_1", "I_2", "I_10"]);
  });

  it("writes one repository for a window that names it on every page", async () => {
    await archive("pr-authored", LATER, 1, [pullRequest(1)]);
    await archive("pr-authored", LATER, 2, [pullRequest(2)]);

    const replayed = await replaySearchWindow(env.DB, env.RAW, "pr-authored", WINDOW);

    expect(replayed?.rows.repositories).toBe(1);
  });

  it("keys a replayed repository off the node id", async () => {
    await archive("pr-authored", LATER, 1, [
      pullRequest(1, { repository: repository("activity-hub") }),
    ]);

    await replaySearchWindow(env.DB, env.RAW, "pr-authored", WINDOW);

    const stored = await readRow<{ name: string }>(
      env.DB,
      "SELECT name FROM repositories WHERE id = ?",
      "R_activity-hub",
    );
    expect(stored?.name).toBe("activity-hub");
  });

  it("replays a reviewed window onto the reviews table", async () => {
    await archive("pr-reviewed", LATER, 1, [reviewedPullRequest(7)]);

    const replayed = await replaySearchWindow(env.DB, env.RAW, "pr-reviewed", WINDOW);

    expect(replayed?.rows.reviews).toBe(1);
  });

  it("changes nothing on a second replay of the same window", async () => {
    await archive("pr-authored", LATER, 1, [pullRequest(1)]);
    await replaySearchWindow(env.DB, env.RAW, "pr-authored", WINDOW);

    const replayed = await replaySearchWindow(env.DB, env.RAW, "pr-authored", WINDOW);

    expect(replayed?.rows).toEqual({
      repositories: 0,
      pullRequests: 0,
      reviews: 0,
      issues: 0,
      commitDays: 0,
    });
  });

  it("reports a window nothing was archived under", async () => {
    await expect(replaySearchWindow(env.DB, env.RAW, "issue", "2011-01")).resolves.toBeNull();
  });

  it("names the key in the error when a body no longer validates", async () => {
    const key = searchKey("pr-authored", WINDOW, LATER, 1);
    await env.RAW.put(key, JSON.stringify(searchPayload([{ ...pullRequest(1), additions: "10" }])));

    const replay = replaySearchWindow(env.DB, env.RAW, "pr-authored", WINDOW);

    await expect(replay).rejects.toThrow(RawValidationError);
    await expect(replay).rejects.toMatchObject({ key });
  });

  it("names the key when a body is not JSON", async () => {
    const key = searchKey("issue", WINDOW, LATER, 1);
    await env.RAW.put(key, "<html>502</html>");

    await expect(replaySearchWindow(env.DB, env.RAW, "issue", WINDOW)).rejects.toMatchObject({
      key,
      name: "RawValidationError",
    });
  });

  it("reports a window whose objects were deleted", async () => {
    const key = searchKey("issue", WINDOW, LATER, 1);
    await env.RAW.put(key, JSON.stringify(searchPayload([issue(1)])));
    await env.RAW.delete(key);

    // The fetch prefix survives its objects in neither R2 nor the listing, so a
    // window emptied between the two calls reads as nothing archived.
    await expect(replaySearchWindow(env.DB, env.RAW, "issue", WINDOW)).resolves.toBeNull();
  });
});

describe("replayContributions", () => {
  it("normalizes the newest archived year", async () => {
    await env.RAW.put(contributionsKey(2026, EARLIER), JSON.stringify(contributionsPayload(1)));
    await env.RAW.put(contributionsKey(2026, LATER), JSON.stringify(contributionsPayload(3)));

    const replayed = await replayContributions(env.DB, env.RAW, 2026);

    expect(replayed?.fetchedAt).toBe(LATER);
    expect(replayed?.rows.commitDays).toBe(3);
    expect(await count("repositories")).toEqual({ total: 3 });
  });

  it("reports a year nothing was archived under", async () => {
    await expect(replayContributions(env.DB, env.RAW, 2011)).resolves.toBeNull();
  });

  it("names the key when the response carries no user", async () => {
    const key = contributionsKey(2026, LATER);
    await env.RAW.put(key, JSON.stringify({ data: { user: null } }));

    await expect(replayContributions(env.DB, env.RAW, 2026)).rejects.toMatchObject({
      key,
      name: "RawValidationError",
    });
  });

  it("changes nothing on a second replay of the same year", async () => {
    await env.RAW.put(contributionsKey(2026, LATER), JSON.stringify(contributionsPayload(2)));
    await replayContributions(env.DB, env.RAW, 2026);

    const replayed = await replayContributions(env.DB, env.RAW, 2026);

    expect(replayed?.rows.commitDays).toBe(0);
    expect(replayed?.rows.repositories).toBe(0);
  });
});

describe("MissingRawObjectError", () => {
  it("carries the key it could not read", () => {
    const error = new MissingRawObjectError("raw/search/issue/2026-08/fetch/0001.json");

    expect(error.name).toBe("MissingRawObjectError");
    expect(error.key).toBe("raw/search/issue/2026-08/fetch/0001.json");
  });
});
