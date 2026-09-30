import { RETRIEVE_DURATION_MS } from "../ocean-timing.js";

export type RetrievePresentation = {
  bobberProgress: number;
  rodLoad: number;
  rodLift: number;
  reelPhase: number;
  lineSag: number;
  lineOpacity: number;
};

const clamp01 = (value: number): number => Math.max(0, Math.min(1, value));
const lerp = (from: number, to: number, amount: number): number => from + (to - from) * amount;

/**
 * Converts the authoritative retrieve progress into one coherent tackle pose.
 * The renderer owns no clock here: every cue is derived from the same progress.
 */
export function retrievePresentationAt(progress: number): RetrievePresentation {
  const p = clamp01(progress);
  return {
    bobberProgress: p * p,
    rodLoad: (1 - p) * 0.12,
    rodLift: (1 - p) * 0.18,
    reelPhase: p * Math.PI * 10,
    lineSag: lerp(0.025, 0.008, p),
    lineOpacity: lerp(0.82, 0.64, p),
  };
}

/** Convert a server timestamp into a clamped presentation progress. */
export function retrieveProgressAt(serverNow: number, retrieveAt: number, durationMs = RETRIEVE_DURATION_MS): number {
  return clamp01((serverNow - retrieveAt) / Math.max(1, durationMs));
}
