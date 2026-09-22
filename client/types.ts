export type OceanPhase =
  | "idle"
  | "casting"
  | "waiting"
  | "biting"
  | "fighting"
  | "caught"
  | "escaped"
  | "retrieving";

export type FishSpecies = "go" | "k8s";

export type OceanState = {
  phase: OceanPhase;
  strength: number;
  aim: number;
  revision: number;
  castAt: number;
  retrieveAt: number;
  tension: number;
  distance: number;
  initialDistance: number;
  reeling: boolean;
  biteRemaining: number;
  fightTime: number;
  mode: "rest" | "surge" | "warning" | "split";
  school: number;
  resultAt: number;
  reason: "" | "missed" | "line" | "slack" | "distance";
  catches: number;
  fishX: number;
  fishSpeed: number;
  fishHeadingX: number;
  fishHeadingZ: number;
  fishWavePhase: number;
  fishWaveAmplitude: number;
  fishWaveFrequency: number;
  species: FishSpecies;
};

export const freshOceanState = (): OceanState => ({
  phase: "idle",
  strength: 0.65,
  aim: 0,
  revision: 0,
  castAt: 0,
  retrieveAt: 0,
  tension: 0,
  distance: 0,
  initialDistance: 0,
  reeling: false,
  biteRemaining: 0,
  fightTime: 0,
  mode: "rest",
  school: 1,
  resultAt: 0,
  reason: "",
  catches: 0,
  fishX: 0,
  fishSpeed: 0,
  fishHeadingX: 1,
  fishHeadingZ: 0,
  fishWavePhase: 0,
  fishWaveAmplitude: 0,
  fishWaveFrequency: 1.6,
  species: "go",
});
