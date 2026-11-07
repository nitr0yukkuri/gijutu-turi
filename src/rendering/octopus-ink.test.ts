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
    assert.equal(effect.diagnostics.activeParticles, 96);
    assert.equal(effect.diagnostics.visibleParticles, 0, 'particles fade in over their first frames');
    effect.update(0.05, 720, 46);
    assert.equal(effect.diagnostics.activeParticles, 96);
    assert.equal(effect.diagnostics.visibleParticles, 96);
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
    assert.equal(effect.diagnostics.activeParticles, 96);
    assert.equal(effect.diagnostics.visibleParticles, 0);
    effect.update(0.05);
    assert.equal(effect.diagnostics.activeParticles, 96);
    assert.equal(effect.diagnostics.visibleParticles, 96);
  } finally {
    effect.dispose();
  }
});


test('octopus ink starts as one dense slug and advects downstream as a single plume', () => {
  const scene = new THREE.Scene();
  const effect = createOctopusInkEffect(scene);
  try {
    effect.trigger(new THREE.Vector3(0, -2, 0), new THREE.Vector3(1, 0, 0));
    const points = scene.getObjectByName('java-octopus-ink');
    const positions = points.geometry.attributes.position.array;
    const extent = axis => {
      let low = Infinity, high = -Infinity;
      for (let index = 0; index < 96; index++) {
        const value = positions[index * 3 + axis];
        low = Math.min(low, value);
        high = Math.max(high, value);
      }
      return high - low;
    };
    const initialX = extent(0);
    assert.ok(initialX > 0.2 && initialX < 0.6, 'the release has a short downstream tail');
    assert.ok(extent(1) < 0.32 && extent(2) < 0.32, 'the initial cloud stays tightly joined across its width');
    for (let step = 0; step < 10; step++) effect.update(0.05);
    assert.ok(extent(0) > initialX + 0.06, 'the plume advances and stretches downstream');
    assert.equal(effect.diagnostics.burstsTriggered, 1);
  } finally {
    effect.dispose();
  }
});
