import assert from "node:assert/strict";
import { test } from "node:test";
import { UpwardHookMotion } from "./upward-hook-motion.js";

test("a sustained upward phone movement sets the hook once", () => {
  const motion = new UpwardHookMotion();
  assert.equal(motion.update({ x: 0, y: 6.4, z: 0 }, 0), false);
  assert.equal(motion.update({ x: 0, y: 6.8, z: 0 }, 40), true);
  assert.equal(motion.update({ x: 0, y: 7, z: 0 }, 80), false);
});

test("downward, sideways, and one-sample movements do not set the hook", () => {
  const motion = new UpwardHookMotion();
  assert.equal(motion.update({ x: 0, y: -8, z: 0 }, 0), false);
  assert.equal(motion.update({ x: 8, y: 0, z: 0 }, 40), false);
  assert.equal(motion.update({ x: 20, y: 6.5, z: 0 }, 60), false);
  assert.equal(motion.update({ x: 0, y: 6.5, z: 0 }, 80), false);
  assert.equal(motion.update({ x: 0, y: 0, z: 0 }, 120), false);
});

test("a gap or an interruption restarts upward confirmation", () => {
  const motion = new UpwardHookMotion();
  assert.equal(motion.update({ x: 0, y: 6.5, z: 0 }, 0), false);
  assert.equal(motion.update({ x: 0, y: 6.5, z: 0 }, 120), false);
  assert.equal(motion.update({ x: 0, y: 6.5, z: 0 }, 160), true);
  assert.equal(motion.update({ x: 0, y: 0, z: 0 }, 180), false);
  assert.equal(motion.update({ x: 0, y: 6.5, z: 0 }, 1000), false);
});
