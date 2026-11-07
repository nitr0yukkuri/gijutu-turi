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
    assert.equal(effect.diagnostics.activeParticles, 48);
    assert.equal(effect.diagnostics.visibleParticles, 0, 'particles fade in over their first frames');
    effect.update(0.05, 720, 46);
    assert.equal(effect.diagnostics.activeParticles, 48);
    assert.equal(effect.diagnostics.visibleParticles, 48);
    assert.equal(effect.diagnostics.finitePositions, true);
    assert.equal(effect.trigger(new THREE.Vector3(1, -2, 3), new THREE.Vector3(1, 0, 0)), true);
    assert.equal(effect.trigger(new THREE.Vector3(), new THREE.Vector3(1, 0, 0)), false, 'an encounter is limited to two ink bursts');
    for (let index = 0; index < 20; index++) effect.update(0.05, 720, 46);
    assert.equal(effect.active, true, 'the cloud remains visible while it advects');
    assert.equal(effect.diagnostics.burstsTriggered, 2);
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
    assert.equal(effect.diagnostics.activeParticles, 48);
    assert.equal(effect.diagnostics.visibleParticles, 0);
    effect.update(0.05);
    assert.equal(effect.diagnostics.activeParticles, 48);
    assert.equal(effect.diagnostics.visibleParticles, 48);
  } finally {
    effect.dispose();
  }
});
