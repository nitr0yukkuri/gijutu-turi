export type FishingRouteKey = "default" | "gofish" | "dockerwhale" | "cssfish" | "k8sfish" | "rustfish" | "jseel";
export type LegacyFishingRouteKey = Exclude<FishingRouteKey, "default">;

/** Canonical public path for the K8s species route. */
export const K8S_FISH_ROUTE_PATH = "/k8sfish";

export const FISHING_ROUTE_PATHS = {
  gofish: "/gofish",
  dockerwhale: "/dockerwhale",
  docker: "/docker",
  cssfish: "/cssfish",
  k8sfish: K8S_FISH_ROUTE_PATH,
  rustfish: "/rustfish",
  jseel: "/jseel",
} as const;

export const CANONICAL_FISH_ROUTE_PATHS = [
  FISHING_ROUTE_PATHS.gofish,
  FISHING_ROUTE_PATHS.dockerwhale,
  FISHING_ROUTE_PATHS.cssfish,
  FISHING_ROUTE_PATHS.k8sfish,
  FISHING_ROUTE_PATHS.rustfish,
  FISHING_ROUTE_PATHS.jseel,
] as const;

/** Compatibility names are shared by browser route resolution and HTTP serving. */
export const LEGACY_FISH_ROUTE_ALIASES = {
  go: "gofish",
  docker: "dockerwhale",
  css: "cssfish",
  cssfish: "cssfish",
  k8s: "k8sfish",
  k8sfish: "k8sfish",
  rust: "rustfish",
  rustfish: "rustfish",
  js: "jseel",
  jseel: "jseel",
  jsfish: "jseel",
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
