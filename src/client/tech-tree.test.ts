import { test } from "node:test";
import assert from "node:assert/strict";
import { FISH_SPECIES } from "../fish-species.js";
import { TECH_TREE_BRANCHES, TECH_TREE_NODE_DETAILS } from "./tech-tree.js";

test("the technology tree has exactly one node for every active catalog fish", () => {
  const activeIds = FISH_SPECIES.filter(species => species.catalogStatus === "active").map(species => species.id).sort();
  const detailIds = Object.keys(TECH_TREE_NODE_DETAILS).sort();
  const branchIds = TECH_TREE_BRANCHES.flatMap(branch => branch.speciesIds);

  assert.deepEqual(detailIds, activeIds);
  assert.deepEqual([...branchIds].sort(), activeIds);
  assert.equal(new Set(branchIds).size, activeIds.length);
});

test("every technology node links to its dedicated fishing route", () => {
  assert.deepEqual(
    Object.values(TECH_TREE_NODE_DETAILS).map(node => node.routeHref).sort(),
    ["/cssfish", "/dockerwhale", "/gofish", "/k8sfish", "/rustfish", "/jseel"].sort(),
  );
});

test("runtime branches describe a technology relationship without imposing a prerequisite", () => {
  const runtime = TECH_TREE_BRANCHES.find(branch => branch.id === "runtime");

  assert.deepEqual(runtime?.speciesIds, ["whale-001", "k8s-001"]);
  assert.match(runtime?.relationship ?? "", /関連する技術/);
  assert.doesNotMatch(runtime?.relationship ?? "", /必須|前提|解放条件/);
});
