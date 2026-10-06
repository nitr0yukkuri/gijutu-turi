import assert from "node:assert/strict";
import test from "node:test";
import type { Pool, PoolConfig } from "pg";
import { FISH_SPECIES } from "./fish-species.js";
import { PostgresCollectionStore } from "./postgres-collection-db.js";

test("PostgreSQL catch persistence seeds catalog and counts each event key once", async () => {
  const species = new Map<string, Record<string, unknown>>();
  const events = new Set<string>();
  const legacyCatchEvents = new Map<string, string>();
  const collections = new Map<string, { catches: number; first: string; last: string }>();
  species.set("unknown-003", { id: "unknown-003", number: 3, catalog_status: "preview" });
  species.set("unknown-004", { id: "unknown-004", number: 4, catalog_status: "preview" });
  collections.set("player_abcdefghijkl:unknown-003", { catches: 2, first: "legacy-first", last: "legacy-last" });
  legacyCatchEvents.set("legacy-event", "unknown-003");
  const result = <T>(rows: T[] = []) => ({ rows, rowCount: rows.length });

  const query = async <T extends Record<string, unknown>>(sql: string, values: unknown[] = []) => {
    const normalized = sql.replace(/\s+/g, " ").trim();
    if (normalized === "SELECT 1") return result<T>();
    if (normalized.startsWith("CREATE TABLE") || normalized.startsWith("DELETE FROM fish_species")) return result<T>();
    if (normalized.startsWith("INSERT INTO fish_species")) {
      const [id, number, name, classification, tagline, description, habitat, rarity, model_key, catalog_status] = values;
      species.set(String(id), { id, number, name, classification, tagline, description, habitat, rarity, model_key, catalog_status });
      return result<T>();
    }
    if (normalized.startsWith("SELECT species.id")) {
      const playerId = String(values[0]);
      return result([...species.values()]
        .filter(row => row.catalog_status === "active")
        .map(row => {
          const collection = collections.get(`${playerId}:${row.id}`);
          return { ...row, catches: collection?.catches ?? null, first_caught_at: collection?.first ?? null, last_caught_at: collection?.last ?? null } as unknown as T;
        }));
    }
    throw new Error(`Unexpected pool query: ${normalized}`);
  };

  const clientQuery = async <T extends Record<string, unknown>>(sql: string, values: unknown[] = []) => {
    const normalized = sql.replace(/\s+/g, " ").trim();
    if (["BEGIN", "COMMIT", "ROLLBACK"].includes(normalized)) return result<T>();
    if (normalized.startsWith("UPDATE fish_species")) {
      const placeholder = [...species.values()].find(row => String(row.id).startsWith("unknown-") && Number(row.number) === Number(values[0]) && row.catalog_status === "preview");
      const referenced = placeholder && (
        [...collections.keys()].some(key => key.endsWith(`:${String(placeholder.id)}`))
        || [...legacyCatchEvents.values()].includes(String(placeholder.id))
      );
      if (placeholder && referenced) {
        const minimum = Math.min(...[...species.values()].map(row => Number(row.number)));
        placeholder.number = minimum > 0 ? -1 : minimum - 1;
      }
      return result<T>();
    }
    if (normalized.startsWith("DELETE FROM fish_species")) {
      const match = [...species.entries()].find(([id, row]) => id.startsWith("unknown-") && Number(row.number) === Number(values[0]) && row.catalog_status === "preview");
      if (match) {
        const [id] = match;
        const referenced = [...collections.keys()].some(key => key.endsWith(`:${id}`)) || [...legacyCatchEvents.values()].includes(id);
        if (!referenced) species.delete(id);
      }
      return result<T>();
    }
    if (normalized.startsWith("INSERT INTO fish_species")) return query<T>(sql, values);
    if (normalized.startsWith("SELECT id, catalog_status FROM fish_species")) {
      const fish = species.get(String(values[0]));
      return result(fish ? [{ id: fish.id, catalog_status: fish.catalog_status } as unknown as T] : []);
    }
    if (normalized.startsWith("INSERT INTO collection_catch_events")) {
      const eventKey = String(values[0]);
      if (events.has(eventKey)) return result<T>();
      events.add(eventKey);
      return result([{ event_key: eventKey } as unknown as T]);
    }
    if (normalized.startsWith("INSERT INTO player_collections")) {
      const [playerId, fishId, caughtAt] = values.map(String);
      const key = `${playerId}:${fishId}`;
      const previous = collections.get(key);
      collections.set(key, { catches: (previous?.catches ?? 0) + 1, first: previous?.first ?? caughtAt!, last: caughtAt! });
      return result<T>();
    }
    throw new Error(`Unexpected transaction query: ${normalized}`);
  };

  const fakePool = {
    query,
    connect: async () => ({ query: clientQuery, release() {} }),
    end: async () => undefined,
  } as unknown as Pool;
  let poolConfig: Omit<PoolConfig, "connectionString"> | undefined;
  const store = await PostgresCollectionStore.connect("postgres://test.invalid/db", (connectionString, config) => {
    assert.equal(connectionString, "postgres://test.invalid/db");
    poolConfig = config;
    return fakePool;
  });
  try {
    assert.equal(poolConfig?.connectionTimeoutMillis, 5_000);
    assert.equal(poolConfig?.statement_timeout, 10_000);
    assert.equal(poolConfig?.query_timeout, 12_000);
    await store.ping();
    const fish = FISH_SPECIES.find(entry => entry.catalogStatus === "active");
    assert.ok(fish);
    const playerId = "player_abcdefghijkl";
    const first = await store.recordCatch(playerId, fish.id, "sea_room:1", "2026-10-03T00:00:00.000Z");
    const retry = await store.recordCatch(playerId, fish.id, "sea_room:1", "2026-10-03T00:00:01.000Z");

    assert.equal(species.size, FISH_SPECIES.length + 1);
    assert.equal(species.get("css-001")?.number, 3);
    assert.ok(Number(species.get("unknown-003")?.number) < 0);
    assert.equal(species.has("unknown-004"), false);
    assert.equal(collections.get("player_abcdefghijkl:unknown-003")?.catches, 2);
    assert.equal(legacyCatchEvents.get("legacy-event"), "unknown-003");
    assert.equal(first.entries.find(entry => entry.id === fish.id)?.catches, 1);
    assert.equal(retry.entries.find(entry => entry.id === fish.id)?.catches, 1);
    assert.equal(retry.registered, 1);
  } finally {
    await store.close();
  }
});
