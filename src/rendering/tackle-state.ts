import type { FishSpeciesId } from "../fish-species.js";
import type { OceanMode, OceanPhase } from "../client/types.js";

export type TackleStateSource = {
  phase: OceanPhase;
  fishId: FishSpeciesId;
  mode: OceanMode;
  tension: number;
  distance: number;
  reeling?: boolean;
  revision: number;
};

export type TackleSnapshot = {
  phase: OceanPhase;
  fishId: FishSpeciesId;
  mode: OceanMode;
  tension: number;
  distance: number;
  reeling: boolean;
  revision: number;
  serverAt: number;
};

export type TackleTransition = {
  revision: number;
  serverAt: number;
  from: Pick<TackleSnapshot, "phase" | "fishId" | "mode" | "reeling">;
  to: Pick<TackleSnapshot, "phase" | "fishId" | "mode" | "reeling">;
};

const initialSnapshot: TackleSnapshot = {
  phase: "idle",
  fishId: "fish-001",
  mode: "rest",
  tension: 0,
  distance: 0,
  reeling: false,
  revision: 0,
  serverAt: 0,
};

const transitionPart = (snapshot: TackleSnapshot): TackleTransition["from"] => ({
  phase: snapshot.phase,
  fishId: snapshot.fishId,
  mode: snapshot.mode,
  reeling: snapshot.reeling,
});

const hasTransition = (from: TackleSnapshot, to: TackleSnapshot): boolean =>
  from.phase !== to.phase || from.fishId !== to.fishId || from.mode !== to.mode || from.reeling !== to.reeling;

/**
 * Keeps the authoritative tackle values used by the rod and reel renderer.
 * It is deliberately fed by server snapshots instead of owning game state.
 */
export class TackleStateStore {
  private current: TackleSnapshot = { ...initialSnapshot };
  private previous: TackleSnapshot = { ...initialSnapshot };
  private readonly history: TackleTransition[] = [];

  update(source: TackleStateSource, serverAt = Date.now()): void {
    const next: TackleSnapshot = {
      phase: source.phase,
      fishId: source.fishId,
      mode: source.mode,
      tension: source.tension,
      distance: source.distance,
      reeling: source.reeling === true,
      revision: source.revision,
      serverAt,
    };
    if (hasTransition(this.current, next)) {
      this.history.push({ revision: next.revision, serverAt, from: transitionPart(this.current), to: transitionPart(next) });
      if (this.history.length > 32) this.history.shift();
    }
    this.previous = this.current;
    this.current = next;
  }

  getState(): TackleSnapshot {
    return this.current;
  }

  getPreviousState(): TackleSnapshot {
    return this.previous;
  }

  getTransitions(): readonly TackleTransition[] {
    return this.history;
  }
}
