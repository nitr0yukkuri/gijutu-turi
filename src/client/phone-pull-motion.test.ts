import assert from "node:assert/strict";
import { test } from "node:test";
import { PhonePullMotion } from "./phone-pull-motion.js";

test("a deliberate far-to-near pull triggers once after confirming the positive screen-normal axis", () => {
  const detector = new PhonePullMotion();
  assert.equal(detector.update({ x: 0, y: 0, z: 6.2 }, 0), false);
  assert.equal(detector.isPending(0), true);
  assert.equal(detector.update({ x: 0, y: 0, z: 6.0 }, 40), true);
  assert.equal(detector.isPending(40), true);
});

test("a single sample, weak movement, farward movement, and sideways movement do not trigger", () => {
  const detector = new PhonePullMotion();
  assert.equal(detector.update({ x: 0, y: 0, z: 6.2 }, 0), false);
  assert.equal(detector.update({ x: 0, y: 0, z: 0 }, 40), false);
  assert.equal(detector.update({ x: 0, y: 0, z: 2.8 }, 100), false);
  assert.equal(detector.update({ x: 0, y: 0, z: -7 }, 140), false);
  assert.equal(detector.update({ x: 7, y: 0, z: 1 }, 180), false);
});

test("a moderate pull is recognized when a phone reports motion at a slower sensor cadence", () => {
  const detector = new PhonePullMotion();
  assert.equal(detector.update({ x: 0, y: 0, z: 3.1 }, 0), false);
  assert.equal(detector.update({ x: 0, y: 0, z: 3.2 }, 150), true);
});

test("a fresh pull requires two timely samples and respects the cooldown", () => {
  const detector = new PhonePullMotion();
  assert.equal(detector.update({ x: 0, y: 0, z: 6 }, 0), false);
  assert.equal(detector.update({ x: 0, y: 0, z: 6 }, 230), false);
  assert.equal(detector.update({ x: 0, y: 0, z: 6 }, 260), true);
  assert.equal(detector.update({ x: 0, y: 0, z: 6 }, 300), false);
  assert.equal(detector.isPending(300), true);
  assert.equal(detector.update({ x: 0, y: 0, z: 6 }, 1059), false);
  assert.equal(detector.isPending(1059), true);
  assert.equal(detector.update({ x: 0, y: 0, z: 6 }, 1060), false);
  assert.equal(detector.update({ x: 0, y: 0, z: 6 }, 1090), true);
});

test("an interruption clears a candidate and invalid sensor values reset the detector", () => {
  const detector = new PhonePullMotion();
  assert.equal(detector.update({ x: 0, y: 0, z: 6 }, 0), false);
  assert.equal(detector.update({ x: 0, y: 0, z: 0 }, 40), false);
  assert.equal(detector.isPending(40), false);
  assert.equal(detector.update({ x: 0, y: 0, z: 6 }, 100), false);
  assert.equal(detector.update({ x: 0, y: Number.NaN, z: 6 }, 140), false);
  assert.equal(detector.isPending(140), false);
});
