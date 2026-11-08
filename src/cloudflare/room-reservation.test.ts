import assert from "node:assert/strict";
import { test } from "node:test";
import { createReservedRoom } from "./room-reservation.js";

test("createReservedRoom releases the slot when Durable Object creation rejects", async () => {
  let releases = 0;

  await assert.rejects(
    createReservedRoom(async () => { throw new Error("durable object unavailable"); }, async () => { releases++; }),
    /durable object unavailable/,
  );
  assert.equal(releases, 1);
});

test("createReservedRoom releases the slot when Durable Object creation returns a failure", async () => {
  let releases = 0;

  const response = await createReservedRoom(async () => new Response(null, { status: 503 }), async () => { releases++; });
  assert.equal(response, undefined);
  assert.equal(releases, 1);
});

test("createReservedRoom keeps the slot after successful Durable Object creation", async () => {
  let releases = 0;
  const created = new Response(null, { status: 201 });

  const response = await createReservedRoom(async () => created, async () => { releases++; });
  assert.equal(response, created);
  assert.equal(releases, 0);
});
