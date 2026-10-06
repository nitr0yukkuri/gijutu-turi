import { readFile } from "node:fs/promises";
import type { IncomingMessage } from "node:http";
import { resolve } from "node:path";
import type { Duplex } from "node:stream";
import { URL } from "node:url";
import { serve } from "@hono/node-server";
import { Hono } from "hono";
import type { Context } from "hono";
import { z } from "zod";
import { createOceanRooms } from "./ocean-room.js";
import { isPlayerId, type CollectionRepository } from "./collection-contract.js";
import { createCollectionRepository } from "./collection-repository.js";
import { CANONICAL_FISH_ROUTE_PATHS, FISHING_ROUTE_PATHS, LEGACY_FISH_PATH_ALIASES } from "./fishing-routes.js";
import { apiCorsHeaders } from "./api-cors.js";

const port = Number(process.env.PORT ?? 8787);
const host = process.env.HOST ?? "0.0.0.0";
const app = new Hono();
app.use("/api/*", async (c, next) => {
  const requestOrigin = c.req.header("Origin");
  const configuredOrigins = new Set((process.env.FRONTEND_ORIGIN ?? "").split(",").map(origin => origin.trim()).filter(Boolean));
  for (const [name, value] of Object.entries(apiCorsHeaders(requestOrigin, configuredOrigins))) c.header(name, value);
  if (c.req.method === "OPTIONS") return c.body(null, 204);
  await next();
});
const collectionStore: CollectionRepository = await createCollectionRepository();
const pendingCatchWrites = new Set<Promise<void>>();
const oceanRooms = createOceanRooms(app, {
  onCatch: (playerId, eventKey, fishId) => {
    const pending = Promise.resolve(collectionStore.recordCatch(playerId, fishId, eventKey)).then(() => undefined);
    pendingCatchWrites.add(pending);
    void pending.then(
      () => pendingCatchWrites.delete(pending),
      () => pendingCatchWrites.delete(pending),
    );
    return pending;
  },
});

const playerIdSchema = z.string().refine(isPlayerId);

app.get("/api/collection", async (c) => {
  const playerId = playerIdSchema.safeParse(c.req.query("playerId"));
  if (!playerId.success) return c.json({ error: "invalid_player_id" }, 400);
  return c.json(await collectionStore.getCollection(playerId.data));
});

