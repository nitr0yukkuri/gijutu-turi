/** Shared fish motion vocabulary used by the authoritative game and renderer. */
export const FISH_GAITS = [
  "cruise",
  "css_cruise",
  "turn",
  "burst",
  "coast",
  "hooked_burst",
  "heavy_start",
  "heavy_surge",
  "heavy_lunge",
  "heavy_glide",
  "heavy_cruise",
  "heavy_station",
  "exhausted",
] as const;

export type FishGait = typeof FISH_GAITS[number];

export interface BodyWaveSnapshot {
  phase: number;
  amplitude: number;
  frequency: number;
  wavelength: number;
}
