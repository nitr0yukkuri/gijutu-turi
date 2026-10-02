import type { FishSpeciesId } from "./fish-species.js";
import type { FishGait } from "./fish-contract.js";

export type FishFightMode = "rest" | "surge" | "warning" | "split";

export type FishFightProfile = {
  initialTension: number;
  openingSeconds: number;
  openingPressure: number;
  basePressure: number;
  /** Minimum line load while the player actively reels. */
  minimumReelingTension: number;
  reelingLoad: number;
  releaseRecovery: number;
  openingRetreatSpeed: number;
  baseRetreatSpeed: number;
  openingReelSpeed: number;
  baseReelSpeed: number;
  warningPressure?: number;
  warningRetreatSpeed?: number;
  warningReelSpeed?: number;
  warningEffort?: number;
  surgePressure?: number;
  surgeRetreatSpeed?: number;
  surgeReelSpeed?: number;
  surgeEffort?: number;
  /** Some small fish remain reelable during a short resistance burst. */
  canReelDuringSurge?: boolean;
  openingLateralAmplitude: number;
  baseLateralAmplitude: number;
  /** Optional lateral escape amplitude for a species' resistance burst. */
  surgeLateralAmplitude?: number;
  lateralLimit: number;
  /** Large species need a slower turn response than their line pressure. */
  lateralAcceleration?: number;
  turnRate?: number;
  /** How quickly line speed follows the requested retreat/reel speed. */
  lineResponse?: number;
  /** Small propulsion pulse coupled to the server-owned body-wave phase. */
  strokePush?: number;
  fatigueRate?: number;
  staminaRecovery?: number;
  /** How quickly the fish changes depth during a heavy turn. */
  depthResponse?: number;
  restEffort: number;
  reelingEffort: number;
  openingEffort: number;
  gaitAt: (context: { mode: FishFightMode; opening: boolean; reeling: boolean }) => FishGait;
  modeAt: (fightTime: number, finale: number) => { mode: FishFightMode; school: number };
};

const standardFightGait = ({ mode, opening, reeling }: { mode: FishFightMode; opening: boolean; reeling: boolean }): FishGait => {
  if (opening) return "burst";
  if (mode === "surge" || mode === "split") return "burst";
  if (mode === "warning") return "turn";
  return reeling ? "turn" : "coast";
};

const cssFishGait = ({ mode, opening, reeling }: { mode: FishFightMode; opening: boolean; reeling: boolean }): FishGait => {
  if (opening || mode === "surge" || mode === "split") return "burst";
  return reeling ? "turn" : "css_cruise";
};

const heavyFishGait = ({ mode, opening }: { mode: FishFightMode; opening: boolean; reeling: boolean }): FishGait => {
  if (opening) return "heavy_start";
  if (mode === "surge") return "heavy_surge";
  return mode === "split" ? "heavy_lunge" : "heavy_glide";
};

const goModeAt = (fightTime: number, finale: number): { mode: FishFightMode; school: number } => {
  let mode: FishFightMode = fightTime < 1.3 ? "surge" : fightTime < 5 ? "rest" : fightTime < 5.9 ? "warning" : fightTime < 8.6 ? "split" : (fightTime - 8.6) % 6.2 < 1.4 ? "surge" : "rest";
  if (finale >= 0 && finale < .8) mode = "warning";
  else if (finale >= .8 && finale < 2.6) mode = "split";
  return { mode, school: mode === "split" ? 7 : 1 };
};

const dockerWhaleModeAt = (fightTime: number, finale: number): { mode: FishFightMode; school: number } => {
  // Docker gets one readable heavy burst after its opening glide. It remains
  // one animal: no Go-like school split, but the body, line pressure, and rod
  // load all surge together for a short, memorable struggle.
  const midFightSurge = fightTime >= 3.2 && fightTime < 4.4;
  const mode: FishFightMode = fightTime < .85 || midFightSurge ? "surge" : "rest";
  if (finale >= 0 && finale < .8) return { mode: "warning", school: 1 };
  return { mode, school: 1 };
};

