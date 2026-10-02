export type FishingRouteKey = "default" | "gofish" | "dockerwhale" | "cssfish" | "k8sfish";
export type LegacyFishingRouteKey = Exclude<FishingRouteKey, "default">;

/** Compatibility names are shared by browser route resolution and HTTP serving. */
export const LEGACY_FISH_ROUTE_ALIASES = {
  go: "gofish",
  docker: "dockerwhale",
  css: "cssfish",
  cssfish: "cssfish",
  k8s: "k8sfish",
  k8sfish: "k8sfish",
} as const satisfies Record<string, LegacyFishingRouteKey>;

export type LegacyFishAlias = keyof typeof LEGACY_FISH_ROUTE_ALIASES;
export const LEGACY_FISH_PATH_PREFIX = "/fish=";
export const LEGACY_FISH_PATH_ALIASES = Object.keys(LEGACY_FISH_ROUTE_ALIASES)
  .map(alias => `${LEGACY_FISH_PATH_PREFIX}${alias}`);

export function legacyFishRouteKey(alias: string | null | undefined): LegacyFishingRouteKey | null {
  if (!alias || !Object.hasOwn(LEGACY_FISH_ROUTE_ALIASES, alias)) return null;
  return LEGACY_FISH_ROUTE_ALIASES[alias as LegacyFishAlias];
}

export function legacyFishAliasFromPath(pathname: string): string | null {
  if (!pathname.startsWith(LEGACY_FISH_PATH_PREFIX)) return null;
  const alias = pathname.slice(LEGACY_FISH_PATH_PREFIX.length);
  return alias && !alias.includes("/") ? alias : null;
}
