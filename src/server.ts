import { randomBytes } from "node:crypto";
import { readFile } from "node:fs/promises";
import type { IncomingMessage } from "node:http";
import { resolve } from "node:path";
import type { Duplex } from "node:stream";
import { URL } from "node:url";
import { serve } from "@hono/node-server";
import { Hono } from "hono";
import type { Context } from "hono";
import { WebSocketServer, type WebSocket } from "ws";
import { z } from "zod";
import { FishingSimulation } from "./game.js";
import { clientMessageSchema, sessionIdSchema, type ServerMessage } from "./protocol.js";
import { createOceanRooms } from "./ocean-room.js";
import { CollectionStore } from "./collection-db.js";

const port = Number(process.env.PORT ?? 8787);
const host = process.env.HOST ?? "0.0.0.0";
const tickRate = 20;
const tickIntervalMs = 1000 / tickRate;

type Session = {
  simulation: FishingSimulation;
  clients: Set<WebSocket>;
  lastInputByClient: WeakMap<object, number>;
};

const sessions = new Map<string, Session>();

const createSessionId = (): string => `session_${randomBytes(6).toString("hex")}`;

const send = (socket: WebSocket, message: ServerMessage): void => {
  if (socket.readyState === socket.OPEN) socket.send(JSON.stringify(message));
};

const broadcast = (session: Session, message: ServerMessage): void => {
  for (const client of session.clients) send(client, message);
};

const getOrCreateSession = (sessionId?: string): Session | undefined => {
  if (!sessionId) return undefined;
  return sessions.get(sessionId);
};

const app = new Hono();
app.use("/api/*", async (c, next) => {
  const requestOrigin = c.req.header("Origin");
  const configuredOrigins = new Set((process.env.FRONTEND_ORIGIN ?? "").split(",").map(origin => origin.trim()).filter(Boolean));
  if (configuredOrigins.has("*")) c.header("Access-Control-Allow-Origin", "*");
  else if (requestOrigin && configuredOrigins.has(requestOrigin)) {
    c.header("Access-Control-Allow-Origin", requestOrigin);
    c.header("Vary", "Origin");
  }
  c.header("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  c.header("Access-Control-Allow-Headers", "Content-Type");
  if (c.req.method === "OPTIONS") return c.body(null, 204);
  await next();
});
const oceanRooms = createOceanRooms(app);
const collectionStore = new CollectionStore();

const playerIdSchema = z.string().regex(/^player_[a-z0-9-]{12,80}$/);
const collectionCatchSchema = z.object({
  playerId: playerIdSchema,
  fishId: z.string().regex(/^[-a-z0-9]{3,80}$/),
  eventKey: z.string().regex(/^[-a-zA-Z0-9_:]{3,160}$/),
});

app.get("/api/collection", (c) => {
  const playerId = playerIdSchema.safeParse(c.req.query("playerId"));
  if (!playerId.success) return c.json({ error: "invalid_player_id" }, 400);
  return c.json(collectionStore.getCollection(playerId.data));
});

app.post("/api/collection/catches", async (c) => {
  const parsed = collectionCatchSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ error: "invalid_catch" }, 400);
  try {
    return c.json(collectionStore.recordCatch(parsed.data.playerId, parsed.data.fishId, parsed.data.eventKey));
  } catch (error) {
    if (error instanceof Error && ["fish_not_catchable", "invalid_player_id", "invalid_catch"].includes(error.message)) {
      return c.json({ error: error.message }, 400);
    }
    throw error;
  }
});

// Explicit public assets only: never expose .git, .env, or the source tree.
const publicAssets = new Map([
  ["/", ["index.html", "text/html; charset=utf-8"]],
  ["/index.html", ["index.html", "text/html; charset=utf-8"]],
  ["/ocean.css", ["ocean.css", "text/css"]],
  ["/ocean-app.js", ["ocean-app.js", "text/javascript"]],
  ["/collection-preview.js", ["src/rendering/collection-preview.ts", "text/javascript"]],
  ["/ocean-scene.js", ["src/rendering/ocean-scene.ts", "text/javascript"]],
  ["/go-fish.html", ["go-fish.html", "text/html; charset=utf-8"]],
  ["/go-fish.js", ["src/rendering/go-fish.ts", "text/javascript"]],
  ["/go-fish-viewer.js", ["src/viewers/go-fish-viewer.ts", "text/javascript"]],
  ["/go-fish-viewer.css", ["go-fish-viewer.css", "text/css"]],
  ["/docker-whale.html", ["docker-whale.html", "text/html; charset=utf-8"]],
  ["/docker-whale.js", ["src/rendering/docker-whale.ts", "text/javascript"]],
  ["/docker-whale-viewer.js", ["src/viewers/docker-whale-viewer.ts", "text/javascript"]],
  ["/docker-whale-viewer.css", ["docker-whale-viewer.css", "text/css"]],
  ["/vendor/three.module.js", ["vendor/three.module.js", "text/javascript"]],
  ["/vendor/three.core.js", ["vendor/three.core.js", "text/javascript"]],
  ["/manifest.webmanifest", ["manifest.webmanifest", "application/manifest+json"]],
  ["/service-worker.js", ["src/service-worker.ts", "text/javascript"]],
  ["/assets/gijutu-turi-logo.png", ["assets/gijutu-turi-logo.png", "image/png"]],
]);
const fishAddons = [
  "controls/OrbitControls.js", "environments/RoomEnvironment.js",
  "postprocessing/EffectComposer.js", "postprocessing/RenderPass.js",
  "postprocessing/UnrealBloomPass.js", "postprocessing/OutputPass.js",
  "postprocessing/ShaderPass.js", "postprocessing/Pass.js", "postprocessing/MaskPass.js",
  "shaders/CopyShader.js", "shaders/LuminosityHighPassShader.js", "shaders/OutputShader.js",
];
for (const addon of fishAddons) publicAssets.set(`/vendor/addons/${addon}`, [`vendor/addons/${addon}`, "text/javascript"]);
for (const [route, asset] of publicAssets) {
  app.get(route, async c => {
    try {
      const preferred = new Set(["/", "/index.html", "/ocean.css", "/ocean-app.js", "/go-fish.html", "/docker-whale.html", "/service-worker.js"]);
      const candidates = preferred.has(route) ? [`dist/client/${asset[0]}`, asset[0]] : [asset[0]];
      let bytes: Buffer | undefined;
      for (const candidate of candidates) {
        try { bytes = await readFile(new URL(`../${candidate}`, import.meta.url)); break; } catch { /* try the source fallback */ }
      }
      if (!bytes) return c.notFound();
      return new Response(bytes as unknown as BodyInit, { headers: { "Content-Type": asset[1]!, "Cache-Control": "no-cache" } });
    } catch (error) { console.error(`Unable to serve ${route}`, error); return c.notFound(); }
  });
}
const serveBuiltAsset = async (c: Context, prefix: "assets" | "chunks") => {
  const relative = c.req.path.slice(`/${prefix}/`.length);
  if (!relative || relative.includes("..") || !/^[A-Za-z0-9._/-]+$/.test(relative)) return c.notFound();
  try {
    const bytes = await readFile(resolve(process.cwd(), "dist", "client", prefix, relative));
    const contentType = relative.endsWith(".css") ? "text/css" : relative.endsWith(".map") ? "application/json" : "text/javascript";
    return new Response(bytes as unknown as BodyInit, { headers: { "Content-Type": contentType, "Cache-Control": "no-cache" } });
  } catch { return c.notFound(); }
};
app.get("/assets/*", c => serveBuiltAsset(c, "assets"));
app.get("/chunks/*", c => serveBuiltAsset(c, "chunks"));

