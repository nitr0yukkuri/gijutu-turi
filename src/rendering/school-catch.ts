/**
 * Shrink a school into a compact catch formation while its leader is landed.
 * The progress is expected to use the leader's eased catch transition.
 */
export function schoolCatchFormationScale(progress: number): number {
  const eased = Math.max(0, Math.min(1, progress));
  return 1 - eased * .66;
}
