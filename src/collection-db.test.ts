import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import assert from "node:assert/strict";
import { CollectionStore } from "./collection-db.js";
import { FISH_SPECIES } from "./fish-species.js";

test("collection store records each catch event once", () => {
  const directory = mkdtempSync(join(tmpdir(), "gijutu-collection-"));
  const store = new CollectionStore(join(directory, "collection.sqlite"));
  const playerId = "player_abcdefghijkl";

  try {
    assert.doesNotThrow(() => store.ping());
    const initial = store.getCollection(playerId);
    assert.equal(initial.registered, 0);
    assert.deepEqual(initial.entries.map(entry => entry.id), FISH_SPECIES.filter(species => species.catalogStatus === "active").map(species => species.id));
    assert.equal(initial.activeTotal, FISH_SPECIES.filter(species => species.catalogStatus === "active").length);
    assert.equal(initial.catalogTotal, FISH_SPECIES.length);

    const first = store.recordCatch(playerId, "fish-001", "sea_test:1", "2026-09-21T00:00:00.000Z");
    assert.equal(first.registered, 1);
    assert.equal(first.entries[0]?.catches, 1);

    const duplicate = store.recordCatch(playerId, "fish-001", "sea_test:1", "2026-09-21T00:01:00.000Z");
    assert.equal(duplicate.registered, 1);
    assert.equal(duplicate.entries[0]?.catches, 1);

    const secondCatch = store.recordCatch(playerId, "fish-001", "sea_test:2", "2026-09-21T00:02:00.000Z");
    assert.equal(secondCatch.entries[0]?.catches, 2);

    const dockerCatch = store.recordCatch(playerId, "whale-001", "sea_test:docker", "2026-09-21T00:03:00.000Z");
    assert.equal(dockerCatch.registered, 2);
    assert.equal(dockerCatch.entries[1]?.name, "Dockerクジラ");
    assert.equal(dockerCatch.entries[1]?.catches, 1);

    const leviathanCatch = store.recordCatch(playerId, "k8s-001", "sea_test:k8s", "2026-09-21T00:04:00.000Z");
    assert.equal(leviathanCatch.registered, 3);
    assert.equal(leviathanCatch.entries[3]?.name, "K8sレヴィアタン");
    assert.equal(leviathanCatch.entries[3]?.catches, 1);
  } finally {
    store.close();
    rmSync(directory, { recursive: true, force: true });
  }
});

test("collection catch event and aggregate roll back together", () => {
  const directory = mkdtempSync(join(tmpdir(), "gijutu-collection-"));
  const path = join(directory, "collection.sqlite");
  const store = new CollectionStore(path);
  const playerId = "player_abcdefghijkl";

  try {
    const setup = new DatabaseSync(path);
    setup.exec(`CREATE TRIGGER reject_collection_insert BEFORE INSERT ON player_collections
      BEGIN SELECT RAISE(ABORT, 'forced failure'); END;`);
    setup.close();

    assert.throws(() => store.recordCatch(playerId, "fish-001", "sea_test:atomic"));

    const repair = new DatabaseSync(path);
    repair.exec("DROP TRIGGER reject_collection_insert");
    repair.close();

    const retried = store.recordCatch(playerId, "fish-001", "sea_test:atomic");
    assert.equal(retried.entries[0]?.catches, 1);
  } finally {
    store.close();
    rmSync(directory, { recursive: true, force: true });
  }
});

