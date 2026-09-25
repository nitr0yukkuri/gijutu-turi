import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { FISH_SPECIES } from "./fish-species.js";

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

type CatalogRow = {
  id: string;
  number: number;
  name: string | null;
  classification: string | null;
  tagline: string | null;
  description: string | null;
  habitat: string | null;
  rarity: string | null;
  model_key: string | null;
  catalog_status: "active" | "preview";
};

type CollectionRow = {
  fish_id: string;
  catches: number;
  first_caught_at: string;
  last_caught_at: string;
};

export const isPlayerId = (value: string): boolean => /^player_[a-z0-9-]{12,80}$/.test(value);

export class CollectionStore {
  private readonly db: DatabaseSync;

  constructor(filePath = process.env.GIJUTU_DB_PATH ?? resolve(process.cwd(), "data", "gijutu-turi.sqlite")) {
    mkdirSync(dirname(filePath), { recursive: true });
    this.db = new DatabaseSync(filePath);
    this.db.exec(`
      PRAGMA journal_mode = WAL;
      CREATE TABLE IF NOT EXISTS fish_species (
        id TEXT PRIMARY KEY,
        number INTEGER NOT NULL UNIQUE,
        name TEXT,
        classification TEXT,
        tagline TEXT,
        description TEXT,
        habitat TEXT,
        rarity TEXT,
        model_key TEXT,
        catalog_status TEXT NOT NULL CHECK (catalog_status IN ('active', 'preview'))
      );
      CREATE TABLE IF NOT EXISTS player_collections (
        player_id TEXT NOT NULL,
        fish_id TEXT NOT NULL REFERENCES fish_species(id),
        catches INTEGER NOT NULL DEFAULT 0,
        first_caught_at TEXT NOT NULL,
        last_caught_at TEXT NOT NULL,
        PRIMARY KEY (player_id, fish_id)
      );
      CREATE TABLE IF NOT EXISTS collection_catch_events (
        event_key TEXT PRIMARY KEY,
        player_id TEXT NOT NULL,
        fish_id TEXT NOT NULL REFERENCES fish_species(id),
        caught_at TEXT NOT NULL
      );
    `);
    const insert = this.db.prepare(`
      INSERT INTO fish_species
        (id, number, name, classification, tagline, description, habitat, rarity, model_key, catalog_status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        number=excluded.number,
        name=excluded.name,
        classification=excluded.classification,
        tagline=excluded.tagline,
        description=excluded.description,
        habitat=excluded.habitat,
        rarity=excluded.rarity,
        model_key=excluded.model_key,
        catalog_status=excluded.catalog_status
    `);
    for (const entry of FISH_SPECIES) {
      insert.run(
        entry.id,
        entry.number,
        entry.name,
        entry.classification,
        entry.tagline,
        entry.description,
        entry.habitat,
        entry.rarity,
        entry.modelKey,
        entry.catalogStatus,
      );
    }
  }

  close(): void {
    this.db.close();
  }

  getCollection(playerId: string): { entries: CollectionEntry[]; registered: number; activeTotal: number; catalogTotal: number } {
    if (!isPlayerId(playerId)) throw new Error("invalid_player_id");
    const records = this.db.prepare(`
      SELECT fish_id, catches, first_caught_at, last_caught_at
      FROM player_collections
      WHERE player_id = ?
    `).all(playerId) as unknown as CollectionRow[];
    const byFishId = new Map(records.map(record => [record.fish_id, record]));
    const entries = (this.db.prepare(`
      SELECT id, number, name, classification, tagline, description, habitat, rarity, model_key, catalog_status
      FROM fish_species
      WHERE catalog_status = 'active'
      ORDER BY number
    `).all() as unknown as CatalogRow[]).map(entry => {
      const record = byFishId.get(entry.id);
      return {
        id: entry.id,
        number: entry.number,
        name: entry.name,
        classification: entry.classification,
        tagline: entry.tagline,
        description: entry.description,
        habitat: entry.habitat,
        rarity: entry.rarity,
        modelKey: entry.model_key,
        catalogStatus: entry.catalog_status,
        status: record ? "caught" : entry.catalog_status === "active" ? "unknown" : "preview",
        catches: record?.catches ?? 0,
        firstCaughtAt: record?.first_caught_at ?? null,
        lastCaughtAt: record?.last_caught_at ?? null,
      } satisfies CollectionEntry;
    });
    const activeTotal = entries.filter(entry => entry.catalogStatus === "active").length;
    return {
      entries,
      registered: entries.filter(entry => entry.status === "caught").length,
      activeTotal,
      catalogTotal: entries.length,
    };
  }

  recordCatch(playerId: string, fishId: string, eventKey: string, caughtAt = new Date().toISOString()): ReturnType<CollectionStore["getCollection"]> {
    if (!isPlayerId(playerId)) throw new Error("invalid_player_id");
    if (!/^[-a-z0-9]{3,80}$/.test(fishId) || !/^[-a-zA-Z0-9_:]{3,160}$/.test(eventKey)) throw new Error("invalid_catch");
    const fish = this.db.prepare("SELECT id, catalog_status FROM fish_species WHERE id = ?").get(fishId) as { id: string; catalog_status: string } | undefined;
    if (!fish || fish.catalog_status !== "active") throw new Error("fish_not_catchable");
    const addEvent = this.db.prepare(`
      INSERT OR IGNORE INTO collection_catch_events (event_key, player_id, fish_id, caught_at)
      VALUES (?, ?, ?, ?)
    `);
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const result = addEvent.run(eventKey, playerId, fishId, caughtAt);
      if (Number(result.changes) > 0) {
        this.db.prepare(`
          INSERT INTO player_collections (player_id, fish_id, catches, first_caught_at, last_caught_at)
          VALUES (?, ?, 1, ?, ?)
          ON CONFLICT(player_id, fish_id) DO UPDATE SET
            catches = player_collections.catches + 1,
            last_caught_at = excluded.last_caught_at
        `).run(playerId, fishId, caughtAt, caughtAt);
      }
      this.db.exec("COMMIT");
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
    return this.getCollection(playerId);
  }
}
