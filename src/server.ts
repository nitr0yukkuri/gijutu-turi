import { randomBytes } from "node:crypto";
import { readFile } from "node:fs/promises";
import type { IncomingMessage } from "node:http";
import type { Duplex } from "node:stream";
import { URL } from "node:url";
import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { WebSocketServer, type WebSocket } from "ws";
import { FishingSimulation } from "./game.js";
import { clientMessageSchema, sessionIdSchema, type ServerMessage } from "./protocol.js";
import { createOceanRooms } from "./ocean-room.js";

const port = Number(process.env.PORT ?? 8787);
const host = process.env.HOST ?? "127.0.0.1";
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
const oceanRooms = createOceanRooms(app);

// Explicit public assets only: never expose .git, .env, or the source tree.
const publicAssets = new Map([
  ["/", ["dist/client/index.html", "text/html; charset=utf-8"]],
  ["/index.html", ["dist/client/index.html", "text/html; charset=utf-8"]],
  ["/go-fish.html", ["go-fish.html", "text/html; charset=utf-8"]],
  ["/go-fish.js", ["go-fish.js", "text/javascript"]],
  ["/go-fish-viewer.js", ["go-fish-viewer.js", "text/javascript"]],
  ["/go-fish-viewer.css", ["go-fish-viewer.css", "text/css"]],
  ["/vendor/three.module.js", ["vendor/three.module.js", "text/javascript"]],
  ["/vendor/three.core.js", ["vendor/three.core.js", "text/javascript"]],
  ["/manifest.webmanifest", ["manifest.webmanifest", "application/manifest+json"]],
  ["/service-worker.js", ["service-worker.js", "text/javascript"]],
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
      const bytes = await readFile(new URL(`../${asset[0]}`, import.meta.url));
      return new Response(bytes, { headers: { "Content-Type": asset[1]!, "Cache-Control": "no-cache" } });
    } catch (error) { console.error(`Unable to serve ${route}`, error); return c.notFound(); }
  });
}

// Vite emits hashed React assets. They are served from the build directory
// through a narrow /assets/* route; source files and arbitrary paths remain
// unreachable from the backend.
app.get("/assets/*", async c => {
  const requested = c.req.path.slice("/assets/".length);
  if (!requested || requested.includes("..") || !/^[a-zA-Z0-9._-]+$/.test(requested)) return c.notFound();
  const extension = requested.endsWith(".css") ? "text/css" : "text/javascript";
  try {
    const bytes = await readFile(new URL(`../dist/client/assets/${requested}`, import.meta.url));
    return new Response(bytes, { headers: { "Content-Type": extension, "Cache-Control": "no-cache" } });
  } catch { return c.notFound(); }
});

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
  wsServer.close();
  httpServer.close();
};

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

console.log(`技術釣り backend listening on http://${host}:${port}`);
