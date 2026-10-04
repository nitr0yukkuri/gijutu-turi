import type { FishSpeciesId } from "../fish-species.js";
import type { OceanClientState } from "../ocean-contract.js";
export type OceanState = OceanClientState;
export type { OceanMessage, OceanMode, OceanPhase } from "../ocean-contract.js";
export type { CatchSaveStatus } from "../ocean-contract.js";
export type { FishSpeciesId } from "../fish-species.js";

export type CollectionEntry = {
  id: string;
  number: number;
  name: string | null;
  classification: string | null;
  tagline: string | null;
  description: string | null;
  habitat: string | null;
  rarity: string | null;
  modelKey: string | null;
  catalogStatus: "active" | "preview";
  status: "unknown" | "caught" | "preview";
  catches: number;
  firstCaughtAt: string | null;
  lastCaughtAt: string | null;
};

export type Collection = {
  entries: CollectionEntry[];
  registered: number;
  activeTotal: number;
  catalogTotal: number;
};

export type OceanSceneController = {
  setState: (state: OceanState, serverNow?: number) => void;
  rodStroke?: () => void;
  setCharge: (amount: number, aim?: number) => void;
  aimScreen: (aim?: number, strength?: number) => { x: number; y: number };
  setOverlayOpen?: (open: boolean) => void;
  diagnostics?: unknown;
  dispose: () => void;
};

export type Feedback = {
  text: string;
  detail: string;
  faded: boolean;
};

export type Reticle = { x: number; y: number } | null;
