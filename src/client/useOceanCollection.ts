import { useCallback, useRef, useState } from "react";
import type { Collection, CollectionEntry } from "./types.js";
import { loadPlayerCollection } from "./ocean-api.js";
import type { CollectionLoadResult } from "./collection-response.js";
import { LatestRequestGuard } from "./latest-request.js";
import { FISH_SPECIES } from "../fish-species.js";

export const COLLECTION_LOAD_ERROR_MESSAGE = "図鑑を読み込めません。DBとの接続を確認してください。";

const fallbackCatalog: CollectionEntry[] = FISH_SPECIES.map(species => ({
  ...species,
  status: "unknown" as const,
  catches: 0,
  firstCaughtAt: null,
  lastCaughtAt: null,
}));

const initialCollection = (): Collection => ({
  entries: fallbackCatalog.map(entry => ({ ...entry })),
  registered: 0,
  activeTotal: fallbackCatalog.length,
  catalogTotal: fallbackCatalog.length,
});

export function useOceanCollection(sessionEndpoint: string, collectionEndpoint: string) {
  const [collection, setCollection] = useState<Collection>(initialCollection);
  const collectionRef = useRef(collection);
  const requestGuardRef = useRef(new LatestRequestGuard());

  const loadCollection = useCallback(async (): Promise<{ result: CollectionLoadResult; revision: number }> => {
    const revision = requestGuardRef.current.begin();
    const result = await loadPlayerCollection(sessionEndpoint, collectionEndpoint);
    if (result.ok && requestGuardRef.current.isCurrent(revision)) {
      collectionRef.current = result.value;
      setCollection(result.value);
    }
    return { result, revision };
  }, [collectionEndpoint, sessionEndpoint]);

  const isCurrentCollectionLoad = useCallback((revision: number) => requestGuardRef.current.isCurrent(revision), []);

  return { collection, collectionRef, loadCollection, isCurrentCollectionLoad };
}
