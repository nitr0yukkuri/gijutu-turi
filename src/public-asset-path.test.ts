import assert from "node:assert/strict";
import test from "node:test";
import { resolve } from "node:path";
import { publicAssetCandidates, resolveContainedAssetPath } from "./public-asset-path.js";

test("public asset paths remain inside their asset root", () => {
  const root = resolve("dist/client/assets");
  assert.equal(resolveContainedAssetPath(root, "fish.js"), resolve(root, "fish.js"));
  assert.equal(resolveContainedAssetPath(root, "nested/fish.js"), resolve(root, "nested/fish.js"));
  assert.equal(resolveContainedAssetPath(root, "../.env"), null);
  assert.equal(resolveContainedAssetPath(root, "/etc/passwd"), null);
  assert.equal(resolveContainedAssetPath(root, ""), null);
  assert.equal(resolveContainedAssetPath(root, "fish\0.js"), null);
});

test("service worker route prefers the bundled worker and retains its source fallback", () => {
  assert.deepEqual(publicAssetCandidates("/service-worker.js", "src/service-worker.ts", true), [
    "dist/client/service-worker.js",
    "src/service-worker.ts",
  ]);
  assert.deepEqual(publicAssetCandidates("/ocean.css", "ocean.css", true), ["dist/client/ocean.css", "ocean.css"]);
});
