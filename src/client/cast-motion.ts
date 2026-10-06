const clamp = (value: number, min: number, max: number): number =>
  Math.max(min, Math.min(max, value));

const finiteMagnitude = (value: number): number =>
  Number.isFinite(value) ? Math.max(0, value) : 0;

const CAST_START_ACCELERATION = 13;
const CAST_START_ANGULAR_SPEED = 240;
const CAST_RELEASE_ACCELERATION = 5;
const CAST_RELEASE_ANGULAR_SPEED = 100;
const CAST_CONFIRM_SAMPLES = 2;
const CAST_CONFIRM_WINDOW_MS = 90;
const CAST_CONFIRM_SPAN_MS = 25;
const CAST_RELEASE_STABLE_MS = 90;
const CAST_MIN_IMPULSE_MS = 50;
const CAST_MIN_GESTURE_MS = 150;
const CAST_MAX_GESTURE_MS = 800;
const CAST_MAX_SAMPLE_GAP_MS = 120;

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
  return finiteMagnitude(acceleration) > CAST_START_ACCELERATION
    || finiteMagnitude(angularSpeed) > CAST_START_ANGULAR_SPEED;
}

export function isCastMotionReleased(acceleration: number, angularSpeed: number): boolean {
  return finiteMagnitude(acceleration) < CAST_RELEASE_ACCELERATION
    && finiteMagnitude(angularSpeed) < CAST_RELEASE_ANGULAR_SPEED;
}

export type CastMotionPeak = { acceleration: number; angularSpeed: number };

/** Requires a sustained throw impulse followed by a stable release. */
export class CastMotionGesture {
  private phase: "idle" | "arming" | "active" = "idle";
  private startedAt: number | null = null;
  private lastStartAt: number | null = null;
  private lastAt: number | null = null;
  private startSamples = 0;
  private releaseAt: number | null = null;
  private peak: CastMotionPeak = { acceleration: 0, angularSpeed: 0 };

  update(acceleration: number, angularSpeed: number, now: number): CastMotionPeak | null {
    if (![acceleration, angularSpeed, now].every(Number.isFinite)) {
      this.reset();
      return null;
    }
    acceleration = Math.max(0, acceleration);
    angularSpeed = Math.max(0, angularSpeed);

    if (this.lastAt !== null && (now <= this.lastAt || now - this.lastAt > CAST_MAX_SAMPLE_GAP_MS)) this.reset();

    if (this.phase === "idle") {
      if (!isCastMotionStart(acceleration, angularSpeed)) return null;
      this.phase = "arming";
      this.startedAt = now;
      this.lastStartAt = now;
      this.lastAt = now;
      this.startSamples = 1;
      this.peak = { acceleration, angularSpeed };
      return null;
    }

    const startedAt = this.startedAt ?? now;
    if (now < startedAt || now - startedAt > CAST_MAX_GESTURE_MS) {
      this.reset();
      return null;
    }

    if (this.phase === "arming") {
      if (!isCastMotionStart(acceleration, angularSpeed)) {
        this.reset();
        return null;
      }
      const lastStartAt = this.lastStartAt ?? startedAt;
      if (now - lastStartAt > CAST_CONFIRM_WINDOW_MS) {
        this.reset();
        return null;
      }
      this.lastStartAt = now;
      this.lastAt = now;
      this.startSamples += 1;
      this.peak.acceleration = Math.max(this.peak.acceleration, acceleration);
      this.peak.angularSpeed = Math.max(this.peak.angularSpeed, angularSpeed);
      if (this.startSamples >= CAST_CONFIRM_SAMPLES && now - startedAt >= CAST_CONFIRM_SPAN_MS) this.phase = "active";
      return null;
    }

    this.lastAt = now;
    this.peak.acceleration = Math.max(this.peak.acceleration, acceleration);
    this.peak.angularSpeed = Math.max(this.peak.angularSpeed, angularSpeed);
    if (isCastMotionReleased(acceleration, angularSpeed)) {
      if (now - startedAt < CAST_MIN_IMPULSE_MS) {
        this.reset();
        return null;
      }
      this.releaseAt ??= now;
      if (now - this.releaseAt >= CAST_RELEASE_STABLE_MS && now - startedAt >= CAST_MIN_GESTURE_MS) {
        const peak = { ...this.peak };
        this.reset();
        return peak;
      }
    } else {
      this.releaseAt = null;
    }
    return null;
  }

