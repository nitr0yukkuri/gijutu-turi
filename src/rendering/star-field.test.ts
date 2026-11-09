import assert from 'node:assert/strict';
import { test } from 'node:test';
import { STAR_FIELD_PROFILE, starFieldGLSL } from './star-field.js';

test('stars are point-like instead of large blurred disks', () => {
  assert.ok(STAR_FIELD_PROFILE.maximumCoreRadius < 0.2 / 6);
  assert.ok(STAR_FIELD_PROFILE.minimumCoreRadius < STAR_FIELD_PROFILE.maximumCoreRadius);
  assert.ok(starFieldGLSL.includes('float pointRadius=mix(0.014,0.032,'));
  assert.ok(starFieldGLSL.includes('float pointCore=1.0-smoothstep(pointRadius*0.28,pointRadius,distanceToStar);'));
  assert.ok(starFieldGLSL.includes('float halo=exp(-distanceToStar*48.0)*0.1;'));
});

test('only a small share of stars receives a thin four-point flare', () => {
  assert.equal(STAR_FIELD_PROFILE.flareMagnitudeStart, 0.72);
  assert.equal(STAR_FIELD_PROFILE.flareMagnitudeEnd, 0.94);
  assert.equal(STAR_FIELD_PROFILE.flareSelectionThreshold, 0.85);
  assert.ok(starFieldGLSL.includes('float flareSelected=smoothstep(0.72,0.94,magnitude)*step(0.85,hash('));
  assert.ok(starFieldGLSL.includes('float horizontalFlare='));
  assert.ok(starFieldGLSL.includes('float verticalFlare='));
  assert.ok(starFieldGLSL.includes('float flare=(horizontalFlare+verticalFlare)*flareSelected*0.3;'));
});

test('star count and night, cloud, storm and twinkle behavior remain intact', () => {
  assert.ok(starFieldGLSL.includes('vec2 grid=skyCoordinates(direction)*vec2(120.0,75.0);'));
  assert.ok(starFieldGLSL.includes('float sparseStars=step(0.9935,seed);'));
  assert.ok(starFieldGLSL.includes('if(sparseStars<0.5) return 0.0;'));
  assert.ok(starFieldGLSL.includes('if(direction.y<=0.04 || cloudMask>=0.98) return 0.0;'));
  assert.ok(starFieldGLSL.includes('float stormFade=1.0-uWeatherStorm*0.96;'));
  assert.ok(starFieldGLSL.includes('float twinkle=0.84+0.16*sin('));
});
