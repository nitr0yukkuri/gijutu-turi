import { useEffect, useState } from "react";
import type { Waterway } from "../waterway.js";
import { CURRENT_WEATHER_STALE_LIMIT_MS, isCurrentWeather, isCurrentWeatherFresh, type CurrentWeather } from "../weather-contract.js";
import { backendUrl } from "./backend-url.js";

export type WeatherLoadStatus = "loading" | "ready" | "unavailable" | "disabled";

const refreshIntervalMs = 30 * 60_000;
const retryIntervalMs = 5 * 60_000;

export function useCurrentWeather(waterway: Waterway, enabled: boolean): {
  weather: CurrentWeather | null;
  status: WeatherLoadStatus;
} {
  const [state, setState] = useState<{ weather: CurrentWeather | null; status: WeatherLoadStatus }>({
    weather: null,
    status: enabled ? "loading" : "disabled",
  });

  useEffect(() => {
    if (!enabled) {
      setState({ weather: null, status: "disabled" });
      return;
    }
    let active = true;
    let hasFailed = false;
    let lastRequestAt = 0;
    setState({ weather: null, status: "loading" });

    const refresh = async () => {
      lastRequestAt = Date.now();
      try {
        const endpoint = backendUrl("/api/weather?waterway=" + encodeURIComponent(waterway));
        const response = await fetch(endpoint, { headers: { Accept: "application/json" } });
        if (!response.ok) throw new Error("weather_unavailable");
        const payload: unknown = await response.json();
        if (!isCurrentWeather(payload) || payload.waterway !== waterway) throw new Error("weather_payload_invalid");
        hasFailed = false;
        if (active) setState({ weather: payload, status: "ready" });
      } catch {
        hasFailed = true;
        if (active) setState(current => {
          const previous = current.weather?.waterway === waterway ? current.weather : null;
          return {
            weather: isCurrentWeatherFresh(previous) ? previous : null,
            status: "unavailable",
          };
        });
      }
    };

    void refresh();
    const timer = window.setInterval(() => {
      const interval = hasFailed ? retryIntervalMs : refreshIntervalMs;
      if (document.visibilityState === "visible" && Date.now() - lastRequestAt >= interval) void refresh();
    }, retryIntervalMs);
    const onVisibilityChange = () => {
      const retryAfter = hasFailed ? retryIntervalMs : refreshIntervalMs;
      if (document.visibilityState === "visible" && Date.now() - lastRequestAt >= retryAfter) void refresh();
    };
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      active = false;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [enabled, waterway]);

  useEffect(() => {
    const weather = state.weather;
    if (!weather || weather.waterway !== waterway) return;

    const expiresIn = Date.parse(weather.fetchedAt) + CURRENT_WEATHER_STALE_LIMIT_MS - Date.now();
    const expireWeather = () => setState(current => {
      if (current.weather !== weather || isCurrentWeatherFresh(current.weather)) return current;
      return { weather: null, status: "unavailable" };
    });
    if (expiresIn <= 0) {
      expireWeather();
      return;
    }

    const timer = window.setTimeout(expireWeather, expiresIn);
    return () => window.clearTimeout(timer);
  }, [state.weather, waterway]);

  return state;
}
