import assert from "node:assert/strict";
import test from "node:test";
import type { D1CollectionConfig } from "./d1-collection-db.js";
import { D1CollectionStore } from "./d1-collection-db.js";
import { FISH_SPECIES } from "./fish-species.js";

type Statement = { sql: string; params?: string[] };
type SpeciesRow = Record<string, unknown> & {
  id: string;
  number: number;
  catalog_status: string;
};

const config: D1CollectionConfig = {
  accountId: "test-account",
  databaseId: "test-database",
  apiToken: "test-secret",
};

function createFakeD1() {
  const species = new Map<string, SpeciesRow>();
  const events = new Set<string>();
  const collections = new Map<string, { catches: number; first: string; last: string }>();
  const requests: Array<{ url: string; init: RequestInit; body: { batch?: Statement[]; sql?: string; params?: string[] } }> = [];

  const fetcher: typeof fetch = async (input, init = {}) => {
    const url = String(input);
    const body = JSON.parse(String(init.body)) as { batch?: Statement[]; sql?: string; params?: string[] };
    requests.push({ url, init, body });
    const statements = body.batch ?? [{ sql: body.sql ?? "", params: body.params }];
    const results: Array<{ success: true; results: Record<string, unknown>[]; meta: { changes: number } }> = [];
    let previousChanges = 0;

    for (const statement of statements) {
      const sql = statement.sql.replace(/\s+/g, " ").trim();
      const params = statement.params ?? [];
      let rows: Record<string, unknown>[] = [];
      let changes = 0;

      if (sql.startsWith("CREATE TABLE")) {
        // DDL is idempotent; the fake schema is represented by these maps.
      } else if (sql === "SELECT 1 AS ready") {
        rows = [{ ready: 1 }];
      } else if (sql.startsWith("DELETE FROM fish_species")) {
        // The fixture starts without legacy placeholders.
      } else if (sql.startsWith("INSERT INTO fish_species")) {
        const [id, number, name, classification, tagline, description, habitat, rarity, modelKey, catalogStatus] = params;
        species.set(String(id), {
          id: String(id),
          number: Number(number),
          name,
          classification,
          tagline,
          description,
          habitat,
          rarity,
          model_key: modelKey,
          catalog_status: String(catalogStatus),
        });
        changes = 1;
      } else if (sql.startsWith("SELECT id, catalog_status FROM fish_species")) {
        const fish = species.get(params[0] ?? "");
        rows = fish ? [{ id: fish.id, catalog_status: fish.catalog_status }] : [];
      } else if (sql === "SELECT 1 AS ready") {
        rows = [{ ready: 1 }];
      } else if (sql.startsWith("SELECT species.id")) {
        const playerId = params[0];
        rows = [...species.values()]
          .filter(row => row.catalog_status === "active")
          .sort((left, right) => left.number - right.number)
          .map(row => {
            const collection = collections.get(`${playerId}:${row.id}`);
            return {
              ...row,
              catches: collection?.catches ?? null,
              first_caught_at: collection?.first ?? null,
              last_caught_at: collection?.last ?? null,
            };
          });
      } else if (sql.startsWith("INSERT OR IGNORE INTO collection_catch_events")) {
        const eventKey = params[0] ?? "";
        if (!events.has(eventKey)) {
          events.add(eventKey);
          changes = 1;
        }
      } else if (sql.startsWith("INSERT INTO player_collections")) {
        if (previousChanges > 0) {
          const [playerId, fishId, caughtAt] = params;
          const key = `${playerId}:${fishId}`;
          const previous = collections.get(key);
          collections.set(key, {
            catches: (previous?.catches ?? 0) + 1,
            first: previous?.first ?? String(caughtAt),
            last: String(caughtAt),
          });
          changes = 1;
        }
      } else {
        throw new Error(`Unexpected D1 query: ${sql}`);
      }

      results.push({ success: true, results: rows, meta: { changes } });
      previousChanges = changes;
    }

    return new Response(JSON.stringify({ success: true, result: results }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  };

  return { fetcher, requests, species, events, collections };
}

test("D1 seeds the catalog and records each catch event exactly once", async () => {
  const fake = createFakeD1();
  const store = await D1CollectionStore.connect(config, fake.fetcher);
  const playerId = "player_abcdefghijkl";
  const firstCaughtAt = "2026-10-03T00:00:00.000Z";

  try {
    await store.ping();
    const initializeRequest = fake.requests.find(request => request.body.batch?.some(statement => statement.sql.startsWith("CREATE TABLE IF NOT EXISTS collection_catch_events")));
    assert.equal(initializeRequest?.url, "https://api.cloudflare.com/client/v4/accounts/test-account/d1/database/test-database/query");
    assert.equal((initializeRequest?.init.headers as Record<string, string>)?.Authorization, "Bearer test-secret");
    assert.ok(initializeRequest);
    assert.equal(fake.species.size, FISH_SPECIES.length);

    const initial = await store.getCollection(playerId);
    assert.equal(initial.activeTotal, FISH_SPECIES.filter(species => species.catalogStatus === "active").length);
    assert.equal(initial.registered, 0);

    const first = await store.recordCatch(playerId, "fish-001", "sea_room:1", firstCaughtAt);
    const retry = await store.recordCatch(playerId, "fish-001", "sea_room:1", "2026-10-03T00:00:01.000Z");
    const second = await store.recordCatch(playerId, "fish-001", "sea_room:2", "2026-10-03T00:00:02.000Z");

    assert.equal(first.entries[0]?.catches, 1);
    assert.equal(retry.entries[0]?.catches, 1);
    assert.equal(second.entries[0]?.catches, 2);
    assert.equal(fake.events.size, 2);
    assert.equal(fake.collections.get(`${playerId}:fish-001`)?.first, firstCaughtAt);

    const catchBatch = fake.requests.find(request => request.body.batch?.some(statement => statement.sql.startsWith("INSERT OR IGNORE INTO collection_catch_events")));
    assert.equal(catchBatch?.body.batch?.length, 2);
    assert.match(catchBatch?.body.batch?.[1]?.sql ?? "", /WHERE changes\(\) > 0/);
  } finally {
    await store.close();
  }
});

test("D1 does not silently fall back when the API rejects its request", async () => {
  await assert.rejects(
    D1CollectionStore.connect(config, async () => new Response(
      JSON.stringify({ success: false, errors: [{ message: "denied" }], result: [] }),
      { status: 200 },
    )),
    { message: "d1_query_failed" },
  );
});
