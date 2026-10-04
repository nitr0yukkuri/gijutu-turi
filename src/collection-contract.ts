export type CollectionStatus = "unknown" | "caught" | "preview";

export type CollectionEntry = {
  id: string;
  number: number;
  name: string | null;
  classification: string | null;
  tagline: string | null;
  description: string | null;
  habitat: string | null;
  rarity: string | null;
  modelKey: string | null;
  catalogStatus: "active" | "preview";
  status: CollectionStatus;
  catches: number;
  firstCaughtAt: string | null;
  lastCaughtAt: string | null;
};

export type CollectionSnapshot = {
  entries: CollectionEntry[];
  registered: number;
  activeTotal: number;
  catalogTotal: number;
};

/** Storage boundary shared by SQLite, D1 and PostgreSQL adapters. */
export interface CollectionRepository {
  ping(): void | Promise<void>;
  getCollection(playerId: string): CollectionSnapshot | Promise<CollectionSnapshot>;
  recordCatch(playerId: string, fishId: string, eventKey: string, caughtAt?: string): CollectionSnapshot | Promise<CollectionSnapshot>;
  close(): void | Promise<void>;
}

export const isPlayerId = (value: string): boolean => /^player_[a-z0-9-]{12,80}$/.test(value);
