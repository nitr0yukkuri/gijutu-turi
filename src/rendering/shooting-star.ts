export type ShootingStarUniformTarget = {
  set(x: number, y: number, z: number, w: number): unknown;
};

const intervalSeconds = 180;
const durationSeconds = 0.85;
const inactiveState = [0, 0, -1, 1] as const;

const randomFor = (seed: number, eventIndex: number, salt: number): number => {
  const value = Math.sin(seed + eventIndex * 127.1 + salt * 311.7) * 43758.5453;
  return value - Math.floor(value);
};

/**
 * Updates a single shader uniform for one rare, short meteor every few minutes.
 * The event pauses with the scene clock, is skipped for reduced-motion users,
 * and needs no texture, network request, or per-frame object allocation.
 */
export function updateShootingStarUniform(
  target: ShootingStarUniformTarget,
  timeSeconds: number,
  sceneSeed: number,
  reducedMotion: boolean,
): void {
  if (reducedMotion || !Number.isFinite(timeSeconds) || timeSeconds < 0) {
    target.set(...inactiveState);
    return;
  }

  const eventIndex = Math.floor(timeSeconds / intervalSeconds);
  const startAt = eventIndex * intervalSeconds
    + 45
    + randomFor(sceneSeed, eventIndex, 1) * 90;
  const progress = (timeSeconds - startAt) / durationSeconds;
  if (progress < 0 || progress > 1) {
    target.set(...inactiveState);
    return;
  }

  const azimuth = -2.5 + randomFor(sceneSeed, eventIndex, 2) * 5;
  const elevation = 0.28 + randomFor(sceneSeed, eventIndex, 3) * 0.82;
  const direction = randomFor(sceneSeed, eventIndex, 4) < 0.5 ? -1 : 1;
  target.set(azimuth, elevation, progress, direction);
}

export const shootingStarGLSL = [
  "uniform vec4 uShootingStar;",
  "float shootingStar(vec3 direction, float cloudMask) {",
  "  if(uShootingStar.z<0.0 || direction.y<=0.04 || uNight<0.55) return 0.0;",
  "  vec2 coordinate=skyCoordinates(direction);",
  "  vec2 trajectory=normalize(vec2(uShootingStar.w,-0.42));",
  "  float progress=clamp(uShootingStar.z,0.0,1.0);",
  "  vec2 head=uShootingStar.xy+trajectory*(progress*0.28);",
  "  vec2 tail=head-trajectory*0.075;",
  "  float distanceToTrail=segmentDistance(coordinate,tail,head);",
  "  float core=exp(-pow(distanceToTrail*900.0,2.0));",
  "  float glow=exp(-pow(distanceToTrail*260.0,2.0))*0.19;",
  "  float headGlow=exp(-pow(length(coordinate-head)*105.0,2.0))*0.24;",
  "  float envelope=smoothstep(0.0,0.07,progress)*(1.0-smoothstep(0.76,1.0,progress));",
  "  float clearSky=1.0-smoothstep(0.18,0.78,cloudMask);",
  "  float stormFade=1.0-uWeatherStorm*0.94;",
  "  return (core+glow+headGlow)*envelope*clearSky*stormFade;",
  "}",
].join("\n");