const cssFishModeAt = (fightTime: number, finale: number): { mode: FishFightMode; school: number } => {
  // CSS changes appearance in response to the same state transitions, but its
  // physical behavior stays readable: one opening burst, a short mid-fight
  // resistance pulse, then a continuously swimming recoverable lull. It gets
  // the emotional red moment of Go without inheriting Go's school split.
  const midFightSurge = fightTime >= 2.8 && (fightTime - 2.8) % 5.8 < 1.15;
  const mode: FishFightMode = fightTime < 1.35
    ? "surge"
    : finale >= 0 && finale < .8
      ? "warning"
      : midFightSurge
        ? "surge"
        : "rest";
  return { mode, school: 1 };
};

const GO_FISH_PROFILE: FishFightProfile = {
  initialTension: .34,
  openingSeconds: 1.3,
  openingPressure: .28,
  basePressure: .035,
  minimumReelingTension: .065,
  reelingLoad: .14,
  releaseRecovery: .24,
  openingRetreatSpeed: 2.6,
  baseRetreatSpeed: .22,
  openingReelSpeed: 1.55,
  baseReelSpeed: 3.5,
  // Go's warning and split phases must change the line, not just the color.
  // The warning is a readable turn; the later attack still takes line while
  // the player is reeling, leaving the following rest as the recovery window.
  warningPressure: .3,
  warningRetreatSpeed: .55,
  warningReelSpeed: 1.25,
  warningEffort: .48,
  surgePressure: .36,
  surgeRetreatSpeed: 1.35,
  surgeReelSpeed: .85,
  surgeEffort: .88,
  openingLateralAmplitude: 2.4,
  baseLateralAmplitude: 1.25,
  lateralLimit: 2.5,
  restEffort: .22,
  reelingEffort: .58,
  openingEffort: .95,
  fatigueRate: .12,
  staminaRecovery: .018,
  gaitAt: standardFightGait,
  modeAt: goModeAt,
};

const DOCKER_WHALE_PROFILE: FishFightProfile = {
  // Docker should feel heavy from the first frame and continue to load the
  // line while the player reels, but its pressure must still be recoverable.
  initialTension: .62,
  // The opening pull is short and deliberate: holding the reel here should
  // be dangerous, while releasing it gives the player a clear response.
  openingSeconds: .85,
  openingPressure: .34,
  basePressure: .1,
  minimumReelingTension: .12,
  reelingLoad: .12,
  releaseRecovery: .22,
  openingRetreatSpeed: 2.15,
  baseRetreatSpeed: .28,
  openingReelSpeed: .45,
  baseReelSpeed: 2.8,
  openingLateralAmplitude: .65,
  baseLateralAmplitude: .32,
  lateralLimit: 1.2,
  lateralAcceleration: .92,
  turnRate: .72,
  lineResponse: 1.7,
  strokePush: .16,
  depthResponse: .58,
  restEffort: .42,
  reelingEffort: .56,
  openingEffort: .88,
  fatigueRate: .1,
  staminaRecovery: .014,
  surgePressure: .24,
  surgeRetreatSpeed: .85,
  surgeReelSpeed: .7,
  surgeEffort: 1,
  gaitAt: heavyFishGait,
  modeAt: dockerWhaleModeAt,
};

