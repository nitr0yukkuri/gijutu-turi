import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveFishingRoute } from "./fishing-route.js";

test("public fish routes select only the initial species", () => {
  assert.deepEqual(resolveFishingRoute("/gofish"), {
    key: "gofish", path: "/gofish", initialFishId: "fish-001", title: "Go魚 — 技術釣り",
  });
  assert.deepEqual(resolveFishingRoute("/dockerwhale/"), {
    key: "dockerwhale", path: "/dockerwhale", initialFishId: "whale-001", title: "Dockerクジラ — 技術釣り",
  });
});

test("docker is a compatibility alias and the old query links remain usable", () => {
  assert.equal(resolveFishingRoute("/docker").path, "/dockerwhale");
  assert.equal(resolveFishingRoute("/", "go").path, "/gofish");
  assert.equal(resolveFishingRoute("/", "docker").path, "/dockerwhale");
});

test("unknown paths keep the default fishing route", () => {
  assert.equal(resolveFishingRoute("/unknown").key, "default");
  assert.equal(resolveFishingRoute("/").initialFishId, undefined);
});
