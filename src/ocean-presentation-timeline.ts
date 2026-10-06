import type { OceanClientState } from "./ocean-contract.js";

type TimedSnapshot = Readonly<{ serverTime: number; state: OceanClientState }>;

/**
 * Shared delayed presentation clock for the WebGL scene and the HUD.
 * The server remains authoritative; this only samples already-validated
 * snapshots at the same render time used to interpolate the fish.
 */
export class OceanPresentationTimeline {
  private readonly snapshots: TimedSnapshot[] = [];
  private serverOffset = 0;

  constructor(private readonly delayMs: number) {}

  push(state: OceanClientState, serverNow: number, clientNow = Date.now()): void {
    if (Number.isFinite(serverNow)) this.serverOffset = serverNow - clientNow;
    const previous = this.snapshots.at(-1)?.state;
    if (previous && previous.revision !== state.revision) this.snapshots.length = 0;

    const serverTime = Number.isFinite(serverNow) ? serverNow : Date.now() + this.serverOffset;
    this.snapshots.push({ serverTime, state });
    if (this.snapshots.length > 16) this.snapshots.shift();
  }

  sample(now = Date.now()): OceanClientState | null {
    return this.sampleWith(interpolateOceanPresentationState, now);
  }

  sampleWith<T>(
    interpolate: (first: OceanClientState, second: OceanClientState, amount: number) => T,
    now = Date.now(),
  ): T | null {
    if (!this.snapshots.length) return null;
    const targetTime = now + this.serverOffset - this.delayMs;
    while (this.snapshots.length > 2 && (this.snapshots[1]?.serverTime ?? Infinity) <= targetTime) this.snapshots.shift();
    const first = this.snapshots[0];
    if (!first) return null;
    if (this.snapshots.length === 1) return interpolate(first.state, first.state, 0);

    const second = this.snapshots[1];
    if (!second) return interpolate(first.state, first.state, 0);
    if (targetTime <= first.serverTime) return interpolate(first.state, first.state, 0);
    if (targetTime >= second.serverTime) return interpolate(second.state, second.state, 0);

    const amount = (targetTime - first.serverTime) / Math.max(1, second.serverTime - first.serverTime);
    return interpolate(first.state, second.state, amount);
  }
}

const lerp = (first: number, second: number, amount: number): number => first + (second - first) * amount;

/** Continuous HUD values interpolate; phase/mode switch at the midpoint. */
export function interpolateOceanPresentationState(
  first: OceanClientState,
  second: OceanClientState,
  amount: number,
): OceanClientState {
  const t = Math.max(0, Math.min(1, amount));
  const discrete = t < 0.5 ? first : second;
  return {
    ...discrete,
    distance: lerp(first.distance, second.distance, t),
    tension: lerp(first.tension, second.tension, t),
    fightTime: lerp(first.fightTime, second.fightTime, t),
  };
}

