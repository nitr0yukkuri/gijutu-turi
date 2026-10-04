import { FISH_SPECIES } from "./fish-species.js";
import { isPlayerId, type CollectionEntry, type CollectionRepository, type CollectionSnapshot } from "./collection-contract.js";

export type D1CollectionConfig = {
  accountId: string;
  databaseId: string;
  apiToken: string;
};

type D1Statement = {
  sql: string;
  params?: string[];
};

type D1StatementResult = {
  success?: boolean;
  results?: Record<string, unknown>[];
};

type D1ApiResponse = {
  success?: boolean;
  errors?: unknown[];
  result?: D1StatementResult[];
};

type D1CatalogRow = {
  id: string;
  number: number | string;
  name: string | null;
  classification: string | null;
  tagline: string | null;
  description: string | null;
  habitat: string | null;
  rarity: string | null;
  model_key: string | null;
  catalog_status: "active" | "preview";
  catches: number | string | null;
  first_caught_at: string | null;
  last_caught_at: string | null;
};

const schemaStatements: D1Statement[] = [
  {
    sql: `CREATE TABLE IF NOT EXISTS fish_species (
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
    )`,
  },
  {
    sql: `CREATE TABLE IF NOT EXISTS player_collections (
      player_id TEXT NOT NULL,
      fish_id TEXT NOT NULL REFERENCES fish_species(id),
      catches INTEGER NOT NULL DEFAULT 0,
      first_caught_at TEXT NOT NULL,
      last_caught_at TEXT NOT NULL,
      PRIMARY KEY (player_id, fish_id)
    )`,
  },
  {
    sql: `CREATE TABLE IF NOT EXISTS collection_catch_events (
      event_key TEXT PRIMARY KEY,
      player_id TEXT NOT NULL,
      fish_id TEXT NOT NULL REFERENCES fish_species(id),
      caught_at TEXT NOT NULL
    )`,
  },
];

const upsertSpeciesSql = `INSERT INTO fish_species
  (id, number, name, classification, tagline, description, habitat, rarity, model_key, catalog_status)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  ON CONFLICT(id) DO UPDATE SET
    number = excluded.number,
    name = excluded.name,
    classification = excluded.classification,
    tagline = excluded.tagline,
    description = excluded.description,
    habitat = excluded.habitat,
    rarity = excluded.rarity,
    model_key = excluded.model_key,
    catalog_status = excluded.catalog_status`;

const normalizeParams = (params: readonly (string | number)[] | undefined): string[] | undefined =>
  params?.map(value => String(value));

const asNumber = (value: number | string | null, fallback = 0): number => {
  if (value === null) return fallback;
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed)) throw new Error("d1_invalid_result");
  return parsed;
};

export class D1CollectionStore implements CollectionRepository {
  private readonly endpoint: string;

  private constructor(
    private readonly config: D1CollectionConfig,
    private readonly fetcher: typeof fetch,
  ) {
    this.endpoint = `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(config.accountId)}/d1/database/${encodeURIComponent(config.databaseId)}/query`;
  }

  static async connect(config: D1CollectionConfig, fetcher: typeof fetch = fetch): Promise<D1CollectionStore> {
    const store = new D1CollectionStore(config, fetcher);
    try {
      await store.initialize();
      return store;
    } catch (error) {
      await store.close();
      throw error;
    }
  }

  async close(): Promise<void> {
    // D1 is accessed over HTTPS and has no local connection to close.
  }

  async ping(): Promise<void> {
    await this.query<{ ready: number }>({ sql: "SELECT 1 AS ready" });
  }

  private async execute(statements: readonly D1Statement[]): Promise<D1StatementResult[]> {
    if (statements.length === 0) return [];
    const body = statements.length === 1
      ? { sql: statements[0]!.sql, ...(statements[0]!.params ? { params: statements[0]!.params } : {}) }
      : { batch: statements.map(statement => ({
        sql: statement.sql,
        ...(statement.params ? { params: statement.params } : {}),
      })) };

    let response: Response;
    try {
      response = await this.fetcher(this.endpoint, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.config.apiToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(15_000),
      });
    } catch {
      throw new Error("d1_unavailable");
    }

    if (!response.ok) throw new Error(`d1_http_${response.status}`);

