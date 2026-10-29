import { ensurePlayerSession } from "./player-session.js";
import { fetchCollection, type CollectionLoadResult } from "./collection-response.js";
import type { FishSpeciesId } from "../fish-species.js";
import type { Waterway } from "../waterway.js";

export class OceanRoomRateLimitError extends Error {
  constructor(readonly retryAfterSeconds: number) {
    super("ocean_room_rate_limited");
  }
}

export async function loadPlayerCollection(sessionEndpoint: string, collectionEndpoint: string): Promise<CollectionLoadResult> {
  try {
    const session = await ensurePlayerSession(sessionEndpoint);
    return await fetchCollection(collectionEndpoint, session.token);
  } catch {
    return { ok: false, error: "network" };
  }
}

export async function createPlayerOceanRoom(
  sessionEndpoint: string,
  roomEndpoint: string,
  fishId?: FishSpeciesId,
  waterway: Waterway = "sea",
): Promise<{ id: string; host?: string }> {
  const session = await ensurePlayerSession(sessionEndpoint);
  const response = await fetch(roomEndpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.token}` },
    body: JSON.stringify({ waterway, ...(fishId ? { fishId } : {}) }),
    cache: "no-store",
  });
  if (response.status === 429) {
    const retryAfter = Number(response.headers.get("Retry-After"));
    throw new OceanRoomRateLimitError(Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter : 60);
  }
  if (!response.ok) throw new Error("room");
  return await response.json() as { id: string; host?: string };
}
