import type { Collection, CollectionEntry } from "./types.js";

export type CollectionLoadError = "network" | "http" | "invalid-json" | "invalid-shape";
export type CollectionLoadResult =
  | { ok: true; value: Collection }
  | { ok: false; error: CollectionLoadError };

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);
const isNullableString = (value: unknown): value is string | null =>
  value === null || typeof value === "string";
const isCount = (value: unknown): value is number =>
  typeof value === "number" && Number.isSafeInteger(value) && value >= 0;

const isCollectionEntry = (value: unknown): value is CollectionEntry => {
  if (!isRecord(value)) return false;
  return typeof value.id === "string"
    && isCount(value.number)
    && isNullableString(value.name)
    && isNullableString(value.classification)
    && isNullableString(value.tagline)
    && isNullableString(value.description)
    && isNullableString(value.habitat)
    && isNullableString(value.rarity)
    && isNullableString(value.modelKey)
    && (value.catalogStatus === "active" || value.catalogStatus === "preview")
    && (value.status === "unknown" || value.status === "caught" || value.status === "preview")
    && isCount(value.catches)
    && isNullableString(value.firstCaughtAt)
    && isNullableString(value.lastCaughtAt);
};

export function parseCollectionResponse(value: unknown): CollectionLoadResult {
  if (!isRecord(value)
    || !Array.isArray(value.entries)
    || !value.entries.every(isCollectionEntry)
    || !isCount(value.registered)
    || !isCount(value.activeTotal)
    || !isCount(value.catalogTotal)) {
    return { ok: false, error: "invalid-shape" };
  }
  return { ok: true, value: value as unknown as Collection };
}

export async function fetchCollection(url: string): Promise<CollectionLoadResult> {
  let response: Response;
  try {
    response = await fetch(url, { cache: "no-store" });
  } catch {
    return { ok: false, error: "network" };
  }
  if (!response.ok) return { ok: false, error: "http" };

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    return { ok: false, error: "invalid-json" };
  }
  return parseCollectionResponse(payload);
}
