// `whale-001` is retained as the stable ID from the earlier preview catalog.
// Reusing it lets existing SQLite files upgrade without losing references.
export type FishSpeciesId = "fish-001" | "whale-001";

export type FishSpeciesDefinition = {
  id: FishSpeciesId;
  number: number;
  name: string;
  classification: string;
  tagline: string;
  description: string;
  habitat: string;
  rarity: string;
  modelKey: "go-fish" | "docker-whale";
  catalogStatus: "active" | "preview";
};

// The registry is the single source of truth shared by the game, collection
// database and client fallback. Adding a species must not require a second
// hard-coded switch in each layer.
export const FISH_SPECIES: readonly FishSpeciesDefinition[] = [
  {
    id: "fish-001",
    number: 1,
    name: "Go魚",
    classification: "CONCURRENCY SPECIES",
    tagline: "ひとつの光が、群れになる。",
    description: "一匹が複数に分かれ、同時に引く。Goの並行処理を、群れの抵抗として体験する魚。",
    habitat: "静かな沖",
    rarity: "COMMON",
    modelKey: "go-fish",
    catalogStatus: "active",
  },
  {
    id: "whale-001",
    number: 2,
    name: "Dockerクジラ",
    classification: "CONTAINER SPECIES",
    tagline: "環境ごと、海を運ぶ。",
    description: "コンテナを背負って同じ環境を運ぶ。Dockerの隔離と再現性を、重い引きとして体験するクジラ。",
    habitat: "深いコンテナ海溝",
    rarity: "RARE",
    modelKey: "docker-whale",
    catalogStatus: "active",
  },
];

export const DEFAULT_FISH_SPECIES_ID: FishSpeciesId = "fish-001";

export const isFishSpeciesId = (value: unknown): value is FishSpeciesId =>
  typeof value === "string" && FISH_SPECIES.some(species => species.id === value);

export const getFishSpecies = (id: FishSpeciesId): FishSpeciesDefinition =>
  FISH_SPECIES.find(species => species.id === id) ?? FISH_SPECIES[0]!;

// The first encounter stays deterministic for demos. After a successful catch
// the next cast rotates to the other active species; an escape retries the same
// species so failure does not unexpectedly change the lesson.
export const nextFishSpeciesId = (current: FishSpeciesId, catches: number): FishSpeciesId =>
  catches > 0 ? current === "fish-001" ? "whale-001" : "fish-001" : current;
