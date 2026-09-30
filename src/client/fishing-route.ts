import type { FishSpeciesId } from "../fish-species.js";

export type FishingRouteKey = "default" | "gofish" | "dockerwhale" | "cssfish" | "k8sfish";

export type FishingRoute = {
  key: FishingRouteKey;
  path: "/" | "/gofish" | "/dockerwhale" | "/cssfish";
  initialFishId?: FishSpeciesId;
  title: string;
};

const DEFAULT_ROUTE: FishingRoute = {
  key: "default",
  path: "/",
  title: "技術釣り — 静かな海に、ひと振り。",
};

const GO_FISH_ROUTE: FishingRoute = {
  key: "gofish",
  path: "/gofish",
  initialFishId: "fish-001",
  title: "Go魚 — 技術釣り",
};

const DOCKER_WHALE_ROUTE: FishingRoute = {
  key: "dockerwhale",
  path: "/dockerwhale",
  initialFishId: "whale-001",
  title: "Dockerクジラ — 技術釣り",
};

const CSS_FISH_ROUTE: FishingRoute = {
  key: "cssfish",
  path: "/cssfish",
  initialFishId: "css-001",
  title: "CSS fish — 技術釣り",
};

const K8S_FISH_ROUTE: FishingRoute = {
  key: "k8sfish",
  path: "/",
  initialFishId: "k8s-001",
  title: "K8sレヴィアタン — 技術釣り",
};

const normalizePathname = (pathname: string): string => {
  const normalized = pathname.trim().replace(/\/+/g, "/").replace(/\/+$/, "");
  return normalized || "/";
};

/** Resolve the public fishing URL without coupling routing to the game loop. */
export const resolveFishingRoute = (pathname: string, legacyFish?: string | null): FishingRoute => {
  switch (normalizePathname(pathname)) {
    case "/gofish": return GO_FISH_ROUTE;
    case "/dockerwhale":
    case "/docker": return DOCKER_WHALE_ROUTE;
    case "/cssfish": return CSS_FISH_ROUTE;
  }

  // Keep the old demo links working while giving QR codes a canonical path.
  if (legacyFish === "go") return GO_FISH_ROUTE;
  if (legacyFish === "docker") return DOCKER_WHALE_ROUTE;
  if (legacyFish === "css" || legacyFish === "cssfish") return CSS_FISH_ROUTE;
  if (legacyFish === "k8s" || legacyFish === "k8sfish") return K8S_FISH_ROUTE;
  return DEFAULT_ROUTE;
};
