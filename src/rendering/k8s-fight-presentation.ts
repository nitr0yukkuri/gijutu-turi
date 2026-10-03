import type { OceanMode, OceanPhase } from '../client/types.js';
import type { FishSpeciesId } from '../fish-species.js';
import { k8sSurfaceLungeProgress } from '../fish-behavior.js';

export type K8sFightPresentation = {
  bodyVisibility: number;
  echoVisibility: number;
  echoSpread: number;
  wakeGain: number;
};

export const K8S_ECHO_COUNT = 2;

const clamp01 = (value: number): number => Math.max(0, Math.min(1, value));

const smoothstep = (value: number): number => {
  const amount = clamp01(value);
  return amount * amount * (3 - 2 * amount);
};

/**
 * Resolve the same server-clocked K8s lunge used by the scene renderer.
 * Callers with live snapshots can pass the renderer's interpolation delay so
 * interface cues land on the same displayed frame as the fish and rod.
 */
export function k8sLungeForSnapshot(
  snapshot: { fishId: FishSpeciesId; phase: OceanPhase; mode: OceanMode; fightTime: number },
  delaySeconds = 0,
): number {
  if (snapshot.fishId !== 'k8s-001' || snapshot.phase !== 'fighting' || snapshot.mode === 'warning') return 0;
  return k8sSurfaceLungeProgress(Math.max(0, snapshot.fightTime - Math.max(0, delaySeconds)));
}

/**
 * K8S Leviathan cues are a view of one server-owned fish, not extra fish state.
 * Distance reveals the body and its echoes; the server fight mode fans echoes
 * out during a surge and gathers them before landing.
 */
export function k8sFightPresentation(
  phase: OceanPhase,
  distance: number,
  mode: OceanMode,
  surfaceLunge = 0,
): K8sFightPresentation {
  if (phase === 'caught') {
    // The result card is a portrait of the landed animal, not another school
    // shot. Hiding the full-size copies avoids stacking several bodies in the
    // close-up catch composition.
    return { bodyVisibility: 1, echoVisibility: 0, echoSpread: .56, wakeGain: 0 };
  }

  if (phase !== 'fighting') {
    return { bodyVisibility: 1, echoVisibility: 0, echoSpread: 1, wakeGain: 0 };
  }

  // Use the actual line distance, not a renderer clock, so all screens reveal
  // the same fish even after reconnecting or receiving a late snapshot.
  const distanceProgress = clamp01((44 - Math.max(0, distance)) / (44 - 8));
  const approach = smoothstep(distanceProgress);
  const breach = clamp01(surfaceLunge);
  const modeGain = mode === 'surge' ? .96 : mode === 'split' ? 1.12 : mode === 'warning' ? .34 : .18;
  // Keep replicas readable through the breach: the main fish may occlude them,
  // but a K8s surge should not make the cluster collapse to a single animal.
  const echoVisibility = (.004 + .22 * approach) * modeGain * (1 - breach * .25);
  const echoSpread = mode === 'warning'
    ? .52
    : mode === 'surge'
      ? 1.8
      : mode === 'split'
      ? 2.25 - breach * .5
        : .72 + .18 * approach;
  const wakeGain = approach * (mode === 'surge' ? 1.4 : mode === 'split' ? 1.8 : mode === 'warning' ? .75 : .25) + breach * 1.5;

  return {
    bodyVisibility: Math.max(.48 + .52 * approach, .58 + .42 * breach),
    echoVisibility,
    echoSpread,
    wakeGain,
  };
}
