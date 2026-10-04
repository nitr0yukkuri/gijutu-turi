import assert from "node:assert/strict";
import { test } from "node:test";
import { OceanFishingGame } from "./ocean-game.js";
import { canContinueAfterCatchSave, isOceanMessage, oceanMessageSchema } from "./ocean-contract.js";

const makeMessage = () => ({
  type: "ocean" as const,
  state: new OceanFishingGame(() => 0.5).wireSnapshot(),
  rodStroke: 0,
  serverNow: 1_000,
  controllers: 1,
  displays: 1,
});

test("authoritative wire snapshot validates and does not expose simulation internals", () => {
  const game = new OceanFishingGame(() => 0.5);
  const message = { ...makeMessage(), state: game.wireSnapshot() };

  assert.equal(isOceanMessage(message), true);
  assert.deepEqual(oceanMessageSchema.parse(message), message);
  assert.equal("fightTime" in message.state, true);
  assert.equal("initialDistance" in message.state, false);
  assert.equal("biteRemaining" in message.state, false);
});

test("wire validation rejects incomplete and malformed snapshots", () => {
  const message = makeMessage();
  const { fish, ...stateWithoutFish } = message.state;

  assert.equal(isOceanMessage({ ...message, state: stateWithoutFish }), false);
  assert.equal(isOceanMessage({
    ...message,
    state: { ...message.state, fish: { ...fish, position: { x: Number.NaN, y: 0, z: 0 } } },
  }), false);
  assert.equal(isOceanMessage({ ...message, state: { ...message.state, serverOnlyFlag: true } }), false);
});

test("frontend accepts and strips private fields from the previous server during split deployment", () => {
  const message = makeMessage();
  const legacyMessage = {
    ...message,
    state: { ...message.state, initialDistance: 32, biteRemaining: 0 },
  };

  assert.equal(isOceanMessage(legacyMessage), true);
  const parsed = oceanMessageSchema.parse(legacyMessage);
  assert.equal("initialDistance" in parsed.state, false);
  assert.equal("biteRemaining" in parsed.state, false);
  assert.equal(isOceanMessage({
    ...legacyMessage,
    state: { ...legacyMessage.state, initialDistance: Number.NaN },
  }), false);
});

test("catch persistence status is validated while old server messages remain compatible", () => {
  const message = makeMessage();

  assert.equal(isOceanMessage(message), true);
  for (const catchSaveStatus of ["none", "pending", "saved", "failed"] as const) {
    assert.equal(isOceanMessage({ ...message, catchSaveStatus }), true);
  }
  assert.equal(isOceanMessage({ ...message, catchSaveStatus: "unknown" }), false);
  assert.equal(canContinueAfterCatchSave("none"), false);
  assert.equal(canContinueAfterCatchSave("pending"), false);
  assert.equal(canContinueAfterCatchSave("failed"), false);
  assert.equal(canContinueAfterCatchSave("saved"), true);
});
