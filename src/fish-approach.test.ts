import assert from 'node:assert/strict';
import test from 'node:test';
import { fishVisibilityTarget } from './fish-approach.js';

test('K8S approach silhouette becomes easier to read without changing other species', () => {
  assert.equal(fishVisibilityTarget('waiting', .46, 'k8s-001'), .42);
  assert.equal(fishVisibilityTarget('biting', 1, 'k8s-001'), .7);
  assert.equal(fishVisibilityTarget('waiting', .46, 'fish-001'), .32);
  assert.ok(Math.abs(fishVisibilityTarget('biting', 1, 'fish-001') - .85) < 1e-12);
});
