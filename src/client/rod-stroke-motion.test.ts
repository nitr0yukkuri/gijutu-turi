import assert from "node:assert/strict";
import { test } from "node:test";
import { RodStrokeMotion } from "./rod-stroke-motion.js";

test("a pull followed by the opposite return emits one rod stroke after settling", () => {
  const detector = new RodStrokeMotion();
  assert.equal(detector.update({ x: 6.5, y: 0, z: 0 }, 0), false);
  assert.equal(detector.isPending(), true);
  assert.equal(detector.update({ x: 6.2, y: 0, z: 0 }, 40), false);
  assert.equal(detector.update({ x: -2, y: 0, z: 0 }, 100), false);
  assert.equal(detector.update({ x: -5.2, y: 0, z: 0 }, 160), false);
  assert.equal(detector.update({ x: -5, y: 0, z: 0 }, 200), false);
  assert.equal(detector.update({ x: 0, y: 0, z: 0 }, 280), false);
  assert.equal(detector.update({ x: 0, y: 0, z: 0 }, 330), true);
  assert.equal(detector.isPending(), false);
});

test("a small shake or a one-sample pull does not arm the rod stroke", () => {
  const detector = new RodStrokeMotion();
  assert.equal(detector.update({ x: 4.5, y: 0, z: 0 }, 0), false);
  assert.equal(detector.update({ x: -3.4, y: 0, z: 0 }, 220), false);
  assert.equal(detector.update({ x: 0, y: 0, z: 0 }, 400), false);
  detector.update({ x: 6.5, y: 0, z: 0 }, 500);
  assert.equal(detector.update({ x: 0, y: 0, z: 0 }, 560), false);
  assert.equal(detector.isPending(), false);
});

test("a return on another device axis is not a rod stroke", () => {
  const detector = new RodStrokeMotion();
  detector.update({ x: 6.5, y: 0, z: 0 }, 0);
  detector.update({ x: 6.2, y: 0, z: 0 }, 40);
  assert.equal(detector.update({ x: 0, y: -6, z: 0 }, 180), false);
  assert.equal(detector.update({ x: 0, y: -6, z: 0 }, 220), false);
  assert.equal(detector.update({ x: 0, y: 0, z: 0 }, 400), false);
});

test("a gesture that never returns expires and a completed stroke has a cooldown", () => {
  const detector = new RodStrokeMotion();
  detector.update({ x: 6.5, y: 0, z: 0 }, 0);
  detector.update({ x: 6.2, y: 0, z: 0 }, 40);
  assert.equal(detector.update({ x: 0, y: 0, z: 0 }, 950), false);
  assert.equal(detector.isPending(), false);

  detector.update({ x: 6.5, y: 0, z: 0 }, 1000);
  detector.update({ x: 6.2, y: 0, z: 0 }, 1040);
  detector.update({ x: -5, y: 0, z: 0 }, 1160);
  detector.update({ x: -5, y: 0, z: 0 }, 1200);
  assert.equal(detector.update({ x: 0, y: 0, z: 0 }, 1330), true);
  assert.equal(detector.update({ x: 6.5, y: 0, z: 0 }, 1350), false);
  assert.equal(detector.isPending(), false);
});
