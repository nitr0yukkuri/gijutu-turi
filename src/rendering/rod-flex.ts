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
  bendGain: .60,
  loadingResponse: 4.8,
  recoveryResponse: 2.4,
  directionInfluence: .24,
  verticalInfluence: .16,
  tipDirectionBlend: .64,
};

/** A sustained, decaying blank response when Docker begins a heavy run. */
export function dockerWhaleRodKick(age: number): number {
  if (age < 0 || age >= 1.25) return 0;
  return (1 - Math.exp(-age * 24)) * Math.exp(-age * 1.8);
}

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

/** Short, sharp billfish runs load the upper blank quickly, then recover cleanly. */
export const RUST_BILLFISH_ROD_FLEX_PROFILE: RodFlexProfile = {
  bendGain: .42,
  loadingResponse: 8.2,
  recoveryResponse: 7.2,
  directionInfluence: .15,
  verticalInfluence: .09,
  tipDirectionBlend: .48,
};

/** Eel resistance travels through the line as a sustained, elastic load. */
export const JS_EEL_ROD_FLEX_PROFILE: RodFlexProfile = {
  bendGain: .34,
  loadingResponse: 8.8,
  recoveryResponse: 8.1,
  directionInfluence: .13,
  verticalInfluence: .075,
  tipDirectionBlend: .40,
};

export const rodFlexProfileFor = (fishId: FishSpeciesId): RodFlexProfile =>
  fishId === "whale-001"
    ? DOCKER_ROD_FLEX_PROFILE
    : fishId === "k8s-001"
      ? K8S_ROD_FLEX_PROFILE
    : fishId === "css-001"
      ? CSS_ROD_FLEX_PROFILE
      : fishId === "rust-001"
        ? RUST_BILLFISH_ROD_FLEX_PROFILE
      : fishId === "js-001"
        ? JS_EEL_ROD_FLEX_PROFILE
      : STANDARD_ROD_FLEX_PROFILE;

const clamp01 = (value: number): number => Math.max(0, Math.min(1, value));
type RodPoint = { x: number; y: number; z: number };

export type RodFlexBendFrame = {
  load: number;
  screenDown: RodPoint;
  screenRight: RodPoint;
  gain: number;
};

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
  fightBend?: RodFlexBendFrame,
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

  if (fightBend) {
    const rejectChord=(direction:RodPoint):RodPoint=>{
      const along=dot(direction,chordDirection);
      return {
        x:direction.x-chordDirection.x*along,
        y:direction.y-chordDirection.y*along,
        z:direction.z-chordDirection.z*along,
      };
    };
    const perpendicularDown=normalize(rejectChord(fightBend.screenDown),normalize(rejectChord(fightBend.screenRight),bendDirection));
    const fightDirection=normalize({
      x:pullSide.x*.2+perpendicularDown.x*.8,
      y:pullSide.y*.2+perpendicularDown.y*.8,
      z:pullSide.z*.2+perpendicularDown.z*.8,
    },perpendicularDown);
    const controlOne=addScaled(butt,chordDirection,chordLength*.32);
    const controlTwo=addScaled(tip,tipTangent,-chordLength*.28);
    const base=cubicBezier(butt,controlOne,controlTwo,tip,progress);
    const t=clamp01(progress);
    // A broad tapered load keeps both anchors and their tangents continuous,
    // while the middle-to-upper blank carries the visible weight.
    const upperBlankShape=16*t*t*(1-t)*(1-t);
    const loadCurve=Math.pow(clamp01(fightBend.load),.72);
    return addScaled(base,fightDirection,fightBend.gain*loadCurve*upperBlankShape);
  }

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
