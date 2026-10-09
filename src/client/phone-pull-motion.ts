type MotionVector = { x: number; y: number; z: number };

const TOWARD_USER_THRESHOLD = 5.5;
const DIRECTION_DOMINANCE = 0.55;
const CONFIRM_GAP_MS = 100;
const MIN_CONFIRM_SPAN_MS = 25;
const CONFIRM_SAMPLES = 2;
const COOLDOWN_MS = 800;

/** Recognizes a deliberate phone movement from far to near as one short reel input. */
export class PhonePullMotion {
  private candidateAt: number | null = null;
  private candidateLastAt: number | null = null;
  private candidateSamples = 0;
  private cooldownUntil = 0;

  update(vector: MotionVector, now: number): boolean {
    if (![vector.x, vector.y, vector.z, now].every(Number.isFinite)) {
      this.reset();
      return false;
    }
    if (now < this.cooldownUntil) return false;

    const magnitude = Math.hypot(vector.x, vector.y, vector.z);
    if (vector.z < TOWARD_USER_THRESHOLD || vector.z / magnitude < DIRECTION_DOMINANCE) {
      this.clearCandidate();
      return false;
    }

    if (this.candidateAt === null
      || now - (this.candidateLastAt ?? now) > CONFIRM_GAP_MS) {
      this.candidateAt = now;
      this.candidateLastAt = now;
      this.candidateSamples = 1;
      return false;
    }

    this.candidateSamples += 1;
    this.candidateLastAt = now;
    if (this.candidateSamples < CONFIRM_SAMPLES
      || now - this.candidateAt < MIN_CONFIRM_SPAN_MS) return false;

    this.cooldownUntil = now + COOLDOWN_MS;
    this.clearCandidate();
    return true;
  }

  /** Suppresses rotation-reel recognition while this pull is being confirmed or cooled down. */
  isPending(now: number): boolean {
    return this.candidateAt !== null || now < this.cooldownUntil;
  }

  reset(): void {
    this.clearCandidate();
    this.cooldownUntil = 0;
  }

  private clearCandidate(): void {
    this.candidateAt = null;
    this.candidateLastAt = null;
    this.candidateSamples = 0;
  }
}