  reset(): void {
    this.phase = "idle";
    this.startedAt = null;
    this.lastStartAt = null;
    this.lastAt = null;
    this.startSamples = 0;
    this.releaseAt = null;
    this.peak = { acceleration: 0, angularSpeed: 0 };
  }
}

/**
 * Pick the strongest signed device-axis rotation. Android devices can report
 * a wrist rotation on a different axis depending on how the phone is held,
 * so the reel gesture should not be tied to alpha alone.
 */
export function reelAngularSignal(alpha: number | null, beta: number | null, gamma: number | null): number {
  return [alpha, beta, gamma]
    .filter((value): value is number => Number.isFinite(value))
    .reduce((strongest, value) => Math.abs(value) > Math.abs(strongest) ? value : strongest, 0);
}

/** Hysteresis keeps a single wrist turn from chattering the reel on/off. */
export function isReelMotionStart(angularSpeed: number): boolean {
  return Number.isFinite(angularSpeed) && Math.abs(angularSpeed) > 150;
}

export function isReelMotionStop(angularSpeed: number): boolean {
  return !Number.isFinite(angularSpeed) || Math.abs(angularSpeed) < 45;
}

/** Debounces a deliberate wrist turn so one sensor spike cannot start reeling. */
export class ReelMotionGesture {
  private active = false;
  private candidateAt: number | null = null;
  private candidateLastAt: number | null = null;
  private candidateSamples = 0;
  private candidateSign = 0;
  private stopCandidateAt: number | null = null;
  private stopLastAt: number | null = null;

  update(angularSpeed: number, now: number): "start" | "stop" | null {
    if (!Number.isFinite(angularSpeed) || !Number.isFinite(now)) {
      const wasActive = this.active;
      this.reset();
      return wasActive ? "stop" : null;
    }
    if (this.active) {
      if (isReelMotionStop(angularSpeed)) {
        if (this.stopLastAt !== null && (now <= this.stopLastAt || now - this.stopLastAt > 120)) this.stopCandidateAt = null;
        this.stopCandidateAt ??= now;
        this.stopLastAt = now;
        if (now - this.stopCandidateAt >= 90) {
          this.active = false;
          this.stopCandidateAt = null;
          this.stopLastAt = null;
          return "stop";
        }
      } else {
        this.stopCandidateAt = null;
        this.stopLastAt = null;
      }
      return null;
    }
    if (!isReelMotionStart(angularSpeed)) {
      this.candidateAt = null;
      this.candidateLastAt = null;
      this.candidateSamples = 0;
      this.candidateSign = 0;
      return null;
    }
    const sign = Math.sign(angularSpeed);
    if (this.candidateLastAt !== null && (now <= this.candidateLastAt || now - this.candidateLastAt > 100 || sign !== this.candidateSign)) {
      this.candidateAt = null;
      this.candidateSamples = 0;
    }
    this.candidateAt ??= now;
    this.candidateLastAt = now;
    this.candidateSign = sign;
    this.candidateSamples += 1;
    if (this.candidateSamples < 3 || now - this.candidateAt < 75) return null;
    this.active = true;
    this.candidateAt = null;
    this.candidateLastAt = null;
    this.candidateSamples = 0;
    this.candidateSign = 0;
    return "start";
  }

  reset(): void {
    this.active = false;
    this.candidateAt = null;
    this.candidateLastAt = null;
    this.candidateSamples = 0;
    this.candidateSign = 0;
    this.stopCandidateAt = null;
    this.stopLastAt = null;
  }
}
