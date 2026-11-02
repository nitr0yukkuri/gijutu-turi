import type { FishGait } from "./fish-contract.js";
import type { FishSpeciesId } from "./fish-species.js";

export type RiverFishId = Extract<FishSpeciesId, `river-${string}`>;
export type RiverFishFightMode = "rest" | "surge" | "warning" | "split";
export type RiverFishManeuver = "headshake" | "dart" | "coil";

export type RiverFishMovementContext = Readonly<{
  fightTime: number;
  /** Cast revision gives each encounter a deterministic but varied swim phase. */
  encounter: number;
  opening: boolean;
  reeling: boolean;
  mode: RiverFishFightMode;
}>;

export type RiverFishMovementCue = Readonly<{
  /** Lateral offset from the hook point in world-space X. */
  lateralTarget: number;
  /** Server-owned swimming depth; it does not affect fishing difficulty. */
  depthTarget: number;
  gait: FishGait;
}>;

type RiverMovementStyle = Readonly<{
  period: number;
  phaseOffset: number;
  openingSeconds: number;
  repeatStartSeconds: number;
  surgePeriod: number;
  surgeDuration: number;
  surgeManeuverDuration: number;
  surgeManeuver: RiverFishManeuver;
  finaleManeuver: RiverFishManeuver;
  openingGait?: FishGait;
  burstSeconds: number;
  recoverySeconds: number;
  lateralExcursion: number;
  cruiseDepth: number;
  dartDepth: number;
  lateralLimit: number;
  lateralAcceleration: number;
  turnRate: number;
  depthResponse: number;
  cruiseGait: FishGait;
  burstGait: FishGait;
  turnGait: FishGait;
}>;

export type RiverFishMovementProfile = Readonly<{
  openingSeconds: number;
  lateralLimit: number;
  lateralAcceleration: number;
  turnRate: number;
  depthResponse: number;
  escapeGait: FishGait;
  cueAt: (context: RiverFishMovementContext) => RiverFishMovementCue;
  modeAt: (fightTime: number, finale: number) => { mode: RiverFishFightMode; school: number };
  maneuverAt: (fightTime: number, mode: RiverFishFightMode, finale: number) => {
    kind: RiverFishManeuver;
    progress: number;
    side: -1 | 1;
  } | null;
}>;

