import assert from "node:assert/strict";
import { test } from "node:test";
import { CatchSaveCoordinator } from "./catch-save.js";

test("failed catch persistence can retry the same idempotent event", async () => {
  const coordinator = new CatchSaveCoordinator();
  const eventKeys: string[] = [];

  await assert.rejects(coordinator.save("room:revision", () => {
    eventKeys.push("room:revision");
    throw new Error("database unavailable");
  }), /database unavailable/);
  assert.equal(coordinator.status, "failed");

  await coordinator.save("room:revision", () => { eventKeys.push("room:revision"); });
  assert.equal(coordinator.status, "saved");
  assert.deepEqual(eventKeys, ["room:revision", "room:revision"]);
});

test("concurrent save requests share one write and a saved event is not duplicated", async () => {
  const coordinator = new CatchSaveCoordinator();
  let resolveWrite: (() => void) | undefined;
  let writes = 0;
  const persist = () => {
    writes++;
    return new Promise<void>(resolve => { resolveWrite = resolve; });
  };

  const first = coordinator.save("room:revision", persist);
  const duplicate = coordinator.save("room:revision", persist);
  assert.equal(coordinator.status, "pending");
  await Promise.resolve();
  assert.equal(writes, 1);
  resolveWrite?.();
  await Promise.all([first, duplicate]);

  await coordinator.save("room:revision", persist);
  assert.equal(coordinator.status, "saved");
  assert.equal(writes, 1);
});

test("a later catch starts a new persistence event after the previous one is saved", async () => {
  const coordinator = new CatchSaveCoordinator();
  const eventKeys: string[] = [];

  await coordinator.save("room:revision-1", () => { eventKeys.push("room:revision-1"); });
  await coordinator.save("room:revision-2", () => { eventKeys.push("room:revision-2"); });

  assert.equal(coordinator.status, "saved");
  assert.deepEqual(eventKeys, ["room:revision-1", "room:revision-2"]);
});
