const clamp = (value: number, min: number, max: number): number =>
  Math.max(min, Math.min(max, value));

const finiteMagnitude = (value: number): number =>
  Number.isFinite(value) ? Math.max(0, value) : 0;

const CAST_START_ACCELERATION = 8;
const CAST_START_ANGULAR_SPEED = 120;
const CAST_FULL_ACCELERATION = 28;
const CAST_FULL_ANGULAR_SPEED = 500;
const CAST_MIN_SWING_ANGLE = 15;
const CAST_FULL_SWING_ANGLE = 100;
const CAST_RELEASE_ACCELERATION = 5;
const CAST_RELEASE_ANGULAR_SPEED = 100;
const CAST_FILTER_SAMPLES = 5;
const CAST_SIGNAL_SMOOTH_SECONDS = .08;
const CAST_CONFIRM_SAMPLES = 2;
const CAST_CONFIRM_WINDOW_MS = 150;
const CAST_CONFIRM_SPAN_MS = 25;
const CAST_RELEASE_STABLE_MS = 90;
const CAST_MIN_IMPULSE_MS = 50;
const CAST_MIN_GESTURE_MS = 150;
const CAST_MAX_GESTURE_MS = 800;
const CAST_MAX_SAMPLE_GAP_MS = 120;

/** Map a phone flick's linear acceleration and angular speed to cast power. */
export function castStrengthFromMotion(acceleration: number, angularSpeed: number | null): number {
  // Start thresholds are the bottom of the distance scale, so a just-detected
  // slow flick casts close instead of jumping straight to the middle distance.
  const accelerationScore = clamp(
    (finiteMagnitude(acceleration) - CAST_START_ACCELERATION)
      / (CAST_FULL_ACCELERATION - CAST_START_ACCELERATION),
    0,
    1,
  );
  const angularScore = angularSpeed === null
    ? 0
    : clamp(
      (finiteMagnitude(angularSpeed) - CAST_START_ANGULAR_SPEED)
        / (CAST_FULL_ANGULAR_SPEED - CAST_START_ANGULAR_SPEED),
      0,
      1,
    );
  const strongest = Math.max(accelerationScore, angularScore);
  const speedScore = clamp(strongest + Math.min(accelerationScore, angularScore) * .15, 0, 1);
  return .2 + speedScore * .8;
}

/**
 * Convert the strength and angular sweep of a phone cast into cast power.
 * A fast wrist snap over a small arc should not travel as far as a full swing.
 */
export function castStrengthFromSwing(
  acceleration: number,
  angularSpeed: number | null,
  swingAngle: number,
): number {
  const speedStrength = castStrengthFromMotion(acceleration, angularSpeed);
  const speedScore = (speedStrength - .2) / .8;
  const rangeScore = clamp(
    (finiteMagnitude(swingAngle) - CAST_MIN_SWING_ANGLE)
      / (CAST_FULL_SWING_ANGLE - CAST_MIN_SWING_ANGLE),
    0,
    1,
  );
  // Keep some influence from speed for short swings, while making a broad,
  // deliberate sweep count more than a brief high-speed wrist flick.
  const combinedScore = speedScore * (.35 + rangeScore * .65);
  return .2 + clamp(combinedScore, 0, 1) * .8;
}

export function isCastMotionStart(acceleration: number, angularSpeed: number): boolean {
  return finiteMagnitude(acceleration) > CAST_START_ACCELERATION
    || finiteMagnitude(angularSpeed) > CAST_START_ANGULAR_SPEED;
}

export function isCastMotionReleased(acceleration: number, angularSpeed: number): boolean {
  return finiteMagnitude(acceleration) < CAST_RELEASE_ACCELERATION
    && finiteMagnitude(angularSpeed) < CAST_RELEASE_ANGULAR_SPEED;
}

export type CastMotionPeak = { acceleration: number; angularSpeed: number; swingAngle: number };
export type CastRotationRate = { alpha: number; beta: number; gamma: number };
type CastMotionSample = CastMotionPeak & CastRotationRate;
type CastMotionFilteredSample = Pick<CastMotionSample, "acceleration" | "angularSpeed" | "alpha" | "beta" | "gamma">;

const zeroRotation: CastRotationRate = { alpha: 0, beta: 0, gamma: 0 };

/** Requires a sustained throw impulse followed by a stable release. */
export class CastMotionGesture {
  private phase: "idle" | "arming" | "active" = "idle";
  private startedAt: number | null = null;
  private lastStartAt: number | null = null;
  private lastAt: number | null = null;
  private startSamples = 0;
  private releaseAt: number | null = null;
  private peak: CastMotionPeak = { acceleration: 0, angularSpeed: 0, swingAngle: 0 };
  private recentSamples: CastMotionSample[] = [];
  private filtered: CastMotionFilteredSample = { acceleration: 0, angularSpeed: 0, ...zeroRotation };
  private lastFilteredRotation: CastRotationRate | null = null;
  private accumulatedRotation: CastRotationRate = { ...zeroRotation };
  private gestureStartRotation: CastRotationRate | null = null;

