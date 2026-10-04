/** A catch is a new discovery only when the first recorded count appears. */
export const isFirstCatch = (previousCatches: number, currentCatches: number): boolean =>
  Number.isFinite(previousCatches)
  && Number.isFinite(currentCatches)
  && previousCatches <= 0
  && currentCatches > 0;
