/** Compensate for vertical FOV changes without enlarging fish on narrow screens. */
export function fishScaleForResponsiveCamera(
  baseScale: number,
  fovDegrees: number,
  portraitBlend: number,
  referenceFovDegrees = 46,
  portraitScale = 1,
): number {
  const currentHalfFov = Math.tan(fovDegrees * Math.PI / 360);
  const referenceHalfFov = Math.tan(referenceFovDegrees * Math.PI / 360);
  const responsiveScale = 1 + (portraitScale - 1) * Math.max(0, Math.min(1, portraitBlend));
  return baseScale * currentHalfFov / referenceHalfFov * responsiveScale;
}
