import type { CollectionEntry } from "./types.js";

/** A display-only reveal. Never change the collection entry or catch count. */
export function techTreeReveal(status: CollectionEntry["status"], requested: boolean, development: boolean) {
  const caught = status === "caught";
  const preview = status === "unknown" && requested && development;
  return { caught, preview, revealed: caught || preview };
}
