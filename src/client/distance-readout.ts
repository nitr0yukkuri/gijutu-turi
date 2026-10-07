import type { OceanPhase } from "../ocean-contract.js";

export function distanceReadoutFor(phase: OceanPhase, distance: number): Readonly<{
  visible: boolean;
  label: "飛距離" | "残り";
  value: string;
}> {
  const visible = ["casting", "waiting", "biting", "fighting"].includes(phase);
  const isCaught = phase === "caught";
  const safeDistance = Number.isFinite(distance) ? Math.max(0, distance) : 0;
  return {
    visible,
    label: phase === "fighting" || isCaught ? "残り" : "飛距離",
    value: isCaught ? "0" : Math.max(0.1, safeDistance).toFixed(1),
  };
}
