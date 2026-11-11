// This entry point is bundled only by the native runtime tests, never by Wrangler.
import productionWorker, { OceanRoom as ProductionOceanRoom } from "../src/cloudflare/worker.js";
import { recordCatch } from "../src/cloudflare/d1-store.js";
import type { CloudflareEnv, DurableObjectState } from "../src/cloudflare/types.js";
import type { OceanFishingGameSnapshot } from "../src/ocean-game.js";

export class OceanRoom extends ProductionOceanRoom {
  constructor(private readonly fixtureState: DurableObjectState, env: CloudflareEnv) { super(fixtureState, env); }

  override async fetch(request: Request): Promise<Response> {
    const path = new URL(request.url).pathname;
    if (path === "/__test/delete-alarm") {
      await this.fixtureState.storage.deleteAlarm();
      return new Response(null, { status: 204 });
    }
    if (path === "/__test/alarm") {
      await this.alarm();
      return new Response(null, { status: 204 });
    }
    if (path === "/__test/pending-catch") {
      const stored = await this.fixtureState.storage.get<{
        id: string; game: OceanFishingGameSnapshot; catchSaveStatus: string;
        catchEvent?: { eventKey: string; fishId: string };
      }>("room");
      if (!stored) return new Response(null, { status: 404 });
      stored.game.state.phase = "caught";
      stored.catchSaveStatus = "pending";
      stored.catchEvent = { eventKey: `native:${stored.id}`, fishId: stored.game.state.fishId };
      await this.fixtureState.storage.put("room", stored);
      return new Response(null, { status: 204 });
    }
    return super.fetch(request);
  }
}

export default {
  async fetch(request: Request, env: CloudflareEnv): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname.startsWith("/__test/room/") && request.method === "POST") {
      const input = await request.json() as { roomId: string };
      const action = url.pathname.slice("/__test/room/".length);
      return env.OCEAN_ROOMS.get(env.OCEAN_ROOMS.idFromName(input.roomId)).fetch(new Request(`https://ocean-room.internal/__test/${action}`, { method: "POST" }));
    }
    if (new URL(request.url).pathname === "/__test/record-catch" && request.method === "POST") {
      const input = await request.json() as { playerId: string; fishId: string; eventKey: string };
      await recordCatch(env.DB, input.playerId, input.fishId, input.eventKey);
      return new Response(null, { status: 204 });
    }
    return productionWorker.fetch(request, env);
  },
};
