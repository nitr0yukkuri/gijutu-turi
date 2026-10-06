import assert from "node:assert/strict";
import test from "node:test";
import { interpolateOceanPresentationState, OceanPresentationTimeline } from "./ocean-presentation-timeline.js";
import type { OceanClientState } from "./ocean-contract.js";

const state = (overrides: Partial<OceanClientState> = {}): OceanClientState => ({
  phase: "fighting", strength: .6, aim: 0, revision: 1, castAt: 0, retrieveAt: 0,
  tension: .4, distance: 8, reeling: false, mode: "rest", criticalWindow: false,
  hookResult: null, approach: 0, catches: 0, reason: "", resultAt: 0, fishId: "fish-001",
  stamina: 1, canReel: false, fightTime: 2, fishX: 0, fishSpeed: 0, school: 1,
  ...overrides,
});

test("presentation timeline samples snapshots at the shared delayed render time", () => {
  const timeline = new OceanPresentationTimeline(100);
  const base = Date.now();
  timeline.push(state({ distance: 10, tension: .2 }), base, base);
  timeline.push(state({ distance: 6, tension: .8 }), base + 100, base + 100);

  const sampled = timeline.sample(base + 150);
  assert.equal(sampled?.distance, 8);
  assert.equal(sampled?.tension, .5);
});

test("presentation interpolation switches discrete state at the midpoint", () => {
  const first = state({ phase: "biting", mode: "rest", distance: 8, tension: .2 });
  const second = state({ phase: "fighting", mode: "surge", distance: 4, tension: .8 });

  assert.equal(interpolateOceanPresentationState(first, second, .49).phase, "biting");
  assert.equal(interpolateOceanPresentationState(first, second, .5).phase, "fighting");
  assert.equal(interpolateOceanPresentationState(first, second, .25).distance, 7);
  assert.ok(Math.abs(interpolateOceanPresentationState(first, second, .25).tension - .35) < 1e-9);
});

test("a room revision discards snapshots from the previous encounter", () => {
  const timeline = new OceanPresentationTimeline(100);
  timeline.push(state({ revision: 1, distance: 14 }), 1_000, 1_000);
  timeline.push(state({ revision: 1, distance: 12 }), 1_100, 1_100);
  timeline.push(state({ revision: 2, distance: 25 }), 2_000, 2_000);

  assert.equal(timeline.sample(2_000)?.revision, 2);
  assert.equal(timeline.sample(2_000)?.distance, 25);
});

