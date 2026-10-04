import { test } from "node:test";
import assert from "node:assert/strict";
import type { FishMotionSnapshot } from "./fish.js";
import { CSS_FISH_PALETTES, cssFishPreviewStateAt, cssFishRedStateStrength, resolveCssFishVisualState } from "./css-fish-style.js";

const tiredFish = { swim: { effort: .2 } } as FishMotionSnapshot;

test("CSS fishの見た目はゲーム状態から一意に導出される", () => {
  assert.equal(resolveCssFishVisualState({ phase: "idle", mode: "rest", tension: 0 }), "normal");
  assert.equal(resolveCssFishVisualState({ phase: "biting", mode: "rest", tension: .2 }), "hit");
  assert.equal(resolveCssFishVisualState({ phase: "fighting", mode: "surge", tension: .7, fish: tiredFish }), "escape");
  assert.equal(resolveCssFishVisualState({ phase: "fighting", mode: "rest", tension: .4, fish: tiredFish }), "tired");
  assert.equal(resolveCssFishVisualState({ phase: "caught", mode: "rest", tension: .1 }), "catchable");
  assert.equal(resolveCssFishVisualState({ phase: "escaped", mode: "rest", tension: 0 }), "escape");
});

test("CSS fishの状態パレットは構造を変えずに見た目だけを分ける", () => {
  assert.notEqual(CSS_FISH_PALETTES.normal.body, CSS_FISH_PALETTES.hit.body);
  assert.ok(CSS_FISH_PALETTES.escape.glow > CSS_FISH_PALETTES.normal.glow);
  assert.ok(((CSS_FISH_PALETTES.escape.body >> 16) & 0xff) > ((CSS_FISH_PALETTES.escape.body >> 8) & 0xff) * 2);
  assert.ok(CSS_FISH_PALETTES.tired.glow < CSS_FISH_PALETTES.normal.glow);
  assert.equal(CSS_FISH_PALETTES.catchable.accent, 0xffffff);
});

test("水中で赤を保つ補正はHITと逃走中だけに適用する", () => {
  assert.equal(cssFishRedStateStrength("normal"), 0);
  assert.equal(cssFishRedStateStrength("tired"), 0);
  assert.equal(cssFishRedStateStrength("catchable"), 0);
  assert.equal(cssFishRedStateStrength("hit"), .78);
  assert.equal(cssFishRedStateStrength("escape"), 1);
});

test("CSS fishの図鑑プレビューは通常色を長めに見せて状態色を巡回する", () => {
  assert.equal(cssFishPreviewStateAt(0), "normal");
  assert.equal(cssFishPreviewStateAt(3.2), "hit");
  assert.equal(cssFishPreviewStateAt(4.3), "escape");
  assert.equal(cssFishPreviewStateAt(5.8), "tired");
  assert.equal(cssFishPreviewStateAt(7.1), "catchable");
  assert.equal(cssFishPreviewStateAt(8.4), "normal");
});
