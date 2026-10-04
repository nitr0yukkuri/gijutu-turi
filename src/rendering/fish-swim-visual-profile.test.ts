import assert from 'node:assert/strict';
import test from 'node:test';
import {
  fishBodyWaveOffsetAt,
  fishFlexEnvelopeAt,
  JS_EEL_SWIM_VISUAL_PROFILE,
  K8S_LEVIATHAN_SWIM_VISUAL_PROFILE,
  RUST_BILLFISH_SWIM_VISUAL_PROFILE,
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

test('JS eel carries one continuous wave from head to tail', () => {
  const profile = JS_EEL_SWIM_VISUAL_PROFILE;
  assert.equal(fishFlexEnvelopeAt(-1.8, profile), 0, 'the mouth stays a readable anchor');
  assert.ok(fishFlexEnvelopeAt(-1.2, profile) > 0, 'the eel begins bending before mid-body');
  assert.ok(fishFlexEnvelopeAt(2.2, profile) > .8, 'the tapering tail receives the largest displacement');
  assert.ok(profile.bendGain > STANDARD_FISH_SWIM_VISUAL_PROFILE.bendGain);
});

test('Rust striped marlin keeps its bill/head steady and gives the tail a stronger traveling wave', () => {
  const profile = RUST_BILLFISH_SWIM_VISUAL_PROFILE;
  assert.equal(fishFlexEnvelopeAt(-.9, profile), 0, 'the long bill and head stay a stable anchor');
  assert.ok(fishFlexEnvelopeAt(.72, profile) > .2, 'the rear trunk begins driving the tail');
  assert.ok(fishFlexEnvelopeAt(1.76, profile) > .99, 'the caudal peduncle reaches full flex');
  assert.ok(profile.bendGain > .4, 'the rear-body wave must remain legible at fight distance');
  assert.ok(profile.bendGain < STANDARD_FISH_SWIM_VISUAL_PROFILE.bendGain, 'the marlin remains streamlined rather than eel-like');
});
