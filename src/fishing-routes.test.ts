import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "node:test";
import { LEGACY_FISH_PATH_ALIASES } from "./fishing-routes.js";

test("Vercel rewrites every shared legacy fish path to the SPA entry", () => {
  const config = JSON.parse(readFileSync(resolve(process.cwd(), "vercel.json"), "utf8")) as {
    rewrites?: Array<{ source?: string; destination?: string }>;
  };
  const rewrites = new Map((config.rewrites ?? []).map(rewrite => [rewrite.source, rewrite.destination]));

  for (const path of LEGACY_FISH_PATH_ALIASES) {
    assert.equal(rewrites.get(path), "/index.html", `missing Vercel rewrite for ${path}`);
  }
});
