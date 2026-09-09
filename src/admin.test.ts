import { env, SELF } from "cloudflare:test";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { advance } from "./sync/state";
import { finishRun, startRun } from "./sync/runs";

const token = "admin-token";

function get(headers: HeadersInit = {}): Promise<Response> {
  return SELF.fetch("https://code-hub.test/admin/sync", { headers });
}

beforeEach(() => {
  env.ADMIN_TOKEN = token;
});

afterEach(() => {
  delete env.ADMIN_TOKEN;
});

describe("GET /admin/sync", () => {
  it("does not exist until the token is configured", async () => {
    delete env.ADMIN_TOKEN;

    expect((await get({ Authorization: `Bearer ${token}` })).status).toBe(404);
  });

  it("rejects a request carrying no token", async () => {
    expect((await get()).status).toBe(401);
  });

  it("rejects a token that is not the configured one", async () => {
    expect((await get({ Authorization: "Bearer wrong" })).status).toBe(401);
  });

  it("rejects the right token under the wrong scheme", async () => {
    expect((await get({ Authorization: token })).status).toBe(401);
  });

  it("reports the watermark, the last run, and recent failures", async () => {
    await advance(env.DB, "pr-authored", "2026-09-01..2026-09-08", "2026-09-09T18:00:00Z");
    const id = await startRun(
      env.DB,
      "pr-authored",
      "2026-09-08..2026-09-15",
      "2026-09-09T18:02:00Z",
    );
    await finishRun(
      env.DB,
      id,
      { pages: 2, rowsChanged: 9, truncated: true, error: "502 from search" },
      "2026-09-09T18:03:00Z",
    );

    const response = await get({ Authorization: `Bearer ${token}` });

    expect(response.status).toBe(200);
    const status = await response.json();
    expect(status).toMatchObject({
      kinds: {
        "pr-authored": {
          watermark: { window: "2026-09-01..2026-09-08", updatedAt: "2026-09-09T18:00:00Z" },
          lastRun: {
            id,
            kind: "pr-authored",
            window: "2026-09-08..2026-09-15",
            startedAt: "2026-09-09T18:02:00Z",
            finishedAt: "2026-09-09T18:03:00Z",
            pages: 2,
            rowsChanged: 9,
            truncated: true,
            error: "502 from search",
          },
        },
        "pr-reviewed": { watermark: null, lastRun: null },
        issue: { watermark: null, lastRun: null },
        contributions: { watermark: null, lastRun: null },
      },
      failures: [{ id, error: "502 from search" }],
    });
  });
});
