import { test } from "node:test";
import assert from "node:assert/strict";
import { parseCollectionResponse } from "./collection-response.js";

const validCollection = {
  entries: [{
    id: "fish-001", number: 1, name: "Go魚", classification: null, tagline: null,
    description: null, habitat: null, rarity: null, modelKey: null,
    catalogStatus: "active", status: "unknown", catches: 0,
    firstCaughtAt: null, lastCaughtAt: null,
  }],
  registered: 0,
  activeTotal: 1,
  catalogTotal: 1,
};

test("validates and accepts a collection API payload", () => {
  const result = parseCollectionResponse(validCollection);
  assert.equal(result.ok, true);
  if (result.ok) assert.equal(result.value.entries[0]?.id, "fish-001");
});

test("rejects malformed collection payloads before they enter UI state", () => {
  assert.deepEqual(parseCollectionResponse(null), { ok: false, error: "invalid-shape" });
  assert.deepEqual(parseCollectionResponse({ ...validCollection, entries: null }), { ok: false, error: "invalid-shape" });
  assert.deepEqual(parseCollectionResponse({ ...validCollection, entries: [{ id: "fish-001" }] }), { ok: false, error: "invalid-shape" });
  assert.deepEqual(parseCollectionResponse({ ...validCollection, registered: -1 }), { ok: false, error: "invalid-shape" });
});
