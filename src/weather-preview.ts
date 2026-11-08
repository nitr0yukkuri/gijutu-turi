import { weatherVisualStateFor, type CurrentWeather, type WeatherVisualState } from "./weather-contract.js";

export const WEATHER_PREVIEW_QUERY_PARAM = "weather";
export const WEATHER_TIME_QUERY_PARAM = "time";

export type WeatherPreviewCondition = "clear" | "cloudy" | "rain" | "storm" | "snow";
export type WeatherPreviewTime = "day" | "night";
export type WeatherPreview = {
  condition: WeatherPreviewCondition | null;
  time: WeatherPreviewTime | null;
};

const conditions = new Set<WeatherPreviewCondition>(["clear", "cloudy", "rain", "storm", "snow"]);

const previewVisuals: Readonly<Record<WeatherPreviewCondition, WeatherVisualState>> = {
  clear: {
    cloudCover: 0,
    rainIntensity: 0,
    snowfallIntensity: 0,
    windStrength: 0,
    thunderstormIntensity: 0,
    nightIntensity: 0,
  },
  cloudy: {
    cloudCover: 0.82,
    rainIntensity: 0,
    snowfallIntensity: 0,
    windStrength: 0.12,
    thunderstormIntensity: 0,
    nightIntensity: 0,
  },
  rain: {
    cloudCover: 0.82,
    rainIntensity: 0.68,
    snowfallIntensity: 0,
    windStrength: 0.38,
    thunderstormIntensity: 0,
    nightIntensity: 0,
  },
  storm: {
    cloudCover: 0.96,
    rainIntensity: 0.84,
    snowfallIntensity: 0,
    windStrength: 0.74,
    thunderstormIntensity: 0.92,
    nightIntensity: 0,
  },
  snow: {
    cloudCover: 0.9,
    rainIntensity: 0,
    snowfallIntensity: 0.82,
    windStrength: 0.28,
    thunderstormIntensity: 0,
    nightIntensity: 0,
  },
};

/** Read deterministic visual-only weather settings from a shareable URL. */
export function resolveWeatherPreview(search: string): WeatherPreview | null {
  const params = new URLSearchParams(search);
  const rawCondition = params.get(WEATHER_PREVIEW_QUERY_PARAM)?.trim().toLowerCase() ?? "";
  const rawTime = params.get(WEATHER_TIME_QUERY_PARAM)?.trim().toLowerCase() ?? "";
  const nightAlias = rawCondition === "night";
  const hasCondition = nightAlias || conditions.has(rawCondition as WeatherPreviewCondition);
  const validTime = rawTime === "day" || rawTime === "night" ? rawTime : null;

  if (!hasCondition && validTime === null) return null;

  return {
    condition: nightAlias ? "clear" : hasCondition ? rawCondition as WeatherPreviewCondition : null,
    time: validTime ?? (hasCondition ? nightAlias ? "night" : "day" : null),
  };
}

/** Override the live weather only for visual previews; gameplay remains server-owned. */
export function weatherPreviewVisualStateFor(
  weather: CurrentWeather | null,
  preview: WeatherPreview | null,
): WeatherVisualState {
  const visual = preview?.condition
    ? { ...previewVisuals[preview.condition] }
    : weatherVisualStateFor(weather);
  if (preview?.time === null || preview?.time === undefined) return visual;
  return { ...visual, nightIntensity: preview.time === "night" ? 1 : 0 };
}
