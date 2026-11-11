import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { before, test, type TestContext } from "node:test";
import { build } from "esbuild";
import { convertV4MiniflareOptions, Miniflare, type WebSocket as RuntimeWebSocket } from "miniflare";
import { FISH_SPECIES } from "../src/fish-species.js";
import { isOceanMessage, type OceanMessage } from "../src/ocean-contract.js";

const origin = "https://fishing.test";
const workerName = "cloudflare-native-tests";
let workerCode: string;

before(async () => {
  const bundle = await build({
    entryPoints: ["cloudflare-tests/fixture-worker.ts"], bundle: true, write: false,
    platform: "browser", format: "esm", target: "es2022",
  });
  workerCode = bundle.outputFiles[0]!.text;
});

async function runtime(t: TestContext, bindings: Record<string, string> = {}) {
  const config = JSON.parse(await readFile("wrangler.jsonc", "utf8")) as {
    compatibility_date: string;
    assets: { directory: string; run_worker_first: string[]; not_found_handling: "single-page-application" };
  };
  const mf = new Miniflare(convertV4MiniflareOptions({
    name: workerName, modules: true, script: workerCode, cf: false,
    handleStructuredLogs: process.env.CLOUDFLARE_TEST_DEBUG ? log => console.error(log) : undefined,
    compatibilityDate: config.compatibility_date,
    bindings,
    d1Databases: { DB: "isolated-native-test-database" },
    durableObjects: { OCEAN_ROOMS: { className: "OceanRoom", useSQLite: true } },
    unsafeInspectDurableObjects: true,
    assets: {
      directory: config.assets.directory, binding: "ASSETS",
      run_worker_first: [...config.assets.run_worker_first, "/__test/*"],
      routerConfig: { has_user_worker: true },
      assetConfig: { not_found_handling: config.assets.not_found_handling },
    },
  }));
  t.after(() => mf.dispose());
  await mf.ready;
  const db = await mf.getD1Database("DB");
  for (const file of (await readdir("migrations")).filter(path => path.endsWith(".sql")).sort()) {
    const sql = await readFile(`migrations/${file}`, "utf8");
    for (const statement of sql.split(/;\s*(?:\r?\n|$)/).filter(statement => statement.trim())) {
      await db.prepare(statement).run();
    }
  }
  return { mf, db };
}

async function session(mf: Miniflare) {
  const response = await mf.dispatchFetch(origin + "/api/player-sessions", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: "{}",
  });
  assert.equal(response.status, 201, await response.clone().text());
  return await response.json() as { playerId: string; token: string };
}

async function room(mf: Miniflare, token: string, fishId = "java-001") {
  const response = await mf.dispatchFetch(origin + "/api/ocean-sessions", {
    method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ fishId, waterway: "sea" }),
  });
  assert.equal(response.status, 201);
  return await response.json() as { id: string };
}

async function until(predicate: () => boolean, label: string) {
  const deadline = Date.now() + 10_000;
  while (!predicate()) {
    assert.ok(Date.now() < deadline, `Timed out: ${label}`);
    await new Promise(resolve => setTimeout(resolve, 15));
  }
}

async function peer(t: TestContext, mf: Miniflare, id: string, role: "display" | "controller") {
  const response = await mf.dispatchFetch(`${origin}/ocean-ws?room=${id}&role=${role}`, {
    headers: { Upgrade: "websocket", Origin: origin, Host: new URL(origin).host },
  });
  assert.equal(response.status, 101);
  const socket = response.webSocket;
  assert.ok(socket);
  const messages: OceanMessage[] = [];
  socket.addEventListener("message", event => {
    const value: unknown = JSON.parse(String(event.data));
    assert.ok(isOceanMessage(value));
    messages.push(value);
  });
  socket.accept();
  t.after(() => { try { socket.close(1000, "test_complete"); } catch { /* runtime already disposed */ } });
  await until(() => messages.length > 0, "initial WebSocket snapshot");
  return { socket: socket as RuntimeWebSocket, messages };
}

