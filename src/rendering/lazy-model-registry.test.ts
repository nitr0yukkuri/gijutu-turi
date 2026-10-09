import assert from "node:assert/strict";
import test from "node:test";
import { createLazyModelRegistry } from "./lazy-model-registry.js";

test("loads only the requested model and shares concurrent loads", async () => {
  const created: string[] = [];
  const registry = createLazyModelRegistry({
    go: async () => { created.push("go"); return { dispose() {} }; },
    whale: async () => { created.push("whale"); return { dispose() {} }; },
  });

  assert.deepEqual(created, []);
  const firstGoLoad = registry.load("go");
  const secondGoLoad = registry.load("go");
  assert.equal(await firstGoLoad, await secondGoLoad);
  const go = registry.peek("go");
  assert.ok(go);
  assert.equal(registry.peek("whale"), undefined);
  assert.deepEqual(created, ["go"]);
});

test("disposes loaded and late-resolving models once and rejects reuse", async () => {
  const disposed: string[] = [];
  let resolveWhale!: (model: { dispose: () => void }) => void;
  const registry = createLazyModelRegistry({
    go: () => ({ dispose: () => disposed.push("go") }),
    whale: () => new Promise<{ dispose: () => void }>(resolve => { resolveWhale = resolve; }),
  });

  const pendingWhale = registry.load("whale");
  await Promise.resolve();
  await registry.load("go");
  registry.dispose();
  registry.dispose();
  resolveWhale({ dispose: () => disposed.push("whale") });

  await assert.rejects(pendingWhale, /model_registry_disposed/);
  assert.deepEqual(disposed.sort(), ["go", "whale"]);
  await assert.rejects(registry.load("whale"), /model_registry_disposed/);
});
