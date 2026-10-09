import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "node:test";
import { CANONICAL_FISH_ROUTE_PATHS, COMPLETE_SHOWCASE_PATH, FISHING_ROUTE_PATHS, LEGACY_FISH_PATH_ALIASES } from "./fishing-routes.js";

test("Vercel rewrites every shared legacy fish path and the canonical K8s route to the SPA entry", () => {
  const config = JSON.parse(readFileSync(resolve(process.cwd(), "vercel.json"), "utf8")) as {
    redirects?: Array<{ source?: string; destination?: string }>;
    rewrites?: Array<{ source?: string; destination?: string }>;
  };
  const rewrites = new Map((config.rewrites ?? []).map(rewrite => [rewrite.source, rewrite.destination]));
  const redirects = new Map((config.redirects ?? []).map(redirect => [redirect.source, redirect.destination]));

  for (const path of LEGACY_FISH_PATH_ALIASES) {
    assert.equal(rewrites.get(path), "/index.html", `missing Vercel rewrite for ${path}`);
  }
  for (const path of CANONICAL_FISH_ROUTE_PATHS) {
    assert.equal(rewrites.get(path), "/index.html", `missing Vercel rewrite for canonical route ${path}`);
    assert.equal(redirects.get(`${path}/`), path, `trailing slash should canonicalize for ${path}`);
  }
  assert.equal(rewrites.get(COMPLETE_SHOWCASE_PATH), "/index.html", "the showcase route should reach the SPA entry");
  assert.equal(redirects.get(`${COMPLETE_SHOWCASE_PATH}/`), COMPLETE_SHOWCASE_PATH);
  assert.equal(FISHING_ROUTE_PATHS.k8sfish, "/k8sfish");
});