test("native Cloudflare runtime serves SPA routes and keeps game APIs authenticated", async t => {
  const { mf } = await runtime(t);
  for (const path of ["/", "/javatako", "/riverfish", "/complete"]) {
    const response = await mf.dispatchFetch(origin + path, { headers: { Accept: "text/html", "Sec-Fetch-Mode": "navigate" } });
    assert.equal(response.status, 200, path);
    assert.match(await response.text(), /<html/i);
  }
  const readiness = await mf.dispatchFetch(origin + "/ready");
  assert.equal(readiness.status, 200, await readiness.text());
  assert.equal((await mf.dispatchFetch(origin + "/api/collection")).status, 401);
  assert.equal((await mf.dispatchFetch(origin + "/api/collection/catches", { method: "POST" })).status, 404);
});

test("native D1 stores every active species exactly once and the public collection includes Java", async t => {
  const { mf, db } = await runtime(t);
  const identity = await session(mf);
  for (const fish of FISH_SPECIES.filter(fish => fish.catalogStatus === "active")) {
    const body = JSON.stringify({ playerId: identity.playerId, fishId: fish.id, eventKey: `native:${fish.id}` });
    for (let attempt = 0; attempt < 2; attempt++) {
      const response = await mf.dispatchFetch(origin + "/__test/record-catch", {
        method: "POST", headers: { "Content-Type": "application/json" }, body,
      });
      assert.equal(response.status, 204, fish.id);
    }
  }
  const response = await mf.dispatchFetch(origin + "/api/collection", { headers: { Authorization: `Bearer ${identity.token}` } });
  assert.equal(response.status, 200);
  const collection = await response.json() as { entries: Array<{ id: string; catches: number }>; registered: number };
  assert.equal(collection.registered, FISH_SPECIES.filter(fish => fish.catalogStatus === "active").length);
  assert.equal(collection.entries.find(entry => entry.id === "java-001")?.catches, 1);
  assert.ok(collection.entries.every(entry => entry.catches === 1));
  assert.equal((await db.prepare("SELECT COUNT(*) AS count FROM collection_catch_events").first())?.count, collection.registered);
});

test("native DO accepts one controller and restores the fishing state after eviction", async t => {
  const { mf } = await runtime(t);
  const identity = await session(mf);
  const created = await room(mf, identity.token);
  const display = await peer(t, mf, created.id, "display");
  const controller = await peer(t, mf, created.id, "controller");
  const extra = await mf.dispatchFetch(`${origin}/ocean-ws?room=${created.id}&role=controller`, {
    headers: { Upgrade: "websocket", Origin: origin, Host: new URL(origin).host },
  });
  assert.equal(extra.status, 403);
  controller.socket.send(JSON.stringify({ action: "cast", strength: 0.7, aim: 0 }));
  await until(() => display.messages.some(message => message.state.phase === "casting"), "cast after WebSocket input");
  await until(() => display.messages.at(-1)?.state.phase === "waiting", "persisted phase transition");
  const revision = display.messages.at(-1)!.state.revision;

  await mf.unsafeEvictDurableObject(workerName, "OceanRoom", { name: created.id, webSockets: "close" });
  const reconnected = await peer(t, mf, created.id, "display");
  assert.equal(reconnected.messages[0]?.state.fishId, "java-001");
  assert.equal(reconnected.messages[0]?.state.revision, revision);
  assert.notEqual(reconnected.messages[0]?.state.phase, "idle");
});

