import assert from "node:assert/strict";
import test from "node:test";
import { isFirstCatch } from "./catch-discovery.js";

test("only the first persisted catch is a new discovery", () => {
  assert.equal(isFirstCatch(0, 1), true);
  assert.equal(isFirstCatch(1, 2), false);
  assert.equal(isFirstCatch(0, 0), false);
  assert.equal(isFirstCatch(Number.NaN, 1), false);
});
