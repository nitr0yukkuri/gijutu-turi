import { getWaterwayForFish, isFishSpeciesId, type FishSpeciesId } from "../fish-species.js";
import { isPlayerId } from "../collection-contract.js";
import { RequestRateLimiter } from "../request-rate-limit.js";
import { apiCorsHeaders } from "../api-cors.js";
import { deleteOceanRoom, getCollection, getPlayerIdForSession, ping, registerPlayerSession, reserveOceanRoom } from "./d1-store.js";
import type { CloudflareEnv } from "./types.js";

const tokenPattern = /^[A-Za-z0-9_-]{43}$/;
const limitWindowMs = 10 * 60_000;
const playerSessionLimiter = new RequestRateLimiter();
const roomAttemptLimiter = new RequestRateLimiter();
const roomCreationLimiter = new RequestRateLimiter();

const json = (value: unknown, status = 200, headers: HeadersInit = {}): Response =>
  new Response(JSON.stringify(value), { status, headers: { "Content-Type": "application/json; charset=utf-8", ...headers } });

const noStore = { "Cache-Control": "no-store" };

function tokenFrom(request: Request): string | undefined {
  const match = request.headers.get("authorization")?.match(/^Bearer ([A-Za-z0-9_-]{43})$/i);
  return match && tokenPattern.test(match[1] ?? "") ? match[1] : undefined;
}

function randomHex(length: number): string {
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  return [...bytes].map(value => value.toString(16).padStart(2, "0")).join("");
}

function randomToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  let binary = "";
  for (const value of bytes) binary += String.fromCharCode(value);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
}

async function hashToken(token: string): Promise<string> {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  return [...new Uint8Array(bytes)].map(value => value.toString(16).padStart(2, "0")).join("");
}

function sourceFor(request: Request): string {
  return request.headers.get("cf-connecting-ip")?.trim() || "unknown";
}

function rateLimited(retryAfter: number): Response {
  return json({ error: "rate_limited" }, 429, { "Retry-After": String(retryAfter) });
}

