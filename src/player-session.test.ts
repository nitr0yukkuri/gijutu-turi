import assert from "node:assert/strict";
import test from "node:test";
import { createPlayerSessionToken, hashPlayerSessionToken, readPlayerSessionToken } from "./player-session.js";

test("player session bearer tokens are opaque, random, and stored as hashes", () => {
  const first = createPlayerSessionToken();
  const second = createPlayerSessionToken();
  assert.match(first, /^[A-Za-z0-9_-]{43}$/);
  assert.notEqual(first, second);
  const hash = hashPlayerSessionToken(first);
  assert.match(hash, /^[a-f0-9]{64}$/);
  assert.notEqual(hash, first);
  assert.equal(readPlayerSessionToken(`Bearer ${first}`), first);
  assert.equal(readPlayerSessionToken(`bearer ${first}`), first);
  assert.equal(readPlayerSessionToken(`Bearer ${first} extra`), undefined);
  assert.equal(readPlayerSessionToken("Bearer guessable-player-id"), undefined);
});
