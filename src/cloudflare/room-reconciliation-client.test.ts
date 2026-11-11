import assert from "node:assert/strict";
import { test } from "node:test";
import { reconcileRooms } from "../../scripts/reconcile-cloudflare-rooms.js";

const token = () => `${Date.now() + 600_000}.${"a".repeat(43)}`;

test("room reconciliation defaults are supplied explicitly and pagination preserves the requested mode", async () => {
  const bodies: Array<{ apply: boolean; cursor: string }> = [];
  const cursor = `sea_${"b".repeat(32)}`;
  const result = await reconcileRooms({
    origin: "https://gijutu-turi.nitr0yukkuri.workers.dev", token: token(), apply: false,
    fetcher: async (_input, init) => {
      bodies.push(JSON.parse(String(init?.body)));
      return Response.json({ apply: false, rooms: [{ action: "inspected" }], nextCursor: bodies.length === 1 ? cursor : null });
    },
  });
  assert.deepEqual(bodies.map(body => body.apply), [false, false]);
  assert.deepEqual(bodies.map(body => body.cursor), ["", cursor]);
  assert.deepEqual(result, { apply: false, inspected: 2, failures: 0, actions: { inspected: 2 } });
});

test("room reconciliation refuses another service origin before sending an administration secret", async () => {
  let calls = 0;
  await assert.rejects(reconcileRooms({
    origin: "https://unrelated.example", token: token(), apply: true,
    fetcher: async () => { calls++; return Response.json({}); },
  }), /unsupported_room_admin_origin/);
  assert.equal(calls, 0);
});

test("room reconciliation reports per-room errors and refuses a looping cursor", async () => {
  const cursor = `sea_${"c".repeat(32)}`;
  await assert.rejects(reconcileRooms({
    origin: "https://gijutu-turi.nitr0yukkuri.workers.dev", token: token(), apply: true,
    fetcher: async () => Response.json({ apply: true, rooms: [{ error: "inspection_failed" }], nextCursor: cursor }),
  }), /repeated_room_admin_cursor/);
  const result = await reconcileRooms({
    origin: "https://gijutu-turi.nitr0yukkuri.workers.dev", token: token(), apply: true,
    fetcher: async () => Response.json({ apply: true, rooms: [{ error: "inspection_failed" }], nextCursor: null }),
  });
  assert.equal(result.failures, 1);
});
