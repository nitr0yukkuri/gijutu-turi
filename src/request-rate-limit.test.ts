import assert from "node:assert/strict";
import test from "node:test";
import { RequestRateLimiter } from "./request-rate-limit.js";

test("request limiter applies client and global quotas without partially consuming a rule", () => {
  const limiter = new RequestRateLimiter();
  const rules = [
    { key: "global", limit: 2, windowMs: 10_000 },
    { key: "client-a", limit: 1, windowMs: 5_000 },
  ];

  assert.equal(limiter.consume(rules, 1_000), 0);
  assert.equal(limiter.consume(rules, 2_000), 4);
  assert.equal(limiter.consume([{ key: "global", limit: 2, windowMs: 10_000 }], 2_000), 0);
  assert.equal(limiter.consume([{ key: "global", limit: 2, windowMs: 10_000 }], 3_000), 8);
  assert.equal(limiter.consume(rules, 11_000), 0);
});
