/** Shared fish motion types retained by the active simulation and renderer. */
export type FishGait =
  | "cruise"
  | "turn"
  | "burst"
  | "coast"
  | "hooked_burst"
  | "exhausted";

export interface BodyWaveSnapshot {
  phase: number;
  amplitude: number;
  frequency: number;
  wavelength: number;
}
