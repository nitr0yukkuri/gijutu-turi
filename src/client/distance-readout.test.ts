import assert from "node:assert/strict";
import test from "node:test";
import { distanceReadoutFor } from "./distance-readout.js";

test("cast and fight distances have distinct compact labels", () => {
  assert.deepEqual(distanceReadoutFor("casting", 12.34), { visible: true, label: "飛距離", value: "12.3" });
  assert.deepEqual(distanceReadoutFor("fighting", 3.26), { visible: true, label: "残り", value: "3.3" });
});

test("the live distance hides when fishing ends while preserving the confirmed catch value", () => {
  assert.deepEqual(distanceReadoutFor("fighting", .04), { visible: true, label: "残り", value: "0.1" });
  assert.deepEqual(distanceReadoutFor("caught", 0), { visible: false, label: "残り", value: "0" });
  assert.equal(distanceReadoutFor("escaped", 0).visible, false);
});
