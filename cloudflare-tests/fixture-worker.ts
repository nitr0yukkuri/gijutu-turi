// This entry point is bundled only by the native runtime tests, never by Wrangler.
import productionWorker, { OceanRoom } from "../src/cloudflare/worker.js";
import { recordCatch } from "../src/cloudflare/d1-store.js";
import type { CloudflareEnv } from "../src/cloudflare/types.js";

export { OceanRoom };

export default {
  async fetch(request: Request, env: CloudflareEnv): Promise<Response> {
    if (new URL(request.url).pathname === "/__test/record-catch" && request.method === "POST") {
      const input = await request.json() as { playerId: string; fishId: string; eventKey: string };
      await recordCatch(env.DB, input.playerId, input.fishId, input.eventKey);
      return new Response(null, { status: 204 });
    }
    return productionWorker.fetch(request, env);
  },
};
