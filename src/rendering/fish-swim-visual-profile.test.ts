import assert from 'node:assert/strict';
import test from 'node:test';
import {
  fishBodyWaveOffsetAt,
  fishFlexEnvelopeAt,
  K8S_LEVIATHAN_SWIM_VISUAL_PROFILE,
  STANDARD_FISH_SWIM_VISUAL_PROFILE,
} from './fish-swim-visual-profile.js';

test('K8s armor stays stable while the compact rear body reaches full tail flex', () => {
  const profile = K8S_LEVIATHAN_SWIM_VISUAL_PROFILE;
  assert.equal(fishFlexEnvelopeAt(-.9, profile), 0, 'the armored head should not wave laterally');
  assert.ok(fishFlexEnvelopeAt(.48, profile) > .2, 'the rear trunk should begin carrying the wave');
  assert.ok(fishFlexEnvelopeAt(1.38, profile) > .999999, 'the short K8s peduncle should reach full flex');
  assert.ok(fishFlexEnvelopeAt(1.38, profile) > fishFlexEnvelopeAt(1.38, STANDARD_FISH_SWIM_VISUAL_PROFILE));
});

test('CPU wave offset matches the shader traveling-wave profile', () => {
  const profile = K8S_LEVIATHAN_SWIM_VISUAL_PROFILE;
  const x = .84;
  const progress = (x - profile.flexStartX) / profile.flexLength;
  const expected = Math.sin(progress * Math.PI * 2 / .7 - .4) * progress * progress * .8 * profile.bendGain
    + .25 * progress * progress * profile.turnGain;
  assert.ok(Math.abs(fishBodyWaveOffsetAt(x, .4, .8, .7, .25, profile) - expected) < 1e-12);
});
