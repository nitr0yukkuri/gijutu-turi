import type { FishSpeciesId } from "./fish-species.js";
import type { CurrentWeather } from "./weather-contract.js";
import type { Waterway } from "./waterway.js";

const nocturnalSpecies = new Set<FishSpeciesId>(["js-001", "river-namazu"]);
const rainActivityCodes = new Set([51, 53, 61, 63, 80, 81]);
const thunderstormCodes = new Set([95, 96, 99]);
const MAX_WEATHER_FISHING_ASSIST = 0.1;
const clamp01 = (value: number): number => Math.max(0, Math.min(1, value));

/** Small, server-owned gameplay tuning; it is not a biological catch forecast. */
export function weatherFishingAssistFor(
  weather: CurrentWeather | null,
  waterway: Waterway,
  fishId: FishSpeciesId,
): number {
  if (!weather || weather.waterway !== waterway || thunderstormCodes.has(weather.weatherCode)) return 0;

  let assist = 0;
  if (!weather.isDay && nocturnalSpecies.has(fishId)) assist += 0.04;
  if (rainActivityCodes.has(weather.weatherCode)) assist += 0.025;

  // Wind speed is only a rough proxy for sea chop; this project does not yet
  // retrieve wave height or swell period. River wind never grants this bonus.
  if (waterway === "sea") {
    const moderateWindFit = clamp01(1 - Math.abs(weather.windSpeedMs - 4.5) / 4.5);
    assist += moderateWindFit * 0.035;
  }

  return Math.min(MAX_WEATHER_FISHING_ASSIST, assist);
}
