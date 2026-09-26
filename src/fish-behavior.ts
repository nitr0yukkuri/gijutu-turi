import type { FishSpeciesId } from "./fish-species.js";

export type FishFightMode = "rest" | "surge" | "warning" | "split";

export type FishFightProfile = {
  initialTension: number;
  openingSeconds: number;
  openingPressure: number;
  basePressure: number;
  reelingLoad: number;
  releaseRecovery: number;
  openingRetreatSpeed: number;
  baseRetreatSpeed: number;
  openingReelSpeed: number;
  baseReelSpeed: number;
  openingLateralAmplitude: number;
  baseLateralAmplitude: number;
  lateralLimit: number;
  restEffort: number;
  reelingEffort: number;
  openingEffort: number;
  modeAt: (fightTime: number, finale: number) => { mode: FishFightMode; school: number };
};

const goModeAt = (fightTime: number, finale: number): { mode: FishFightMode; school: number } => {
  let mode: FishFightMode = fightTime < 1.3 ? "surge" : fightTime < 5 ? "rest" : fightTime < 5.9 ? "warning" : fightTime < 8.6 ? "split" : (fightTime - 8.6) % 6.2 < 1.4 ? "surge" : "rest";
  if (finale >= 0 && finale < .8) mode = "warning";
  else if (finale >= .8 && finale < 2.6) mode = "split";
  return { mode, school: mode === "split" ? 7 : 1 };
};

const dockerWhaleModeAt = (fightTime: number, finale: number): { mode: FishFightMode; school: number } => {
  // Docker is a heavy, steady pull rather than a school of quick bursts.
  // A short warning near the end communicates load without adding another
  // escape burst or making the species impossible to land.
  const mode: FishFightMode = fightTime < 1.8 ? "surge" : finale >= 0 && finale < .8 ? "warning" : "rest";
  return { mode, school: 1 };
};

const GO_FISH_PROFILE: FishFightProfile = {
  initialTension: .34,
  openingSeconds: 1.3,
  openingPressure: .28,
  basePressure: .035,
  reelingLoad: .14,
  releaseRecovery: .24,
  openingRetreatSpeed: 2.6,
  baseRetreatSpeed: .22,
  openingReelSpeed: 1.55,
  baseReelSpeed: 3.5,
  openingLateralAmplitude: 2.4,
  baseLateralAmplitude: 1.25,
  lateralLimit: 2.5,
  restEffort: .22,
  reelingEffort: .58,
  openingEffort: .95,
  modeAt: goModeAt,
};

const DOCKER_WHALE_PROFILE: FishFightProfile = {
  // The whale starts with visible weight, then settles into a controlled pull.
  initialTension: .55,
  openingSeconds: 1.8,
  openingPressure: .28,
  basePressure: .08,
  reelingLoad: .11,
  releaseRecovery: .22,
  openingRetreatSpeed: 1.7,
  baseRetreatSpeed: .1,
  openingReelSpeed: .9,
  baseReelSpeed: 2.9,
  openingLateralAmplitude: .55,
  baseLateralAmplitude: .28,
  lateralLimit: 1.1,
  restEffort: .35,
  reelingEffort: .45,
  openingEffort: .72,
  modeAt: dockerWhaleModeAt,
};

export const getFishFightProfile = (fishId: FishSpeciesId): FishFightProfile =>
  fishId === "whale-001" ? DOCKER_WHALE_PROFILE : GO_FISH_PROFILE;