const RIVER_FISH_MOTION_STYLES: Readonly<Record<RiverFishId, RiverMovementStyle>> = {
  "river-ayu": {
    period: 4.8, phaseOffset: .45, openingSeconds: 1.0, repeatStartSeconds: 4.1,
    surgePeriod: 6.2, surgeDuration: 1.15, surgeManeuverDuration: .42,
    surgeManeuver: "dart", finaleManeuver: "headshake",
    burstSeconds: .42, recoverySeconds: .72,
    lateralExcursion: .34, cruiseDepth: -2.15, dartDepth: -1.95,
    lateralLimit: .9, lateralAcceleration: 1.5, turnRate: 1.2, depthResponse: .9,
    cruiseGait: "river_cruise", burstGait: "burst", turnGait: "turn",
  },
  "river-yamame": {
    period: 5.1, phaseOffset: .9, openingSeconds: 1.2, repeatStartSeconds: 4.0,
    surgePeriod: 5.4, surgeDuration: 1.25, surgeManeuverDuration: .5,
    surgeManeuver: "dart", finaleManeuver: "headshake",
    burstSeconds: .38, recoverySeconds: .92,
    lateralExcursion: .92, cruiseDepth: -2.6, dartDepth: -2.12,
    lateralLimit: 1.65, lateralAcceleration: 2.8, turnRate: 2.0, depthResponse: 1.25,
    cruiseGait: "cruise", burstGait: "burst", turnGait: "turn",
  },
  "river-oikawa": {
    period: 2.9, phaseOffset: .2, openingSeconds: .7, repeatStartSeconds: 2.7,
    surgePeriod: 3.5, surgeDuration: .8, surgeManeuverDuration: .3,
    surgeManeuver: "dart", finaleManeuver: "dart",
    burstSeconds: .3, recoverySeconds: .52,
    lateralExcursion: .68, cruiseDepth: -2.12, dartDepth: -1.92,
    lateralLimit: 1.55, lateralAcceleration: 2.8, turnRate: 1.9, depthResponse: 1.1,
    cruiseGait: "css_cruise", burstGait: "burst", turnGait: "turn",
  },
  "river-ugui": {
    period: 4.1, phaseOffset: 1.3, openingSeconds: .95, repeatStartSeconds: 3.7,
    surgePeriod: 5.8, surgeDuration: 1.2, surgeManeuverDuration: .38,
    surgeManeuver: "headshake", finaleManeuver: "headshake",
    burstSeconds: .38, recoverySeconds: .78,
    lateralExcursion: .46, cruiseDepth: -2.42, dartDepth: -2.2,
    lateralLimit: 1.1, lateralAcceleration: 1.45, turnRate: 1.05, depthResponse: .8,
    cruiseGait: "cruise", burstGait: "burst", turnGait: "turn",
  },
  "river-kawamutsu": {
    period: 2.35, phaseOffset: .65, openingSeconds: .62, repeatStartSeconds: 2.2,
    surgePeriod: 2.9, surgeDuration: .65, surgeManeuverDuration: .24,
    surgeManeuver: "dart", finaleManeuver: "dart",
    burstSeconds: .24, recoverySeconds: .48,
    lateralExcursion: .72, cruiseDepth: -2.5, dartDepth: -2.22,
    lateralLimit: 1.8, lateralAcceleration: 3.1, turnRate: 2.25, depthResponse: 1.05,
    cruiseGait: "cruise", burstGait: "burst", turnGait: "turn",
  },
  "river-namazu": {
    period: 6.7, phaseOffset: 1.8, openingSeconds: 1.55, repeatStartSeconds: 5.0,
    surgePeriod: 7.5, surgeDuration: 1.65, surgeManeuverDuration: .5,
    surgeManeuver: "coil", finaleManeuver: "coil",
    burstSeconds: .5, recoverySeconds: 1.1,
    lateralExcursion: .3, cruiseDepth: -2.88, dartDepth: -2.66,
    lateralLimit: .65, lateralAcceleration: .7, turnRate: .58, depthResponse: .42,
    openingGait: "heavy_start", cruiseGait: "heavy_cruise", burstGait: "heavy_surge", turnGait: "heavy_glide",
  },
  "river-dojo": {
    period: 4.25, phaseOffset: .85, openingSeconds: .85, repeatStartSeconds: 3.2,
    surgePeriod: 4.6, surgeDuration: 1.0, surgeManeuverDuration: .36,
    surgeManeuver: "coil", finaleManeuver: "coil",
    burstSeconds: .36, recoverySeconds: .82,
    lateralExcursion: .44, cruiseDepth: -2.82, dartDepth: -2.58,
    lateralLimit: 1.05, lateralAcceleration: 1.8, turnRate: 1.55, depthResponse: .62,
    cruiseGait: "cruise", burstGait: "burst", turnGait: "turn",
  },
  "river-kamatsuka": {
    period: 5.9, phaseOffset: 2.0, openingSeconds: 1.2, repeatStartSeconds: 4.6,
    surgePeriod: 7.1, surgeDuration: 1.55, surgeManeuverDuration: .32,
    surgeManeuver: "headshake", finaleManeuver: "headshake",
    burstSeconds: .32, recoverySeconds: .9,
    lateralExcursion: .18, cruiseDepth: -2.96, dartDepth: -2.78,
    lateralLimit: .42, lateralAcceleration: .52, turnRate: .48, depthResponse: .38,
    openingGait: "heavy_start", cruiseGait: "heavy_station", burstGait: "heavy_surge", turnGait: "heavy_glide",
  },
  "river-koi": {
    period: 6.4, phaseOffset: 1.55, openingSeconds: 1.65, repeatStartSeconds: 5.8,
    surgePeriod: 8.4, surgeDuration: 1.85, surgeManeuverDuration: .56,
    surgeManeuver: "coil", finaleManeuver: "coil",
    burstSeconds: .56, recoverySeconds: 1.32,
    lateralExcursion: .4, cruiseDepth: -2.86, dartDepth: -2.54,
    lateralLimit: .74, lateralAcceleration: .72, turnRate: .52, depthResponse: .46,
    openingGait: "heavy_start", cruiseGait: "heavy_glide", burstGait: "heavy_surge", turnGait: "heavy_cruise",
  },
  "river-ginbuna": {
    period: 4.6, phaseOffset: 1.05, openingSeconds: .9, repeatStartSeconds: 3.4,
    surgePeriod: 5.4, surgeDuration: 1.15, surgeManeuverDuration: .32,
    surgeManeuver: "dart", finaleManeuver: "headshake",
    burstSeconds: .32, recoverySeconds: .82,
    lateralExcursion: .31, cruiseDepth: -2.62, dartDepth: -2.4,
    lateralLimit: .82, lateralAcceleration: .82, turnRate: .76, depthResponse: .55,
    cruiseGait: "css_cruise", burstGait: "burst", turnGait: "turn",
  },
};

