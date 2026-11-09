export const STAR_FIELD_PROFILE = Object.freeze({
  gridScaleX: 120,
  gridScaleY: 75,
  sparseThreshold: 0.9935,
  minimumCoreRadius: 0.014,
  maximumCoreRadius: 0.032,
  coreFeatherStart: 0.28,
  haloFalloff: 48,
  haloStrength: 0.1,
  flareSelectionThreshold: 0.9,
  flareArmNarrowness: 120,
  horizontalFlareFalloff: 22,
  verticalFlareFalloff: 11,
  flareStrength: 0.3,
});

const glslFloat = (value: number): string => Number.isInteger(value) ? value.toFixed(1) : String(value);

/** Sparse point stars with only occasional, restrained four-point glints. */
export const starFieldGLSL = `float starField(vec3 direction,float cloudMask) {
  if(direction.y<=0.04 || cloudMask>=0.98) return 0.0;
  float elevation=max(direction.y,0.0);
  vec2 grid=skyCoordinates(direction)*vec2(${glslFloat(STAR_FIELD_PROFILE.gridScaleX)},${glslFloat(STAR_FIELD_PROFILE.gridScaleY)});
  vec2 cell=floor(grid);
  vec2 local=fract(grid)-0.5;
  float seed=hash(cell+vec2(17.1,31.7));
  float sparseStars=step(${STAR_FIELD_PROFILE.sparseThreshold},seed);
  if(sparseStars<0.5) return 0.0;
  vec2 offset=vec2(hash(cell+vec2(4.3,7.1)),hash(cell+vec2(9.2,2.7)))-0.5;
  vec2 starDelta=local-offset;
  float pointRadius=mix(${STAR_FIELD_PROFILE.minimumCoreRadius},${STAR_FIELD_PROFILE.maximumCoreRadius},hash(cell+vec2(13.2,8.9)));
  float distanceToStar=length(starDelta);
  float pointCore=1.0-smoothstep(pointRadius*${STAR_FIELD_PROFILE.coreFeatherStart},pointRadius,distanceToStar);
  float halo=exp(-distanceToStar*${glslFloat(STAR_FIELD_PROFILE.haloFalloff)})*${STAR_FIELD_PROFILE.haloStrength};
  float flareSelected=step(${STAR_FIELD_PROFILE.flareSelectionThreshold},hash(cell+vec2(31.8,62.4)));
  float horizontalFlare=exp(-pow(starDelta.y*${glslFloat(STAR_FIELD_PROFILE.flareArmNarrowness)},2.0))*exp(-abs(starDelta.x)*${glslFloat(STAR_FIELD_PROFILE.horizontalFlareFalloff)});
  float verticalFlare=exp(-pow(starDelta.x*${glslFloat(STAR_FIELD_PROFILE.flareArmNarrowness)},2.0))*exp(-abs(starDelta.y)*${glslFloat(STAR_FIELD_PROFILE.verticalFlareFalloff)});
  float flare=(horizontalFlare+verticalFlare)*flareSelected*${STAR_FIELD_PROFILE.flareStrength};
  float starShape=clamp(pointCore+halo+flare,0.0,1.0);
  float stormFade=1.0-uWeatherStorm*0.96;
  float visible=smoothstep(0.04,0.24,elevation)*(1.0-cloudMask*0.96)*stormFade;
  float twinkle=0.84+0.16*sin(uTime*(1.2+seed*1.8)+seed*6.283);
  float magnitude=mix(0.48,1.0,hash(cell+vec2(22.4,9.8)));
  return starShape*sparseStars*visible*twinkle*magnitude;
}`;
