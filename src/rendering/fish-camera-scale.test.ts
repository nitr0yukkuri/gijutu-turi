import { test } from "node:test";
import assert from "node:assert/strict";
import { fishScaleForResponsiveCamera } from "./fish-camera-scale.js";

test("縦画角を広げても魚を追加で拡大せず、投影サイズを保つ", () => {
  const baseScale = .74;
  const desktopScale = fishScaleForResponsiveCamera(baseScale, 46, 0);
  const portraitScale = fishScaleForResponsiveCamera(baseScale, 64, 1);

  assert.equal(desktopScale, baseScale);
  assert.ok(portraitScale > desktopScale);
  const desktopProjection = desktopScale / Math.tan(46 * Math.PI / 360);
  const portraitProjection = portraitScale / Math.tan(64 * Math.PI / 360);
  assert.ok(Math.abs(portraitProjection / desktopProjection - 1) < 1e-10);
});

test("レスポンシブ補正後も魚種ごとのサイズ比を維持する", () => {
  const go = fishScaleForResponsiveCamera(.84, 64, 1);
  const css = fishScaleForResponsiveCamera(.74, 64, 1);
  assert.ok(css < go);
  assert.ok(Math.abs(css / go - .74 / .84) < 1e-10);
  assert.ok(fishScaleForResponsiveCamera(.74, 56, .5) < css, "portrait zoom is smooth between breakpoints");
  const intentionallySmaller = fishScaleForResponsiveCamera(.74, 64, 1, 46, .72);
  assert.ok(Math.abs(intentionallySmaller / css - .72) < 1e-10);
});
