import { handleSyncStatus } from "./admin";

export default {
  fetch(request, env): Response | Promise<Response> {
    const url = new URL(request.url);
    if (request.method === "GET" && url.pathname === "/healthz") {
      return Response.json({ ok: true });
    }
    if (request.method === "GET" && url.pathname === "/admin/sync") {
      return handleSyncStatus(request, env);
    }
    return new Response("Not Found", { status: 404 });
  },

  scheduled(controller): void {
    console.log(`sync trigger ${controller.cron} has no work wired up yet`);
  },
} satisfies ExportedHandler<Env>;
