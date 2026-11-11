import assert from "node:assert/strict";
import { test } from "node:test";
import { OceanFishingGame } from "../ocean-game.js";
import { OceanRoom } from "./ocean-room.js";
import type { CloudflareEnv, DurableObjectState, DurableObjectStorage, DurableSocket } from "./types.js";

class FakeSocket {
  readyState = 1;
  bufferedAmount = 0;
  private attachment: unknown;

  serializeAttachment(value: unknown): void { this.attachment = structuredClone(value); }
  deserializeAttachment(): unknown { return this.attachment; }
  send(_message: string): void {}
  close(): void { this.readyState = 3; }
}

const delay = (milliseconds: number) => new Promise(resolve => setTimeout(resolve, milliseconds));

test("an active room stops ticking after its display disconnects while a controller remains", { timeout: 2_000 }, async t => {
  const values = new Map<string, unknown>();
  const pending: Promise<unknown>[] = [];
  const sockets: DurableSocket[] = [];
  const deletedRooms: string[] = [];
  let roomExpiry: number | Date | undefined;
  let storageWrites = 0;
  const storage = {
    get: async <T>(key: string) => values.get(key) as T | undefined,
    put: async <T>(key: string, value: T) => { values.set(key, structuredClone(value)); storageWrites++; },
    delete: async (key: string) => values.delete(key),
    deleteAlarm: async () => { roomExpiry = undefined; },
    setAlarm: async (time: number | Date) => { roomExpiry = time; },
  } as DurableObjectStorage;
  const state = {
    storage,
    acceptWebSocket: (socket: WebSocket) => { sockets.push(socket as DurableSocket); },
    getWebSockets: (tag?: string) => tag
      ? sockets.filter(socket => (socket.deserializeAttachment() as { role?: string } | undefined)?.role === tag)
      : [...sockets],
    waitUntil: (promise: Promise<unknown>) => { pending.push(promise); },
    blockConcurrencyWhile: async <T>(callback: () => Promise<T>) => callback(),
  } as unknown as DurableObjectState;
  const env = {
    DB: {
      prepare: () => ({ bind: (roomId: string) => ({ run: async () => { deletedRooms.push(roomId); } }) }),
    },
  } as unknown as CloudflareEnv;
  const room = new OceanRoom(state, env);
  const internals = room as unknown as {
    room?: { game: { state: { phase: string } } };
    tickTimer?: ReturnType<typeof setTimeout>;
  };
  t.after(() => { if (internals.tickTimer !== undefined) clearTimeout(internals.tickTimer); });

  const created = await room.fetch(new Request("https://room.internal/create", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ roomId: `sea_${"a".repeat(32)}`, playerId: "player_smoke-test-1234" }),
  }));
  assert.equal(created.status, 201);

  const display = new FakeSocket();
  display.serializeAttachment({ role: "display", reelUntil: 0, lastRodPumpAt: 0, windowAt: Date.now(), messages: 0 });
  const controller = new FakeSocket();
  controller.serializeAttachment({ role: "controller", reelUntil: 0, lastRodPumpAt: 0, windowAt: Date.now(), messages: 0 });
  sockets.push(display as unknown as DurableSocket, controller as unknown as DurableSocket);

  await room.webSocketMessage(controller as unknown as DurableSocket, JSON.stringify({ action: "cast", strength: 0.7, aim: 0 }));
  for (let attempt = 0; attempt < 30 && internals.room?.game.state.phase === "idle"; attempt++) await delay(5);
  assert.notEqual(internals.room?.game.state.phase, "idle", "the cast command should activate the room");
  assert.notEqual(internals.tickTimer, undefined, "an active room with a display should tick");

  sockets.splice(sockets.indexOf(display as unknown as DurableSocket), 1);
  await room.webSocketClose(display as unknown as DurableSocket);
  while (pending.length) await Promise.all(pending.splice(0));
  const writesAfterDisconnect = storageWrites;

  await delay(130);
  while (pending.length) await Promise.all(pending.splice(0));
  assert.equal(internals.tickTimer, undefined, "the last scheduled tick should stop when only a controller remains");
  assert.equal(storageWrites, writesAfterDisconnect, "controller-only idle time should not keep writing room state");
  assert.notEqual(roomExpiry, undefined, "a controller-only room should retain its cleanup alarm");

  await room.alarm();

  assert.deepEqual(deletedRooms, [`sea_${"a".repeat(32)}`], "the expired room should release its D1 slot");
  assert.equal(internals.room, undefined, "the expired room snapshot should be removed");
  assert.equal(controller.readyState, 3, "the controller should be closed when its room expires");
});

