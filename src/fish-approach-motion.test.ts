import assert from 'node:assert/strict';
import test from 'node:test';
import { getFishApproachMotionProfile } from './fish-approach-motion.js';

test('only K8S gets the heavy approach and station-keeping gaits', () => {
  const k8s = getFishApproachMotionProfile('k8s-001');
  assert.deepEqual(k8s.approach, { gait: 'heavy_cruise', speed: 1.05, effort: .42 });
  assert.deepEqual(k8s.stationKeep, { gait: 'heavy_station', speed: .42, effort: .4 });

  for (const fishId of ['fish-001', 'css-001', 'whale-001'] as const) {
    assert.deepEqual(getFishApproachMotionProfile(fishId), {
      approach: { gait: 'cruise', speed: 1.05, effort: .28 },
      stationKeep: { gait: 'coast', speed: .16, effort: .12 },
    }, `${fishId} keeps its existing approach motion`);
  }
});
