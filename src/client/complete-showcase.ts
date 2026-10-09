import { COMPLETE_SHOWCASE_PATH } from "../fishing-routes.js";
import { FISH_SPECIES } from "../fish-species.js";
import type { Collection } from "./types.js";

export const isCompleteShowcasePath = (pathname: string): boolean =>
  pathname === COMPLETE_SHOWCASE_PATH || pathname === `${COMPLETE_SHOWCASE_PATH}/`;

const activeSpecies = FISH_SPECIES.filter(species => species.catalogStatus === "active");

/** A display-only fixture. It is never sent to the collection API. */
export const COMPLETE_SHOWCASE_COLLECTION: Collection = {
  entries: activeSpecies.map(species => ({
    id: species.id,
    number: species.number,
    name: species.name,
    classification: species.classification,
    tagline: species.tagline,
    description: species.description,
    habitat: species.habitat,
    rarity: species.rarity,
    modelKey: species.modelKey,
    catalogStatus: species.catalogStatus,
    status: "caught",
    catches: 0,
    firstCaughtAt: null,
    lastCaughtAt: null,
  })),
  registered: activeSpecies.length,
  activeTotal: activeSpecies.length,
  catalogTotal: FISH_SPECIES.length,
};
