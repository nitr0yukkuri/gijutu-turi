import type { FishSpeciesId } from './fish-species.js';

export const PRE_BITE_APPROACH_SECONDS = 1.05;
export const BITE_APPROACH_SECONDS = .9;
export const WAIT_APPROACH_FRACTION = .46;

type FishVisibilityProfile = {
  waitingMax: number;
  bitingMax: number;
};

const DEFAULT_VISIBILITY: FishVisibilityProfile = { waitingMax: .32, bitingMax: .85 };
const VISIBILITY_BY_SPECIES: Partial<Record<FishSpeciesId, FishVisibilityProfile>> = {
  // The whale needs a little more silhouette budget at distance. The water
  // profile still controls its final underwater contrast.
  'whale-001': { waitingMax: .42, bitingMax: .95 },
  // CSS's state palette is the feature. Let the normal blue cascade appear
  // clearly before the bite instead of looking like an unstyled Go shadow.
  'css-001': { waitingMax: .46, bitingMax: .98 },
  // Keep the leviathan recognizably distant, but do not let its dark body
  // disappear before the player can read its swimming silhouette.
  'k8s-001': { waitingMax: .42, bitingMax: .7 },
};

export const easeFishApproach = (progress: number): number => {
  const t = Math.max(0, Math.min(1, progress));
  return t * t * (3 - 2 * t);
};

export const fishVisibilityTarget = (phase: string, progress: number, fishId?: FishSpeciesId): number => {
  const amount = Math.max(0, Math.min(1, progress));
  const profile = (fishId && VISIBILITY_BY_SPECIES[fishId]) ?? DEFAULT_VISIBILITY;
  if (phase === "waiting") {
    const reveal = Math.max(0, Math.min(1, (amount - .025) / (WAIT_APPROACH_FRACTION - .025)));
    return reveal * profile.waitingMax;
  }
  if (phase === "biting") {
    const reveal = easeFishApproach((amount - WAIT_APPROACH_FRACTION) / (1 - WAIT_APPROACH_FRACTION));
    return profile.waitingMax + reveal * (profile.bitingMax - profile.waitingMax);
  }
  // Escaped scenes freeze their entry visibility and use escapeFishVisibility
  // for the terminal fade instead of damping toward this generic target.
  return phase === "fighting" || phase === "caught" ? 1 : 0;
};

/** Keep the last readable silhouette visible until the escape fade completes. */
export const escapeFishVisibility = (visibilityAtEscape: number, fade: number): number => {
  const visible = Math.max(0, Math.min(1, visibilityAtEscape));
  const remaining = Math.max(0, Math.min(1, fade));
  return visible * remaining;
};
