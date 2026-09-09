import { SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";

describe("fetch", () => {
  it("reports health", async () => {
    const response = await SELF.fetch("https://code-hub.test/healthz");

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true });
  });

  it("does not answer health on a write method", async () => {
    const response = await SELF.fetch("https://code-hub.test/healthz", { method: "POST" });

    expect(response.status).toBe(404);
  });

  it("404s an unknown path", async () => {
    const response = await SELF.fetch("https://code-hub.test/");

    expect(response.status).toBe(404);
  });
});
