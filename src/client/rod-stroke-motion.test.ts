import assert from "node:assert/strict";
import { test } from "node:test";
import { RodStrokeMotion } from "./rod-stroke-motion.js";

test("a pull followed by the opposite return emits one rod stroke after settling", () => {
  const detector = new RodStrokeMotion();
  assert.equal(detector.update({ x: 4.5, y: 0, z: 0 }, 0), false);
  assert.equal(detector.isPending(), true);
  assert.equal(detector.update({ x: -1, y: 0, z: 0 }, 100), false);
  assert.equal(detector.update({ x: -3.4, y: 0, z: 0 }, 220), false);
  assert.equal(detector.update({ x: 0, y: 0, z: 0 }, 285), true);
  assert.equal(detector.isPending(), false);
});

test("a one-way tug or a return on another device axis is not a rod stroke", () => {
  const detector = new RodStrokeMotion();
  detector.update({ x: 4.5, y: 0, z: 0 }, 0);
  assert.equal(detector.update({ x: -1, y: 0, z: 0 }, 160), false);
  assert.equal(detector.update({ x: 0, y: -4, z: 0 }, 280), false);
  assert.equal(detector.update({ x: 0, y: 0, z: 0 }, 360), false);
});

test("a gesture that never returns expires and a completed stroke has a cooldown", () => {
  const detector = new RodStrokeMotion();
  detector.update({ x: 4.5, y: 0, z: 0 }, 0);
  assert.equal(detector.update({ x: 0, y: 0, z: 0 }, 950), false);
  assert.equal(detector.isPending(), false);

  detector.update({ x: 4.5, y: 0, z: 0 }, 1000);
  detector.update({ x: -3.4, y: 0, z: 0 }, 1220);
  assert.equal(detector.update({ x: 0, y: 0, z: 0 }, 1285), true);
  assert.equal(detector.update({ x: 4.5, y: 0, z: 0 }, 1300), false);
  assert.equal(detector.isPending(), false);
});
