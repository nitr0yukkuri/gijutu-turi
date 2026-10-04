import type { OceanPhase } from "./ocean-game.js";
import type { OceanMode } from "./client/types.js";
import type { FishMotionSnapshot } from "./fish.js";

export type CssFishVisualState = "normal" | "hit" | "escape" | "tired" | "catchable";

export type CssFishPalette = {
  body: number;
  shade: number;
  accent: number;
  emission: number;
  glow: number;
  pattern: number;
};

export const CSS_FISH_PALETTES: Readonly<Record<CssFishVisualState, CssFishPalette>> = {
  // The reference keeps one friendly fish silhouette and changes its visual
  // state. CSS fish therefore starts in a readable blue, then moves through
  // warm warning, red escape, violet fatigue, and pale catchable states.
  normal: { body: 0x28b7aa, shade: 0x143d56, accent: 0xffd36c, emission: 0x72f4d8, glow: .48, pattern: .72 },
  // Red is intentionally over-saturated here: underwater extinction removes
  // red faster than blue, so a natural-looking red turns brown/blue at fight
  // depth. The palette must still read as red after the water pass.
  hit: { body: 0xf05243, shade: 0x6e1f31, accent: 0xffd06c, emission: 0xff7255, glow: .95, pattern: .86 },
  escape: { body: 0xff2f36, shade: 0x641127, accent: 0xffb35a, emission: 0xff3b28, glow: 1.25, pattern: .95 },
  tired: { body: 0x7054b4, shade: 0x282051, accent: 0xd5baff, emission: 0x967df0, glow: .42, pattern: .3 },
  catchable: { body: 0xdceeff, shade: 0x7894b4, accent: 0xffffff, emission: 0xc2efff, glow: .86, pattern: .64 },
};

export const getCssFishPalette = (state: CssFishVisualState): CssFishPalette => CSS_FISH_PALETTES[state];

/** Preserve warm pigments in water only while the fish is reacting or fighting hard. */
export const cssFishRedStateStrength = (state: CssFishVisualState): number => {
  if (state === "escape") return 1;
  if (state === "hit") return .78;
  return 0;
};

// The collection has no fight state, so it uses a slow specimen-only preview
// cycle to demonstrate CSS fish's defining behavior without pretending that a
// catch or a server-side mode transition happened.
export const CSS_FISH_PREVIEW_CYCLE_SECONDS = 8.4;
export const cssFishPreviewStateAt = (seconds: number): CssFishVisualState => {
  const phase = ((seconds % CSS_FISH_PREVIEW_CYCLE_SECONDS) + CSS_FISH_PREVIEW_CYCLE_SECONDS) % CSS_FISH_PREVIEW_CYCLE_SECONDS;
  if (phase < 3.0) return "normal";
  if (phase < 4.0) return "hit";
  if (phase < 5.25) return "escape";
  if (phase < 6.75) return "tired";
  if (phase < 7.75) return "catchable";
  return "normal";
};

export type CssFishVisualInput = {
  phase: OceanPhase;
  mode: OceanMode;
  tension: number;
  fish?: FishMotionSnapshot | null;
};

/**
 * Maps authoritative game state to a presentation state. This never changes
 * catch rules or server state; it only selects the CSS fish's appearance.
 */
export const resolveCssFishVisualState = ({ phase, mode, tension, fish }: CssFishVisualInput): CssFishVisualState => {
  if (phase === "caught") return "catchable";
  if (phase === "escaped") return "escape";
  if (phase === "biting") return "hit";
  if (phase !== "fighting") return "normal";
  if (mode === "surge" || mode === "split") return "escape";
  const effort = fish?.swim?.effort ?? 1;
  if (mode === "rest" && effort < .34 && tension < .72) return "tired";
  return "normal";
};
