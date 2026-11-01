import assert from "node:assert/strict";
import test from "node:test";
import { getCurrentWeather, type WeatherFetcher } from "./current-weather.js";

function currentWeatherResponse(weatherCode: number) {
  return new Response(JSON.stringify({
    current: {
      temperature_2m: 18,
      precipitation: 0,
      weather_code: weatherCode,
      is_day: 1,
      cloud_cover: 20,
      wind_speed_10m: 4,
      time: "2026-11-01T12:00",
    },
  }), { status: 200, headers: { "Content-Type": "application/json" } });
}

test("weather fetch combines JMA conditions with a separate GFS thunderstorm code", async () => {
  const requests: string[] = [];
  const fetcher: WeatherFetcher = async input => {
    const url = String(input);
    requests.push(url);
    return currentWeatherResponse(url.includes("/v1/gfs?") ? 95 : 3);
  };

  const result = await getCurrentWeather("river", fetcher);

  assert.equal(result.weatherCode, 3);
  assert.equal(result.thunderstormCode, 95);
  assert.equal(requests.some(url => url.includes("/v1/jma?")), true);
  assert.equal(requests.some(url => url.includes("/v1/gfs?")), true);
});

test("weather fetch keeps JMA data when the optional GFS forecast is unavailable", async () => {
  const fetcher: WeatherFetcher = async input => {
    const url = String(input);
    return url.includes("/v1/gfs?")
      ? new Response(null, { status: 503 })
      : currentWeatherResponse(2);
  };

  const result = await getCurrentWeather("sea", fetcher);

  assert.equal(result.weatherCode, 2);
  assert.equal(result.thunderstormCode, null);
});