const CSS_FISH_PROFILE: FishFightProfile = {
  // CSS fish is the approachable species: it still resists, but should not
  // demand the same timing precision as Go or the Docker whale.
  initialTension: .30,
  openingSeconds: 1.35,
  openingPressure: .16,
  // CSS fish is small, not inert. Its normal cruise keeps a weak continuous
  // pull so the rod and line never become visually slack between red bursts.
  // A small baseline pull keeps the CSS fish readable, but releasing the reel
  // can still slacken the line completely and trigger the shared slack rule.
  basePressure: .08,
  minimumReelingTension: .12,
  reelingLoad: .08,
  releaseRecovery: .32,
  openingRetreatSpeed: 1.65,
  baseRetreatSpeed: .25,
  openingReelSpeed: 1.35,
  baseReelSpeed: 3.2,
  // The red state must also be a physical resistance state. It remains below
  // Go's burst, but takes a little line even while the player keeps reeling.
  // The red burst is a little stronger than the baseline, while remaining
  // recoverable for a small fish.
  surgePressure: .22,
  surgeRetreatSpeed: .88,
  surgeReelSpeed: 1.0,
  surgeEffort: .84,
  canReelDuringSurge: true,
  openingLateralAmplitude: 1.15,
  baseLateralAmplitude: .6,
  surgeLateralAmplitude: .75,
  lateralLimit: 1.5,
  restEffort: .4,
  reelingEffort: .6,
  openingEffort: .88,
  fatigueRate: .24,
  staminaRecovery: .03,
  gaitAt: cssFishGait,
  modeAt: cssFishModeAt,
};

const K8S_PULSE_PERIOD = 7.2;
const K8S_PULSE_OFFSET = 2.4;
const K8S_LUNGE_START = .95;
const K8S_LUNGE_END = 2.35;
const k8sPulseAt = (fightTime: number): number =>
  ((fightTime - K8S_PULSE_OFFSET) % K8S_PULSE_PERIOD + K8S_PULSE_PERIOD) % K8S_PULSE_PERIOD;

/** One server-clocked breach arc shared by fish depth and surface cues. */
export function k8sSurfaceLungeProgress(fightTime: number): number {
  if (!Number.isFinite(fightTime) || fightTime < 0) return 0;
  const pulse = k8sPulseAt(fightTime);
  if (pulse < K8S_LUNGE_START || pulse >= K8S_LUNGE_END) return 0;
  const progress = (pulse - K8S_LUNGE_START) / (K8S_LUNGE_END - K8S_LUNGE_START);
  const arch = Math.sin(Math.PI * progress);
  return arch * arch;
}

const k8sModeAt = (fightTime: number, finale: number): { mode: FishFightMode; school: number } => {
  // Follow the opening with a readable split beat, then repeat the cycle so
  // the fight does not sit in the same low-energy state for too long.
  if (finale >= 0 && finale < .9) return { mode: "warning", school: 1 };
  if (fightTime < .95) return { mode: "surge", school: 1 };
  const pulse = k8sPulseAt(fightTime);
  const mode: FishFightMode = pulse < K8S_LUNGE_START ? "surge" : pulse < K8S_LUNGE_END ? "split" : "rest";
  return { mode, school: 1 };
};

const K8S_LEVIATHAN_PROFILE: FishFightProfile = {
  initialTension: .55,
  openingSeconds: .95,
  openingPressure: .3,
  basePressure: .075,
  minimumReelingTension: .1,
  reelingLoad: .095,
  releaseRecovery: .27,
  openingRetreatSpeed: 2.25,
  baseRetreatSpeed: .2,
  openingReelSpeed: .55,
  baseReelSpeed: 2.65,
  openingLateralAmplitude: .8,
  baseLateralAmplitude: .45,
  surgePressure: .26,
  surgeRetreatSpeed: .95,
  surgeReelSpeed: .62,
  surgeEffort: .96,
  surgeLateralAmplitude: .82,
  lateralLimit: 1.5,
  lateralAcceleration: 1.2,
  turnRate: .96,
  lineResponse: 1.55,
  strokePush: .26,
  depthResponse: .62,
  restEffort: .38,
  reelingEffort: .58,
  openingEffort: .94,
  fatigueRate: .14,
  staminaRecovery: .02,
  gaitAt: heavyFishGait,
  modeAt: k8sModeAt,
};

const FISH_FIGHT_PROFILES: Readonly<Record<FishSpeciesId, FishFightProfile>> = {
  "fish-001": GO_FISH_PROFILE,
  "whale-001": DOCKER_WHALE_PROFILE,
  "css-001": CSS_FISH_PROFILE,
  "k8s-001": K8S_LEVIATHAN_PROFILE,
};

export const getFishFightProfile = (fishId: FishSpeciesId): FishFightProfile => FISH_FIGHT_PROFILES[fishId];