const smoothStep = (value: number): number => {
  const t = Math.min(1, Math.max(0, value));
  return t * t * (3 - 2 * t);
};

const easeOutCubic = (value: number): number => {
  const t = Math.min(1, Math.max(0, value));
  return 1 - (1 - t) ** 3;
};

const createMovementCue = (style: RiverMovementStyle) =>
  ({ fightTime, encounter, opening, reeling, mode }: RiverFishMovementContext): RiverFishMovementCue => {
    // A stable cast revision changes the phase without adding client-side randomness.
    const encounterPhase = (((Math.floor(encounter) % 7) + 7) % 7) * .137;
    const clock = Math.max(0, fightTime + style.phaseOffset + encounterPhase * style.period);
    const cycle = Math.floor(clock / style.period);
    const cycleTime = clock - cycle * style.period;
    const side = cycle % 2 === 0 ? 1 : -1;
    const recoveryEnd = style.burstSeconds + style.recoverySeconds;
    const pulse = cycleTime < style.burstSeconds
      ? easeOutCubic(cycleTime / style.burstSeconds)
      : cycleTime < recoveryEnd
        ? 1 - smoothStep((cycleTime - style.burstSeconds) / style.recoverySeconds)
        : 0;
    const motionPulse = opening || mode === "surge"
      ? Math.max(pulse, .62)
      : mode === "warning"
        ? Math.max(pulse, .30)
        : mode === "split"
          ? Math.max(pulse, .2)
          : pulse * .42;
    const gait = opening
      ? style.openingGait ?? style.burstGait
      : mode === "surge"
        ? style.burstGait
        : mode === "warning" || mode === "split"
          ? style.turnGait
          : cycleTime < recoveryEnd
            ? style.turnGait
            : style.cruiseGait;
    return {
      lateralTarget: style.lateralExcursion * .12 * Math.sin(clock * Math.PI * 2 / (style.period * 1.65))
        + side * style.lateralExcursion * motionPulse,
      depthTarget: style.cruiseDepth + (style.dartDepth - style.cruiseDepth) * motionPulse,
      gait,
    };
  };

const createModeAt = (style: RiverMovementStyle) =>
  (fightTime: number, finale: number): { mode: RiverFishFightMode; school: number } => {
    const cycleTime = fightTime - style.repeatStartSeconds;
    const repeatedSurge = cycleTime >= 0 && cycleTime % style.surgePeriod < style.surgeDuration;
    let mode: RiverFishFightMode = fightTime < style.openingSeconds || repeatedSurge ? "surge" : "rest";
    if (finale >= 0 && finale < .8) mode = "warning";
    else if (finale >= .8 && finale < 2.6) mode = "split";
    return { mode, school: 1 };
  };

const createManeuverAt = (style: RiverMovementStyle) =>
  (fightTime: number, mode: RiverFishFightMode, finale: number) => {
    if (finale >= .8 && finale < 2.6) {
      return { kind: style.finaleManeuver, progress: (finale - .8) / 1.8, side: 1 as const };
    }
    const cycleTime = fightTime - style.repeatStartSeconds;
    if (mode !== "surge" || cycleTime < 0) return null;
    const pulseTime = cycleTime % style.surgePeriod;
    if (pulseTime >= style.surgeManeuverDuration) return null;
    const pulseNumber = Math.floor(cycleTime / style.surgePeriod);
    return {
      kind: style.surgeManeuver,
      progress: pulseTime / style.surgeManeuverDuration,
      side: pulseNumber % 2 === 0 ? -1 as const : 1 as const,
    };
  };

const createMovementProfile = (style: RiverMovementStyle): RiverFishMovementProfile => ({
  openingSeconds: style.openingSeconds,
  lateralLimit: style.lateralLimit,
  lateralAcceleration: style.lateralAcceleration,
  turnRate: style.turnRate,
  depthResponse: style.depthResponse,
  escapeGait: style.burstGait,
  cueAt: createMovementCue(style),
  modeAt: createModeAt(style),
  maneuverAt: createManeuverAt(style),
});

export const RIVER_FISH_MOVEMENT_PROFILES: Readonly<Record<RiverFishId, RiverFishMovementProfile>> =
  Object.fromEntries(
    Object.entries(RIVER_FISH_MOTION_STYLES).map(([fishId, style]) => [fishId, createMovementProfile(style)]),
  ) as Record<RiverFishId, RiverFishMovementProfile>;

export const getRiverFishMovementProfile = (fishId: RiverFishId): RiverFishMovementProfile =>
  RIVER_FISH_MOVEMENT_PROFILES[fishId];