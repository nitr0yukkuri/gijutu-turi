import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { FishingSimulation } from "./game.js";

describe("FishingSimulation", () => {
  it("emits domain events for the fishing lifecycle", () => {
    const simulation = new FishingSimulation("session_test1234");

    simulation.applyInput({ action: "cast", strength: 1 });
    simulation.drainEvents();

    for (let index = 0; index < 100; index += 1) simulation.step(0.05);

    const events = simulation.drainEvents();
    assert.ok(events.some((event) => event.type === "LureLanded"));
    assert.ok(events.some((event) => event.type === "FishApproached"));
    assert.ok(events.some((event) => event.type === "FishBite"));
    assert.equal(simulation.snapshot().phase, "biting");
  });

  it("does not accept reel input before a fish is hooked", () => {
    const simulation = new FishingSimulation("session_test1234");
    simulation.applyInput({ action: "reel", strength: 1 });
    assert.equal(simulation.snapshot().phase, "idle");
  });

  it("exposes a C-start and burst/coast gait after hooking", () => {
    const simulation = new FishingSimulation("session_test1234");
    simulation.applyInput({ action: "cast", strength: 1 });

    for (let index = 0; index < 100; index += 1) simulation.step(0.05);
    simulation.drainEvents();
    simulation.applyInput({ action: "hook" });

    const hookedSnapshot = simulation.snapshot();
    assert.equal(hookedSnapshot.phase, "fighting");
    assert.equal(hookedSnapshot.fish.gait, "hooked_burst");
    assert.ok(hookedSnapshot.fish.bodyWave.amplitude > 0);
    assert.ok(hookedSnapshot.fish.bodyWave.frequency > 0);

    for (let index = 0; index < 4; index += 1) simulation.step(0.1);
    const fightSnapshot = simulation.snapshot();
    assert.ok(["burst", "coast"].includes(fightSnapshot.fish.gait));
    assert.ok(fightSnapshot.fish.speed >= 0);
  });
});
