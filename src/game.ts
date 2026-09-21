import type {
  DomainEvent,
  FishSnapshot,
  FishingPhase,
  FishState,
  GameSnapshot,
  InputPayload,
} from "./protocol.js";
import { FishLocomotion, type Vec3, add, magnitude, normalise, scale, subtract } from "./fish.js";

const clamp = (value: number, min: number, max: number): number =>
  Math.min(Math.max(value, min), max);

const distance = (a: Vec3, b: Vec3): number => magnitude(subtract(a, b));
const FISH_ID = "fish-001";

export class FishingSimulation {
  readonly sessionId: string;

  private tickCount = 0;
  private phase: FishingPhase = "idle";
  private fishState: FishState = "cruise";
  private readonly fish = new FishLocomotion(
    { x: 2.5, y: -1.5, z: -5 },
    { x: 0.15, y: 0, z: 0.1 },
  );
  private lineTension = 0;
  private lineLength = 0;
  private lurePosition: Vec3 = { x: 0, y: 0, z: 0 };
  private castTime = 0;
  private biteTime = 0;
  private behaviorTime = 0;
  private fightMode: "burst" | "coast" = "coast";
  private fightModeRemaining = 0;
  private lastProcessedInput = -1;
  private pendingEvents: DomainEvent[] = [];
  private rodDirection: Vec3 = { x: 0, y: 0, z: 0 };
  private rodStrength = 0;

  constructor(sessionId: string) {
    this.sessionId = sessionId;
  }

  applyInput(input: InputPayload): void {
    switch (input.action) {
      case "cast":
        this.startCast(input.strength);
        break;
      case "reel":
        this.reel(input.strength);
        break;
      case "hook":
        this.hook();
        break;
      case "rod_motion":
        this.rodDirection = normalise(input.direction);
        this.rodStrength = input.strength;
        break;
      case "reset":
        this.reset();
        break;
    }
  }

  markInputProcessed(sequence: number): void {
    this.lastProcessedInput = sequence;
  }

  step(deltaSeconds: number): void {
    const delta = clamp(deltaSeconds, 0, 0.1);
    this.tickCount += 1;
    this.behaviorTime += delta;

    if (this.phase === "idle") {
      this.advanceCruise(delta);
      return;
    }

    if (this.phase === "casting") {
      this.castTime += delta;
      if (this.castTime >= 0.45) {
        this.phase = "waiting";
        this.pendingEvents.push({ type: "LureLanded", tick: this.tickCount });
      }
      return;
    }

    if (this.phase === "waiting") {
      this.advanceWaiting(delta);
      this.castTime += delta;
      if (this.castTime >= 2.5 && this.fishState === "cruise") {
        this.fishState = "approach";
        this.pendingEvents.push({ type: "FishApproached", tick: this.tickCount, fishId: FISH_ID });
      }
      if (this.castTime >= 4.2) {
        this.phase = "biting";
        this.fishState = "bite";
        this.biteTime = 0;
        this.pendingEvents.push({ type: "FishBite", tick: this.tickCount, fishId: FISH_ID });
      }
      return;
    }

    if (this.phase === "biting") {
      this.biteTime += delta;
      this.advanceWaiting(delta);
      if (this.biteTime >= 1.2) this.escape();
      return;
    }

    if (this.phase === "fighting") this.advanceFight(delta);
  }

  drainEvents(): DomainEvent[] {
    const events = this.pendingEvents;
    this.pendingEvents = [];
    return events;
  }

  snapshot(): GameSnapshot {
    const motion = this.fish.snapshot();
    const fish: FishSnapshot = {
      id: FISH_ID,
      state: this.fishState,
      position: motion.position,
      velocity: motion.velocity,
      heading: motion.heading,
      speed: Math.round(motion.speed * 1000) / 1000,
      gait: motion.gait,
      bodyWave: motion.bodyWave,
      stamina: Math.round(this.fish.getStamina() * 100) / 100,
    };

    return {
      sessionId: this.sessionId,
      tick: this.tickCount,
      phase: this.phase,
      fish,
      line: {
        tension: Math.round(this.lineTension * 100) / 100,
        length: Math.round(this.lineLength * 100) / 100,
      },
      lastProcessedInput: this.lastProcessedInput,
    };
  }

  private startCast(strength: number): void {
    if (this.phase !== "idle" && this.phase !== "caught" && this.phase !== "escaped") return;
    this.phase = "casting";
    this.fishState = "cruise";
    this.fish.reset({ x: 2.5, y: -1.5, z: -5 }, { x: 0.15, y: 0, z: 0.1 });
    this.lineTension = 0;
    this.lineLength = 8 + strength * 12;
    this.castTime = 0;
    this.biteTime = 0;
    this.behaviorTime = 0;
    this.fightMode = "coast";
    this.fightModeRemaining = 0;
    this.lurePosition = { x: 0, y: -1, z: -this.lineLength };
    this.pendingEvents.push({ type: "CastStarted", tick: this.tickCount });
  }

