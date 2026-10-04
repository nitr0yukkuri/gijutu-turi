import { test } from "node:test";
import assert from "node:assert/strict";
import { FISH_SPECIES } from "../fish-species.js";
import { TECH_TREE_BRANCHES, TECH_TREE_FISH_LINKS, TECH_TREE_NODE_DETAILS } from "./tech-tree.js";

test("the technology tree has exactly one node for every active catalog fish", () => {
  const activeIds = FISH_SPECIES.filter(species => species.catalogStatus === "active").map(species => species.id).sort();
  const detailIds = Object.keys(TECH_TREE_NODE_DETAILS).sort();
  const branchIds = TECH_TREE_BRANCHES.flatMap(branch => branch.speciesIds);

  assert.deepEqual(detailIds, activeIds);
  assert.deepEqual([...branchIds].sort(), activeIds);
  assert.equal(new Set(branchIds).size, activeIds.length);
});

test("runtime branches describe a technology relationship without imposing a prerequisite", () => {
  const runtime = TECH_TREE_BRANCHES.find(branch => branch.id === "runtime");

  assert.deepEqual(runtime?.speciesIds, ["whale-001", "k8s-001"]);
  assert.match(runtime?.relationship ?? "", /関連する技術/);
  assert.doesNotMatch(runtime?.relationship ?? "", /必須|前提|解放条件/);
});

test("fish-to-fish links cover the active catalog without self-links or duplicate pairs", () => {
  const activeIds = FISH_SPECIES.filter(species => species.catalogStatus === "active").map(species => species.id).sort();
  const endpoints = TECH_TREE_FISH_LINKS.flatMap(link => [link.from, link.to]);
  const pairs = TECH_TREE_FISH_LINKS.map(link => [link.from, link.to].sort().join(":"));

  assert.deepEqual([...endpoints].sort(), activeIds);
  assert.equal(new Set(TECH_TREE_FISH_LINKS.map(link => link.id)).size, TECH_TREE_FISH_LINKS.length);
  assert.equal(new Set(pairs).size, TECH_TREE_FISH_LINKS.length);
  assert.ok(TECH_TREE_FISH_LINKS.every(link => link.from !== link.to));
});
