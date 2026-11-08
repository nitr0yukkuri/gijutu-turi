import type { OceanPhase } from '../ocean-contract.js';
import type { Waterway } from '../waterway.js';

export const RIVER_FIGHT_RAIN_PROFILE = Object.freeze({
  transitionSpeed: 6,
  pointSizeScale: 0.72,
  opacityScale: 0.68,
  keepFadeStart: 0.62,
  keepFadeEnd: 0.74,
});

export const RIVER_FIGHT_RAIN_SHADER = Object.freeze({
  uniform: 'uniform float uRiverFight;',
  keep: `mix(1.0,1.0-smoothstep(${RIVER_FIGHT_RAIN_PROFILE.keepFadeStart},${RIVER_FIGHT_RAIN_PROFILE.keepFadeEnd},aPhase),uRiverFight)`,
  pointSize: `mix(1.0,${RIVER_FIGHT_RAIN_PROFILE.pointSizeScale},uRiverFight)`,
  opacity: `mix(1.0,${RIVER_FIGHT_RAIN_PROFILE.opacityScale},uRiverFight)`,
});

export function shouldSoftenRiverFightRain(waterway: Waterway, phase: OceanPhase): boolean {
  return waterway === 'river' && phase === 'fighting';
}

export function riverFightRainParticleProfile(phase: number, blend: number) {
  const amount = Math.min(1, Math.max(0, blend));
  const fadePosition = Math.min(1, Math.max(0,
    (phase - RIVER_FIGHT_RAIN_PROFILE.keepFadeStart)
      / (RIVER_FIGHT_RAIN_PROFILE.keepFadeEnd - RIVER_FIGHT_RAIN_PROFILE.keepFadeStart),
  ));
  const fade = fadePosition * fadePosition * (3 - 2 * fadePosition);

  return {
    keep: 1 - fade * amount,
    pointSizeScale: 1 + (RIVER_FIGHT_RAIN_PROFILE.pointSizeScale - 1) * amount,
    opacityScale: 1 + (RIVER_FIGHT_RAIN_PROFILE.opacityScale - 1) * amount,
  };
}
