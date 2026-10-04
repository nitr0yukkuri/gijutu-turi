const TAU = Math.PI * 2;

export const DOCKER_WHALE_PREVIEW_CYCLE_SECONDS = 5.8;

export type DockerWhalePreviewMotion = {
  bodyPhase: number;
  bodyFrequency: number;
  bodyWavelength: number;
  amplitude: number;
  effort: number;
  power: number;
  buoyancy: number;
  forwardOffset: number;
  turn: number;
  cargoLoad: number;
  stroke: number;
  glide: number;
};

/**
 * One presentation clock for the catalog whale.
 *
 * A whale does not need a constant bob. It makes a short fluke stroke and
 * then coasts. The same phase drives the body wave, the tiny root drift and
 * the cargo load so the specimen reads as one heavy animal.
 */
export const dockerWhalePreviewMotionAt = (seconds: number): DockerWhalePreviewMotion => {
  const safeSeconds = Number.isFinite(seconds) ? Math.max(0, seconds) : 0;
  const bodyPhase = safeSeconds / DOCKER_WHALE_PREVIEW_CYCLE_SECONDS * TAU;
  const rawStroke = Math.sin(bodyPhase - .35);
  const stroke = Math.pow(Math.max(0, rawStroke), 2.4);
  const glide = 1 - stroke;

  return {
    bodyPhase,
    bodyFrequency: 1.02,
    bodyWavelength: .94,
    amplitude: .034 + stroke * .106,
    effort: .16 + stroke * .72,
    power: .22 + stroke * .58,
    // Keep buoyancy subordinate to the body. This is a breathing-sized lift,
    // not a vertical sine path that makes the specimen look inflatable.
    buoyancy: Math.sin(bodyPhase * .5 - .8) * .009 + stroke * .004,
    // A short forward pulse followed by a smooth return gives the eye a
    // delayed body response without moving the catalog card out of frame.
    forwardOffset: -(1 - Math.cos(bodyPhase)) * .012,
    turn: Math.sin(bodyPhase * .5 - .55) * .08,
    cargoLoad: .18 + stroke * .22,
    stroke,
    glide,
  };
};
