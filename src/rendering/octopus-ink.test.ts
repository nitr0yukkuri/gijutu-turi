import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from '../../vendor/three.module.js';
import { createOctopusInkEffect } from './octopus-ink.js';

test('octopus ink is emitted as a finite, short-lived underwater plume', () => {
  const scene = new THREE.Scene();
  const effect = createOctopusInkEffect(scene);
  try {
    assert.equal(effect.active, false);
    assert.ok(scene.getObjectByName('java-octopus-ink'));
    assert.equal(effect.trigger(new THREE.Vector3(1, -2, 3), new THREE.Vector3(1, 0, 0)), true);
    assert.equal(effect.active, true);
    assert.equal(effect.diagnostics.activeParticles, 144);
    assert.equal(effect.diagnostics.visibleParticles, 0, 'particles fade in over their first frames');
    effect.update(0.05, 720, 46);
    assert.equal(effect.diagnostics.activeParticles, 144);
    assert.equal(effect.diagnostics.visibleParticles, 144);
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
    assert.equal(effect.diagnostics.activeParticles, 144);
    assert.equal(effect.diagnostics.visibleParticles, 0);
    effect.update(0.05);
    assert.equal(effect.diagnostics.activeParticles, 144);
    assert.equal(effect.diagnostics.visibleParticles, 144);
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
    if (!positionAttribute || !sizeAttribute) throw new Error('ink plume has position and size attributes');
    const positions = positionAttribute.array;
    const sizes = sizeAttribute.array;
    const extent = (axis: 0 | 1 | 2) => {
      let low = Infinity, high = -Infinity;
      for (let index = 0; index < 144; index++) {
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
    assert.ok(initialAlong > 0.75 && initialAlong < 1.7, 'ink extends downstream from its funnel release');
    assert.ok(initialAcross > 0.65 && initialAcross < 1.7, 'the released ink has a diffuse cross-section');
    assert.ok(initialSize < 0.29, 'no oversized particle merges the plume into a single dark slug');
    for (let step = 0; step < 10; step++) effect.update(0.05);
    assert.ok(extent(0) > initialAlong + 0.12, 'the plume advances downstream');
    assert.ok(across() > initialAcross + 0.12, 'the cloud expands laterally as it mixes');
    assert.ok(maximum(sizes) > initialSize * 1.2, 'particles bloom as the initial bolus disperses');
    assert.equal(effect.diagnostics.burstsTriggered, 1);
    assert.equal(effect.diagnostics.finitePositions, true);
  } finally {
    effect.dispose();
  }
});
