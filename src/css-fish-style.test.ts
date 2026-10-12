import { test } from "node:test";
import assert from "node:assert/strict";
import { CSS_FISH_LIVE_STATE, CSS_FISH_PALETTES, cssFishPreviewStateAt } from "./css-fish-style.js";

test("実プレイ中のCSS fishは釣りから戦闘まで通常パレットを保つ", () => {
  assert.equal(CSS_FISH_LIVE_STATE, "normal");
});

test("CSS fishの状態パレットは構造を変えずに見た目だけを分ける", () => {
  assert.notEqual(CSS_FISH_PALETTES.normal.body, CSS_FISH_PALETTES.hit.body);
  assert.ok(CSS_FISH_PALETTES.escape.glow > CSS_FISH_PALETTES.normal.glow);
  assert.ok(((CSS_FISH_PALETTES.escape.body >> 16) & 0xff) > ((CSS_FISH_PALETTES.escape.body >> 8) & 0xff) * 2);
  assert.ok(CSS_FISH_PALETTES.tired.glow < CSS_FISH_PALETTES.normal.glow);
  assert.equal(CSS_FISH_PALETTES.catchable.accent, 0xffffff);
});

test("CSS fishの図鑑プレビューは通常色を長めに見せて状態色を巡回する", () => {
  assert.equal(cssFishPreviewStateAt(0), "normal");
  assert.equal(cssFishPreviewStateAt(3.2), "hit");
  assert.equal(cssFishPreviewStateAt(4.3), "escape");
  assert.equal(cssFishPreviewStateAt(5.8), "tired");
  assert.equal(cssFishPreviewStateAt(7.1), "catchable");
  assert.equal(cssFishPreviewStateAt(8.4), "normal");
});
