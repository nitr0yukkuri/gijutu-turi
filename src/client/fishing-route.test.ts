import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveFishingRoute } from "./fishing-route.js";
import { LEGACY_FISH_ROUTE_ALIASES } from "../fishing-routes.js";

test("public fish routes select only the initial species", () => {
  assert.deepEqual(resolveFishingRoute("/gofish"), {
    key: "gofish", path: "/gofish", initialFishId: "fish-001", title: "Go魚 — 技術釣り",
  });
  assert.deepEqual(resolveFishingRoute("/dockerwhale/"), {
    key: "dockerwhale", path: "/dockerwhale", initialFishId: "whale-001", title: "Dockerクジラ — 技術釣り",
  });
  assert.deepEqual(resolveFishingRoute("/cssfish/"), {
    key: "cssfish", path: "/cssfish", initialFishId: "css-001", title: "CSS fish — 技術釣り",
  });
  assert.deepEqual(resolveFishingRoute("/rustfish/"), {
    key: "rustfish", path: "/rustfish", initialFishId: "rust-001", title: "Rustカジキ — 技術釣り",
  });
  assert.deepEqual(resolveFishingRoute("/jseel/"), {
    key: "jseel", path: "/jseel", initialFishId: "js-001", title: "JSアナゴ — 技術釣り",
  });
  assert.deepEqual(resolveFishingRoute("/k8sfish"), {
    key: "k8sfish", path: "/k8sfish", initialFishId: "k8s-001", title: "K8sレヴィアタン — 技術釣り",
  });
  assert.equal(resolveFishingRoute("/k8sfish/").initialFishId, "k8s-001");
  assert.deepEqual(resolveFishingRoute("/", "k8s"), {
    key: "k8sfish", path: "/k8sfish", initialFishId: "k8s-001", title: "K8sレヴィアタン — 技術釣り",
  });
});

test("docker is a compatibility alias and the old query links remain usable", () => {
  assert.equal(resolveFishingRoute("/docker").path, "/dockerwhale");
  assert.equal(resolveFishingRoute("/", "go").path, "/gofish");
  assert.equal(resolveFishingRoute("/", "docker").path, "/dockerwhale");
  assert.equal(resolveFishingRoute("/", "css").path, "/cssfish");
  assert.equal(resolveFishingRoute("/", "cssfish").initialFishId, "css-001");
  assert.equal(resolveFishingRoute("/", "k8sfish").initialFishId, "k8s-001");
});

test("fish path aliases select the requested initial species",()=>{
  for (const [alias, routeKey] of Object.entries(LEGACY_FISH_ROUTE_ALIASES)) {
    assert.equal(resolveFishingRoute(`/fish=${alias}`).key, routeKey);
    assert.equal(resolveFishingRoute("/", alias).key, routeKey);
  }
  assert.equal(resolveFishingRoute("/fish=cssfish/").initialFishId,"css-001");
});

test("unknown paths keep the default fishing route", () => {
  assert.equal(resolveFishingRoute("/unknown").key, "default");
  assert.equal(resolveFishingRoute("/").initialFishId, undefined);
});
