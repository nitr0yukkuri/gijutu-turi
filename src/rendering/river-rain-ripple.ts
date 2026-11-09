export const RIVER_RAIN_RIPPLE_PROFILE = Object.freeze({
  lightRainGridScale: 0.4,
  heavyRainGridScale: 0.55,
  lightRainCellChance: 0.055,
  heavyRainCellChance: 0.32,
  minimumRadius: 0.008,
  maximumRadius: 0.105,
  radiusScaleMinimum: 0.78,
  radiusScaleMaximum: 1.22,
  minimumRingWidth: 24,
  maximumRingWidth: 43,
  fadeInEnd: 0.11,
  fadeOutStart: 0.6,
  fadeOutEnd: 0.92,
  normalStrength: 0.045,
  normalCrossStrength: 0.0324,
  color: Object.freeze([0.008, 0.014, 0.016] as const),
});

const clamp01 = (value: number): number => Math.min(1, Math.max(0, value));
const mix = (from: number, to: number, amount: number): number => from + (to - from) * amount;
const glslFloat = (value: number): string => Number.isInteger(value) ? value.toFixed(1) : String(value);

/** Rain-impact density in world-space cells, capped so the surface never becomes a field of rings. */
export function riverRainRippleProfile(rainIntensity: number) {
  const rain = Number.isFinite(rainIntensity) ? clamp01(rainIntensity) : 0;
  const gridScale = mix(RIVER_RAIN_RIPPLE_PROFILE.lightRainGridScale, RIVER_RAIN_RIPPLE_PROFILE.heavyRainGridScale, rain);
  const activeCellChance = mix(RIVER_RAIN_RIPPLE_PROFILE.lightRainCellChance, RIVER_RAIN_RIPPLE_PROFILE.heavyRainCellChance, rain);

  return {
    rain,
    gridScale,
    activeCellChance,
    ripplesPerWorldArea: gridScale * gridScale * activeCellChance,
  };
}

/** Water-surface rain marks only; falling rain particles are handled by their own renderer. */
export const RIVER_RAIN_RIPPLE_SHADER = Object.freeze({
  function: `float riverRainRipple(vec2 point) {
  float rain=clamp(uWeatherRain,0.0,1.0);
  vec2 drift=vec2(uTime*(0.015+uWeatherWind*0.12),-uTime*(0.01+uWeatherWind*0.05));
  vec2 grid=(point+drift)*mix(${RIVER_RAIN_RIPPLE_PROFILE.lightRainGridScale},${RIVER_RAIN_RIPPLE_PROFILE.heavyRainGridScale},rain);
  vec2 cell=floor(grid),local=fract(grid);
  float occurrence=hash(cell+vec2(83.1,19.2));
  if(occurrence>mix(${RIVER_RAIN_RIPPLE_PROFILE.lightRainCellChance},${RIVER_RAIN_RIPPLE_PROFILE.heavyRainCellChance},rain))return 0.0;
  vec4 randomA=vec4(hash(cell+vec2(17.7,48.2)),hash(cell+vec2(113.13,271.19)),hash(cell+vec2(61.7,9.2)),hash(cell+vec2(31.4,71.8)));
  vec4 randomB=vec4(hash(cell+vec2(93.2,7.6)),hash(cell+vec2(44.1,128.3)),hash(cell+vec2(8.9,53.7)),hash(cell+vec2(205.3,17.1)));
  vec2 center=mix(vec2(0.08),vec2(0.92),randomA.xy);
  float rate=mix(0.36,0.68,randomA.z)*(1.0+rain*0.28);
  float age=fract(uTime*rate+randomA.w);
  float radius=mix(${RIVER_RAIN_RIPPLE_PROFILE.minimumRadius},${RIVER_RAIN_RIPPLE_PROFILE.maximumRadius},age)*mix(${RIVER_RAIN_RIPPLE_PROFILE.radiusScaleMinimum},${RIVER_RAIN_RIPPLE_PROFILE.radiusScaleMaximum},randomB.x);
  float angle=randomB.y*6.2831853;
  mat2 rotation=mat2(cos(angle),-sin(angle),sin(angle),cos(angle));
  vec2 ellipse=rotation*(local-center);
  float aspect=mix(0.78,1.25,randomB.z);
  float distanceToRing=length(vec2(ellipse.x/aspect,ellipse.y));
  float ringWidth=mix(${glslFloat(RIVER_RAIN_RIPPLE_PROFILE.minimumRingWidth)},${glslFloat(RIVER_RAIN_RIPPLE_PROFILE.maximumRingWidth)},randomB.w);
  float ring=exp(-pow((distanceToRing-radius)*ringWidth,2.0));
  float fade=smoothstep(0.0,${RIVER_RAIN_RIPPLE_PROFILE.fadeInEnd},age)*(1.0-smoothstep(${RIVER_RAIN_RIPPLE_PROFILE.fadeOutStart},${RIVER_RAIN_RIPPLE_PROFILE.fadeOutEnd},age));
  return ring*fade;
}`,
  normalAdjustment: `n=normalize(n+vec3(rainRipple*${RIVER_RAIN_RIPPLE_PROFILE.normalStrength},0.0,rainRipple*${RIVER_RAIN_RIPPLE_PROFILE.normalCrossStrength}));`,
  colorAdjustment: `color+=vec3(${RIVER_RAIN_RIPPLE_PROFILE.color.join(",")})*rainRipple;`,
});
