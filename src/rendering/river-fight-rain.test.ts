import { test } from 'node:test';
import assert from 'node:assert/strict';
import { OCEAN_PHASES } from '../ocean-contract.js';
import {
  RIVER_FIGHT_RAIN_PROFILE,
  RIVER_FIGHT_RAIN_SHADER,
  riverFightRainParticleProfile,
  shouldSoftenRiverFightRain,
} from './river-fight-rain.js';

test('river rain softening is active only during the fighting phase', () => {
  for (const phase of OCEAN_PHASES) {
    assert.equal(shouldSoftenRiverFightRain('river', phase), phase === 'fighting');
    assert.equal(shouldSoftenRiverFightRain('sea', phase), false);
  }
});

test('the inactive profile leaves every rain particle unchanged', () => {
  for (const phase of [0, 0.62, 0.68, 0.74, 1]) {
    assert.deepEqual(riverFightRainParticleProfile(phase, 0), {
      keep: 1,
      pointSizeScale: 1,
      opacityScale: 1,
    });
  }
});

test('the active profile smoothly fades only high-phase particles and applies the river-fight scales', () => {
  const beforeFade = riverFightRainParticleProfile(0.5, 1);
  const fadeStart = riverFightRainParticleProfile(0.62, 1);
  const fadeMidpoint = riverFightRainParticleProfile(0.68, 1);
  const fadeEnd = riverFightRainParticleProfile(0.74, 1);
  const afterFade = riverFightRainParticleProfile(0.9, 1);

  assert.equal(beforeFade.keep, 1);
  assert.equal(fadeStart.keep, 1);
  assert.ok(Math.abs(fadeMidpoint.keep - 0.5) < 1e-12);
  assert.equal(fadeEnd.keep, 0);
  assert.equal(afterFade.keep, 0);
  assert.equal(fadeMidpoint.pointSizeScale, RIVER_FIGHT_RAIN_PROFILE.pointSizeScale);
  assert.equal(fadeMidpoint.opacityScale, RIVER_FIGHT_RAIN_PROFILE.opacityScale);
  const halfBlend = riverFightRainParticleProfile(0.5, 0.5);
  assert.ok(Math.abs(halfBlend.pointSizeScale - 0.86) < 1e-12);
  assert.ok(Math.abs(halfBlend.opacityScale - 0.84) < 1e-12);
  assert.ok(Math.abs(riverFightRainParticleProfile(0.68, 0.5).keep - 0.75) < 1e-12);
});

test('the GLSL expressions use the same tested fade range and scales', () => {
  assert.equal(RIVER_FIGHT_RAIN_SHADER.uniform, 'uniform float uRiverFight;');
  assert.equal(RIVER_FIGHT_RAIN_SHADER.keep, 'mix(1.0,1.0-smoothstep(0.62,0.74,aPhase),uRiverFight)');
  assert.equal(RIVER_FIGHT_RAIN_SHADER.pointSize, 'mix(1.0,0.72,uRiverFight)');
  assert.equal(RIVER_FIGHT_RAIN_SHADER.opacity, 'mix(1.0,0.68,uRiverFight)');
  assert.equal(RIVER_FIGHT_RAIN_PROFILE.transitionSpeed, 6);
});

test('the blend is clamped to its neutral and fully softened endpoints', () => {
  assert.deepEqual(riverFightRainParticleProfile(0.68, -1), riverFightRainParticleProfile(0.68, 0));
  assert.deepEqual(riverFightRainParticleProfile(0.68, 2), riverFightRainParticleProfile(0.68, 1));
});
