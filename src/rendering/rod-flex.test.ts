import { test } from "node:test";
import assert from "node:assert/strict";
import { CSS_ROD_FLEX_PROFILE, DOCKER_ROD_FLEX_PROFILE, JS_EEL_ROD_FLEX_PROFILE, RUST_BILLFISH_ROD_FLEX_PROFILE, STANDARD_ROD_FLEX_PROFILE, rodCenterAt, rodFlexProfileFor } from "./rod-flex.js";

test("Docker rod carries visible bend earlier through the belly", () => {
  assert.equal(rodFlexProfileFor("whale-001"), DOCKER_ROD_FLEX_PROFILE);
  assert.equal(rodFlexProfileFor("fish-001"), STANDARD_ROD_FLEX_PROFILE);
  assert.equal(rodFlexProfileFor("css-001"), CSS_ROD_FLEX_PROFILE);
  assert.equal(rodFlexProfileFor("rust-001"), RUST_BILLFISH_ROD_FLEX_PROFILE);
  assert.equal(rodFlexProfileFor("js-001"), JS_EEL_ROD_FLEX_PROFILE);
  assert.ok(DOCKER_ROD_FLEX_PROFILE.bendGain > STANDARD_ROD_FLEX_PROFILE.bendGain);
  assert.ok(DOCKER_ROD_FLEX_PROFILE.tipDirectionBlend > STANDARD_ROD_FLEX_PROFILE.tipDirectionBlend);
});

test("rod centerline stays attached at the butt and tip anchors", () => {
  const butt={x:0,y:0,z:0},tip={x:0,y:0,z:-5},pull={x:-.8,y:.2,z:-.6};
  for (const profile of [STANDARD_ROD_FLEX_PROFILE, DOCKER_ROD_FLEX_PROFILE, CSS_ROD_FLEX_PROFILE, RUST_BILLFISH_ROD_FLEX_PROFILE, JS_EEL_ROD_FLEX_PROFILE]) {
    assert.deepEqual(rodCenterAt(0,butt,tip,pull,.8,profile),butt);
    assert.deepEqual(rodCenterAt(1,butt,tip,pull,.8,profile),tip);
  }
});

test("loaded rod keeps a continuous line-facing tip tangent", () => {
  const butt={x:0,y:0,z:0},tip={x:0,y:0,z:-5},pull={x:-.8,y:.2,z:-.6};
  const before=rodCenterAt(.98,butt,tip,pull,.8,STANDARD_ROD_FLEX_PROFILE);
  const atTip=rodCenterAt(1,butt,tip,pull,.8,STANDARD_ROD_FLEX_PROFILE);
  const tangent={x:atTip.x-before.x,y:atTip.y-before.y,z:atTip.z-before.z};
  const tangentLength=Math.hypot(tangent.x,tangent.y,tangent.z);
  const pullLength=Math.hypot(pull.x,pull.y,pull.z);
  const alignment=(tangent.x*pull.x+tangent.y*pull.y+tangent.z*pull.z)/(tangentLength*pullLength);
  assert.ok(alignment>.55,'tip tangent should follow the line instead of straightening back to the chord');
});