    let payload: D1ApiResponse;
    try {
      payload = await response.json() as D1ApiResponse;
    } catch {
      throw new Error("d1_invalid_response");
    }

    if (payload.success === false || (payload.errors?.length ?? 0) > 0 || !Array.isArray(payload.result)) {
      throw new Error("d1_query_failed");
    }
    if (payload.result.some(result => result.success === false)) throw new Error("d1_query_failed");
    return payload.result;
  }

  private async query<T extends Record<string, unknown>>(statement: D1Statement): Promise<T[]> {
    const [result] = await this.execute([statement]);
    if (!result) throw new Error("d1_invalid_response");
    return (result.results ?? []) as T[];
  }

  private async initialize(): Promise<void> {
    const placeholderNumbers = FISH_SPECIES.map(() => "?").join(", ");
    const statements: D1Statement[] = [
      ...schemaStatements,
      {
        sql: `DELETE FROM fish_species
          WHERE id LIKE 'unknown-%'
            AND number IN (${placeholderNumbers})
            AND catalog_status = 'preview'
            AND NOT EXISTS (SELECT 1 FROM player_collections WHERE fish_id = fish_species.id)
            AND NOT EXISTS (SELECT 1 FROM collection_catch_events WHERE fish_id = fish_species.id)`,
        params: normalizeParams(FISH_SPECIES.map(entry => entry.number)),
      },
      ...FISH_SPECIES.map(entry => ({
        sql: upsertSpeciesSql,
        params: normalizeParams([
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
        ]),
      })),
    ];
    await this.execute(statements);
  }

  async getCollection(playerId: string): Promise<CollectionSnapshot> {
    if (!isPlayerId(playerId)) throw new Error("invalid_player_id");
    const rows = await this.query<D1CatalogRow>({
      sql: `SELECT
          species.id, species.number, species.name, species.classification,
          species.tagline, species.description, species.habitat, species.rarity,
          species.model_key, species.catalog_status,
          collection.catches, collection.first_caught_at, collection.last_caught_at
        FROM fish_species AS species
        LEFT JOIN player_collections AS collection
          ON collection.fish_id = species.id AND collection.player_id = ?
        WHERE species.catalog_status = 'active'
        ORDER BY species.number`,
      params: [playerId],
    });

    const entries: CollectionEntry[] = rows.map(row => ({
      id: row.id,
      number: asNumber(row.number),
      name: row.name,
      classification: row.classification,
      tagline: row.tagline,
      description: row.description,
      habitat: row.habitat,
      rarity: row.rarity,
      modelKey: row.model_key,
      catalogStatus: row.catalog_status,
      status: row.first_caught_at !== null ? "caught" : "unknown",
      catches: asNumber(row.catches),
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

  async recordCatch(
    playerId: string,
    fishId: string,
    eventKey: string,
    caughtAt = new Date().toISOString(),
  ): Promise<CollectionSnapshot> {
    if (!isPlayerId(playerId)) throw new Error("invalid_player_id");
    if (!/^[-a-z0-9]{3,80}$/.test(fishId) || !/^[-a-zA-Z0-9_:]{3,160}$/.test(eventKey)) throw new Error("invalid_catch");

    const fish = await this.query<{ id: string; catalog_status: string }>({
      sql: "SELECT id, catalog_status FROM fish_species WHERE id = ?",
      params: [fishId],
    });
    if (fish[0]?.catalog_status !== "active") throw new Error("fish_not_catchable");

    // D1 executes a batch sequentially as one transaction. changes() ensures a
    // duplicate event never increments the aggregate a second time.
    await this.execute([
      {
        sql: `INSERT OR IGNORE INTO collection_catch_events (event_key, player_id, fish_id, caught_at)
          VALUES (?, ?, ?, ?)`,
        params: [eventKey, playerId, fishId, caughtAt],
      },
      {
        sql: `INSERT INTO player_collections
            (player_id, fish_id, catches, first_caught_at, last_caught_at)
          SELECT ?, ?, 1, ?, ?
          WHERE changes() > 0
          ON CONFLICT (player_id, fish_id) DO UPDATE SET
            catches = player_collections.catches + 1,
            last_caught_at = excluded.last_caught_at`,
        params: [playerId, fishId, caughtAt, caughtAt],
      },
    ]);

    return this.getCollection(playerId);
  }
}
