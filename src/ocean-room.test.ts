import assert from "node:assert/strict";
import { test } from "node:test";
import { Hono } from "hono";
import { canQueueRoomAction, createOceanRooms, isAllowedWebSocketOrigin, removeQueuedCommandsForClient } from "./ocean-room.js";
import { CollectionStore } from "./collection-db.js";
import { registerOceanSessionRoutes } from "./ocean-session-route.js";

test("a non-controlling display can reset only a terminal result while a display is connected", () => {
  assert.equal(canQueueRoomAction({ action: "reset" }, "caught", false, true), true);
  assert.equal(canQueueRoomAction({ action: "reset" }, "escaped", false, true), true);
  assert.equal(canQueueRoomAction({ action: "reset" }, "fighting", false, true), false);
  assert.equal(canQueueRoomAction({ action: "hook" }, "caught", false, true), false);
  assert.equal(canQueueRoomAction({ action: "reset" }, "caught", false, false), false);
});

test("WebSocket origins allow same-host, explicitly configured, and deliberate wildcard cases", () => {
  const configured = new Set(["https://game.example"]);
  assert.equal(isAllowedWebSocketOrigin(undefined, "api.example", configured), true);
  assert.equal(isAllowedWebSocketOrigin("http://localhost:8787", "localhost:8787", configured), true);
  assert.equal(isAllowedWebSocketOrigin("https://game.example", "api.example", configured), true);
  assert.equal(isAllowedWebSocketOrigin("https://other.example", "api.example", configured), false);
  assert.equal(isAllowedWebSocketOrigin("not an origin", "api.example", configured), false);
  assert.equal(isAllowedWebSocketOrigin("https://other.example", "api.example", new Set(["*"])), true);
});

test("disconnecting one room client preserves commands queued by the others", () => {
  const display = {};
  const phone = {};
  const commands = [
    { client: display, action: "cast" },
    { client: phone, action: "hook" },
    { client: display, action: "retrieve" },
  ];
  assert.deepEqual(removeQueuedCommandsForClient(commands, phone), [commands[0], commands[2]]);
});

test("session creation rejects simple cross-origin form content types", async () => {
  const app = new Hono();
  const rooms = createOceanRooms();
  const repository = new CollectionStore(":memory:");
  registerOceanSessionRoutes(app, { rooms, repository });
  try {
    const identityResponse = await app.request("/api/player-sessions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ playerId: "player_abcdefghijkl" }),
    });
    assert.equal(identityResponse.status, 201);
    const identity = await identityResponse.json() as { token: string };
    const response = await app.request("/api/ocean-sessions", {
      method: "POST",
      headers: { "Content-Type": "text/plain" },
      body: JSON.stringify({}),
    });
    assert.equal(response.status, 415);
    assert.deepEqual(await response.json(), { error: "unsupported_media_type" });
    const jsonResponse = await app.request("/api/ocean-sessions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${identity.token}` },
      body: JSON.stringify({}),
    });
    assert.equal(jsonResponse.status, 201);
  } finally {
    rooms.close();
    repository.close();
  }
});

test("collection and room creation require a server-issued player session", async () => {
  const app = new Hono();
  const rooms = createOceanRooms();
  const repository = new CollectionStore(":memory:");
  registerOceanSessionRoutes(app, { rooms, repository });

  try {
    assert.equal((await app.request("/api/collection")).status, 401);
    const anonymousRoom = await app.request("/api/ocean-sessions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fishId: "fish-001" }),
    });
    assert.equal(anonymousRoom.status, 401);

    const sessionResponse = await app.request("/api/player-sessions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    assert.equal(sessionResponse.status, 201);
    const session = await sessionResponse.json() as { playerId: string; token: string };
    assert.match(session.playerId, /^player_[a-f0-9]{32}$/);

    const duplicateClaim = await app.request("/api/player-sessions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ playerId: session.playerId }),
    });
    assert.equal(duplicateClaim.status, 409);

    const collection = await app.request("/api/collection", { headers: { Authorization: `Bearer ${session.token}` } });
    assert.equal(collection.status, 200);
    const invalidToken = await app.request("/api/collection", { headers: { Authorization: "Bearer not-a-session-token" } });
    assert.equal(invalidToken.status, 401);

    const roomResponse = await app.request("/api/ocean-sessions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.token}` },
      body: JSON.stringify({ fishId: "fish-001" }),
    });
    assert.equal(roomResponse.status, 201);
    assert.match((await roomResponse.json() as { id: string }).id, /^sea_[a-f0-9]{32}$/);

    const forgedPlayer = await app.request("/api/ocean-sessions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.token}` },
      body: JSON.stringify({ playerId: "player_anotheridentity0000000" }),
    });
    assert.equal(forgedPlayer.status, 400, "room callers cannot override the player bound to their bearer token");
  } finally {
    rooms.close();
    repository.close();
  }
});
