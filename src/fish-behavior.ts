import type { FishSpeciesId } from "./fish-species.js";
import type { FishGait } from "./fish-contract.js";

export type FishFightMode = "rest" | "surge" | "warning" | "split";
export type FishAttackManeuver = "cut" | "headshake" | "dart" | "leap" | "coil";
export type FishAttackManeuverState = Readonly<{
  kind: FishAttackManeuver;
  /** Normalized time through this maneuver. */
  progress: number;
  /** Deterministic preferred side, so all displays reproduce the same move. */
  side: -1 | 1;
}>;

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
  /** Wider side-run while the player reels through a recovery window. */
  reelingLateralAmplitude?: number;
  /** Faster, still bounded steering sweep while resisting an active reel. */
  reelingSteeringRate?: number;
  lateralLimit: number;
  /** Large species need a slower turn response than their line pressure. */
  lateralAcceleration?: number;
  turnRate?: number;
  /** How quickly line speed follows the requested retreat/reel speed. */
  lineResponse?: number;
  /** Small propulsion pulse coupled to the server-owned body-wave phase. */
  strokePush?: number;
  /** Optional species-specific gait while the player reels during recovery. */
  escapeGait?: FishGait;
  fatigueRate?: number;
  staminaRecovery?: number;
  /** How quickly the fish changes depth during a heavy turn. */
  depthResponse?: number;
  restEffort: number;
  reelingEffort: number;
  openingEffort: number;
  gaitAt: (context: { mode: FishFightMode; opening: boolean; reeling: boolean }) => FishGait;
  modeAt: (fightTime: number, finale: number) => { mode: FishFightMode; school: number };
  /** Server-clocked attack shape layered over the existing fight phase. */
  maneuverAt?: (fightTime: number, mode: FishFightMode, finale: number) => FishAttackManeuverState | null;
};

const maneuverWindow = (
  fightTime: number,
  start: number,
  duration: number,
  kind: FishAttackManeuver,
  side: -1 | 1,
): FishAttackManeuverState | null => fightTime >= start && fightTime < start + duration
  ? { kind, progress: (fightTime - start) / duration, side }
  : null;

const standardFightGait = ({ mode, opening, reeling }: { mode: FishFightMode; opening: boolean; reeling: boolean }): FishGait => {
  if (opening) return "burst";
  if (mode === "surge" || mode === "split") return "burst";
  if (mode === "warning") return "turn";
  return reeling ? "turn" : "coast";
};

const goFishFightGait = ({ mode, opening, reeling }: { mode: FishFightMode; opening: boolean; reeling: boolean }): FishGait => {
  if (opening || mode === "surge" || mode === "split") return "burst";
  if (mode === "warning") return "turn";
  return reeling ? "go_reel_resist" : "coast";
};

const rustBillfishGait = ({ mode, opening, reeling }: { mode: FishFightMode; opening: boolean; reeling: boolean }): FishGait => {
  if (opening || mode === "surge") return "billfish_burst";
  if (mode === "warning" || reeling) return "turn";
  // Keep the marlin moving through its recovery window. `coast` makes its
  // rear-body wave too small to read at fight distance, despite non-zero effort.
  return "cruise";
};

const RUST_BILLFISH_OPENING_SECONDS = .95;
const RUST_BILLFISH_REPEAT_SURGE_START = 3.25;
const RUST_BILLFISH_SURGE_PERIOD = 4.25;
const RUST_BILLFISH_SURGE_DURATION = 1.0;

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

