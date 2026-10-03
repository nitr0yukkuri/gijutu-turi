export type CatchFraming = Readonly<{
  duration: number;
  depth: number;
  screenX: number;
  screenY: number;
  lift: number;
  baseScale: number;
}>;

/** Pure camera-space composition for the caught-fish result pose. */
export function catchFraming(fishId: string, aspect: number, fovDegrees: number): CatchFraming {
  const isK8s = fishId === 'k8s-001';
  const isWhale = fishId === 'whale-001';
  const depth = aspect < .85
    ? (isK8s ? 9.5 : 8.8) * .85 / aspect
    : isK8s ? 9.5 : 8.8;
  const halfWidth = depth * Math.tan(fovDegrees * Math.PI / 360) * aspect;
  const screenX = isK8s
    ? aspect < .85 ? 0 : halfWidth * .40
    : aspect < .85 ? -.95 : aspect * depth * .425 * .24 - .95;

  return {
    duration: isK8s ? .82 : 1.2,
    depth,
    screenX,
    screenY: isK8s ? -.48 : .15,
    lift: isK8s ? .48 : isWhale ? 1.35 : 2,
    baseScale: isWhale ? .57 : isK8s ? .96 : fishId === 'css-001' ? .88 : 1.1,
  };
}
