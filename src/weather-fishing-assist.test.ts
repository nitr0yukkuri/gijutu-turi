import assert from "node:assert/strict";
import test from "node:test";
import { weatherFishingAssistFor } from "./weather-fishing-assist.js";
import type { CurrentWeather } from "./weather-contract.js";

function weather(overrides: Partial<CurrentWeather> = {}): CurrentWeather {
  return {
    waterway: "sea",
    location: "東京湾（参考地点）",
    temperatureC: 18,
    weatherCode: 0,
    thunderstormCode: null,
    isDay: true,
    precipitationMm: 0,
    cloudCoverPercent: 20,
    windSpeedMs: 0,
    currentAt: "2026-11-01T12:00",
    fetchedAt: "2026-11-01T03:00:00.000Z",
    ...overrides,
  };
}

test("night, rain, snow, and forecast thunderstorms apply small fishing assistance", () => {
  assert.equal(weatherFishingAssistFor(weather({ isDay: false }), "sea", "js-001"), 0.04);
  assert.equal(weatherFishingAssistFor(weather({ weatherCode: 65 }), "sea", "js-001"), 0.025);
  assert.equal(weatherFishingAssistFor(weather({ weatherCode: 71 }), "sea", "js-001"), 0.025);
  assert.equal(weatherFishingAssistFor(weather({ thunderstormCode: 95 }), "sea", "js-001"), 0.025);
});

test("weather assistance is capped and sea wind does not affect river fishing", () => {
  const stacked = weather({
    isDay: false,
    weatherCode: 71,
    thunderstormCode: 99,
    windSpeedMs: 4.5,
  });
  assert.equal(weatherFishingAssistFor(stacked, "sea", "js-001"), 0.1);
  assert.equal(weatherFishingAssistFor(weather({ waterway: "river", windSpeedMs: 4.5 }), "river", "river-namazu"), 0);
});

test("missing or mismatched weather never changes fishing balance", () => {
  assert.equal(weatherFishingAssistFor(null, "sea", "js-001"), 0);
  assert.equal(weatherFishingAssistFor(weather({ waterway: "sea" }), "river", "river-namazu"), 0);
});
