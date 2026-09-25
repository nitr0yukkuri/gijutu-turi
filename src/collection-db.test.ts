import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import assert from "node:assert/strict";
import { CollectionStore } from "./collection-db.js";

test("collection store records each catch event once", () => {
  const directory = mkdtempSync(join(tmpdir(), "gijutu-collection-"));
  const store = new CollectionStore(join(directory, "collection.sqlite"));
  const playerId = "player_abcdefghijkl";

  try {
    const initial = store.getCollection(playerId);
    assert.equal(initial.registered, 0);
    assert.deepEqual(initial.entries.map(entry => entry.id), ["fish-001", "whale-001"]);
    assert.equal(initial.activeTotal, 2);
    assert.equal(initial.catalogTotal, 2);

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
