import assert from "node:assert/strict";
import { test } from "node:test";
import { ensurePlayerSession } from "./player-session.js";

test("a stale legacy player ID recovers by creating a fresh session", async t => {
  const values = new Map<string, string>([["gijutu.player-id", "player_legacy-id-1234"]]);
  const originalFetch = globalThis.fetch;
  const originalStorage = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
  const requestBodies: unknown[] = [];
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => { values.set(key, value); },
    },
  });
  globalThis.fetch = async (_input, init) => {
    requestBodies.push(JSON.parse(String(init?.body)));
    if (requestBodies.length === 1) return new Response(JSON.stringify({ error: "player_session_exists" }), { status: 409 });
    return new Response(JSON.stringify({ playerId: "player_new-id-1234567", token: "a".repeat(43) }), {
      status: 201,
      headers: { "Content-Type": "application/json" },
    });
  };
  t.after(() => {
    globalThis.fetch = originalFetch;
    if (originalStorage) Object.defineProperty(globalThis, "localStorage", originalStorage);
    else Reflect.deleteProperty(globalThis, "localStorage");
  });

  const session = await ensurePlayerSession("/api/player-sessions");

  assert.deepEqual(requestBodies, [{ playerId: "player_legacy-id-1234" }, {}]);
  assert.equal(session.playerId, "player_new-id-1234567");
  assert.equal(values.get("gijutu.player-id"), "player_new-id-1234567");
  assert.equal(values.get("gijutu.player-session-token"), "a".repeat(43));
});
