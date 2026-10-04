import type { FishSpeciesId } from "./fish-species.js";

/** Renderer-to-audio cue for a fish contacting the water surface. */
export type FishSurfaceImpactCue = {
  fishId: FishSpeciesId;
  transition: "breach" | "reentry";
  impactPower: number;
  firstBreach: boolean;
};
