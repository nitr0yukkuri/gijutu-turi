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
  assert.equal(detector.update({ x: 0, y: 0, z: 4.8 }, 100), false);
  assert.equal(detector.update({ x: 0, y: 0, z: -7 }, 140), false);
  assert.equal(detector.update({ x: 7, y: 0, z: 1 }, 180), false);
});

test("a fresh pull requires two timely samples and respects the cooldown", () => {
  const detector = new PhonePullMotion();
  assert.equal(detector.update({ x: 0, y: 0, z: 6 }, 0), false);
  assert.equal(detector.update({ x: 0, y: 0, z: 6 }, 130), false);
  assert.equal(detector.update({ x: 0, y: 0, z: 6 }, 160), true);
  assert.equal(detector.update({ x: 0, y: 0, z: 6 }, 300), false);
  assert.equal(detector.isPending(300), true);
  assert.equal(detector.update({ x: 0, y: 0, z: 6 }, 959), false);
  assert.equal(detector.isPending(959), true);
  assert.equal(detector.update({ x: 0, y: 0, z: 6 }, 960), false);
  assert.equal(detector.update({ x: 0, y: 0, z: 6 }, 1000), true);
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
