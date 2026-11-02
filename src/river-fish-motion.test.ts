import assert from "node:assert/strict";
import { test } from "node:test";
import { getFishFightProfile } from "./fish-behavior.js";
import { OceanFishingGame } from "./ocean-game.js";
import {
  RIVER_FISH_MOVEMENT_PROFILES,
  type RiverFishId,
} from "./river-fish-motion.js";

const RIVER_FISH_IDS = Object.keys(RIVER_FISH_MOVEMENT_PROFILES) as RiverFishId[];
const SAMPLE_TIMES = [0, .22, .78, 1.6, 2.3, 3.8, 5.1, 7.5, 10.7, 15.3];

function movementSignature(fishId: RiverFishId): string {
  const profile = RIVER_FISH_MOVEMENT_PROFILES[fishId];
  return SAMPLE_TIMES.map(fightTime => {
    const mode = profile.modeAt(fightTime, -1).mode;
    const cue = profile.cueAt({
      fightTime,
      encounter: 4,
      opening: fightTime < profile.openingSeconds,
      reeling: false,
      mode,
    });
    assert.ok(Number.isFinite(cue.lateralTarget));
    assert.ok(Number.isFinite(cue.depthTarget));
    assert.ok(cue.depthTarget < 0);
    assert.deepEqual(profile.cueAt({
      fightTime,
      encounter: 4,
      opening: fightTime < profile.openingSeconds,
      reeling: false,
      mode,
    }), cue, `${fishId} movement must be deterministic`);
    return `${cue.gait}:${cue.lateralTarget.toFixed(4)}:${cue.depthTarget.toFixed(4)}`;
  }).join("|");
}

test("all ten river fish have deterministic, visibly distinct movement paths", () => {
  assert.equal(RIVER_FISH_IDS.length, 10);
  const signatures = RIVER_FISH_IDS.map(movementSignature);
  assert.equal(new Set(signatures).size, RIVER_FISH_IDS.length);
});

test("river fish use individual fight rhythms and maneuvers without spawning schools", () => {
  const signatures = RIVER_FISH_IDS.map(fishId => {
    const profile = RIVER_FISH_MOVEMENT_PROFILES[fishId];
    let surgeFrames = 0;
    let totalFrames = 0;
    const phases: string[] = [];
    for (let frame = 0; frame <= 800; frame++) {
      const fightTime = 20 + frame * .05;
      const { mode, school } = profile.modeAt(fightTime, -1);
      assert.equal(school, 1, `${fishId} remains a single river fish`);
      totalFrames++;
      if (mode === "surge") surgeFrames++;
      const maneuver = profile.maneuverAt(fightTime, mode, -1);
      if (maneuver) {
        assert.notEqual(maneuver.kind, "cut", `${fishId} does not borrow Go's line-cut move`);
        assert.ok(maneuver.progress >= 0 && maneuver.progress <= 1);
      }
      phases.push(`${mode}/${maneuver?.kind ?? "-"}`);
    }
    const repeatedSurgeShare = surgeFrames / totalFrames;
    assert.ok(
      repeatedSurgeShare >= .18 && repeatedSurgeShare <= .24,
      `${fishId} repeated surge share should stay near the common difficulty range: ${repeatedSurgeShare}`,
    );
    return phases.join("|");
  });
  assert.equal(new Set(signatures).size, RIVER_FISH_IDS.length);

  const goProfile = getFishFightProfile("fish-001");
  assert.equal(goProfile.movementAt, undefined, "the river motion layer must not leak into sea Go");
});

test("river swimming keeps Go's line-load and fatigue coefficients", () => {
  const go = getFishFightProfile("fish-001");
  const sharedCoefficients = [
    "initialTension",
    "openingPressure",
    "basePressure",
    "minimumReelingTension",
    "reelingLoad",
    "releaseRecovery",
    "openingRetreatSpeed",
    "baseRetreatSpeed",
    "openingReelSpeed",
    "baseReelSpeed",
    "warningPressure",
    "warningRetreatSpeed",
    "warningReelSpeed",
    "surgePressure",
    "surgeRetreatSpeed",
    "surgeReelSpeed",
    "fatigueRate",
    "staminaRecovery",
  ] as const;
  for (const fishId of RIVER_FISH_IDS) {
    const profile = getFishFightProfile(fishId);
    for (const key of sharedCoefficients) {
      assert.equal(profile[key], go[key], `${fishId} keeps shared ${key}`);
    }
  }
});

test("the authoritative river battle applies its own surge schedule and gait", () => {
  const fishId: RiverFishId = "river-kawamutsu";
  const game = new OceanFishingGame(() => .5, fishId, "fixed", "river");
  let now = 1_000;
  const step = (reeling = false) => {
    now += 50;
    game.step(.05, reeling, now);
  };

  assert.equal(game.action({ action: "cast", strength: .5, aim: 0 }, now), true);
  for (let frame = 0; frame < 200 && game.state.phase !== "biting"; frame++) step();
  assert.equal(game.state.phase, "biting");
  assert.equal(game.action({ action: "hook" }, now), true);

  const currentPhase = () => game.snapshot().phase;
  const profile = getFishFightProfile(fishId);
  let sawRest = false;
  let sawScheduledSurge = false;
  for (let frame = 0; frame < 90 && currentPhase() === "fighting"; frame++) {
    step();
    const expected = profile.modeAt(game.state.fightTime, -1);
    assert.equal(game.state.mode, expected.mode);
    assert.equal(game.state.school, 1);
    sawRest ||= expected.mode === "rest";
    if (expected.mode === "surge") {
      sawScheduledSurge = true;
      assert.equal(game.state.fish.gait, "burst");
    }
  }
  assert.ok(sawRest);
  assert.ok(sawScheduledSurge);
});
