import type { OceanMode, OceanPhase } from '../ocean-contract.js';

export type K8sPresentationSample = Readonly<{
  phase: OceanPhase;
  mode: OceanMode;
  fightTime: number;
  distance: number;
}>;

/** Top-of-body landmarks in the K8s model's local coordinates (nose = -X). */
export const K8S_SURFACE_BODY_PROBES = [
  { x:-1.78, y:.19, z:0 }, // armored snout
  { x:-1.30, y:.56, z:0 }, // front of the head shield
  { x:-.90, y:.65, z:0 }, // crown
  { x:-.42, y:.62, z:0 }, // shoulder / back
  { x:.06, y:.49, z:0 }, // rear trunk
] as const;

/**
 * Interpolate K8s-only presentation inputs with the fish pose. Discrete modes
 * switch at the midpoint so the lunge cue cannot run ahead of the body.
 */
export function interpolateK8sPresentationSample(
  first:K8sPresentationSample,
  second:K8sPresentationSample,
  amount:number,
):K8sPresentationSample {
  const t=Math.max(0,Math.min(1,amount));
  return{
    phase:t<.5?first.phase:second.phase,
    mode:t<.5?first.mode:second.mode,
    fightTime:first.fightTime+(second.fightTime-first.fightTime)*t,
    distance:first.distance+(second.distance-first.distance)*t,
  };
}

export type K8sSurfaceTransition = 'breach' | 'reentry' | null;
export type K8sSurfaceExposure = Readonly<{ exposed:boolean; transition:K8sSurfaceTransition }>;

const BREACH_GAP=.025;
const REENTRY_GAP=-.09;

/** Hysteresis prevents small wave crests from repeatedly firing splash events. */
export function updateK8sSurfaceExposure(exposed:boolean,gap:number):K8sSurfaceExposure {
  if(!Number.isFinite(gap))return{exposed,transition:null};
  if(!exposed&&gap>=BREACH_GAP)return{exposed:true,transition:'breach'};
  if(exposed&&gap<=REENTRY_GAP)return{exposed:false,transition:'reentry'};
  return{exposed,transition:null};
}

/** Surface wake strength follows actual propulsion, body-wave energy, and tail phase. */
export function k8sSurfaceWakeStrength(
  speed:number,
  bodyAmplitude:number,
  bodyPhase:number,
  lungeProgress:number,
):number {
  const speedGain=Math.max(0,Math.min(1,speed/4.5));
  const waveGain=Math.max(0,Math.min(1,bodyAmplitude/.3));
  const lunge=Math.max(0,Math.min(1,lungeProgress));
  const tailStroke=.5+.5*Math.max(0,Math.sin(bodyPhase+.35));
  const propulsion=.16+speedGain*.38+waveGain*.22+lunge*.22;
  return Math.max(0,Math.min(1,propulsion*(.62+tailStroke*.38)));
}
