import type { FishMotionSnapshot, Vec3 } from '../fish.js';
import type { OceanClientState } from '../ocean-contract.js';
import { interpolateOceanPresentationState } from '../ocean-presentation-timeline.js';

export function copyFishMotion(fish: FishMotionSnapshot | undefined): FishMotionSnapshot | undefined {
  if (!fish) return undefined;
  return {
    ...fish,
    position: { ...fish.position },
    velocity: { ...fish.velocity },
    heading: { ...fish.heading },
    bodyWave: { ...fish.bodyWave },
    swim: fish.swim ? { ...fish.swim, velocity: { ...fish.swim.velocity } } : undefined,
  };
}

const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
const lerpVector = (a: Vec3, b: Vec3, t: number): Vec3 => ({
  x: lerp(a.x, b.x, t), y: lerp(a.y, b.y, t), z: lerp(a.z, b.z, t),
});
const lerpAngle = (a: number, b: number, t: number): number =>
  a + Math.atan2(Math.sin(b - a), Math.cos(b - a)) * t;

/** Fish motion and top-level tension share the HUD's delayed presentation time.
 * Keep this boundary typed: wire fish snapshots do not contain tension. */
export function interpolateFishPresentationState(
  first: OceanClientState,
  second: OceanClientState,
  amount: number,
): OceanClientState {
  const state = interpolateOceanPresentationState(first, second, amount);
  const a = first.fish, b = second.fish;
  if (!a || !b) return { ...state, fish: copyFishMotion(a ?? b) };
  const t = Math.max(0, Math.min(1, amount));
  return {
    ...state,
    fish: {
      position: lerpVector(a.position, b.position, t),
      velocity: lerpVector(a.velocity, b.velocity, t),
      heading: lerpVector(a.heading, b.heading, t),
      speed: lerp(a.speed, b.speed, t),
      gait: t < .5 ? a.gait : b.gait,
      bodyWave: {
        phase: lerpAngle(a.bodyWave.phase, b.bodyWave.phase, t),
        amplitude: lerp(a.bodyWave.amplitude, b.bodyWave.amplitude, t),
        frequency: lerp(a.bodyWave.frequency, b.bodyWave.frequency, t),
        wavelength: lerp(a.bodyWave.wavelength, b.bodyWave.wavelength, t),
      },
      swim: a.swim && b.swim ? {
        effort: lerp(a.swim.effort, b.swim.effort, t),
        turn: lerp(a.swim.turn, b.swim.turn, t),
        velocity: lerpVector(a.swim.velocity, b.swim.velocity, t),
      } : (a.swim ?? b.swim),
    },
  };
}
