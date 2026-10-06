import assert from "node:assert/strict";
import test from "node:test";
import { distanceReadoutFor } from "./distance-readout.js";

test("cast and fight distances have distinct compact labels", () => {
  assert.deepEqual(distanceReadoutFor("casting", 12.34), { visible: true, label: "飛距離", value: "12.3", caught: false });
  assert.deepEqual(distanceReadoutFor("fighting", 3.26), { visible: true, label: "残り", value: "3.3", caught: false });
});

test("zero is presented as a catch only when the server confirms caught", () => {
  assert.deepEqual(distanceReadoutFor("fighting", .04), { visible: true, label: "残り", value: "0.1", caught: false });
  assert.deepEqual(distanceReadoutFor("caught", 0), { visible: true, label: "残り", value: "0", caught: true });
  assert.equal(distanceReadoutFor("escaped", 0).visible, false);
});
