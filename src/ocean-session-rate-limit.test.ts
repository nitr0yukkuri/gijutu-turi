import assert from "node:assert/strict";
import test from "node:test";
import { Hono } from "hono";
import { createOceanRooms } from "./ocean-room.js";
import { CollectionStore } from "./collection-db.js";
import { registerOceanSessionRoutes } from "./ocean-session-route.js";

test("session payloads are bounded and valid requests retain a workshop-sized quota", async () => {
  const app = new Hono();
  const rooms = createOceanRooms();
  const repository = new CollectionStore(":memory:");
  registerOceanSessionRoutes(app, { rooms, repository });

  try {
    const identityResponse = await app.request("/api/player-sessions", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Forwarded-For": "192.0.2.8" },
      body: JSON.stringify({ playerId: "player_workshop000000000000" }),
    });
    assert.equal(identityResponse.status, 201);
    const { token } = await identityResponse.json() as { token: string };

    const oversized = await app.request("/api/ocean-sessions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, "X-Forwarded-For": "192.0.2.9" },
      body: JSON.stringify({ fishId: "fish-001", padding: "x".repeat(1200) }),
    });
    assert.equal(oversized.status, 413, "oversized JSON must be rejected before parsing");

    for (let attempt = 0; attempt < 20; attempt++) {
      const invalid = await app.request("/api/ocean-sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, "X-Forwarded-For": "192.0.2.10" },
        body: JSON.stringify({ playerId: "bad" }),
      });
      assert.equal(invalid.status, 400);
    }

    const sessions = await Promise.all(Array.from({ length: 31 }, () => app.request("/api/ocean-sessions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, "X-Forwarded-For": "192.0.2.10" },
      body: JSON.stringify({ fishId: "fish-001" }),
    })));

    assert.ok(sessions.every(response => response.status === 201), "a workshop group should not hit the former 10/source or 30/global threshold");
  } finally {
    rooms.close();
    repository.close();
  }
});
