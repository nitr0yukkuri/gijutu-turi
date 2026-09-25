import assert from 'node:assert/strict';
import test from 'node:test';
import { smoothRodLoad } from './rendering/rod-flex.js';

test('rod load eases into tension instead of snapping to it', () => {
  const loaded = smoothRodLoad(0, 1, 0.1);

  assert.ok(loaded > 0);
  assert.ok(loaded < 1);
});

test('rod load eases back after tension releases', () => {
  const released = smoothRodLoad(0.7, 0, 0.1);

  assert.ok(released > 0);
  assert.ok(released < 0.7);
});

test('rod load easing is stable across frame rates', () => {
  const oneFrame = smoothRodLoad(0.2, 1, 0.1);
  const twoFrames = smoothRodLoad(smoothRodLoad(0.2, 1, 0.05), 1, 0.05);

  assert.ok(Math.abs(oneFrame - twoFrames) < 1e-12);
});
