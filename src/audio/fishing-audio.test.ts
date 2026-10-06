import { test } from "node:test";
import assert from "node:assert/strict";
import { clampAudioGain, fishSurfaceSoundProfile } from "./fishing-audio.js";
import type { FishSpeciesId } from "../fish-species.js";

const FISH_IDS: FishSpeciesId[] = ["fish-001", "whale-001", "css-001", "k8s-001", "rust-001", "js-001"];

test("surface sound envelopes stay finite, short, and under the one-shot gain ceiling", () => {
  for (const fishId of FISH_IDS) {
    for (const kind of ["first", "breach", "reentry"] as const) {
      const profile = fishSurfaceSoundProfile(fishId, kind, 2.7);
      for (const value of [
        profile.bodyFrequency,
        profile.bodyPeak,
        profile.bodyDuration,
        profile.sprayFrequency,
        profile.sprayPeak,
        profile.sprayDuration,
        profile.sprayDelay,
      ]) assert.ok(Number.isFinite(value) && value > 0, `${fishId}/${kind} has a positive finite parameter`);
      assert.ok(profile.bodyDuration < .6 && profile.sprayDuration < .4, `${fishId}/${kind} remains a brief cue`);
      assert.ok(clampAudioGain(profile.bodyPeak) <= .22);
      assert.ok(clampAudioGain(profile.sprayPeak) <= .22);
    }
  }
});

test("a first breach is more prominent than a reentry, while CSS remains lighter than K8s", () => {
  const k8sFirst = fishSurfaceSoundProfile("k8s-001", "first", 2.1);
  const k8sReentry = fishSurfaceSoundProfile("k8s-001", "reentry", 2.1);
  const cssFirst = fishSurfaceSoundProfile("css-001", "first", 2.1);

  assert.ok(k8sFirst.bodyPeak > k8sReentry.bodyPeak);
  assert.ok(k8sFirst.sprayPeak > k8sReentry.sprayPeak);
  assert.ok(cssFirst.bodyPeak < k8sFirst.bodyPeak);
  assert.equal(cssFirst.introToneFrequency, undefined);
  assert.ok(k8sFirst.introToneFrequency);
});

test("invalid impact strength falls back safely and one-shot gains remain capped", () => {
  assert.deepEqual(
    fishSurfaceSoundProfile("rust-001", "breach", Number.NaN),
    fishSurfaceSoundProfile("rust-001", "breach", 1.5),
  );
  assert.equal(clampAudioGain(Number.POSITIVE_INFINITY), 0);
  assert.equal(clampAudioGain(-10), 0);
  assert.equal(clampAudioGain(100), .22);
});
