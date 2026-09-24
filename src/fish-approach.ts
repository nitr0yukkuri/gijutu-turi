export const PRE_BITE_APPROACH_SECONDS = 1.05;
export const BITE_APPROACH_SECONDS = .9;
export const WAIT_APPROACH_FRACTION = .46;

export const easeFishApproach = (progress: number): number => {
  const t = Math.max(0, Math.min(1, progress));
  return t * t * (3 - 2 * t);
};

export const fishVisibilityTarget = (phase: string, progress: number): number => {
  const amount = Math.max(0, Math.min(1, progress));
  if (phase === "waiting") {
    const reveal = Math.max(0, Math.min(1, (amount - .025) / (WAIT_APPROACH_FRACTION - .025)));
    return reveal * .32;
  }
  if (phase === "biting") {
    const reveal = easeFishApproach((amount - WAIT_APPROACH_FRACTION) / (1 - WAIT_APPROACH_FRACTION));
    return .32 + reveal * .53;
  }
  return phase === "fighting" || phase === "caught" || phase === "escaped" ? 1 : 0;
};
