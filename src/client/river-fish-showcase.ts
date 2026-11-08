import { RIVER_FISH_SHOWCASE_PATH } from "../fishing-routes.js";

export { RIVER_FISH_SHOWCASE_PATH };

export const isRiverFishShowcasePath = (pathname: string): boolean =>
  pathname === RIVER_FISH_SHOWCASE_PATH || pathname === `${RIVER_FISH_SHOWCASE_PATH}/`;
