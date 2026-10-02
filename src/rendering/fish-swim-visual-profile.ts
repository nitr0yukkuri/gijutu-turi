export type FishSwimVisualProfile = Readonly<{
  /** Local X coordinate where the traveling body wave begins. */
  flexStartX: number;
  /** Local body length over which the wave reaches full strength. */
  flexLength: number;
  bendGain: number;
  turnGain: number;
  finPhaseLag: number;
  finFlutterGain: number;
}>;

/** Shared default for the longer, fusiform Go/CSS models. */
export const STANDARD_FISH_SWIM_VISUAL_PROFILE: FishSwimVisualProfile = {
  flexStartX: -1.45,
  flexLength: 3.8,
  bendGain: .62,
  turnGain: .45,
  finPhaseLag: .35,
  finFlutterGain: .07,
};

/**
 * K8s has a deep armored front and a compact rear body. Keep the shield
 * stable, then carry the server-clocked wave through the peduncle and tail.
 */
export const K8S_LEVIATHAN_SWIM_VISUAL_PROFILE: FishSwimVisualProfile = {
  flexStartX: -.42,
  flexLength: 1.8,
  bendGain: .62,
  turnGain: .45,
  finPhaseLag: .55,
  finFlutterGain: .055,
};

export function fishFlexEnvelopeAt(localX: number, profile: FishSwimVisualProfile): number {
  const amount = Math.max(0, Math.min(1, (localX - profile.flexStartX) / profile.flexLength));
  return amount * amount;
}

/** CPU counterpart of the vertex shader's lateral body deformation. */
export function fishBodyWaveOffsetAt(
  localX: number,
  phase: number,
  wavePower: number,
  wavelength: number,
  turn: number,
  profile: FishSwimVisualProfile,
): number {
  const progress = Math.sqrt(fishFlexEnvelopeAt(localX, profile));
  const envelope = progress * progress;
  const spatialFrequency = Math.PI * 2 / Math.max(.5, Math.min(1.5, wavelength));
  const boundedPower = Math.max(0, Math.min(1, wavePower));
  return (
    Math.sin(progress * spatialFrequency - phase) * envelope * boundedPower * profile.bendGain
    + turn * envelope * profile.turnGain
  );
}
