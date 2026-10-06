import { Pool, type PoolConfig, type QueryResultRow } from "pg";
import { FISH_SPECIES } from "./fish-species.js";
import { isPlayerId, type CollectionEntry, type CollectionRepository, type CollectionSnapshot } from "./collection-contract.js";

type CatalogRow = QueryResultRow & {
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
  catches: number | null;
  first_caught_at: string | null;
  last_caught_at: string | null;
};

const schema = `
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
`;

export class PostgresCollectionStore implements CollectionRepository {
  private constructor(private readonly pool: Pool) {}

  private static readonly poolConfig: Omit<PoolConfig, "connectionString"> = {
    max: 5,
    connectionTimeoutMillis: 5_000,
    statement_timeout: 10_000,
    query_timeout: 12_000,
  };

  static async connect(
    connectionString: string,
    createPool: (connectionString: string, config: Omit<PoolConfig, "connectionString">) => Pool =
      (value, config) => new Pool({ connectionString: value, ...config }),
  ): Promise<PostgresCollectionStore> {
    const store = new PostgresCollectionStore(createPool(connectionString, PostgresCollectionStore.poolConfig));
    try {
      await store.initialize();
      return store;
    } catch (error) {
      await store.close();
      throw error;
    }
  }

  private async initialize(): Promise<void> {
    await this.pool.query(schema);
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      for (const entry of FISH_SPECIES) {
        // Preserve referenced legacy rows at a private number before promoting
        // a real fish into the slot, keeping collection/event foreign keys valid.
        await client.query(`
          UPDATE fish_species
          SET number = (SELECT CASE WHEN COALESCE(MIN(number), 0) > 0 THEN -1 ELSE MIN(number) - 1 END FROM fish_species)
          WHERE id LIKE 'unknown-%'
            AND number = $1
            AND catalog_status = 'preview'
            AND (EXISTS (SELECT 1 FROM player_collections WHERE fish_id = fish_species.id)
              OR EXISTS (SELECT 1 FROM collection_catch_events WHERE fish_id = fish_species.id))
        `, [entry.number]);
        await client.query(`
          DELETE FROM fish_species
          WHERE id LIKE 'unknown-%'
            AND number = $1
            AND catalog_status = 'preview'
            AND NOT EXISTS (SELECT 1 FROM player_collections WHERE fish_id = fish_species.id)
            AND NOT EXISTS (SELECT 1 FROM collection_catch_events WHERE fish_id = fish_species.id)
        `, [entry.number]);
        await client.query(`
          INSERT INTO fish_species
            (id, number, name, classification, tagline, description, habitat, rarity, model_key, catalog_status)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
          ON CONFLICT (id) DO UPDATE SET
            number = EXCLUDED.number,
            name = EXCLUDED.name,
            classification = EXCLUDED.classification,
            tagline = EXCLUDED.tagline,
            description = EXCLUDED.description,
            habitat = EXCLUDED.habitat,
            rarity = EXCLUDED.rarity,
            model_key = EXCLUDED.model_key,
            catalog_status = EXCLUDED.catalog_status
        `, [entry.id, entry.number, entry.name, entry.classification, entry.tagline, entry.description, entry.habitat, entry.rarity, entry.modelKey, entry.catalogStatus]);
      }
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async close(): Promise<void> {
    await this.pool.end();
  }

  async ping(): Promise<void> {
    await this.pool.query("SELECT 1");
  }

  async getCollection(playerId: string): Promise<CollectionSnapshot> {
    if (!isPlayerId(playerId)) throw new Error("invalid_player_id");
    const { rows } = await this.pool.query<CatalogRow>(`
      SELECT
        species.id, species.number, species.name, species.classification,
        species.tagline, species.description, species.habitat, species.rarity,
        species.model_key, species.catalog_status,
        collection.catches, collection.first_caught_at, collection.last_caught_at
      FROM fish_species AS species
      LEFT JOIN player_collections AS collection
        ON collection.fish_id = species.id AND collection.player_id = $1
      WHERE species.catalog_status = 'active'
      ORDER BY species.number
    `, [playerId]);

    const entries: CollectionEntry[] = rows.map(row => ({
      id: row.id,
      number: row.number,
      name: row.name,
      classification: row.classification,
      tagline: row.tagline,
      description: row.description,
      habitat: row.habitat,
      rarity: row.rarity,
      modelKey: row.model_key,
      catalogStatus: row.catalog_status,
      status: row.first_caught_at !== null ? "caught" : "unknown",
      catches: row.catches ?? 0,
      firstCaughtAt: row.first_caught_at,
      lastCaughtAt: row.last_caught_at,
    }));
    const activeTotal = entries.length;
    return {
      entries,
      registered: entries.filter(entry => entry.status === "caught").length,
      activeTotal,
      catalogTotal: activeTotal,
    };
  }

  async recordCatch(playerId: string, fishId: string, eventKey: string, caughtAt = new Date().toISOString()): Promise<CollectionSnapshot> {
    if (!isPlayerId(playerId)) throw new Error("invalid_player_id");
    if (!/^[-a-z0-9]{3,80}$/.test(fishId) || !/^[-a-zA-Z0-9_:]{3,160}$/.test(eventKey)) throw new Error("invalid_catch");

    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const fish = await client.query<{ id: string; catalog_status: string } & QueryResultRow>(
        "SELECT id, catalog_status FROM fish_species WHERE id = $1",
        [fishId],
      );
      if (fish.rows[0]?.catalog_status !== "active") throw new Error("fish_not_catchable");

      const event = await client.query(
        `INSERT INTO collection_catch_events (event_key, player_id, fish_id, caught_at)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (event_key) DO NOTHING
         RETURNING event_key`,
        [eventKey, playerId, fishId, caughtAt],
      );
      if (event.rowCount) {
        await client.query(`
          INSERT INTO player_collections (player_id, fish_id, catches, first_caught_at, last_caught_at)
          VALUES ($1, $2, 1, $3, $3)
          ON CONFLICT (player_id, fish_id) DO UPDATE SET
            catches = player_collections.catches + 1,
            last_caught_at = EXCLUDED.last_caught_at
        `, [playerId, fishId, caughtAt]);
      }
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
    return this.getCollection(playerId);
  }
}
