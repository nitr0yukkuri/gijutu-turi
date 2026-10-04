/** Keep fish readable as the camera widens and give portrait screens more of their available height. */
export function fishScaleForResponsiveCamera(
  baseScale: number,
  fovDegrees: number,
  portraitBlend: number,
  referenceFovDegrees = 46,
  portraitBoost = 1.5,
): number {
  const currentHalfFov = Math.tan(fovDegrees * Math.PI / 360);
  const referenceHalfFov = Math.tan(referenceFovDegrees * Math.PI / 360);
  const portraitScale = 1 + (portraitBoost - 1) * Math.max(0, Math.min(1, portraitBlend));
  return baseScale * currentHalfFov / referenceHalfFov * portraitScale;
}