app.get("/health", (c) =>
  c.json({ ok: true, service: "gijutu-turi-backend", sessions: sessions.size }),
);

app.post("/api/sessions", (c) => {
  const sessionId = createSessionId();
  sessions.set(sessionId, {
    simulation: new FishingSimulation(sessionId),
    clients: new Set(),
    lastInputByClient: new WeakMap(),
  });
  return c.json(
    {
      sessionId,
      wsPath: `/ws?sessionId=${sessionId}`,
      snapshot: sessions.get(sessionId)?.simulation.snapshot(),
    },
    201,
  );
});

app.get("/api/sessions/:sessionId", (c) => {
  const parsed = sessionIdSchema.safeParse(c.req.param("sessionId"));
  if (!parsed.success) return c.json({ error: "invalid_session_id" }, 400);
  const session = sessions.get(parsed.data);
  if (!session) return c.json({ error: "session_not_found" }, 404);
  return c.json({ sessionId: parsed.data, snapshot: session.simulation.snapshot() });
});

const httpServer = serve({ fetch: app.fetch, port, hostname: host });
const wsServer = new WebSocketServer({ noServer: true });

const handleUpgrade = (request: IncomingMessage, socket: Duplex, head: Buffer): void => {
  if (oceanRooms.upgrade(request, socket, head)) return;
  const requestUrl = new URL(request.url ?? "/", `http://${request.headers.host ?? "localhost"}`);
  if (requestUrl.pathname !== "/ws") {
    socket.destroy();
    return;
  }

  const sessionId = requestUrl.searchParams.get("sessionId") ?? "";
  const session = getOrCreateSession(sessionId);
  if (!session) {
    socket.destroy();
    return;
  }

  wsServer.handleUpgrade(request, socket, head, (client) => {
    wsServer.emit("connection", client, request, session);
  });
};

httpServer.on("upgrade", handleUpgrade);

wsServer.on("connection", (socket: WebSocket, _request: IncomingMessage, session: Session) => {
  session.clients.add(socket);
  send(socket, { type: "result", result: "session_joined" });
  send(socket, { type: "snapshot", snapshot: session.simulation.snapshot() });

  socket.on("message", (raw) => {
    let parsedJson: unknown;
    try {
      parsedJson = JSON.parse(raw.toString());
    } catch {
      send(socket, { type: "result", result: "input_rejected", message: "invalid_json" });
      return;
    }

    const parsed = clientMessageSchema.safeParse(parsedJson);
    if (!parsed.success) {
      send(socket, { type: "result", result: "input_rejected", message: "invalid_message" });
      return;
    }

    const previousSequence = session.lastInputByClient.get(socket) ?? -1;
    if (parsed.data.sequence <= previousSequence) {
      send(socket, { type: "result", result: "input_rejected", message: "sequence_out_of_order" });
      return;
    }

    session.lastInputByClient.set(socket, parsed.data.sequence);
    session.simulation.applyInput(parsed.data.input);
    session.simulation.markInputProcessed(parsed.data.sequence);
  });

  socket.on("close", () => {
    session.clients.delete(socket);
  });
});

const tickTimer = setInterval(() => {
  for (const session of sessions.values()) {
    session.simulation.step(1 / tickRate);
    const events = session.simulation.drainEvents();
    for (const event of events) broadcast(session, { type: "fish_event", event });
    broadcast(session, { type: "snapshot", snapshot: session.simulation.snapshot() });
  }
}, tickIntervalMs);

const shutdown = (): void => {
  clearInterval(tickTimer);
  oceanRooms.close();
  collectionStore.close();
  wsServer.close();
  httpServer.close();
};

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

console.log(`技術釣り backend listening on http://${host}:${port}`);
