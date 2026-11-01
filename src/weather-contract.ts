import type { Waterway } from "./waterway.js";

export type CurrentWeather = {
  waterway: Waterway;
  location: string;
  temperatureC: number;
  weatherCode: number;
  /** Thunderstorm code from Open-Meteo's GFS model; JMA does not derive these codes. */
  thunderstormCode?: number | null;
  isDay: boolean;
  precipitationMm: number;
  cloudCoverPercent: number;
  windSpeedMs: number;
  currentAt: string;
  fetchedAt: string;
};

export type WeatherVisualState = {
  cloudCover: number;
  rainIntensity: number;
  snowfallIntensity: number;
  windStrength: number;
  thunderstormIntensity: number;
  nightIntensity: number;
};

export const WEATHER_REFERENCE_AREAS: Record<Waterway, string> = {
  sea: "東京湾（参考地点）",
  river: "荒川（熊谷付近）",
};

const rainCodes = new Set([51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 80, 81, 82, 95, 96, 97, 99]);
const snowIntensityByCode: Record<number, number> = {
  71: 0.28, 73: 0.56, 75: 0.88, 77: 0.22, 85: 0.38, 86: 0.78,
};
const thunderstormIntensityByCode: Record<number, number> = { 95: 0.68, 96: 0.84, 97: 0.92, 99: 1 };
const clamp01 = (value: number): number => Math.max(0, Math.min(1, value));

export function weatherVisualStateFor(weather: CurrentWeather | null): WeatherVisualState {
  if (!weather) return { cloudCover: 0, rainIntensity: 0, snowfallIntensity: 0, windStrength: 0, thunderstormIntensity: 0, nightIntensity: 0 };
  const snowfallIntensity = snowIntensityByCode[weather.weatherCode] ?? 0;
  const thunderstormIntensity = thunderstormIntensityByCode[weather.thunderstormCode ?? -1] ?? 0;
  const cloudCover = Math.max(
    clamp01(weather.cloudCoverPercent / 100),
    snowfallIntensity > 0 ? 0.66 : 0,
    thunderstormIntensity > 0 ? 0.84 : 0,
  );
  return {
    cloudCover,
    rainIntensity: rainCodes.has(weather.weatherCode) ? clamp01(Math.max(weather.precipitationMm / 2, 0.12)) : 0,
    snowfallIntensity: snowfallIntensity > 0 ? clamp01(Math.max(snowfallIntensity, weather.precipitationMm / 4)) : 0,
    windStrength: clamp01(weather.windSpeedMs / 16),
    thunderstormIntensity,
    nightIntensity: weather.isDay ? 0 : 1,
  };
}

export function isCurrentWeather(value: unknown): value is CurrentWeather {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  return (record.waterway === "sea" || record.waterway === "river")
    && typeof record.location === "string"
    && typeof record.temperatureC === "number" && Number.isFinite(record.temperatureC)
    && typeof record.weatherCode === "number" && Number.isInteger(record.weatherCode)
    && (record.thunderstormCode === undefined || record.thunderstormCode === null
      || typeof record.thunderstormCode === "number" && Number.isInteger(record.thunderstormCode))
    && typeof record.isDay === "boolean"
    && typeof record.precipitationMm === "number" && Number.isFinite(record.precipitationMm)
    && typeof record.cloudCoverPercent === "number" && Number.isFinite(record.cloudCoverPercent)
    && typeof record.windSpeedMs === "number" && Number.isFinite(record.windSpeedMs)
    && typeof record.currentAt === "string" && Number.isFinite(Date.parse(record.currentAt))
    && typeof record.fetchedAt === "string" && Number.isFinite(Date.parse(record.fetchedAt));
}
