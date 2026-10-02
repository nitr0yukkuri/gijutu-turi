import type { FishSpeciesId } from "./fish-species.js";
import type { HookResult } from "./hook-timing.js";

export type OceanPhase = "idle" | "casting" | "waiting" | "biting" | "fighting" | "caught" | "escaped" | "retrieving";
export type OceanMode = "rest" | "surge" | "warning" | "split";

/** Stable client/server payload; the game keeps additional private simulation fields. */
export type OceanWireState = {
  phase: OceanPhase;
  strength: number;
  aim: number;
  revision: number;
  castAt: number;
  retrieveAt: number;
  tension: number;
  distance: number;
  reeling: boolean;
  mode: OceanMode;
  stamina?: number;
  canReel?: boolean;
  criticalWindow: boolean;
  hookResult: HookResult | null;
  approach: number;
  catches: number;
  reason: "" | "missed" | "line" | "slack" | "distance";
  resultAt: number;
  fish?: unknown;
  fishId: FishSpeciesId;
  fishX?: number;
  fishSpeed?: number;
  school?: number;
};

export type OceanMessage = {
  type: "ocean";
  state: OceanWireState;
  rodStroke: number;
  serverNow: number;
  controllers: number;
  displays: number;
};
