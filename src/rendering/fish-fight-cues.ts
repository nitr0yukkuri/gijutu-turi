import type {FishMotionSnapshot} from '../fish.js';

const clamp=(value:number)=>Math.max(0,Math.min(1,value));

export function lineSagForLoad(load:number) {
  const slack=1-clamp(load);
  return {airSag:.04+.80*slack**2,wetSag:.025+.50*slack**2};
}

/** One presentation clock for the tail, rod, fins and leader. Never feeds back
 * into game tension, distance or catch decisions. No independent time input. */
export function fishFightCues(fish:FishMotionSnapshot|null,tension:number) {
  const load=clamp(tension),effort=clamp(fish?.swim?.effort??0);
  const wave=fish?.bodyWave;
  // Same phase at the tail tip (s=1) as go-fish.ts's travelling body wave.
  const tail=wave?Math.sin(Math.PI*2/Math.max(.5,Math.min(1.5,wave.wavelength))-wave.phase):0;
  const stroke=tail*tail;
  const {airSag,wetSag}=lineSagForLoad(load);
  return {
    load,stroke,
    strain:clamp(load+(stroke-.5)*.16*effort*load),
    rodSide:tail*.055*effort*load,
    airSag,wetSag,
    lineOpacity:.52+.36*load,
    leaderOpacity:.32+.38*load,
    ripplePower:(.04+.10*load)*effort,
  };
}
