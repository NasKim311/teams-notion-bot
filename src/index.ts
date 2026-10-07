import type { Env } from "./types";

export default {
  async fetch(request: Request, _env: Env, _ctx: ExecutionContext): Promise<Response> {
    return new Response("Method Not Allowed", { status: 405, headers: { Allow: "POST" } });
  },
} satisfies ExportedHandler<Env>;
