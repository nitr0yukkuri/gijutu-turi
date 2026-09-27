import { test } from "node:test";
import assert from "node:assert/strict";
import { TackleStateStore, type TackleStateSource } from "./tackle-state.js";

const source = (overrides: Partial<TackleStateSource> = {}): TackleStateSource => ({
  phase: "idle",
  fishId: "fish-001",
  mode: "rest",
  tension: 0,
  distance: 0,
  reeling: false,
  revision: 0,
  ...overrides,
});

test("the whale tackle follows one authoritative snapshot for rod and reel", () => {
  const store = new TackleStateStore();
  store.update(source({ phase: "fighting", fishId: "whale-001", mode: "surge", tension: .55, distance: 24, revision: 1 }), 1000);
  store.update(source({ phase: "fighting", fishId: "whale-001", mode: "surge", tension: .7, distance: 25, reeling: true, revision: 1 }), 1050);

  assert.deepEqual(store.getState(), {
    phase: "fighting", fishId: "whale-001", mode: "surge", tension: .7, distance: 25,
    reeling: true, revision: 1, serverAt: 1050,
  });
  assert.equal(store.getPreviousState().tension, .55);
  assert.equal(store.getTransitions().at(-1)?.to.reeling, true);
  assert.equal(store.getTransitions().at(-1)?.to.fishId, "whale-001");
});

test("tackle transitions are retained without becoming a second game state", () => {
  const store = new TackleStateStore();
  store.update(source({ phase: "fighting", fishId: "whale-001", mode: "surge", revision: 1 }), 1000);
  store.update(source({ phase: "caught", fishId: "whale-001", mode: "rest", tension: .15, revision: 1 }), 3000);

  assert.equal(store.getTransitions().length, 2);
  assert.deepEqual(store.getTransitions().map(transition => [transition.from.phase, transition.to.phase]), [
    ["idle", "fighting"], ["fighting", "caught"],
  ]);
});
