import type { FishSpeciesId } from "../fish-species.js";

export type RodFlexProfile = {
  /** Visual bend amount at full presentation load. */
  bendGain: number;
  /** Response while a fish is adding load. */
  loadingResponse: number;
  /** Response while the blank is unloading. */
  recoveryResponse: number;
  /** Horizontal response to the actual line direction. */
  directionInfluence: number;
  /** Vertical response to a fish pulling below the rod tip. */
  verticalInfluence: number;
  /** How far the terminal tangent follows the line instead of the chord. */
  tipDirectionBlend: number;
};

export const STANDARD_ROD_FLEX_PROFILE: RodFlexProfile = {
  bendGain: .44,
  loadingResponse: 10,
  recoveryResponse: 10,
  directionInfluence: .08,
  verticalInfluence: .055,
  tipDirectionBlend: .34,
};

/**
 * A whale loads the belly earlier and unloads slowly. The values deliberately
 * change the distribution of curvature, not the game's authoritative tension.
 */
export const DOCKER_ROD_FLEX_PROFILE: RodFlexProfile = {
  bendGain: .49,
  loadingResponse: 3.8,
  recoveryResponse: 2.4,
  directionInfluence: .24,
  verticalInfluence: .16,
  tipDirectionBlend: .64,
};

export const K8S_ROD_FLEX_PROFILE: RodFlexProfile = {
  ...DOCKER_ROD_FLEX_PROFILE,
  bendGain: .53,
  loadingResponse: 4.4,
  recoveryResponse: 2.9,
  directionInfluence: .22,
  verticalInfluence: .14,
  tipDirectionBlend: .59,
};

/** CSS fish is visibly light, so its rod follows the line without loading the
 * blank as deeply as Go. Keeping this profile here prevents species checks from
 * leaking into the scene's centerline construction. */
export const CSS_ROD_FLEX_PROFILE: RodFlexProfile = {
  bendGain: .30,
  loadingResponse: 9,
  recoveryResponse: 8,
  directionInfluence: .12,
  verticalInfluence: .08,
  tipDirectionBlend: .42,
};

export const rodFlexProfileFor = (fishId: FishSpeciesId): RodFlexProfile =>
  fishId === "whale-001"
    ? DOCKER_ROD_FLEX_PROFILE
    : fishId === "k8s-001"
      ? K8S_ROD_FLEX_PROFILE
    : fishId === "css-001"
      ? CSS_ROD_FLEX_PROFILE
      : STANDARD_ROD_FLEX_PROFILE;

const clamp01 = (value: number): number => Math.max(0, Math.min(1, value));
type RodPoint = { x: number; y: number; z: number };

const addScaled = (origin: RodPoint, direction: RodPoint, scale: number): RodPoint => ({
  x: origin.x + direction.x * scale,
  y: origin.y + direction.y * scale,
  z: origin.z + direction.z * scale,
});

const subtract = (a: RodPoint, b: RodPoint): RodPoint => ({
  x: a.x - b.x,
  y: a.y - b.y,
  z: a.z - b.z,
});

const dot = (a: RodPoint, b: RodPoint): number => a.x * b.x + a.y * b.y + a.z * b.z;

const length = (value: RodPoint): number => Math.hypot(value.x, value.y, value.z);

const normalize = (value: RodPoint, fallback: RodPoint): RodPoint => {
  const magnitude = length(value);
  return magnitude > .0001
    ? { x: value.x / magnitude, y: value.y / magnitude, z: value.z / magnitude }
    : fallback;
};

const lerpPoint = (from: RodPoint, to: RodPoint, amount: number): RodPoint => ({
  x: from.x + (to.x - from.x) * amount,
  y: from.y + (to.y - from.y) * amount,
  z: from.z + (to.z - from.z) * amount,
});

const cubicBezier = (p0: RodPoint, p1: RodPoint, p2: RodPoint, p3: RodPoint, progress: number): RodPoint => {
  const p = clamp01(progress),oneMinus=1-p;
  return {
    x: oneMinus**3*p0.x+3*oneMinus**2*p*p1.x+3*oneMinus*p*p*p2.x+p**3*p3.x,
    y: oneMinus**3*p0.y+3*oneMinus**2*p*p1.y+3*oneMinus*p*p*p2.y+p**3*p3.y,
    z: oneMinus**3*p0.z+3*oneMinus**2*p*p1.z+3*oneMinus*p*p*p2.z+p**3*p3.z,
  };
};

/**
 * Build one point on a loaded blank using a continuous cubic centerline.
 *
 * The old implementation added a downward hump to a straight chord. That made
 * the tip straighten abruptly and ignored the direction of the line. The new
 * curve keeps both anchors fixed, gives the tip a line-facing tangent, and
 * applies one bounded bend amount. This is presentation-only; the server still
 * owns tension and catch decisions.
 */
export const rodCenterAt = (
  progress: number,
  butt: RodPoint,
  tip: RodPoint,
  lineDirection: RodPoint | null,
  load: number,
  profile: RodFlexProfile,
): RodPoint => {
  const chord=subtract(tip,butt),chordLength=length(chord),chordDirection=normalize(chord,{x:0,y:0,z:1});
  const pullDirection=normalize(lineDirection||chordDirection,chordDirection);
  const projectedPull={
    x:pullDirection.x-chordDirection.x*dot(pullDirection,chordDirection),
    y:pullDirection.y-chordDirection.y*dot(pullDirection,chordDirection),
    z:pullDirection.z-chordDirection.z*dot(pullDirection,chordDirection),
  };
  const pullSide=normalize(projectedPull,{x:0,y:-1,z:0});
  const visualSag={x:0,y:-1,z:0};
  const bendDirection=normalize({
    x:visualSag.x*.42+pullSide.x*.58,
    y:visualSag.y*.42+pullSide.y*.58,
    z:visualSag.z*.42+pullSide.z*.58,
  },visualSag);
  const amount=clamp01(load)*profile.bendGain;
  const tipTangent=normalize(lerpPoint(chordDirection,pullDirection,clamp01(load)*profile.tipDirectionBlend),chordDirection);
  const controlOne=addScaled(addScaled(butt,chordDirection,chordLength*.32),bendDirection,amount*.18);
  const controlTwo=addScaled(addScaled(tip,tipTangent,-chordLength*.28),bendDirection,amount*.92);
  return cubicBezier(butt,controlOne,controlTwo,tip,progress);
};

/** Ease the rod's visual load without changing authoritative game tension. */
export function smoothRodLoad(current: number, target: number, dt: number, response = 10): number {
  if (dt <= 0 || response <= 0) return current;
  const amount = 1 - Math.exp(-response * dt);
  return current + (target - current) * amount;
}
