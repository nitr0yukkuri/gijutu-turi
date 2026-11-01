import { useEffect, useState } from "react";
import type { Waterway } from "../waterway.js";
import { isCurrentWeather, type CurrentWeather } from "../weather-contract.js";
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
        if (active) setState(current => ({
          weather: current.weather?.waterway === waterway ? current.weather : null,
          status: "unavailable",
        }));
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

  return state;
}
