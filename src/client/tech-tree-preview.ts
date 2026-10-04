import type { CollectionEntry } from "./types.js";

export function isCompletePreviewPath(pathname: string, development: boolean): boolean {
  return development && /^\/complete\/?$/.test(pathname);
}

/** A display-only reveal. Never change the collection entry or catch count. */
export function techTreeReveal(status: CollectionEntry["status"], requested: boolean, development: boolean) {
  const caught = status === "caught";
  const preview = status === "unknown" && requested && development;
  return { caught, preview, revealed: caught || preview };
}