const goManeuverAt = (fightTime: number, mode: FishFightMode, finale: number): FishAttackManeuverState | null => {
  if (mode !== "split") return null;
  if (finale >= .8 && finale < 2.6) {
    // The near-catch version is a short head shake aimed at unloading the line.
    return { kind: "headshake", progress: (finale - .8) / 1.8, side: 1 };
  }
  return maneuverWindow(fightTime, 5.9, 2.7, "cut", -1);
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

const dockerWhaleManeuverAt = (fightTime: number, mode: FishFightMode): FishAttackManeuverState | null =>
  mode === "surge" && fightTime >= 3.2
    ? maneuverWindow(fightTime, 3.2, 1.2, "headshake", 1)
    : null;

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

const cssFishManeuverAt = (fightTime: number, mode: FishFightMode): FishAttackManeuverState | null => {
  if (mode !== "surge" || fightTime < 2.8) return null;
  const pulse = (fightTime - 2.8) % 5.8;
  const pulseNumber = Math.floor((fightTime - 2.8) / 5.8);
  return maneuverWindow(pulse, 0, 1.15, "dart", pulseNumber % 2 === 0 ? -1 : 1);
};

const rustMarlinModeAt = (fightTime: number, finale: number): { mode: FishFightMode; school: number } => {
  // The opening is followed by a real recovery window before the marlin
  // commits to another full-speed run. Later attacks remain server-clocked.
  const afterFirstRepeat = fightTime - RUST_BILLFISH_REPEAT_SURGE_START;
  const pulse = fightTime < RUST_BILLFISH_OPENING_SECONDS
    || (afterFirstRepeat >= 0 && afterFirstRepeat % RUST_BILLFISH_SURGE_PERIOD < RUST_BILLFISH_SURGE_DURATION);
  if (finale >= 0 && finale < .75) return { mode: "warning", school: 1 };
  return { mode: pulse ? "surge" : "rest", school: 1 };
};

const rustMarlinManeuverAt = (fightTime: number, mode: FishFightMode): FishAttackManeuverState | null => {
  if (mode !== "surge" || fightTime < RUST_BILLFISH_REPEAT_SURGE_START) return null;
  const pulse = (fightTime - RUST_BILLFISH_REPEAT_SURGE_START) % RUST_BILLFISH_SURGE_PERIOD;
  const pulseNumber = Math.floor((fightTime - RUST_BILLFISH_REPEAT_SURGE_START) / RUST_BILLFISH_SURGE_PERIOD);
  return maneuverWindow(pulse, 0, RUST_BILLFISH_SURGE_DURATION,
    pulseNumber % 2 === 0 ? "leap" : "cut", pulseNumber % 2 === 0 ? 1 : -1);
};

const jsEelModeAt = (fightTime: number, finale: number): { mode: FishFightMode; school: number } => {
  // The eel never becomes a rigid stop/start fish: a short acceleration is
  // followed by readable coasting windows, while the body wave keeps running.
  const pulse = fightTime < .9 || (fightTime - .9) % 4.8 < .62;
  if (finale >= 0 && finale < .7) return { mode: "warning", school: 1 };
  return { mode: pulse ? "surge" : "rest", school: 1 };
};

const jsEelManeuverAt = (fightTime: number, mode: FishFightMode): FishAttackManeuverState | null => {
  if (mode !== "surge" || fightTime < .9) return null;
  const pulse = (fightTime - .9) % 4.8;
  const pulseNumber = Math.floor((fightTime - .9) / 4.8);
  return maneuverWindow(pulse, 0, .62, "coil", pulseNumber % 2 === 0 ? -1 : 1);
};

const GO_FISH_PROFILE: FishFightProfile = {
  initialTension: .34,
  openingSeconds: 1.3,
  openingPressure: .24,
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
  surgeLateralAmplitude: 1.9,
  reelingLateralAmplitude: 1.9,
  reelingSteeringRate: 1.05,
  lateralLimit: 2.5,
  restEffort: .22,
  reelingEffort: .58,
  openingEffort: .95,
  // Each tail beat slightly delays line recovery, so Go still pushes back as
  // the player makes progress toward landing it.
  strokePush: .72,
  escapeGait: "hooked_burst",
  fatigueRate: .12,
  staminaRecovery: .018,
  gaitAt: goFishFightGait,
  modeAt: goModeAt,
  maneuverAt: goManeuverAt,
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
  maneuverAt: dockerWhaleManeuverAt,
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
  maneuverAt: cssFishManeuverAt,
};

const RUST_BILLFISH_PROFILE: FishFightProfile = {
  // Rust's fish is fast but not heavy: the danger comes from a clean, sharp
  // run that takes line before the player can settle into the reel rhythm.
  initialTension: .40,
  openingSeconds: RUST_BILLFISH_OPENING_SECONDS,
  openingPressure: .28,
  basePressure: .055,
  minimumReelingTension: .085,
  reelingLoad: .12,
  releaseRecovery: .28,
  openingRetreatSpeed: 4.6,
  baseRetreatSpeed: .30,
  openingReelSpeed: .9,
  baseReelSpeed: 3.7,
  surgePressure: .27,
  surgeRetreatSpeed: 3.9,
  surgeReelSpeed: 1.1,
  surgeEffort: 1,
  openingLateralAmplitude: 1.3,
  baseLateralAmplitude: .8,
  surgeLateralAmplitude: 1.85,
  lateralLimit: 2.1,
  lateralAcceleration: 4.2,
  turnRate: 1.85,
  lineResponse: 6.0,
  strokePush: .65,
  fatigueRate: .18,
  staminaRecovery: .024,
  depthResponse: 1.35,
  restEffort: .32,
  reelingEffort: .74,
  openingEffort: .98,
  gaitAt: rustBillfishGait,
  modeAt: rustMarlinModeAt,
  maneuverAt: rustMarlinManeuverAt,
};

const JS_EEL_PROFILE: FishFightProfile = {
  initialTension: .32,
  openingSeconds: .9,
  openingPressure: .19,
  basePressure: .045,
  minimumReelingTension: .07,
  reelingLoad: .09,
  releaseRecovery: .3,
  openingRetreatSpeed: 2.15,
  baseRetreatSpeed: .2,
  openingReelSpeed: 1.2,
  baseReelSpeed: 3.35,
  surgePressure: .22,
  surgeRetreatSpeed: 1.05,
  surgeReelSpeed: 1.0,
  surgeEffort: .82,
  canReelDuringSurge: true,
  openingLateralAmplitude: 1.65,
  baseLateralAmplitude: 1.0,
  surgeLateralAmplitude: 1.2,
  lateralLimit: 2.0,
  lateralAcceleration: 2.2,
  turnRate: 1.15,
  lineResponse: 2.8,
  strokePush: .2,
  fatigueRate: .2,
  staminaRecovery: .026,
  depthResponse: .8,
  restEffort: .3,
  reelingEffort: .58,
  openingEffort: .9,
  gaitAt: standardFightGait,
  modeAt: jsEelModeAt,
  maneuverAt: jsEelManeuverAt,
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
  // Give each cluster attack a readable tell: gather, commit, split/breach,
  // then leave a real recovery window. The opening establishes the threat
  // before the first run; the near-catch finale gets one last attack beat.
  if (finale >= 0) {
    if (finale < .8) return { mode: "warning", school: 1 };
    if (finale < 2.2) return { mode: "split", school: 1 };
    return { mode: "rest", school: 1 };
  }
  if (fightTime < .75) return { mode: "warning", school: 1 };
  if (fightTime < 1.65) return { mode: "surge", school: 1 };
  const pulse = k8sPulseAt(fightTime);
  const mode: FishFightMode = pulse < .35
    ? "surge"
    : pulse < K8S_LUNGE_START
      ? "warning"
      : pulse < K8S_LUNGE_END
        ? "split"
        : "rest";
  return { mode, school: 1 };
};

const K8S_LEVIATHAN_PROFILE: FishFightProfile = {
  initialTension: .55,
  openingSeconds: .75,
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
  "rust-001": RUST_BILLFISH_PROFILE,
  "js-001": JS_EEL_PROFILE,
};

export const getFishFightProfile = (fishId: FishSpeciesId): FishFightProfile => FISH_FIGHT_PROFILES[fishId];
