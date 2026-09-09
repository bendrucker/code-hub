import { env } from "cloudflare:test";
import { beforeEach } from "vitest";

// Children before parents. Foreign keys are enforced and checked immediately,
// so deleting a repository still referenced by a pull request fails.
const tables = ["pull_requests", "reviews", "issues", "commit_days", "repositories", "sync_state"];

// The pool shares one database across every test in a file, so a test would
// otherwise read whatever its predecessors wrote.
beforeEach(async () => {
  await env.DB.batch(tables.map((table) => env.DB.prepare(`DELETE FROM ${table}`)));
});