// Explicit public assets only: never expose .git, .env, or the source tree.
const publicAssets = new Map<string, string[]>([
  ["/", ["index.html", "text/html; charset=utf-8"]],
  ["/index.html", ["index.html", "text/html; charset=utf-8"]],
  ...CANONICAL_FISH_ROUTE_PATHS.map(route => [route, ["index.html", "text/html; charset=utf-8"]] as [string, string[]]),
  [FISHING_ROUTE_PATHS.docker, ["index.html", "text/html; charset=utf-8"]],
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
  ["/license.txt", ["license.txt", "text/plain; charset=utf-8"]],
  ["/third-party-notices.txt", ["third-party-notices.txt", "text/plain; charset=utf-8"]],
  ["/manifest.webmanifest", ["manifest.webmanifest", "application/manifest+json"]],
  ["/service-worker.js", ["src/service-worker.ts", "text/javascript"]],
  ["/favicon.svg", ["favicon.svg", "image/svg+xml"]],
  ["/assets/gijutu-turi-logo.png", ["assets/gijutu-turi-logo.png", "image/png"]],
  ["/assets/gijutu-turi-favicon-generated.png", ["assets/gijutu-turi-favicon-generated.png", "image/png"]],
  ["/assets/gijutu-turi-og.png", ["assets/gijutu-turi-og.png", "image/png"]],
]);
for(const route of LEGACY_FISH_PATH_ALIASES)publicAssets.set(route,["index.html","text/html; charset=utf-8"]);
const fishAddons = [
  "controls/OrbitControls.js", "environments/RoomEnvironment.js",
  "postprocessing/EffectComposer.js", "postprocessing/RenderPass.js",
  "postprocessing/UnrealBloomPass.js", "postprocessing/OutputPass.js",
  "postprocessing/ShaderPass.js", "postprocessing/Pass.js", "postprocessing/MaskPass.js",
  "shaders/CopyShader.js", "shaders/LuminosityHighPassShader.js", "shaders/OutputShader.js",
];
for (const addon of fishAddons) publicAssets.set(`/vendor/addons/${addon}`, [`vendor/addons/${addon}`, "text/javascript"]);
for (const route of [...CANONICAL_FISH_ROUTE_PATHS, FISHING_ROUTE_PATHS.docker, ...LEGACY_FISH_PATH_ALIASES]) {
  app.get(`${route}/`, c => c.redirect(`${route}${new URL(c.req.url).search}`, 308));
}
for (const [route, asset] of publicAssets) {
  app.get(route, async c => {
    try {
      const preferred = new Set([
        "/", "/index.html", ...CANONICAL_FISH_ROUTE_PATHS, FISHING_ROUTE_PATHS.docker,
        ...LEGACY_FISH_PATH_ALIASES, "/ocean.css", "/ocean-app.js", "/go-fish.html",
        "/docker-whale.html", "/service-worker.js", "/manifest.webmanifest", "/favicon.svg",
        "/assets/gijutu-turi-favicon-generated.png", "/assets/gijutu-turi-og.png",
        "/license.txt", "/third-party-notices.txt",
      ]);
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
    const contentType = relative.endsWith(".css") ? "text/css" : relative.endsWith(".svg") ? "image/svg+xml" : relative.endsWith(".png") ? "image/png" : relative.endsWith(".map") ? "application/json" : "text/javascript";
    return new Response(bytes as unknown as BodyInit, { headers: { "Content-Type": contentType, "Cache-Control": "no-cache" } });
  } catch { return c.notFound(); }
};
app.get("/assets/*", c => serveBuiltAsset(c, "assets"));
app.get("/chunks/*", c => serveBuiltAsset(c, "chunks"));

app.get("/health", (c) =>
  c.json({ ok: true, service: "gijutu-turi-backend" }),
);

app.get("/ready", async c => {
  c.header("Cache-Control", "no-store");
  try {
    await collectionStore.ping();
    return c.json({ ok: true, service: "gijutu-turi-backend" });
  } catch {
    return c.json({ ok: false, service: "gijutu-turi-backend", error: "collection_store_unavailable" }, 503);
  }
});

const httpServer = serve({ fetch: app.fetch, port, hostname: host });

const handleUpgrade = (request: IncomingMessage, socket: Duplex, head: Buffer): void => {
  if (!oceanRooms.upgrade(request, socket, head)) socket.destroy();
};

httpServer.on("upgrade", handleUpgrade);

let shutdownPromise: Promise<void> | null = null;

const closeHttpServer = (): Promise<void> => {
  if (!httpServer.listening) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const forceClose = setTimeout(() => {
      (httpServer as typeof httpServer & { closeAllConnections?: () => void }).closeAllConnections?.();
    }, 8_000);
    forceClose.unref();
    httpServer.close(error => {
      clearTimeout(forceClose);
      if (error) reject(error);
      else resolve();
    });
  });
};

const shutdown = (): Promise<void> => {
  if (shutdownPromise) return shutdownPromise;
  shutdownPromise = (async () => {
    oceanRooms.close();
    await closeHttpServer();
    await Promise.allSettled([...pendingCatchWrites]);
    await collectionStore.close();
  })();
  return shutdownPromise;
};

const handleShutdown = (): void => {
  void shutdown().then(
    () => process.exit(0),
    error => {
      console.error("Unable to shut down backend cleanly", error);
      process.exit(1);
    },
  );
};

process.once("SIGINT", handleShutdown);
process.once("SIGTERM", handleShutdown);

console.log(`技術釣り backend listening on http://${host}:${port}`);
