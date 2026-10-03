import assert from "node:assert/strict";
import test from "node:test";
import { Hono } from "hono";
import { createOceanRooms } from "./ocean-room.js";

test("session payloads are bounded and valid requests retain a workshop-sized quota", async () => {
  const app = new Hono();
  const rooms = createOceanRooms(app);

  try {
    const oversized = await app.request("/api/ocean-sessions", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Forwarded-For": "192.0.2.9" },
      body: JSON.stringify({ playerId: "player_abcdefghijkl", padding: "x".repeat(1200) }),
    });
    assert.equal(oversized.status, 413, "oversized JSON must be rejected before parsing");

    for (let attempt = 0; attempt < 20; attempt++) {
      const invalid = await app.request("/api/ocean-sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Forwarded-For": "192.0.2.10" },
        body: JSON.stringify({ playerId: "bad" }),
      });
      assert.equal(invalid.status, 400);
    }

    const sessions = await Promise.all(Array.from({ length: 31 }, (_, index) => app.request("/api/ocean-sessions", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Forwarded-For": "192.0.2.10" },
      body: JSON.stringify({ playerId: `player_workshop${String(index).padStart(12, "0")}`, fishId: "fish-001" }),
    })));

    assert.ok(sessions.every(response => response.status === 201), "a workshop group should not hit the former 10/source or 30/global threshold");
  } finally {
    rooms.close();
  }
});
