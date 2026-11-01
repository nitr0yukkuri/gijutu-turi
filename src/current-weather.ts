import { RequestRateLimiter } from "./request-rate-limit.js";
import { WEATHER_REFERENCE_AREAS, type CurrentWeather } from "./weather-contract.js";
import type { Waterway } from "./waterway.js";

export type WeatherFetcher = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

const cacheTtlMs = 30 * 60_000;
const staleLimitMs = 6 * 60 * 60_000;
const weatherCache = new Map<Waterway, { value: CurrentWeather; expiresAt: number }>();
const weatherRequests = new Map<Waterway, Promise<CurrentWeather>>();
const requestLimiter = new RequestRateLimiter();
const windowMs = 10 * 60_000;

const weatherPoints: Record<Waterway, { latitude: number; longitude: number }> = {
  sea: { latitude: 35.48, longitude: 139.8 },
  river: { latitude: 36.15, longitude: 139.39 },
};
const thunderstormCodes = new Set([95, 96, 97, 99]);

function json(value: unknown, status: number, headers: HeadersInit = {}): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", ...headers },
  });
}

function finiteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

async function fetchThunderstormCode(waterway: Waterway, fetcher: WeatherFetcher): Promise<number | null> {
  const point = weatherPoints[waterway];
  const query = new URLSearchParams({
    latitude: String(point.latitude),
    longitude: String(point.longitude),
    current: "weather_code",
    timezone: "Asia/Tokyo",
    forecast_days: "1",
    cell_selection: waterway === "sea" ? "sea" : "land",
  });

  try {
    const response = await fetcher("https://api.open-meteo.com/v1/gfs?" + query.toString(), {
      signal: AbortSignal.timeout(3_000),
    });
    if (!response.ok) return null;
    const payload: unknown = await response.json();
    if (typeof payload !== "object" || payload === null || Array.isArray(payload)) return null;
    const current = (payload as Record<string, unknown>).current;
    if (typeof current !== "object" || current === null || Array.isArray(current)) return null;
    const weatherCode = (current as Record<string, unknown>).weather_code;
    return finiteNumber(weatherCode) && Number.isInteger(weatherCode) && thunderstormCodes.has(weatherCode)
      ? weatherCode
      : null;
  } catch {
    return null;
  }
}

async function fetchWeather(waterway: Waterway, fetcher: WeatherFetcher): Promise<CurrentWeather> {
  const point = weatherPoints[waterway];
  const query = new URLSearchParams({
    latitude: String(point.latitude),
    longitude: String(point.longitude),
    current: "temperature_2m,precipitation,weather_code,is_day,cloud_cover,wind_speed_10m",
    wind_speed_unit: "ms",
    timezone: "Asia/Tokyo",
    forecast_days: "1",
    cell_selection: waterway === "sea" ? "sea" : "land",
  });
  const [response, thunderstormCode] = await Promise.all([
    fetcher("https://api.open-meteo.com/v1/jma?" + query.toString(), {
      signal: AbortSignal.timeout(5_000),
    }),
    fetchThunderstormCode(waterway, fetcher),
  ]);
  if (!response.ok) throw new Error("weather_upstream_unavailable");
  const payload: unknown = await response.json();
  if (typeof payload !== "object" || payload === null || Array.isArray(payload)) throw new Error("weather_payload_invalid");
  const current = (payload as Record<string, unknown>).current;
  if (typeof current !== "object" || current === null || Array.isArray(current)) throw new Error("weather_payload_invalid");
  const values = current as Record<string, unknown>;
  const temperatureC = values.temperature_2m;
  const precipitationMm = values.precipitation;
  const weatherCode = values.weather_code;
  const isDay = values.is_day;
  const cloudCoverPercent = values.cloud_cover;
  const windSpeedMs = values.wind_speed_10m;
  const currentAt = values.time;
  if (!finiteNumber(temperatureC) || !finiteNumber(precipitationMm) || !finiteNumber(weatherCode)
    || (isDay !== 0 && isDay !== 1)
    || !finiteNumber(cloudCoverPercent) || !finiteNumber(windSpeedMs) || typeof currentAt !== "string"
    || !Number.isFinite(Date.parse(currentAt)) || !Number.isInteger(weatherCode)) {
    throw new Error("weather_payload_invalid");
  }
  return {
    waterway,
    location: WEATHER_REFERENCE_AREAS[waterway],
    temperatureC,
    thunderstormCode,
    weatherCode,
    isDay: isDay === 1,
    precipitationMm: Math.max(0, precipitationMm),
    cloudCoverPercent: Math.max(0, Math.min(100, cloudCoverPercent)),
    windSpeedMs: Math.max(0, windSpeedMs),
    currentAt,
    fetchedAt: new Date().toISOString(),
  };
}

export async function getCurrentWeather(waterway: Waterway, fetcher: WeatherFetcher = fetch): Promise<CurrentWeather> {
  const now = Date.now();
  const cached = weatherCache.get(waterway);
  if (cached && now < cached.expiresAt) return cached.value;
  const pending = weatherRequests.get(waterway);
  if (pending) return pending;

  const request = fetchWeather(waterway, fetcher).then(value => {
    weatherCache.set(waterway, { value, expiresAt: Date.now() + cacheTtlMs });
    return value;
  }).catch(error => {
    if (cached && Date.now() - Date.parse(cached.value.fetchedAt) < staleLimitMs) {
      weatherCache.set(waterway, { value: cached.value, expiresAt: Date.now() + 5 * 60_000 });
      return cached.value;
    }
    throw error;
  });
  weatherRequests.set(waterway, request);
  try {
    return await request;
  } finally {
    if (weatherRequests.get(waterway) === request) weatherRequests.delete(waterway);
  }
}

export async function handleCurrentWeatherRequest(
  request: Request,
  fetcher: WeatherFetcher = fetch,
): Promise<Response> {
  if (request.method !== "GET") return json({ error: "method_not_allowed" }, 405, { Allow: "GET" });
  const url = new URL(request.url);
  const waterwayValue = url.searchParams.get("waterway");
  let hasUnexpectedParameter = false;
  url.searchParams.forEach((_value, name) => {
    if (name !== "waterway") hasUnexpectedParameter = true;
  });
  if (hasUnexpectedParameter || url.searchParams.getAll("waterway").length !== 1
    || (waterwayValue !== "sea" && waterwayValue !== "river")) {
    return json({ error: "invalid_weather_request" }, 400);
  }

  const source = request.headers.get("cf-connecting-ip")?.trim()
    || request.headers.get("x-forwarded-for")?.split(",", 1)[0]?.trim()
    || "unknown";
  const retryAfter = requestLimiter.consume([
    { key: "global", limit: 6_000, windowMs },
    { key: "source:" + source, limit: 60, windowMs },
  ]);
  if (retryAfter) return json({ error: "rate_limited" }, 429, { "Retry-After": String(retryAfter) });

  try {
    const weather = await getCurrentWeather(waterwayValue, fetcher);
    return json(weather, 200, { "Cache-Control": "public, max-age=600, s-maxage=1800, stale-if-error=21600" });
  } catch {
    return json({ error: "weather_unavailable" }, 503, { "Cache-Control": "no-store" });
  }
}
