/** Ease the rod's visual load without changing authoritative game tension. */
export function smoothRodLoad(current: number, target: number, dt: number, response = 10): number {
  if (dt <= 0 || response <= 0) return current;
  const amount = 1 - Math.exp(-response * dt);
  return current + (target - current) * amount;
}
