import assert from "node:assert/strict";
import test from "node:test";
import { isCurrentWeather, weatherVisualStateFor, type CurrentWeather } from "./weather-contract.js";

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

test("weather visuals map snow and GFS thunderstorm codes independently of JMA codes", () => {
  assert.equal(weatherVisualStateFor(weather({ weatherCode: 75 })).snowfallIntensity, 0.88);
  assert.equal(weatherVisualStateFor(weather({ weatherCode: 0, thunderstormCode: 97 })).thunderstormIntensity, 0.92);
  assert.equal(weatherVisualStateFor(null).thunderstormIntensity, 0);
});

test("weather payload validation accepts optional storm codes and rejects malformed values", () => {
  const payload = weather({ thunderstormCode: 95 });
  assert.equal(isCurrentWeather(payload), true);
  assert.equal(isCurrentWeather({ ...payload, thunderstormCode: "storm" }), false);
  const legacyPayload = { ...payload };
  delete (legacyPayload as Partial<CurrentWeather>).thunderstormCode;
  assert.equal(isCurrentWeather(legacyPayload), true);
});
