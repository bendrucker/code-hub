import { handleBackfill, handleLakeBuild, handleSyncStatus } from "./admin";
import { buildLake, LAKE_CRON } from "./lake";
import { syncIncremental } from "./sync/incremental";

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
      // An unhandled error marks the scheduled invocation failed, so a build
      // that never wrote its tables gets noticed.
      await buildLake(env);
      return;
    }

    await syncIncremental(env);
    console.log(`sync trigger ${controller.cron} finished`);
  },
} satisfies ExportedHandler<Env>;