test("a transient room-storage error marks catch persistence retryable", async () => {
  const values = new Map<string, unknown>();
  let storageWrites = 0;
  const storage = {
    get: async <T>(key: string) => values.get(key) as T | undefined,
    put: async <T>(key: string, value: T) => {
      storageWrites++;
      if (storageWrites === 1) throw new Error("transient storage failure");
      values.set(key, structuredClone(value));
    },
    delete: async (key: string) => values.delete(key),
    deleteAlarm: async () => {},
    setAlarm: async (_time: number | Date) => {},
  } as DurableObjectStorage;
  const state = {
    storage,
    getWebSockets: () => [],
    waitUntil: (_promise: Promise<unknown>) => {},
  } as unknown as DurableObjectState;
  const room = new OceanRoom(state, { DB: {} } as CloudflareEnv);
  const game = new OceanFishingGame(() => 0.5, "fish-001", "fixed");
  const internals = room as unknown as {
    room?: {
      id: string;
      playerId: string;
      game: ReturnType<OceanFishingGame["serialize"]>;
      rodStroke: number;
      catchSaveStatus: "none" | "pending" | "saved" | "failed";
      catchEvent?: { eventKey: string; fishId: "fish-001" };
    };
    game?: OceanFishingGame;
    writeCatch: () => Promise<void>;
  };
  internals.game = game;
  internals.room = {
    id: `sea_${"a".repeat(32)}`,
    playerId: "player_smoke-test-1234",
    game: game.serialize(),
    rodStroke: 0,
    catchSaveStatus: "pending",
    catchEvent: { eventKey: `sea_${"a".repeat(32)}:1`, fishId: "fish-001" },
  };

  await internals.writeCatch();

  assert.equal(internals.room.catchSaveStatus, "failed");
  assert.equal(storageWrites, 2, "the failed pending write is followed by a persisted retryable status");
  assert.equal((values.get("room") as { catchSaveStatus: string }).catchSaveStatus, "failed");
});

test("a transient D1 cleanup error keeps the room snapshot available for retry", async () => {
  const values = new Map<string, unknown>();
  let deleteAttempts = 0;
  let alarmAt: number | Date | undefined;
  const storage = {
    get: async <T>(key: string) => values.get(key) as T | undefined,
    put: async <T>(key: string, value: T) => { values.set(key, structuredClone(value)); },
    delete: async (key: string) => values.delete(key),
    deleteAlarm: async () => { alarmAt = undefined; },
    setAlarm: async (time: number | Date) => { alarmAt = time; },
  } as DurableObjectStorage;
  const state = {
    storage,
    getWebSockets: () => [],
    waitUntil: (_promise: Promise<unknown>) => {},
  } as unknown as DurableObjectState;
  const env = {
    DB: {
      prepare: () => ({ bind: () => ({ run: async () => {
        deleteAttempts++;
        if (deleteAttempts === 1) throw new Error("temporary D1 failure");
      } }) }),
    },
  } as unknown as CloudflareEnv;
  const room = new OceanRoom(state, env);

  const created = await room.fetch(new Request("https://room.internal/create", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ roomId: `sea_${"b".repeat(32)}`, playerId: "player_smoke-test-1234" }),
  }));
  assert.equal(created.status, 201);

  await assert.rejects(room.alarm(), /temporary D1 failure/);
  assert.equal(values.has("room"), true, "the room snapshot must survive until D1 cleanup succeeds");
  assert.notEqual(alarmAt, undefined, "a failed D1 cleanup should schedule another attempt");

  await room.alarm();

  assert.equal(values.has("room"), false);
  assert.equal(deleteAttempts, 2);
});

