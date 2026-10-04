import { test } from "node:test";
import assert from "node:assert/strict";
import { FISH_SPECIES, getFishSpecies, randomActiveFishSpeciesId } from "./fish-species.js";

test("the unqualified route selects normal encounters but keeps prototypes opt-in", () => {
  const activeIds = FISH_SPECIES.filter(species => species.catalogStatus === "active" && species.randomEncounter !== false).map(species => species.id);
  const selected = new Set([0, .19, .39, .59, .79, .99].map(sample => randomActiveFishSpeciesId(() => sample)));

  assert.deepEqual([...selected], activeIds);
  assert.equal(FISH_SPECIES.find(species => species.id === "k8s-001")?.catalogStatus, "active");
  assert.equal(FISH_SPECIES.find(species => species.id === "k8s-001")?.randomEncounter, false);
});

test("an out-of-range random sample falls back to a valid active species", () => {
  assert.equal(FISH_SPECIES.some(species => species.id === randomActiveFishSpeciesId(() => Number.NaN)), true);
  assert.equal(FISH_SPECIES.some(species => species.id === randomActiveFishSpeciesId(() => 2)), true);
});

test("every catalog species has an unknown-state silhouette and discovery hints", () => {
  for (const species of FISH_SPECIES) {
    assert.ok(species.silhouetteKey);
    assert.ok(species.unknownTitle);
    assert.ok(species.unknownHint);
    assert.ok(species.traits.length >= 2);
    assert.ok(species.observation);
  }
});

test("CSS fish keeps its user-facing catalog name", () => {
  assert.equal(getFishSpecies("css-001").name, "CSS fish");
});

test("Rustカジキ keeps its name and saved model key while using the marlin silhouette", () => {
  const marlin = getFishSpecies("rust-001");
  assert.equal(marlin.name, "Rustカジキ");
  assert.equal(marlin.modelKey, "rust-swordfish", "existing catch records keep resolving their model");
  assert.equal(marlin.silhouetteKey, "rust-striped-marlin");
});
