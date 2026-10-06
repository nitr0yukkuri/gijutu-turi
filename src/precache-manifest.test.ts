import assert from "node:assert/strict";
import test from "node:test";
import { createPrecacheManifest } from "./precache-manifest.js";

test("offline manifest includes only unique built scripts and styles", () => {
  assert.deepEqual(createPrecacheManifest([
    "chunks/scene.js",
    "assets/app.css",
    "chunks/scene.js",
    "assets/photo.png",
    "../secret.js",
    "assets/../secret.js",
    "chunks/nested/../../secret.css",
    "assets/../../secret.js",
    "https://other.example/app.js",
  ]), ["assets/app.css", "chunks/scene.js"]);
});