  private reel(strength: number): void {
    if (this.phase !== "fighting") return;
    const reelStrength = clamp(strength, 0, 1);
    this.lineLength = Math.max(1.5, this.lineLength - reelStrength * 0.35);
    this.lineTension = clamp(this.lineTension + reelStrength * 0.045, 0, 1);
    this.fish.setStamina(this.fish.getStamina() - reelStrength * 1.8);
    if (this.fish.getStamina() <= 0) this.catchFish();
  }

  private hook(): void {
    if (this.phase !== "biting") return;
    this.phase = "fighting";
    this.fishState = "fight";
    this.fightMode = "burst";
    this.fightModeRemaining = 0.45;
    const fishPosition = this.fish.snapshot().position;
    this.fish.triggerCStart(normalise(subtract(fishPosition, this.lurePosition)));
    this.pendingEvents.push({ type: "FishHooked", tick: this.tickCount, fishId: FISH_ID });
  }

  private advanceCruise(delta: number): void {
    const direction = normalise({
      x: 0.35 + Math.sin(this.behaviorTime * 0.45) * 0.35,
      y: Math.sin(this.behaviorTime * 0.3) * 0.08,
      z: 0.2 + Math.cos(this.behaviorTime * 0.38) * 0.25,
    });
    this.fish.update(delta, { direction, speed: 0.32, gait: "cruise" });
  }

  private advanceWaiting(delta: number): void {
    const fishPosition = this.fish.snapshot().position;
    const distanceToLure = distance(fishPosition, this.lurePosition);
    const targetDirection = normalise(subtract(this.lurePosition, fishPosition));
    const isApproaching = this.castTime >= 2.5 || this.phase === "biting";
    const direction = isApproaching
      ? targetDirection
      : normalise({
          x: 0.25 + Math.sin(this.behaviorTime * 0.5) * 0.3,
          y: Math.sin(this.behaviorTime * 0.4) * 0.08,
          z: 0.2 + Math.cos(this.behaviorTime * 0.35) * 0.25,
        });
    const gait = isApproaching ? "turn" : "cruise";
    const speed = isApproaching ? Math.min(1, 0.45 + Math.max(0, 6 - distanceToLure) * 0.12) : 0.32;
    this.fish.update(delta, { direction, speed, gait });
  }

  private advanceFight(delta: number): void {
    this.fightModeRemaining -= delta;
    if (this.fightModeRemaining <= 0) {
      this.fightMode = this.fightMode === "burst" ? "coast" : "burst";
      const staminaRatio = this.fish.getStamina() / 100;
      this.fightModeRemaining = this.fightMode === "burst"
        ? 0.4 + staminaRatio * 0.45
        : 0.55 + (1 - staminaRatio) * 0.8;
    }

    const staminaRatio = this.fish.getStamina() / 100;
    const isBurst = this.fightMode === "burst";
    const direction = normalise({
      x: Math.sin(this.behaviorTime * (isBurst ? 2.3 : 0.7)) * (isBurst ? 0.8 : 0.25),
      y: Math.sin(this.behaviorTime * 1.3) * 0.18,
      z: -1,
    });
    const targetSpeed = isBurst ? 1.35 + staminaRatio * 1.25 : 0.3 + staminaRatio * 0.35;
    const gait = isBurst ? "burst" : "coast";
    const rodControl = this.rodStrength * 0.25;
    const swimPull = isBurst ? 0.72 + staminaRatio * 0.25 : 0.12;
    const lineDirection = normalise(subtract(this.lurePosition, this.fish.snapshot().position));
    const lineForce = scale(lineDirection, this.lineTension * 1.6);

    this.lineTension = clamp(this.lineTension + (swimPull - rodControl) * delta, 0, 1);
    this.lineLength = clamp(this.lineLength + swimPull * delta - rodControl * delta, 1.5, 30);
    this.fish.setStamina(this.fish.getStamina() - delta * (isBurst ? 6 : 0.8));
    this.fish.update(delta, { direction, speed: targetSpeed, gait }, lineForce);

    if (this.lineTension >= 1) this.escape();
    if (this.fish.getStamina() <= 0) this.catchFish();
  }

  private catchFish(): void {
    this.phase = "caught";
    this.fishState = "caught";
    this.fish.setGait("exhausted");
    this.lineTension = 0.15;
    this.pendingEvents.push({ type: "FishCaught", tick: this.tickCount, fishId: FISH_ID });
  }

  private escape(): void {
    this.phase = "escaped";
    this.fishState = "escaped";
    this.fish.setGait("burst");
    this.lineTension = 0;
    this.pendingEvents.push({ type: "FishEscaped", tick: this.tickCount, fishId: FISH_ID });
  }

  private reset(): void {
    this.phase = "idle";
    this.fishState = "cruise";
    this.fish.reset({ x: 2.5, y: -1.5, z: -5 }, { x: 0.15, y: 0, z: 0.1 });
    this.lineTension = 0;
    this.lineLength = 0;
    this.castTime = 0;
    this.biteTime = 0;
    this.behaviorTime = 0;
    this.fightMode = "coast";
    this.fightModeRemaining = 0;
  }
}

export const getDistanceToLure = (simulation: FishingSimulation): number => {
  const snapshot = simulation.snapshot();
  return distance(snapshot.fish.position, { x: 0, y: -1, z: -snapshot.line.length });
};
