import assert from "node:assert/strict";
import { test } from "node:test";
import { Hono } from "hono";
import { createOceanRooms, isAllowedWebSocketOrigin } from "./ocean-room.js";

test("WebSocket origins allow same-host, explicitly configured, and deliberate wildcard cases", () => {
  const configured = new Set(["https://game.example"]);
  assert.equal(isAllowedWebSocketOrigin(undefined, "api.example", configured), true);
  assert.equal(isAllowedWebSocketOrigin("http://localhost:8787", "localhost:8787", configured), true);
  assert.equal(isAllowedWebSocketOrigin("https://game.example", "api.example", configured), true);
  assert.equal(isAllowedWebSocketOrigin("https://other.example", "api.example", configured), false);
  assert.equal(isAllowedWebSocketOrigin("not an origin", "api.example", configured), false);
  assert.equal(isAllowedWebSocketOrigin("https://other.example", "api.example", new Set(["*"])), true);
});


test("session creation rejects simple cross-origin form content types", async () => {
  const app = new Hono();
  const rooms = createOceanRooms(app);
  try {
    const response = await app.request("/api/ocean-sessions", {
      method: "POST",
      headers: { "Content-Type": "text/plain" },
      body: JSON.stringify({ playerId: "player_abcdefghijkl" }),
    });
    assert.equal(response.status, 415);
    assert.deepEqual(await response.json(), { error: "unsupported_media_type" });
    const jsonResponse = await app.request("/api/ocean-sessions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ playerId: "player_abcdefghijkl" }),
    });
    assert.equal(jsonResponse.status, 201);
  } finally {
    rooms.close();
  }
});
