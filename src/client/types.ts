export type OceanPhase = "idle" | "casting" | "waiting" | "biting" | "fighting" | "caught" | "escaped" | "retrieving";
export type OceanMode = "rest" | "surge" | "warning" | "split";

export type OceanState = {
  phase: OceanPhase;
  strength: number;
  aim: number;
  revision: number;
  castAt: number;
  retrieveAt: number;
  tension: number;
  distance: number;
  mode: OceanMode;
  approach: number;
  catches: number;
  reason: "" | "missed" | "line" | "slack" | "distance";
  resultAt: number;
  fish?: unknown;
  fishX?: number;
  fishSpeed?: number;
  school?: number;
};

export type OceanMessage = {
  type: "ocean";
  state: OceanState;
  serverNow: number;
  controllers: number;
  displays: number;
};

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
  setCharge: (amount: number, aim?: number) => void;
  aimScreen: (aim?: number, strength?: number) => { x: number; y: number };
  diagnostics?: unknown;
  dispose: () => void;
};

export type Feedback = {
  text: string;
  detail: string;
  faded: boolean;
};

export type Reticle = { x: number; y: number } | null;
