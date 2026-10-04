type MotionVector = { x: number; y: number; z: number };
type Axis = "x" | "y" | "z";

const PULL_THRESHOLD = 6.0;
const RETURN_THRESHOLD = 4.5;
const SETTLED_THRESHOLD = 1.6;
const MIN_RETURN_DELAY_MS = 120;
const MIN_STROKE_MS = 320;
const MAX_STROKE_MS = 900;
const RETURN_SETTLE_MS = 90;
const CONFIRM_GAP_MS = 100;
const CONFIRM_SAMPLES = 2;
const MIN_CONFIRM_SPAN_MS = 25;
const COOLDOWN_MS = 800;

/** Recognizes one deliberate pull-away-and-return acceleration pair. */
export class RodStrokeMotion {
  private axis: Axis | null = null;
  private pullSign = 0;
  private phase: "idle" | "pull" | "return" = "idle";
  private pullAt = 0;
  private returnActivityAt = 0;
  private cooldownUntil = 0;
  private pullCandidateAt: number | null = null;
  private pullCandidateLastAt: number | null = null;
  private pullCandidateSamples = 0;
  private pullCandidateAxis: Axis | null = null;
  private pullCandidateSign = 0;
  private returnCandidateAt: number | null = null;
  private returnCandidateLastAt: number | null = null;
  private returnCandidateSamples = 0;

  update(vector: MotionVector, now: number): boolean {
    if (![vector.x, vector.y, vector.z, now].every(Number.isFinite)) {
      this.reset();
      return false;
    }
    if (now < this.cooldownUntil) return false;

    const components: Record<Axis, number> = { x: vector.x, y: vector.y, z: vector.z };
    const axis = (Object.keys(components) as Axis[]).reduce((largest, candidate) =>
      Math.abs(components[candidate]) > Math.abs(components[largest]) ? candidate : largest, "x");
    const signal = components[axis];
    const magnitude = Math.hypot(vector.x, vector.y, vector.z);

    if (this.phase === "idle") {
      if (magnitude < PULL_THRESHOLD) {
        this.clearPullCandidate();
        return false;
      }
      const sign = Math.sign(signal);
      if (this.pullCandidateAt === null
        || now - (this.pullCandidateLastAt ?? now) > CONFIRM_GAP_MS
        || this.pullCandidateAxis !== axis
        || this.pullCandidateSign !== sign) {
        this.clearPullCandidate();
        this.pullCandidateAt = now;
        this.pullCandidateAxis = axis;
        this.pullCandidateSign = sign;
        this.pullCandidateSamples = 1;
        this.pullCandidateLastAt = now;
        return false;
      }
      this.pullCandidateSamples += 1;
      this.pullCandidateLastAt = now;
      if (this.pullCandidateSamples < CONFIRM_SAMPLES
        || now - (this.pullCandidateAt ?? now) < MIN_CONFIRM_SPAN_MS) return false;
      this.axis = this.pullCandidateAxis;
      this.pullSign = this.pullCandidateSign;
      this.pullAt = this.pullCandidateAt ?? now;
      this.phase = "pull";
      this.clearPullCandidate();
      return false;
    }

    const elapsed = now - this.pullAt;
    if (elapsed > MAX_STROKE_MS) {
      this.clearGesture();
      return false;
    }

    if (this.phase === "pull") {
      if (elapsed < MIN_RETURN_DELAY_MS || axis !== this.axis) return false;
      this.confirmReturn(signal, this.pullSign, now);
      return false;
    }

    if (axis === this.axis && signal * this.pullSign <= -RETURN_THRESHOLD) {
      this.returnActivityAt = now;
      this.returnCandidateAt = null;
      this.returnCandidateLastAt = null;
      this.returnCandidateSamples = 0;
      return false;
    }
    if (elapsed >= MIN_STROKE_MS && magnitude <= SETTLED_THRESHOLD && now - this.returnActivityAt >= RETURN_SETTLE_MS) {
      this.cooldownUntil = now + COOLDOWN_MS;
      this.clearGesture();
      return true;
    }
    return false;
  }

  isPending(): boolean {
    return this.phase !== "idle" || this.pullCandidateAt !== null;
  }

  reset(): void {
    this.clearGesture();
    this.cooldownUntil = 0;
  }

  private clearGesture(): void {
    this.axis = null;
    this.pullSign = 0;
    this.phase = "idle";
    this.pullAt = 0;
    this.returnActivityAt = 0;
    this.clearPullCandidate();
    this.returnCandidateAt = null;
    this.returnCandidateLastAt = null;
    this.returnCandidateSamples = 0;
  }

  private confirmReturn(signal: number, pullSign: number, now: number): void {
    if (signal * pullSign > -RETURN_THRESHOLD) {
      this.returnCandidateAt = null;
      this.returnCandidateLastAt = null;
      this.returnCandidateSamples = 0;
      return;
    }
    if (this.returnCandidateAt === null
      || now - (this.returnCandidateLastAt ?? now) > CONFIRM_GAP_MS) {
      this.returnCandidateAt = now;
      this.returnCandidateLastAt = now;
      this.returnCandidateSamples = 1;
      return;
    }
    this.returnCandidateSamples += 1;
    this.returnCandidateLastAt = now;
    if (this.returnCandidateSamples >= CONFIRM_SAMPLES
      && now - this.returnCandidateAt >= MIN_CONFIRM_SPAN_MS) {
      this.phase = "return";
      this.returnActivityAt = now;
      this.returnCandidateAt = null;
      this.returnCandidateLastAt = null;
      this.returnCandidateSamples = 0;
    }
  }

  private clearPullCandidate(): void {
    this.pullCandidateAt = null;
    this.pullCandidateLastAt = null;
    this.pullCandidateSamples = 0;
    this.pullCandidateAxis = null;
    this.pullCandidateSign = 0;
  }
}
