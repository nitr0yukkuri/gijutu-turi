import assert from "node:assert/strict";
import { test } from "node:test";
import { FISH_SPECIES } from "../fish-species.js";
import { COMPLETE_SHOWCASE_COLLECTION, isCompleteShowcasePath } from "./complete-showcase.js";

test("the showcase route matches only its canonical path with an optional trailing slash", () => {
  assert.equal(isCompleteShowcasePath("/complete"), true);
  assert.equal(isCompleteShowcasePath("/complete/"), true);
  assert.equal(isCompleteShowcasePath("/complete-extra"), false);
  assert.equal(isCompleteShowcasePath("/"), false);
});

test("the showcase represents every active species as discovered without inventing saved catches", () => {
  const activeSpecies = FISH_SPECIES.filter(species => species.catalogStatus === "active");
  assert.deepEqual(COMPLETE_SHOWCASE_COLLECTION.entries.map(entry => entry.id), activeSpecies.map(species => species.id));
  assert.ok(COMPLETE_SHOWCASE_COLLECTION.entries.every(entry => entry.status === "caught"));
  assert.ok(COMPLETE_SHOWCASE_COLLECTION.entries.every(entry => entry.catches === 0 && entry.firstCaughtAt === null && entry.lastCaughtAt === null));
  assert.equal(COMPLETE_SHOWCASE_COLLECTION.registered, activeSpecies.length);
  assert.equal(COMPLETE_SHOWCASE_COLLECTION.activeTotal, activeSpecies.length);
});
