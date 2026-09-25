const clamp = (value: number, min: number, max: number): number =>
  Math.max(min, Math.min(max, value));

const finiteMagnitude = (value: number): number =>
  Number.isFinite(value) ? Math.max(0, value) : 0;

/** Map a phone flick's linear acceleration and angular speed to cast power. */
export function castStrengthFromMotion(acceleration: number, angularSpeed: number | null): number {
  const accelerationScore = clamp((finiteMagnitude(acceleration) - 8) / 20, 0, 1);
  const angularScore = angularSpeed === null
    ? 0
    : clamp((finiteMagnitude(angularSpeed) - 120) / 380, 0, 1);
  const strongest = Math.max(accelerationScore, angularScore);
  const combined = clamp(strongest + Math.min(accelerationScore, angularScore) * .15, 0, 1);
  return .2 + combined * .8;
}

export function isCastMotionStart(acceleration: number, angularSpeed: number): boolean {
  return acceleration > 10 || angularSpeed > 180;
}

export function isCastMotionReleased(acceleration: number, angularSpeed: number): boolean {
  return acceleration < 4 && angularSpeed < 80;
}
