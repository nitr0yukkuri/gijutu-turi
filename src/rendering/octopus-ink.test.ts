import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from '../../vendor/three.module.js';
import { createOctopusInkEffect, shouldReleaseJavaOctopusInk } from './octopus-ink.js';

test('octopus ink is emitted as a finite, short-lived underwater plume', () => {
  const scene = new THREE.Scene();
  const effect = createOctopusInkEffect(scene);
  try {
    assert.equal(effect.active, false);
    assert.ok(scene.getObjectByName('java-octopus-ink'));
    assert.equal(effect.trigger(new THREE.Vector3(1, -2, 3), new THREE.Vector3(1, 0, 0)), true);
    assert.equal(effect.active, true);
    assert.equal(effect.diagnostics.activeParticles, 384);
    assert.equal(effect.diagnostics.visibleParticles, 0, 'particles fade in over their first frames');
    effect.update(0.05, 720, 46);
    assert.equal(effect.diagnostics.activeParticles, 384);
    assert.ok(effect.diagnostics.visibleParticles >= 60 && effect.diagnostics.visibleParticles <= 64,
      'the dense nucleus is visible before the delayed edge particles disperse');
    assert.equal(effect.diagnostics.finitePositions, true);
    assert.equal(effect.trigger(new THREE.Vector3(), new THREE.Vector3(1, 0, 0)), false, 'one encounter releases one coherent ink cloud');
    for (let index = 0; index < 20; index++) effect.update(0.05, 720, 46);
    assert.equal(effect.active, true, 'the cloud remains visible while it advects');
    assert.equal(effect.diagnostics.burstsTriggered, 1);
    for (let index = 0; index < 100; index++) effect.update(0.05, 720, 46);
    assert.equal(effect.active, false, 'the plume clears instead of remaining on screen');
    effect.reset();
    assert.equal(effect.diagnostics.burstsTriggered, 0);
    assert.equal(effect.trigger(new THREE.Vector3(), new THREE.Vector3(1, 0, 0)), true);
  } finally {
    effect.dispose();
  }
  assert.equal(scene.getObjectByName('java-octopus-ink'), undefined, 'dispose removes its scene object');
  assert.equal(effect.diagnostics.disposed, true);
});

test('octopus ink has a stable fallback direction and ignores non-finite frame time', () => {
  const scene = new THREE.Scene();
  const effect = createOctopusInkEffect(scene);
  try {
    assert.equal(effect.trigger(new THREE.Vector3(0, -1, 0), new THREE.Vector3()), true);
    effect.update(Number.NaN, 0, 0);
    assert.equal(effect.active, true);
    assert.equal(effect.diagnostics.activeParticles, 384);
    assert.equal(effect.diagnostics.visibleParticles, 0);
    effect.update(0.05);
    assert.equal(effect.diagnostics.activeParticles, 384);
    assert.ok(effect.diagnostics.visibleParticles >= 60 && effect.diagnostics.visibleParticles <= 64,
      'the initial jet reveals the core before the rest of the bolus disperses');
  } finally {
    effect.dispose();
  }
});


test('octopus ink blooms into a diffuse downstream smoke screen', () => {
  const scene = new THREE.Scene();
  const effect = createOctopusInkEffect(scene);
  try {
    effect.trigger(new THREE.Vector3(0, -2, 0), new THREE.Vector3(1, 0, 0));
    const points = scene.getObjectByName('java-octopus-ink');
    if (!(points instanceof THREE.Points)) throw new Error('ink plume uses a Points object');
    const positionAttribute = points.geometry.getAttribute('position');
    const sizeAttribute = points.geometry.getAttribute('aPointSize');
    const velocityAttribute = points.geometry.getAttribute('aVelocity');
    if (!positionAttribute || !sizeAttribute || !velocityAttribute) throw new Error('ink plume has position, velocity, and size attributes');
    const positions = positionAttribute.array;
    const sizes = sizeAttribute.array;
    const material = points.material;
    if (!(material instanceof THREE.ShaderMaterial)) throw new Error('ink plume uses a procedural shader');
    assert.match(material.vertexShader, /aVelocity/, 'particle speed orients its streak along the current');
    assert.match(material.fragmentShader, /vFlowDirection/, 'the plume retains its flow-aligned shape');
    const velocities = velocityAttribute.array;
    const extent = (axis: 0 | 1 | 2) => {
      let low = Infinity, high = -Infinity;
      for (let index = 0; index < 384; index++) {
        const value = positions[index * 3 + axis];
        low = Math.min(low, value);
        high = Math.max(high, value);
      }
      return high - low;
    };
    const across = () => Math.max(extent(1), extent(2));
    const maximum = (values: Float32Array) => Math.max(...values);
    const initialAlong = extent(0);
    const initialAcross = across();
    const initialSize = maximum(sizes);
    assert.ok(initialAlong < 0.16, 'the first frame stays close to the funnel as a compact bolus');
    assert.ok(initialAcross < 0.16, 'the first frame has a tight viscous core');
    assert.ok(initialSize > 0.7 && initialSize < 0.9, 'the dense bolus projects large enough to read at fight distance');
    for (let step = 0; step < 24; step++) effect.update(0.05);
    assert.ok(extent(0) > initialAlong + 0.12, 'the plume advances downstream');
    assert.ok(across() > initialAcross + 0.12, 'the bolus shears into a broader turbulent streak');
    assert.ok(maximum(sizes) > initialSize * 1.1, 'particles bloom as the initial bolus disperses');
    assert.equal(effect.diagnostics.burstsTriggered, 1);
    assert.equal(effect.diagnostics.finitePositions, true);
    assert.ok(velocities.every(Number.isFinite), 'flow direction stays finite for the anisotropic particle shader');
  } finally {
    effect.dispose();
  }
});


test('Java octopus waits for its first post-opening surge before releasing ink', () => {
  assert.equal(shouldReleaseJavaOctopusInk('surge', 0), false, 'the opening burst keeps the octopus visible');
  assert.equal(shouldReleaseJavaOctopusInk('surge', .79), false, 'ink does not cover the first 0.8-second burst');
  assert.equal(shouldReleaseJavaOctopusInk('warning', 1), false, 'a warning turn does not release ink');
  assert.equal(shouldReleaseJavaOctopusInk('rest', 3.09), false, 'the fish has a clear recovery window');
  assert.equal(shouldReleaseJavaOctopusInk('surge', 3.09), false, 'the ink cue waits for the scheduled escape surge');
  assert.equal(shouldReleaseJavaOctopusInk('surge', 3.1), true, 'the first deliberate escape surge can release ink');
  assert.equal(shouldReleaseJavaOctopusInk('surge', Number.NaN), false, 'invalid presentation time cannot trigger ink');
});
