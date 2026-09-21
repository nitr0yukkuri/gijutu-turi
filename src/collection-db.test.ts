import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
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
    assert.deepEqual(initial.entries.map(entry => entry.id), ["fish-001"]);
    assert.equal(initial.activeTotal, 1);
    assert.equal(initial.catalogTotal, 1);

    const first = store.recordCatch(playerId, "fish-001", "sea_test:1", "2026-09-21T00:00:00.000Z");
    assert.equal(first.registered, 1);
    assert.equal(first.entries[0]?.catches, 1);

    const duplicate = store.recordCatch(playerId, "fish-001", "sea_test:1", "2026-09-21T00:01:00.000Z");
    assert.equal(duplicate.registered, 1);
    assert.equal(duplicate.entries[0]?.catches, 1);

    const secondCatch = store.recordCatch(playerId, "fish-001", "sea_test:2", "2026-09-21T00:02:00.000Z");
    assert.equal(secondCatch.entries[0]?.catches, 2);
  } finally {
    store.close();
    rmSync(directory, { recursive: true, force: true });
  }
});
