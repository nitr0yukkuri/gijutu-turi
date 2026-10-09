export type CatchFraming = Readonly<{
  duration: number;
  depth: number;
  screenX: number;
  screenY: number;
  lift: number;
  baseScale: number;
}>;

const REFERENCE_ASPECT = 1.4;
const MIN_ASPECT = .35;

/** Pure camera-space composition for the caught-fish result pose. */
export function catchFraming(fishId: string, aspect: number, fovDegrees: number): CatchFraming {
  const isK8s = fishId === 'k8s-001';
  const isWhale = fishId === 'whale-001';
  const isRust = fishId === 'rust-001';
  const isJsEel = fishId === 'js-001';
  const safeAspect = Math.max(MIN_ASPECT, aspect);
  const compactBlend = Math.max(0, Math.min(1, (.85 - safeAspect) / .35));
  const baseDepth = isK8s ? 9.5 : 8.8;
  // Match the fish's screen-space width from wide landscape through portrait.
  // FOV compensation is handled by fish-camera-scale.ts.
  const depth = baseDepth * Math.max(1, REFERENCE_ASPECT / safeAspect);
  const halfWidth = depth * Math.tan(fovDegrees * Math.PI / 360) * safeAspect;
  const screenX = isK8s
    ? halfWidth * .40 * (1 - compactBlend)
    : halfWidth * .24 * (1 - compactBlend) - .95;

  return {
    duration: isK8s ? .82 : isRust ? 1.05 : isJsEel ? 1.08 : 1.2,
    depth,
    screenX,
    screenY: isK8s ? -.48 : isRust ? .08 : isJsEel ? .1 : .15,
    lift: isK8s ? .48 : isWhale ? 1.35 : isRust ? 1.5 : 2,
    baseScale: isWhale ? .57 : isK8s ? .96 : isRust ? 1.02 : isJsEel ? 1.0 : fishId === 'css-001' ? .88 : 1.1,
  };
}
