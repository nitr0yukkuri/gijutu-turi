import assert from "node:assert/strict";
import test from "node:test";
import {
  CRITICAL_HOOK_WINDOW_END_SECONDS,
  CRITICAL_HOOK_WINDOW_START_SECONDS,
  getHookResult,
  isCriticalHookWindow,
} from "./hook-timing.js";

test("critical hook window includes its boundaries and rejects invalid ages", () => {
  assert.equal(isCriticalHookWindow(CRITICAL_HOOK_WINDOW_START_SECONDS), true);
  assert.equal(isCriticalHookWindow(CRITICAL_HOOK_WINDOW_END_SECONDS), true);
  assert.equal(isCriticalHookWindow(CRITICAL_HOOK_WINDOW_START_SECONDS - .001), false);
  assert.equal(isCriticalHookWindow(CRITICAL_HOOK_WINDOW_END_SECONDS + .001), false);
  assert.equal(isCriticalHookWindow(Number.NaN), false);
});

test("hook result rewards the clear float timing window without removing normal hooks", () => {
  assert.equal(getHookResult(.7), "critical");
  assert.equal(getHookResult(0), "normal");
  assert.equal(getHookResult(2), "normal");
});
