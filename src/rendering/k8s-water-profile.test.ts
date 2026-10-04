import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_FISH_WATER_PROFILE, K8S_LEVIATHAN_WATER_PROFILE, fishWaterCoverage } from './fish-water.js';

test('K8S keeps its dark palette but holds a clearer body silhouette underwater', () => {
  const normalCoverage = fishWaterCoverage(2.1, 10, .55, 'body', DEFAULT_FISH_WATER_PROFILE);
  const leviathanCoverage = fishWaterCoverage(2.1, 10, .55, 'body', K8S_LEVIATHAN_WATER_PROFILE);

  assert.ok(leviathanCoverage > normalCoverage);
  assert.ok(K8S_LEVIATHAN_WATER_PROFILE.bodyLightMax > DEFAULT_FISH_WATER_PROFILE.bodyLightMax);
  assert.ok(K8S_LEVIATHAN_WATER_PROFILE.bodyLightMax < 1, 'the leviathan should stay shaded, not emissive');
});