test("collection store upgrades an unused legacy preview slot for a new species", () => {
  const directory = mkdtempSync(join(tmpdir(), "gijutu-collection-"));
  const path = join(directory, "collection.sqlite");
  const legacy = new DatabaseSync(path);
  legacy.exec(`
    CREATE TABLE fish_species (
      id TEXT PRIMARY KEY,
      number INTEGER NOT NULL UNIQUE,
      name TEXT,
      classification TEXT,
      tagline TEXT,
      description TEXT,
      habitat TEXT,
      rarity TEXT,
      model_key TEXT,
      catalog_status TEXT NOT NULL
    );
    CREATE TABLE player_collections (
      player_id TEXT NOT NULL,
      fish_id TEXT NOT NULL,
      catches INTEGER NOT NULL,
      first_caught_at TEXT NOT NULL,
      last_caught_at TEXT NOT NULL,
      PRIMARY KEY (player_id, fish_id)
    );
    CREATE TABLE collection_catch_events (
      event_key TEXT PRIMARY KEY,
      player_id TEXT NOT NULL,
      fish_id TEXT NOT NULL,
      caught_at TEXT NOT NULL
    );
    INSERT INTO fish_species (id, number, catalog_status) VALUES ('unknown-003', 3, 'preview');
  `);
  legacy.close();

  try {
    const store = new CollectionStore(path);
    try {
      const collection = store.getCollection("player_abcdefghijkl");
      assert.equal(collection.entries.find(entry => entry.id === "css-001")?.number, 3);
      assert.equal(collection.entries.some(entry => entry.id === "unknown-003"), false);
    } finally {
      store.close();
    }
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("collection store preserves references to a legacy placeholder when promoting its number", () => {
  const directory = mkdtempSync(join(tmpdir(), "gijutu-collection-"));
  const path = join(directory, "collection.sqlite");
  const legacy = new DatabaseSync(path);
  legacy.exec(`
    PRAGMA foreign_keys = ON;
    CREATE TABLE fish_species (
      id TEXT PRIMARY KEY,
      number INTEGER NOT NULL UNIQUE,
      name TEXT,
      classification TEXT,
      tagline TEXT,
      description TEXT,
      habitat TEXT,
      rarity TEXT,
      model_key TEXT,
      catalog_status TEXT NOT NULL
    );
    CREATE TABLE player_collections (
      player_id TEXT NOT NULL,
      fish_id TEXT NOT NULL REFERENCES fish_species(id),
      catches INTEGER NOT NULL,
      first_caught_at TEXT NOT NULL,
      last_caught_at TEXT NOT NULL,
      PRIMARY KEY (player_id, fish_id)
    );
    CREATE TABLE collection_catch_events (
      event_key TEXT PRIMARY KEY,
      player_id TEXT NOT NULL,
      fish_id TEXT NOT NULL REFERENCES fish_species(id),
      caught_at TEXT NOT NULL
    );
    INSERT INTO fish_species (id, number, catalog_status) VALUES ('unknown-003', 3, 'preview');
    INSERT INTO player_collections VALUES ('player_abcdefghijkl', 'unknown-003', 2, 'first', 'last');
    INSERT INTO collection_catch_events VALUES ('legacy-event', 'player_abcdefghijkl', 'unknown-003', 'last');
  `);
  legacy.close();

  try {
    const store = new CollectionStore(path);
    store.close();
    const migrated = new DatabaseSync(path);
    try {
      const placeholder = migrated.prepare("SELECT number FROM fish_species WHERE id = 'unknown-003'").get() as { number: number };
      const css = migrated.prepare("SELECT number FROM fish_species WHERE id = 'css-001'").get() as { number: number };
      const collection = migrated.prepare("SELECT fish_id, catches FROM player_collections WHERE player_id = ?").get("player_abcdefghijkl") as { fish_id: string; catches: number };
      const event = migrated.prepare("SELECT fish_id FROM collection_catch_events WHERE event_key = 'legacy-event'").get() as { fish_id: string };
      assert.ok(placeholder.number < 0);
      assert.equal(css.number, 3);
      assert.equal(collection.fish_id, "unknown-003");
      assert.equal(collection.catches, 2);
      assert.equal(event.fish_id, "unknown-003");
      assert.equal(migrated.prepare("PRAGMA foreign_key_check").all().length, 0);
    } finally {
      migrated.close();
    }
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
