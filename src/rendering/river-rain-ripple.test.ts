import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  RIVER_RAIN_RIPPLE_PROFILE,
  RIVER_RAIN_RIPPLE_SHADER,
  riverRainRippleProfile,
} from './river-rain-ripple.js';

test('river rain ripple density rises with rain but stays far below a filled grid', () => {
  const light = riverRainRippleProfile(0.2);
  const medium = riverRainRippleProfile(0.5);
  const heavy = riverRainRippleProfile(1);
  const previousHeavyDensity = 0.94 * 0.78 * 0.78;

  assert.ok(light.ripplesPerWorldArea < medium.ripplesPerWorldArea);
  assert.ok(medium.ripplesPerWorldArea < heavy.ripplesPerWorldArea);
  assert.equal(heavy.activeCellChance, RIVER_RAIN_RIPPLE_PROFILE.heavyRainCellChance);
  assert.ok(heavy.activeCellChance <= 0.35);
  assert.ok(heavy.ripplesPerWorldArea < previousHeavyDensity * 0.2);
});

test('rain intensity is clamped and non-finite values use the dry baseline', () => {
  assert.deepEqual(riverRainRippleProfile(-1), riverRainRippleProfile(0));
  assert.deepEqual(riverRainRippleProfile(2), riverRainRippleProfile(1));
  assert.deepEqual(riverRainRippleProfile(Number.NaN), riverRainRippleProfile(0));
  assert.deepEqual(riverRainRippleProfile(Number.POSITIVE_INFINITY), riverRainRippleProfile(0));
});

test('surface rings vary in placement, radius, orientation and width, then fade in and out', () => {
  const { function: rippleFunction } = RIVER_RAIN_RIPPLE_SHADER;

  assert.match(rippleFunction, /mix\(vec2\(0\.08\),vec2\(0\.92\),randomA\.xy\)/);
  assert.match(rippleFunction, /mix\(0\.008,0\.105,age\)/);
  assert.match(rippleFunction, /float angle=randomB\.y\*6\.2831853/);
  assert.match(rippleFunction, /float ringWidth=mix\(24,43,randomB\.w\)/);
  assert.match(rippleFunction, /smoothstep\(0\.0,0\.11,age\)/);
  assert.match(rippleFunction, /smoothstep\(0\.6,0\.92,age\)/);
});

test('the renderer snippets keep the ripple lighting subdued', () => {
  assert.equal(
    RIVER_RAIN_RIPPLE_SHADER.normalAdjustment,
    'n=normalize(n+vec3(rainRipple*0.045,0.0,rainRipple*0.0324));',
  );
  assert.equal(
    RIVER_RAIN_RIPPLE_SHADER.colorAdjustment,
    'color+=vec3(0.008,0.014,0.016)*rainRipple;',
  );
});
