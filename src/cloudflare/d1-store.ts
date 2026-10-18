import { FISH_SPECIES, isFishSpeciesId, type FishSpeciesId } from "../fish-species.js";
import { isPlayerId, type CollectionEntry, type CollectionSnapshot } from "../collection-contract.js";
import type { D1Database, D1PreparedStatement } from "./types.js";

let catalogReady: Promise<void> | undefined;

const schema = [
  `CREATE TABLE IF NOT EXISTS fish_species (
    id TEXT PRIMARY KEY, number INTEGER NOT NULL UNIQUE, name TEXT, classification TEXT,
    tagline TEXT, description TEXT, habitat TEXT, rarity TEXT, model_key TEXT,
    catalog_status TEXT NOT NULL CHECK (catalog_status IN ('active', 'preview'))
  )`,
  `CREATE TABLE IF NOT EXISTS player_collections (
    player_id TEXT NOT NULL, fish_id TEXT NOT NULL REFERENCES fish_species(id),
    catches INTEGER NOT NULL DEFAULT 0, first_caught_at TEXT NOT NULL, last_caught_at TEXT NOT NULL,
    PRIMARY KEY (player_id, fish_id)
  )`,
  `CREATE TABLE IF NOT EXISTS collection_catch_events (
    event_key TEXT PRIMARY KEY, player_id TEXT NOT NULL, fish_id TEXT NOT NULL REFERENCES fish_species(id),
    caught_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS player_sessions (
    player_id TEXT PRIMARY KEY, token_hash TEXT NOT NULL UNIQUE, created_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS ocean_rooms (
    room_id TEXT PRIMARY KEY, player_id TEXT NOT NULL, fish_id TEXT, created_at TEXT NOT NULL
  )`,
];

const bind = (db: D1Database, sql: string, values: Array<string | number | boolean | null> = []): D1PreparedStatement =>
  db.prepare(sql).bind(...values);

export async function ensureCatalog(db: D1Database): Promise<void> {
  if (!catalogReady) {
    catalogReady = (async () => {
      const statements: D1PreparedStatement[] = schema.map(sql => db.prepare(sql));
      for (const entry of FISH_SPECIES) {
        statements.push(bind(db, `UPDATE fish_species
          SET number = (SELECT CASE WHEN COALESCE(MIN(number), 0) > 0 THEN -1 ELSE MIN(number) - 1 END FROM fish_species)
          WHERE id LIKE 'unknown-%' AND number = ? AND catalog_status = 'preview'
            AND (EXISTS (SELECT 1 FROM player_collections WHERE fish_id = fish_species.id)
              OR EXISTS (SELECT 1 FROM collection_catch_events WHERE fish_id = fish_species.id))`, [entry.number]));
        statements.push(bind(db, `DELETE FROM fish_species
          WHERE id LIKE 'unknown-%' AND number = ? AND catalog_status = 'preview'
            AND NOT EXISTS (SELECT 1 FROM player_collections WHERE fish_id = fish_species.id)
            AND NOT EXISTS (SELECT 1 FROM collection_catch_events WHERE fish_id = fish_species.id)`, [entry.number]));
        statements.push(bind(db, `INSERT INTO fish_species
          (id, number, name, classification, tagline, description, habitat, rarity, model_key, catalog_status)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(id) DO UPDATE SET number=excluded.number, name=excluded.name,
            classification=excluded.classification, tagline=excluded.tagline, description=excluded.description,
            habitat=excluded.habitat, rarity=excluded.rarity, model_key=excluded.model_key,
            catalog_status=excluded.catalog_status`, [
          entry.id, entry.number, entry.name, entry.classification, entry.tagline, entry.description,
          entry.habitat, entry.rarity, entry.modelKey, entry.catalogStatus,
        ]));
      }
      await db.batch(statements);
    })().catch(error => {
      catalogReady = undefined;
      throw error;
    });
  }
  await catalogReady;
}

type CatalogRow = {
  id: string; number: number; name: string | null; classification: string | null;
  tagline: string | null; description: string | null; habitat: string | null;
  rarity: string | null; model_key: string | null; catalog_status: "active" | "preview";
  catches: number | null; first_caught_at: string | null; last_caught_at: string | null;
};

