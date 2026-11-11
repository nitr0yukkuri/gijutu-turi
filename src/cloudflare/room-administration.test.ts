import assert from "node:assert/strict";
import { test } from "node:test";
import { handleRoomAdministration } from "./room-administration.js";
import type { CloudflareEnv } from "./types.js";

const envWithoutQueries = (token?: string) => ({
  MIGRATION_ADMIN_TOKEN: token,
  DB: { prepare: () => { throw new Error("unauthorized or invalid requests must not query D1"); } },
} as unknown as CloudflareEnv);
const validToken = () => `${Date.now() + 600_000}.${"a".repeat(43)}`;

test("room administration stays closed without a valid, unexpired migration secret", async () => {
  for (const configured of [undefined, "invalid", `${Date.now() - 1}.${"a".repeat(43)}`]) {
    const response = await handleRoomAdministration(new Request("https://demo.test/api/admin/rooms", {
      headers: { Authorization: `Bearer ${configured}` },
    }), envWithoutQueries(configured));
    assert.equal(response.status, 404);
  }
  const response = await handleRoomAdministration(new Request("https://demo.test/api/admin/rooms"), envWithoutQueries(validToken()));
  assert.equal(response.status, 404);
});

test("room administration validates pagination and requires an explicit POST to apply repairs", async () => {
  const token = validToken();
  for (const query of ["?limit=21", "?cursor=invalid", "?limit=1&limit=2", "?apply=true", "?unexpected=1"]) {
    const response = await handleRoomAdministration(new Request("https://demo.test/api/admin/rooms" + query, {
      headers: { Authorization: `Bearer ${token}` },
    }), envWithoutQueries(token));
    assert.equal(response.status, 400, query);
  }
  for (const body of [{ limit: true }, { apply: "true" }, { cursor: 3 }, { unexpected: true }]) {
    const response = await handleRoomAdministration(new Request("https://demo.test/api/admin/rooms/reconcile", {
      method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify(body),
    }), envWithoutQueries(token));
    assert.equal(response.status, 400, JSON.stringify(body));
  }
});

test("a failed Durable Object is reported without hiding another room's result or pagination", async () => {
  const token = validToken();
  const ids = [`sea_${"a".repeat(32)}`, `sea_${"b".repeat(32)}`];
  const env = {
    MIGRATION_ADMIN_TOKEN: token,
    DB: { prepare: () => ({ bind: () => ({ all: async () => ({ results: ids.map(room_id => ({ room_id, created_at: "2026-01-01T00:00:00.000Z" })) }) }) }) },
    OCEAN_ROOMS: {
      idFromName: (id: string) => id,
      get: (id: string) => ({ fetch: async () => {
        if (id === ids[0]) throw new Error("unsupported_room_schema");
        return Response.json({ action: "kept_connected" });
      } }),
    },
  } as unknown as CloudflareEnv;
  const response = await handleRoomAdministration(new Request("https://demo.test/api/admin/rooms/reconcile", {
    method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ apply: true, limit: 2 }),
  }), env);
  assert.equal(response.status, 200);
  const result = await response.json() as { rooms: Array<{ error?: string; action?: string }>; nextCursor: string };
  assert.equal(result.rooms[0]?.error, "inspection_failed");
  assert.equal(result.rooms[1]?.action, "kept_connected");
  assert.equal(result.nextCursor, ids[1]);
});
