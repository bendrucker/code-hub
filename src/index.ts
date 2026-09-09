import { handleBackfill, handleLakeBuild, handleSyncStatus } from "./admin";
import { buildLake } from "./lake";
import { syncIncremental } from "./sync/incremental";

// The nightly trigger in wrangler.jsonc. Every other cron runs the sync, so an
// expression that drifts from the config leaves the lake unbuilt and reports
// nothing. `src/index.test.ts` checks this against the configured triggers.
export const LAKE_CRON = "30 9 * * *";

export default {
  fetch(request, env): Response | Promise<Response> {
    const url = new URL(request.url);
    if (request.method === "GET" && url.pathname === "/healthz") {
      return Response.json({ ok: true });
    }
    if (request.method === "GET" && url.pathname === "/admin/sync") {
      return handleSyncStatus(request, env);
    }
    if (request.method === "POST" && url.pathname === "/admin/backfill") {
      return handleBackfill(request, env);
    }
    if (request.method === "POST" && url.pathname === "/admin/lake") {
      return handleLakeBuild(request, env);
    }
    return new Response("Not Found", { status: 404 });
  },

  async scheduled(controller, env): Promise<void> {
    if (controller.cron === LAKE_CRON) {
      // Rethrown rather than logged, so a build that never wrote its tables
      // shows as a failed invocation instead of a successful one.
      await buildLake(env);
      return;
    }

    await syncIncremental(env);
    console.log(`sync trigger ${controller.cron} finished`);
  },
} satisfies ExportedHandler<Env>;