function applyCors(request: Request, response: Response, environment: CloudflareEnv): Response {
  // A 101 response carries the WebSocket endpoint itself; rebuilding it as an
  // ordinary Response would drop the endpoint and make the handshake fail.
  if (response.status === 101) return response;
  const origin = request.headers.get("Origin") ?? undefined;
  const configured = new Set((environment.FRONTEND_ORIGIN ?? "").split(",").map(value => value.trim()).filter(Boolean));
  const headers = new Headers(response.headers);
  for (const [name, value] of Object.entries(apiCorsHeaders(origin, configured))) headers.set(name, value);
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

async function readSmallJson(request: Request): Promise<{ ok: true; value: unknown } | { ok: false; response: Response }> {
  const contentType = (request.headers.get("content-type") ?? "").split(";", 1)[0]?.trim().toLowerCase();
  if (contentType !== "application/json") return { ok: false, response: json({ error: "unsupported_media_type" }, 415) };
  const declaredLength = Number(request.headers.get("content-length") ?? "0");
  if (declaredLength > 1024) return { ok: false, response: json({ error: "payload_too_large" }, 413) };
  const text = await request.text();
  if (new TextEncoder().encode(text).byteLength > 1024) return { ok: false, response: json({ error: "payload_too_large" }, 413) };
  try { return { ok: true, value: JSON.parse(text) as unknown }; }
  catch { return { ok: false, response: json({ error: "invalid_json" }, 400) }; }
}

async function route(request: Request, env: CloudflareEnv): Promise<Response> {
  const url = new URL(request.url);
  if (request.method === "OPTIONS" && url.pathname.startsWith("/api/")) return new Response(null, { status: 204 });

  if (url.pathname === "/health" && request.method === "GET") {
    return json({ ok: true, service: "gijutu-turi-cloudflare" });
  }
  if (url.pathname === "/ready" && request.method === "GET") {
    try {
      await ping(env.DB);
      return json({ ok: true, service: "gijutu-turi-cloudflare", collectionBackend: "d1" }, 200, noStore);
    } catch {
      return json({ ok: false, service: "gijutu-turi-cloudflare", collectionBackend: "d1", error: "collection_store_unavailable" }, 503, noStore);
    }
  }

  if (url.pathname === "/api/player-sessions" && request.method === "POST") {
    const body = await readSmallJson(request);
    if (!body.ok) return body.response;
    const source = sourceFor(request);
    const retryAfter = playerSessionLimiter.consume([
      { key: "global", limit: 600, windowMs: limitWindowMs },
      { key: `source:${source}`, limit: 120, windowMs: limitWindowMs },
    ]);
    if (retryAfter) return rateLimited(retryAfter);
    const value = body.value;
    if (typeof value !== "object" || value === null || Array.isArray(value)
      || Object.keys(value).some(key => key !== "playerId")) return json({ error: "invalid_player_session" }, 400);
    const requested = (value as { playerId?: unknown }).playerId;
    if (requested !== undefined && (typeof requested !== "string" || !isPlayerId(requested))) return json({ error: "invalid_player_session" }, 400);
    const playerId = (requested as string | undefined) ?? `player_${randomHex(16)}`;
    const token = randomToken();
    const registered = await registerPlayerSession(env.DB, playerId, await hashToken(token));
    if (!registered) return json({ error: "player_session_exists" }, 409);
    return json({ playerId, token }, 201, noStore);
  }

  if (url.pathname === "/api/collection" && request.method === "GET") {
    const token = tokenFrom(request);
    if (!token) return json({ error: "unauthorized" }, 401, noStore);
    const playerId = await getPlayerIdForSession(env.DB, await hashToken(token));
    if (!playerId) return json({ error: "unauthorized" }, 401, noStore);
    return json(await getCollection(env.DB, playerId), 200, noStore);
  }

  if (url.pathname === "/api/ocean-sessions" && request.method === "POST") {
    const body = await readSmallJson(request);
    if (!body.ok) return body.response;
    const token = tokenFrom(request);
    if (!token) return json({ error: "unauthorized" }, 401);
    const playerId = await getPlayerIdForSession(env.DB, await hashToken(token));
    if (!playerId) return json({ error: "unauthorized" }, 401);
    const source = sourceFor(request);
    const attemptRetryAfter = roomAttemptLimiter.consume([
      { key: "global", limit: 1200, windowMs: limitWindowMs },
      { key: `source:${source}`, limit: 240, windowMs: limitWindowMs },
    ]);
    if (attemptRetryAfter) return rateLimited(attemptRetryAfter);
    const value = body.value;
    if (typeof value !== "object" || value === null || Array.isArray(value)
      || Object.keys(value).some(key => key !== "fishId" && key !== "waterway")) return json({ error: "invalid_ocean_session" }, 400);
    const fishValue = (value as { fishId?: unknown }).fishId;
    const waterwayValue = (value as { waterway?: unknown }).waterway ?? "sea";
    if (fishValue !== undefined && typeof fishValue !== "string" || waterwayValue !== "sea" && waterwayValue !== "river") return json({ error: "invalid_ocean_session" }, 400);
    if (fishValue && !isFishSpeciesId(fishValue)) return json({ error: "invalid_fish_id" }, 400);
    const requestedFishId = fishValue as FishSpeciesId | undefined;
    const pinnedFishId = requestedFishId && getWaterwayForFish(requestedFishId) === waterwayValue ? requestedFishId : undefined;
    const retryAfter = roomCreationLimiter.consume([
      { key: "global", limit: 600, windowMs: limitWindowMs },
      { key: `source:${source}`, limit: 120, windowMs: limitWindowMs },
    ]);
    if (retryAfter) return rateLimited(retryAfter);

    const roomId = `sea_${randomHex(16)}`;
    if (!await reserveOceanRoom(env.DB, roomId, playerId, pinnedFishId)) return json({ error: "rooms_full" }, 503);
    const durableId = env.OCEAN_ROOMS.idFromName(roomId);
    const stub = env.OCEAN_ROOMS.get(durableId);
    const response = await stub.fetch(new Request("https://ocean-room.internal/create", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ roomId, playerId, ...(pinnedFishId ? { fishId: pinnedFishId } : {}), waterway: waterwayValue }),
    }));
    if (!response.ok) {
      await deleteOceanRoom(env.DB, roomId);
      return json({ error: "room_create_failed" }, 503);
    }
    return json({ id: roomId, host: url.host }, 201, noStore);
  }

  if (url.pathname === "/ocean-ws" && request.method === "GET") {
    const roomId = url.searchParams.get("room") ?? "";
    if (!/^sea_[a-f0-9]{32}$/.test(roomId)) return new Response("Not Found", { status: 404 });
    return env.OCEAN_ROOMS.get(env.OCEAN_ROOMS.idFromName(roomId)).fetch(request);
  }

  if (url.pathname.startsWith("/api/")) return json({ error: "not_found" }, 404);
  return env.ASSETS.fetch(request);
}

function logRequestAnalytics(request: Request, response: Response): void {
  try {
    const country = (request as Request & { cf?: { country?: string } }).cf?.country;
    console.log({
      record_type: "http_request",
      method: request.method,
      path: new URL(request.url).pathname.slice(0, 512),
      status: response.status,
      country: country || "unknown",
      user_agent: request.headers.get("user-agent")?.slice(0, 256) || "unknown",
    });
  } catch {
    // Analytics must never change the response sent to the visitor.
  }
}
export default {
  async fetch(request: Request, env: CloudflareEnv): Promise<Response> {
    let response: Response;
    try {
      response = applyCors(request, await route(request, env), env);
    } catch (error) {
      console.error("Cloudflare request failed", error instanceof Error ? error.message : "unknown_error");
      response = applyCors(request, json({ error: "internal_error" }, 500), env);
    }
    logRequestAnalytics(request, response);
    return response;
  },
};

export { OceanRoom } from "./ocean-room.js";
