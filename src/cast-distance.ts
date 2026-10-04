export const CAST_MIN_STRENGTH = .2;
export const CAST_MAX_STRENGTH = 1;
export const CAST_MIN_DISTANCE_METERS = 10;
export const CAST_MAX_DISTANCE_METERS = 35;

const clamp = (value:number,min:number,max:number):number => Math.max(min,Math.min(max,value));

/** Convert the authoritative cast strength into a line distance in metres. */
export const castDistanceForStrength = (strength:number):number => {
  const bounded = clamp(
    Number.isFinite(strength) ? strength : CAST_MIN_STRENGTH,
    CAST_MIN_STRENGTH,
    CAST_MAX_STRENGTH,
  );
  const progress = (bounded-CAST_MIN_STRENGTH)/(CAST_MAX_STRENGTH-CAST_MIN_STRENGTH);
  return CAST_MIN_DISTANCE_METERS + progress*(CAST_MAX_DISTANCE_METERS-CAST_MIN_DISTANCE_METERS);
};