export async function getCollection(db: D1Database, playerId: string): Promise<CollectionSnapshot> {
  await ensureCatalog(db);
  if (!isPlayerId(playerId)) throw new Error("invalid_player_id");
  const result = await bind(db, `SELECT species.id, species.number, species.name, species.classification,
      species.tagline, species.description, species.habitat, species.rarity, species.model_key,
      species.catalog_status, collection.catches, collection.first_caught_at, collection.last_caught_at
    FROM fish_species AS species
    LEFT JOIN player_collections AS collection
      ON collection.fish_id = species.id AND collection.player_id = ?
    WHERE species.catalog_status = 'active' ORDER BY species.number`, [playerId]).all<CatalogRow>();
  const entries: CollectionEntry[] = result.results.map(row => ({
    id: row.id, number: Number(row.number), name: row.name, classification: row.classification,
    tagline: row.tagline, description: row.description, habitat: row.habitat, rarity: row.rarity,
    modelKey: row.model_key, catalogStatus: row.catalog_status,
    status: row.first_caught_at ? "caught" : "unknown", catches: Number(row.catches ?? 0),
    firstCaughtAt: row.first_caught_at, lastCaughtAt: row.last_caught_at,
  }));
  const activeTotal = entries.length;
  return { entries, registered: entries.filter(entry => entry.status === "caught").length, activeTotal, catalogTotal: activeTotal };
}

export async function registerPlayerSession(db: D1Database, playerId: string, tokenHash: string): Promise<boolean> {
  await ensureCatalog(db);
  if (!isPlayerId(playerId) || !/^[a-f0-9]{64}$/.test(tokenHash)) throw new Error("invalid_player_session");
  await bind(db, "INSERT OR IGNORE INTO player_sessions (player_id, token_hash, created_at) VALUES (?, ?, ?)",
    [playerId, tokenHash, new Date().toISOString()]).run();
  const row = await bind(db, "SELECT token_hash FROM player_sessions WHERE player_id = ?", [playerId]).first<{ token_hash: string }>();
  return row?.token_hash === tokenHash;
}

export async function getPlayerIdForSession(db: D1Database, tokenHash: string): Promise<string | undefined> {
  await ensureCatalog(db);
  if (!/^[a-f0-9]{64}$/.test(tokenHash)) return undefined;
  const row = await bind(db, "SELECT player_id FROM player_sessions WHERE token_hash = ?", [tokenHash]).first<{ player_id: string }>();
  return row?.player_id;
}

export async function recordCatch(db: D1Database, playerId: string, fishId: string, eventKey: string): Promise<void> {
  await ensureCatalog(db);
  if (!isPlayerId(playerId) || !isFishSpeciesId(fishId) || !/^[-a-zA-Z0-9_:]{3,160}$/.test(eventKey)) {
    throw new Error("invalid_catch");
  }
  const fish = await bind(db, "SELECT id, catalog_status FROM fish_species WHERE id = ?", [fishId])
    .first<{ id: string; catalog_status: string }>();
  if (fish?.catalog_status !== "active") throw new Error("fish_not_catchable");
  const caughtAt = new Date().toISOString();
  await db.batch([
    bind(db, `INSERT OR IGNORE INTO collection_catch_events (event_key, player_id, fish_id, caught_at)
      VALUES (?, ?, ?, ?)`, [eventKey, playerId, fishId, caughtAt]),
    bind(db, `INSERT INTO player_collections (player_id, fish_id, catches, first_caught_at, last_caught_at)
      SELECT ?, ?, 1, ?, ? WHERE changes() > 0
      ON CONFLICT (player_id, fish_id) DO UPDATE SET
        catches=player_collections.catches + 1, last_caught_at=excluded.last_caught_at`,
    [playerId, fishId, caughtAt, caughtAt]),
  ]);
}

export async function ping(db: D1Database): Promise<void> {
  await ensureCatalog(db);
  await db.prepare("SELECT 1 AS ready").first();
}

export async function reserveOceanRoom(
  db: D1Database,
  roomId: string,
  playerId: string,
  fishId?: FishSpeciesId,
): Promise<boolean> {
  await ensureCatalog(db);
  const createdAt = new Date().toISOString();
  const results = await db.batch([
    bind(db, `INSERT INTO ocean_rooms (room_id, player_id, fish_id, created_at)
      SELECT ?, ?, ?, ? WHERE (SELECT COUNT(*) FROM ocean_rooms) < 128`,
    [roomId, playerId, fishId ?? null, createdAt]),
    bind(db, "SELECT room_id FROM ocean_rooms WHERE room_id = ?", [roomId]),
  ]);
  return results[1]?.results?.length === 1;
}

export async function deleteOceanRoom(db: D1Database, roomId: string): Promise<void> {
  await bind(db, "DELETE FROM ocean_rooms WHERE room_id = ?", [roomId]).run();
}
