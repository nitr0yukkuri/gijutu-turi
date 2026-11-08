import assert from 'node:assert/strict';
import test from 'node:test';
import { getFishFightProfile, JAVA_OCTOPUS_FIRST_DEFENSIVE_SURGE_SECONDS } from './fish-behavior.js';

test('Java octopus has a visible opening, then releases ink on its first defensive surge', () => {
  const profile = getFishFightProfile('java-001');
  assert.equal(profile.modeAt(0, -1).mode, 'surge', 'the opening movement establishes the octopus');
  assert.equal(profile.modeAt(0.8, -1).mode, 'warning', 'the octopus turns before committing to escape');
  assert.equal(profile.modeAt(1.05, -1).mode, 'rest', 'a short recovery separates the opening and defense');
  assert.equal(profile.modeAt(JAVA_OCTOPUS_FIRST_DEFENSIVE_SURGE_SECONDS - 0.01, -1).mode, 'rest');
  assert.equal(profile.modeAt(JAVA_OCTOPUS_FIRST_DEFENSIVE_SURGE_SECONDS, -1).mode, 'surge');
  assert.equal(profile.modeAt(JAVA_OCTOPUS_FIRST_DEFENSIVE_SURGE_SECONDS + 1.05, -1).mode, 'rest');
});
