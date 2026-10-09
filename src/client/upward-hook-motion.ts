type MotionVector = { x: number; y: number; z: number };

const UPWARD_ACCELERATION_THRESHOLD = 6.0;
const CONFIRM_SAMPLES = 2;
const CONFIRM_SPAN_MS = 25;
const MAX_SAMPLE_GAP_MS = 100;
const COOLDOWN_MS = 800;

/** Recognizes a deliberate upward phone flick for setting the hook. Device Y points toward the top edge. */
export class UpwardHookMotion {
  private candidateAt: number | null = null;
  private lastSampleAt: number | null = null;
  private samples = 0;
  private cooldownUntil = 0;

  update(vector: MotionVector, now: number): boolean {
    if (![vector.x, vector.y, vector.z, now].every(Number.isFinite)) {
      this.clearCandidate();
      return false;
    }
    if (now < this.cooldownUntil) return false;
    if (this.lastSampleAt !== null
      && (now <= this.lastSampleAt || now - this.lastSampleAt > MAX_SAMPLE_GAP_MS)) {
      this.clearCandidate();
    }

    const magnitude = Math.hypot(vector.x, vector.y, vector.z);
    if (vector.y < UPWARD_ACCELERATION_THRESHOLD || vector.y / magnitude < 0.55) {
      this.clearCandidate();
      return false;
    }

    if (this.candidateAt === null) {
      this.candidateAt = now;
      this.lastSampleAt = now;
      this.samples = 1;
      return false;
    }

    this.lastSampleAt = now;
    this.samples += 1;
    if (this.samples < CONFIRM_SAMPLES || now - this.candidateAt < CONFIRM_SPAN_MS) return false;

    this.cooldownUntil = now + COOLDOWN_MS;
    this.clearCandidate();
    return true;
  }

  reset(): void {
    this.clearCandidate();
    this.cooldownUntil = 0;
  }

  private clearCandidate(): void {
    this.candidateAt = null;
    this.lastSampleAt = null;
    this.samples = 0;
  }
}
