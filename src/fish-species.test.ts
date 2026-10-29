import { test } from "node:test";
import assert from "node:assert/strict";
import { FISH_SPECIES, getFishSpecies, nextFishSpeciesId, randomActiveFishSpeciesId } from "./fish-species.js";

test("the unqualified route selects sea encounters and keeps prototypes opt-in", () => {
  const activeSeaIds = FISH_SPECIES.filter(species => species.catalogStatus === "active" && species.randomEncounter !== false && (species.waterway ?? "sea") === "sea").map(species => species.id);
  const selected = new Set([0, .19, .39, .59, .79, .99].map(sample => randomActiveFishSpeciesId(() => sample)));

  assert.deepEqual([...selected], activeSeaIds);
  assert.equal(FISH_SPECIES.find(species => species.id === "k8s-001")?.catalogStatus, "active");
  assert.equal(FISH_SPECIES.find(species => species.id === "k8s-001")?.randomEncounter, false);
});

test("river encounters stay out of the default route and cover the river catalog", () => {
  const activeRiverIds = FISH_SPECIES.filter(species => species.catalogStatus === "active" && species.randomEncounter !== false && species.waterway === "river").map(species => species.id);
  const selectedRiverIds = new Set(activeRiverIds.map((_, index) => randomActiveFishSpeciesId(() => (index + 0.5) / activeRiverIds.length, "river")));
  const defaultRouteIds = new Set([0, .19, .39, .59, .79, .99].map(sample => randomActiveFishSpeciesId(() => sample)));

  assert.equal(activeRiverIds.length, 10);
  assert.deepEqual([...selectedRiverIds], activeRiverIds);
  assert.ok(activeRiverIds.every(id => !defaultRouteIds.has(id)));
});

test("successful river catches rotate only through river species", () => {
  assert.equal(nextFishSpeciesId("river-ayu", 0, "river"), "river-ayu");
  assert.equal(nextFishSpeciesId("river-ayu", 1, "river"), "river-yamame");
  assert.equal(nextFishSpeciesId("river-ginbuna", 1, "river"), "river-ayu");
  assert.equal(nextFishSpeciesId("river-ayu", 1, "sea"), "fish-001");
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
