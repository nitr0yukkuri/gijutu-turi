import { test } from "node:test";
import assert from "node:assert/strict";
import { techTreeReveal } from "./tech-tree-preview.js";

test("all-unlocked preview reveals unknown nodes only in development", () => {
  assert.deepEqual(techTreeReveal("unknown", true, true), { caught: false, preview: true, revealed: true });
  assert.deepEqual(techTreeReveal("unknown", true, false), { caught: false, preview: false, revealed: false });
  assert.deepEqual(techTreeReveal("unknown", false, true), { caught: false, preview: false, revealed: false });
});

test("a real catch stays distinct from the display-only preview", () => {
  assert.deepEqual(techTreeReveal("caught", true, true), { caught: true, preview: false, revealed: true });
  assert.deepEqual(techTreeReveal("preview", true, true), { caught: false, preview: false, revealed: false });
});