  update(
    acceleration: number,
    angularSpeed: number,
    now: number,
    rotationRate: CastRotationRate = { alpha: angularSpeed, beta: 0, gamma: 0 },
  ): CastMotionPeak | null {
    if (![acceleration, angularSpeed, now, rotationRate.alpha, rotationRate.beta, rotationRate.gamma].every(Number.isFinite)) {
      this.reset();
      return null;
    }
    let elapsed = this.lastAt === null ? 1 / 60 : (now - this.lastAt) / 1000;
    if (this.lastAt !== null && (now <= this.lastAt || now - this.lastAt > CAST_MAX_SAMPLE_GAP_MS)) {
      this.reset();
      elapsed = 1 / 60;
    }
    this.lastAt = now;
    this.recentSamples.push({
      acceleration: Math.max(0, acceleration),
      angularSpeed: Math.max(0, angularSpeed),
      alpha: rotationRate.alpha,
      beta: rotationRate.beta,
      gamma: rotationRate.gamma,
      swingAngle: 0,
    });
    if (this.recentSamples.length > CAST_FILTER_SAMPLES) this.recentSamples.shift();
    if (this.recentSamples.length < CAST_FILTER_SAMPLES) return null;

    // A short median rejects one- and two-frame device-motion spikes before
    // they can arm a cast or become its peak power. It preserves sustained
    // movement while making the result insensitive to a single bad sample.
    const median = (key: keyof CastMotionSample): number => {
      const sorted = this.recentSamples.map(sample => sample[key]).sort((a, b) => a - b);
      return sorted[Math.floor(sorted.length / 2)] ?? 0;
    };
    const medianAcceleration = median("acceleration");
    const medianAngularSpeed = median("angularSpeed");
    const smoothing = 1 - Math.exp(-elapsed / CAST_SIGNAL_SMOOTH_SECONDS);
    this.filtered.acceleration += (medianAcceleration - this.filtered.acceleration) * smoothing;
    this.filtered.angularSpeed += (medianAngularSpeed - this.filtered.angularSpeed) * smoothing;
    this.filtered.alpha += (median("alpha") - this.filtered.alpha) * smoothing;
    this.filtered.beta += (median("beta") - this.filtered.beta) * smoothing;
    this.filtered.gamma += (median("gamma") - this.filtered.gamma) * smoothing;
    acceleration = this.filtered.acceleration;
    angularSpeed = this.filtered.angularSpeed;

    if (this.phase === "idle") this.accumulatedRotation = { ...zeroRotation };
    const previousRotation = this.lastFilteredRotation;
    if (previousRotation !== null) {
      this.accumulatedRotation.alpha += (previousRotation.alpha + this.filtered.alpha) * .5 * elapsed;
      this.accumulatedRotation.beta += (previousRotation.beta + this.filtered.beta) * .5 * elapsed;
      this.accumulatedRotation.gamma += (previousRotation.gamma + this.filtered.gamma) * .5 * elapsed;
    }
    this.lastFilteredRotation = {
      alpha: this.filtered.alpha,
      beta: this.filtered.beta,
      gamma: this.filtered.gamma,
    };
    const swingAngle = this.gestureStartRotation === null ? 0 : Math.hypot(
      this.accumulatedRotation.alpha - this.gestureStartRotation.alpha,
      this.accumulatedRotation.beta - this.gestureStartRotation.beta,
      this.accumulatedRotation.gamma - this.gestureStartRotation.gamma,
    );

    if (this.phase === "idle") {
      if (!isCastMotionStart(acceleration, angularSpeed)) return null;
      this.phase = "arming";
      this.startedAt = now;
      this.lastStartAt = now;
      this.startSamples = 1;
      this.gestureStartRotation = { ...this.accumulatedRotation };
      this.peak = { acceleration, angularSpeed, swingAngle };
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
      this.startSamples += 1;
      this.peak.acceleration = Math.max(this.peak.acceleration, acceleration);
      this.peak.angularSpeed = Math.max(this.peak.angularSpeed, angularSpeed);
      this.peak.swingAngle = Math.max(this.peak.swingAngle, swingAngle);
      if (this.startSamples >= CAST_CONFIRM_SAMPLES && now - startedAt >= CAST_CONFIRM_SPAN_MS) this.phase = "active";
      return null;
    }

    this.peak.acceleration = Math.max(this.peak.acceleration, acceleration);
    this.peak.angularSpeed = Math.max(this.peak.angularSpeed, angularSpeed);
    this.peak.swingAngle = Math.max(this.peak.swingAngle, swingAngle);
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
    this.peak = { acceleration: 0, angularSpeed: 0, swingAngle: 0 };
    this.recentSamples = [];
    this.filtered = { acceleration: 0, angularSpeed: 0, ...zeroRotation };
    this.lastFilteredRotation = null;
    this.accumulatedRotation = { ...zeroRotation };
    this.gestureStartRotation = null;
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

/** A screen-held reel blocks sensor input, but motion must be allowed to release its own reel. */
export function isScreenReelBlockingMotion(reelHeld: boolean, motionOwnsReel: boolean): boolean {
  return reelHeld && !motionOwnsReel;
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
