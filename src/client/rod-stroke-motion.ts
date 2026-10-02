type MotionVector = { x: number; y: number; z: number };
type Axis = "x" | "y" | "z";

const PULL_THRESHOLD = 4.0;
const RETURN_THRESHOLD = 2.8;
const SETTLED_THRESHOLD = 1.6;
const MIN_RETURN_DELAY_MS = 120;
const MIN_STROKE_MS = 250;
const MAX_STROKE_MS = 900;
const RETURN_SETTLE_MS = 65;
const COOLDOWN_MS = 650;

/** Recognizes one deliberate pull-away-and-return acceleration pair. */
export class RodStrokeMotion {
  private axis: Axis | null = null;
  private pullSign = 0;
  private phase: "idle" | "pull" | "return" = "idle";
  private pullAt = 0;
  private returnActivityAt = 0;
  private cooldownUntil = 0;

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
      if (magnitude < PULL_THRESHOLD) return false;
      this.axis = axis;
      this.pullSign = Math.sign(signal);
      this.pullAt = now;
      this.phase = "pull";
      return false;
    }

    const elapsed = now - this.pullAt;
    if (elapsed > MAX_STROKE_MS) {
      this.clearGesture();
      return false;
    }

    if (this.phase === "pull") {
      if (elapsed < MIN_RETURN_DELAY_MS || axis !== this.axis) return false;
      if (signal * this.pullSign <= -RETURN_THRESHOLD) {
        this.phase = "return";
        this.returnActivityAt = now;
      }
      return false;
    }

    if (axis === this.axis && signal * this.pullSign <= -RETURN_THRESHOLD) {
      this.returnActivityAt = now;
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
    return this.phase !== "idle";
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
  }
}
