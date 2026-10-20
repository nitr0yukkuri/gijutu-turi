import { isFishSpeciesId, type FishSpeciesId } from "../fish-species.js";
import { isPlayerId, type CollectionEntry, type CollectionSnapshot } from "../collection-contract.js";
import type { D1Database, D1PreparedStatement } from "./types.js";

const bind = (db: D1Database, sql: string, values: Array<string | number | boolean | null> = []): D1PreparedStatement =>
  db.prepare(sql).bind(...values);

type CatalogRow = {
  id: string; number: number; name: string | null; classification: string | null;
  tagline: string | null; description: string | null; habitat: string | null;
  rarity: string | null; model_key: string | null; catalog_status: "active" | "preview";
  catches: number | null; first_caught_at: string | null; last_caught_at: string | null;
};

export async function getCollection(db: D1Database, playerId: string): Promise<CollectionSnapshot> {
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
  if (!isPlayerId(playerId) || !/^[a-f0-9]{64}$/.test(tokenHash)) throw new Error("invalid_player_session");
  await bind(db, "INSERT OR IGNORE INTO player_sessions (player_id, token_hash, created_at) VALUES (?, ?, ?)",
    [playerId, tokenHash, new Date().toISOString()]).run();
  const row = await bind(db, "SELECT token_hash FROM player_sessions WHERE player_id = ?", [playerId]).first<{ token_hash: string }>();
  return row?.token_hash === tokenHash;
}

export async function getPlayerIdForSession(db: D1Database, tokenHash: string): Promise<string | undefined> {
  if (!/^[a-f0-9]{64}$/.test(tokenHash)) return undefined;
  const row = await bind(db, "SELECT player_id FROM player_sessions WHERE token_hash = ?", [tokenHash]).first<{ player_id: string }>();
  return row?.player_id;
}

export async function recordCatch(db: D1Database, playerId: string, fishId: string, eventKey: string): Promise<void> {
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
  const tables = await db.prepare(`SELECT
    EXISTS(SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'fish_species') AS fish_species,
    EXISTS(SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'player_collections') AS player_collections,
    EXISTS(SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'collection_catch_events') AS collection_catch_events,
    EXISTS(SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'player_sessions') AS player_sessions,
    EXISTS(SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'ocean_rooms') AS ocean_rooms`).first<{
      fish_species: number;
      player_collections: number;
      collection_catch_events: number;
      player_sessions: number;
      ocean_rooms: number;
    }>();
  if (!tables || Object.values(tables).some(value => Number(value) !== 1)) {
    throw new Error("d1_schema_not_ready");
  }
}

export async function reserveOceanRoom(
  db: D1Database,
  roomId: string,
  playerId: string,
  fishId?: FishSpeciesId,
): Promise<boolean> {
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

