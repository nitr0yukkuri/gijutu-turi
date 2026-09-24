import type { BodyWaveSnapshot, FishGait } from "./protocol.js";

export type Vec3 = { x: number; y: number; z: number };

export interface SwimIntent {
  direction: Vec3;
  speed: number;
  gait: FishGait;
}

export interface FishMotionSnapshot {
  position: Vec3;
  velocity: Vec3;
  heading: Vec3;
  speed: number;
  gait: FishGait;
  bodyWave: BodyWaveSnapshot;
  /** Self-propulsion, separate from translation imposed by a fishing line. */
  swim?: { velocity: Vec3; effort: number; turn: number };
}

type GaitProfile = {
  acceleration: number;
  drag: number;
  amplitude: number;
  frequency: number;
  wavelength: number;
};

const TAU = Math.PI * 2;

const GAIT_PROFILES: Record<FishGait, GaitProfile> = {
  cruise: { acceleration: 1.8, drag: 0.7, amplitude: 0.08, frequency: 1.6, wavelength: 0.8 },
  turn: { acceleration: 2.8, drag: 0.9, amplitude: 0.16, frequency: 2.6, wavelength: 0.72 },
  burst: { acceleration: 5.4, drag: 0.35, amplitude: 0.22, frequency: 4.6, wavelength: 0.64 },
  coast: { acceleration: 0.7, drag: 0.28, amplitude: 0.045, frequency: 0.8, wavelength: 0.9 },
  hooked_burst: { acceleration: 7.2, drag: 0.3, amplitude: 0.3, frequency: 5.8, wavelength: 0.58 },
  exhausted: { acceleration: 1, drag: 1.25, amplitude: 0.025, frequency: 0.6, wavelength: 1 },
};

const clamp = (value: number, min: number, max: number): number =>
  Math.min(Math.max(value, min), max);

export const magnitude = (value: Vec3): number => Math.hypot(value.x, value.y, value.z);

export const normalise = (value: Vec3): Vec3 => {
  const length = magnitude(value);
  if (length === 0) return { x: 0, y: 0, z: 0 };
  return { x: value.x / length, y: value.y / length, z: value.z / length };
};

export const add = (left: Vec3, right: Vec3): Vec3 => ({
  x: left.x + right.x,
  y: left.y + right.y,
  z: left.z + right.z,
});

export const subtract = (left: Vec3, right: Vec3): Vec3 => ({
  x: left.x - right.x,
  y: left.y - right.y,
  z: left.z - right.z,
});

export const scale = (value: Vec3, factor: number): Vec3 => ({
  x: value.x * factor,
  y: value.y * factor,
  z: value.z * factor,
});

const clampMagnitude = (value: Vec3, maxLength: number): Vec3 => {
  const length = magnitude(value);
  if (length <= maxLength || length === 0) return value;
  return scale(value, maxLength / length);
};

const lerp = (from: Vec3, to: Vec3, amount: number): Vec3 => ({
  x: from.x + (to.x - from.x) * amount,
  y: from.y + (to.y - from.y) * amount,
  z: from.z + (to.z - from.z) * amount,
});

export class FishLocomotion {
  private position: Vec3;
  private velocity: Vec3;
  private heading: Vec3;
  private gait: FishGait = "cruise";
  private wavePhase = 0;
  private stamina = 100;
  private cStartRemaining = 0;
  private swim: FishMotionSnapshot['swim'];

  constructor(position: Vec3, velocity: Vec3) {
    this.position = { ...position };
    this.velocity = { ...velocity };
    this.heading = normalise(velocity);
  }

  update(deltaSeconds: number, intent: SwimIntent, externalForce: Vec3 = { x: 0, y: 0, z: 0 }): void {
    const delta = clamp(deltaSeconds, 0, 0.1);
    const activeGait = this.cStartRemaining > 0 ? "hooked_burst" : intent.gait;
    const profile = GAIT_PROFILES[activeGait];
    const direction = normalise(intent.direction);
    const targetSpeed = this.cStartRemaining > 0 ? Math.max(intent.speed, 2.8) : intent.speed;
    const desiredVelocity = scale(direction, targetSpeed);
    const velocityDelta = clampMagnitude(
      subtract(desiredVelocity, this.velocity),
      profile.acceleration * delta,
    );
    const steeringAcceleration = scale(velocityDelta, 1 / Math.max(delta, 0.001));
    const totalAcceleration = add(steeringAcceleration, externalForce);

    this.velocity = add(this.velocity, scale(totalAcceleration, delta));
    this.velocity = scale(this.velocity, Math.exp(-profile.drag * delta));
    this.position = add(this.position, scale(this.velocity, delta));

    const speed = magnitude(this.velocity);
    if (speed > 0.01) {
      this.heading = normalise(lerp(this.heading, normalise(this.velocity), clamp(delta * 7, 0, 1)));
    }

    this.gait = activeGait;
    this.wavePhase = (this.wavePhase + profile.frequency * TAU * delta) % TAU;
    this.cStartRemaining = Math.max(0, this.cStartRemaining - delta);
  }

  triggerCStart(escapeDirection: Vec3): void {
    const direction = normalise(escapeDirection);
    this.cStartRemaining = 0.22;
    this.gait = "hooked_burst";
    this.heading = direction;
    this.velocity = add(this.velocity, scale(direction, 1.6));
  }

  /**
   * Keep the procedural body wave while letting an authoritative game loop
   * own the fish's root motion. This prevents a renderer from inventing a
   * second position or heading for the same fish.
   */
  setRootMotion(position: Vec3, velocity: Vec3, swim?: FishMotionSnapshot['swim']): void {
    this.position = { ...position };
    this.velocity = { ...velocity };
    this.swim = swim ? { ...swim, velocity: { ...swim.velocity } } : undefined;
    const facingVelocity = swim?.velocity ?? velocity;
    if (magnitude(facingVelocity) > 0.01) this.heading = normalise(facingVelocity);
  }

  setGait(gait: FishGait): void {
    this.gait = gait;
  }

  setStamina(stamina: number): void {
    this.stamina = clamp(stamina, 0, 100);
  }

  getStamina(): number {
    return this.stamina;
  }

  reset(position: Vec3, velocity: Vec3): void {
    this.position = { ...position };
    this.velocity = { ...velocity };
    this.heading = normalise(velocity);
    this.gait = "cruise";
    this.wavePhase = 0;
    this.stamina = 100;
    this.cStartRemaining = 0;
    this.swim = undefined;
  }

  snapshot(): FishMotionSnapshot {
    const profile = GAIT_PROFILES[this.gait];
    const speed = magnitude(this.velocity);
    const speedFactor = clamp((this.swim ? magnitude(this.swim.velocity) : speed) / 2.8, 0.35, 1.35);
    return {
      position: { ...this.position },
      velocity: { ...this.velocity },
      heading: { ...this.heading },
      speed,
      gait: this.gait,
      ...(this.swim ? { swim: { ...this.swim, velocity: { ...this.swim.velocity } } } : {}),
      bodyWave: {
        phase: this.wavePhase,
        amplitude: profile.amplitude * speedFactor,
        frequency: profile.frequency,
        wavelength: profile.wavelength,
      },
    };
  }
}
