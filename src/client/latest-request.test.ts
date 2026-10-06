import assert from "node:assert/strict";
import test from "node:test";
import { LatestRequestGuard } from "./latest-request.js";

test("a late response cannot replace data from a newer request", () => {
  const requests = new LatestRequestGuard();
  const older = requests.begin();
  const newer = requests.begin();
  assert.equal(requests.isCurrent(older), false);
  assert.equal(requests.isCurrent(newer), true);
});
