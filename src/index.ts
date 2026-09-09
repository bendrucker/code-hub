export default {
  fetch(request): Response {
    const url = new URL(request.url);
    if (request.method === "GET" && url.pathname === "/healthz") {
      return Response.json({ ok: true });
    }
    return new Response("Not Found", { status: 404 });
  },

  scheduled(controller): void {
    console.log(`sync trigger ${controller.cron} has no work wired up yet`);
  },
} satisfies ExportedHandler<Env>;
