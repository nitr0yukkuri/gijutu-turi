import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { test } from "node:test";
import { FISH_SPECIES } from "../fish-species.js";

const migrationPaths = readdirSync("migrations").filter(path => path.endsWith(".sql")).sort();
const javaMigrationPath = "20261111_0001_java_octopus_catalog.sql";
const apply = (db: DatabaseSync, path: string) => db.exec(readFileSync(`migrations/${path}`, "utf8"));

const newDatabase = () => {
  const db = new DatabaseSync(":memory:");
  db.exec("PRAGMA foreign_keys = ON");
  return db;
};

test("D1 migrations contain every source catalog species with the same number and status", t => {
  const db = newDatabase();
  t.after(() => db.close());
  for (const path of migrationPaths) apply(db, path);

  const expected = [...FISH_SPECIES].sort((a, b) => a.number - b.number).map(species => ({
    id: species.id, number: species.number, model_key: species.modelKey, catalog_status: species.catalogStatus,
  }));
  const actual = db.prepare("SELECT id, number, model_key, catalog_status FROM fish_species ORDER BY number").all();
  assert.deepEqual(actual.map(row => ({ ...row })), expected);
});

test("Java catalog migration preserves referenced preview records and existing catches", t => {
  const db = newDatabase();
  t.after(() => db.close());
  for (const path of migrationPaths.filter(path => path < javaMigrationPath)) apply(db, path);
  db.exec(`
    INSERT INTO fish_species (id, number, model_key, catalog_status) VALUES ('unknown-017', 17, 'unknown', 'preview');
    INSERT INTO player_collections (player_id, fish_id, catches, first_caught_at, last_caught_at)
      VALUES ('player_migration-history', 'unknown-017', 3, '2026-10-01', '2026-10-02');
    INSERT INTO collection_catch_events (event_key, player_id, fish_id, caught_at)
      VALUES ('historical:1', 'player_migration-history', 'unknown-017', '2026-10-01');
  `);

  apply(db, javaMigrationPath);
  apply(db, javaMigrationPath);

  const previous = db.prepare("SELECT number FROM fish_species WHERE id = 'unknown-017'").get();
  assert.ok(Number(previous?.number) < 0);
  assert.equal(db.prepare("SELECT catches FROM player_collections WHERE fish_id = 'unknown-017'").get()?.catches, 3);
  assert.equal(db.prepare("SELECT COUNT(*) AS count FROM collection_catch_events").get()?.count, 1);
  assert.equal(db.prepare("SELECT catalog_status FROM fish_species WHERE id = 'java-001' AND number = 17").get()?.catalog_status, "active");
});

test("Java catalog migration replaces an unreferenced preview without retaining a duplicate number", t => {
  const db = newDatabase();
  t.after(() => db.close());
  for (const path of migrationPaths.filter(path => path < javaMigrationPath)) apply(db, path);
  db.exec("INSERT INTO fish_species (id, number, catalog_status) VALUES ('unknown-017', 17, 'preview')");
  apply(db, javaMigrationPath);
  assert.equal(db.prepare("SELECT COUNT(*) AS count FROM fish_species WHERE number = 17").get()?.count, 1);
  assert.equal(db.prepare("SELECT id FROM fish_species WHERE number = 17").get()?.id, "java-001");
});