test("native D1 reservation enforces the 128-room boundary without rejecting the next released slot", async t => {
  const { mf, db } = await runtime(t);
  const identity = await session(mf);
  await db.prepare(`WITH RECURSIVE slots(n) AS (SELECT 1 UNION ALL SELECT n + 1 FROM slots WHERE n < 128)
    INSERT INTO ocean_rooms (room_id, player_id, created_at)
    SELECT 'sea_' || printf('%032x', n), ?, '2026-01-01' FROM slots`).bind(identity.playerId).run();
  const request = () => mf.dispatchFetch(origin + "/api/ocean-sessions", {
    method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${identity.token}` }, body: "{}",
  });
  assert.equal((await request()).status, 503);
  await db.prepare("DELETE FROM ocean_rooms WHERE room_id = (SELECT room_id FROM ocean_rooms LIMIT 1)").run();
  assert.equal((await request()).status, 201);
  assert.equal((await db.prepare("SELECT COUNT(*) AS count FROM ocean_rooms").first())?.count, 128);
});

const adminToken = () => `${Date.now() + 600_000}.${"a".repeat(43)}`;

async function fixtureAction(mf: Miniflare, id: string, action: string) {
  const response = await mf.dispatchFetch(`${origin}/__test/room/${action}`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ roomId: id }),
  });
  assert.equal(response.status, 204);
}

test("native room repair preserves a connected display and gives legacy controller-only rooms a new alarm", async t => {
  const token = adminToken();
  const { mf, db } = await runtime(t, { MIGRATION_ADMIN_TOKEN: token });
  const identity = await session(mf);
  const displayed = await room(mf, identity.token);
  await peer(t, mf, displayed.id, "display");
  const legacy = await room(mf, identity.token);
  await peer(t, mf, legacy.id, "controller");
  await fixtureAction(mf, legacy.id, "delete-alarm");
  const headers = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
  assert.equal((await mf.dispatchFetch(origin + "/api/admin/rooms")).status, 404);

  const before = await mf.dispatchFetch(origin + "/api/admin/rooms", { headers });
  const inspected = await before.json() as { rooms: Array<{ roomId: string; alarmAt: number | null }> };
  assert.equal(inspected.rooms.find(entry => entry.roomId === legacy.id)?.alarmAt, null);
  const response = await mf.dispatchFetch(origin + "/api/admin/rooms/reconcile", { method: "POST", headers, body: JSON.stringify({ apply: true }) });
  assert.equal(response.status, 200);
  const repaired = await response.json() as { rooms: Array<{ roomId: string; action: string; alarmAt: number | null }> };
  assert.equal(repaired.rooms.find(entry => entry.roomId === displayed.id)?.action, "kept_connected");
  assert.equal(repaired.rooms.find(entry => entry.roomId === legacy.id)?.action, "scheduled_expiry");
  assert.ok(Number(repaired.rooms.find(entry => entry.roomId === legacy.id)?.alarmAt) > Date.now());
  assert.equal((await db.prepare("SELECT COUNT(*) AS count FROM ocean_rooms").first())?.count, 2);
});

test("native room repair only releases missing snapshots after the reservation grace period", async t => {
  const token = adminToken();
  const { mf, db } = await runtime(t, { MIGRATION_ADMIN_TOKEN: token });
  const oldId = `sea_${"a".repeat(32)}`;
  const recentId = `sea_${"b".repeat(32)}`;
  await db.batch([oldId, recentId].map((id, index) => db.prepare("INSERT INTO ocean_rooms (room_id, player_id, created_at) VALUES (?, ?, ?)")
    .bind(id, "player_native-test-identity", index === 0 ? "2026-01-01T00:00:00.000Z" : new Date().toISOString())));
  const request = (apply: boolean) => mf.dispatchFetch(origin + "/api/admin/rooms/reconcile", {
    method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify({ apply }),
  });
  assert.equal((await request(false)).status, 200);
  assert.equal((await db.prepare("SELECT COUNT(*) AS count FROM ocean_rooms").first())?.count, 2, "dry run must not release reservations");
  const response = await request(true);
  const result = await response.json() as { rooms: Array<{ roomId: string; action: string }> };
  assert.equal(result.rooms.find(entry => entry.roomId === oldId)?.action, "released_missing_snapshot");
  assert.equal(result.rooms.find(entry => entry.roomId === recentId)?.action, "kept_recent_reservation");
  assert.equal((await db.prepare("SELECT COUNT(*) AS count FROM ocean_rooms").first())?.count, 1);
});

test("native expiration persists a pending Java catch before releasing the room", async t => {
  const { mf, db } = await runtime(t);
  const identity = await session(mf);
  const created = await room(mf, identity.token);
  await fixtureAction(mf, created.id, "pending-catch");
  await mf.unsafeEvictDurableObject(workerName, "OceanRoom", { name: created.id, webSockets: "close" });
  await fixtureAction(mf, created.id, "alarm");
  assert.equal((await db.prepare("SELECT catches FROM player_collections WHERE player_id = ? AND fish_id = 'java-001'").bind(identity.playerId).first())?.catches, 1);
  assert.equal((await db.prepare("SELECT COUNT(*) AS count FROM ocean_rooms WHERE room_id = ?").bind(created.id).first())?.count, 0);
  assert.equal((await mf.dispatchFetch(`${origin}/ocean-ws?room=${created.id}&role=display`)).status, 404);
});
