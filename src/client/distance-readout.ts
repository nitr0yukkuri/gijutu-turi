import type { OceanPhase } from "../ocean-contract.js";

export function distanceReadoutFor(phase: OceanPhase, distance: number): Readonly<{
  visible: boolean;
  label: "飛距離" | "残り";
  value: string;
  caught: boolean;
}> {
  const visible = ["casting", "waiting", "biting", "fighting", "caught"].includes(phase);
  const caught = phase === "caught";
  const safeDistance = Number.isFinite(distance) ? Math.max(0, distance) : 0;
  return {
    visible,
    label: phase === "fighting" || caught ? "残り" : "飛距離",
    value: caught ? "0" : Math.max(0.1, safeDistance).toFixed(1),
    caught,
  };
}
