import assert from "node:assert/strict";
import test from "node:test";
import { clampAudioGain, getDragPulseInterval, getFishAudioTuning, getTensionSoundLevel } from "./audio/fishing-audio.js";

test("audio gain is finite and capped before voices are mixed", () => {
  assert.equal(clampAudioGain(Number.POSITIVE_INFINITY), 0);
  assert.equal(clampAudioGain(-1), 0);
  assert.equal(clampAudioGain(.03), .045);
  assert.equal(clampAudioGain(.5), .11);
  assert.equal(clampAudioGain(.08, .05), .05);
});

test("fish audio tuning separates light and heavy resistance", () => {
  const go = getFishAudioTuning("fish-001");
  const css = getFishAudioTuning("css-001");
  const whale = getFishAudioTuning("whale-001");
  const leviathan = getFishAudioTuning("k8s-001");
  assert.ok(whale.strainGain > go.strainGain);
  assert.ok(go.strainGain > css.strainGain);
  assert.ok(css.reelFrequency > go.reelFrequency);
  assert.ok(whale.reelFrequency < go.reelFrequency);
  assert.ok(leviathan.strainGain > whale.strainGain);
  assert.ok(leviathan.reelFrequency < whale.reelFrequency);
});

test("drag sound stays quiet below strain and becomes more urgent with tension", () => {
  assert.equal(getTensionSoundLevel(.3), 0);
  assert.equal(getTensionSoundLevel(.92), 1);
  assert.ok(getTensionSoundLevel(.72) > getTensionSoundLevel(.48));
  assert.equal(getTensionSoundLevel(Number.NaN), 0);
});

test("drag ratchet cadence speeds up as tension rises", () => {
  assert.equal(getDragPulseInterval(0), 220);
  assert.equal(getDragPulseInterval(1), 88);
  assert.ok(getDragPulseInterval(.8) < getDragPulseInterval(.2));
  assert.equal(getDragPulseInterval(Number.POSITIVE_INFINITY), 220);
});
