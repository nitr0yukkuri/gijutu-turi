import type { FishSpecies } from "./types";

export type CollectionStatus = "unknown" | "caught" | "preview";

export type CollectionEntry = {
  id: string;
  number: number;
  name: string | null;
  classification: string | null;
  description: string | null;
  habitat: string | null;
  rarity: string | null;
  modelKey: FishSpecies | null;
  catalogStatus: "active" | "preview";
  status: CollectionStatus;
  catches: number;
};

export type Collection = {
  entries: CollectionEntry[];
  registered: number;
  activeTotal: number;
  catalogTotal: number;
};

const catalog: Omit<CollectionEntry, "status" | "catches">[] = [
  {
    id: "fish-001", number: 1, name: "Go魚", classification: "CONCURRENCY SPECIES",
    description: "一匹が複数に分かれ、同時に引く。Goの並行処理を、群れの抵抗として体験する魚。",
    habitat: "静かな沖", rarity: "COMMON", modelKey: "go", catalogStatus: "active",
  },
  {
    id: "fish-002", number: 2, name: "K8s魚", classification: "CLUSTER SPECIES",
    description: "ポッドの群れをまとい、重い引きへ変わる。Kubernetesのクラスタを魚の動きにした一匹。",
    habitat: "深いクラスタ", rarity: "RARE", modelKey: "k8s", catalogStatus: "active",
  },
  {
    id: "fish-003", number: 3, name: "Dockerホエール", classification: "CONTAINER SPECIES",
    description: "大きな体で海を押し分ける、次に出会う予定の魚。",
    habitat: "重い沖", rarity: "PREVIEW", modelKey: null, catalogStatus: "preview",
  },
];

const storageKey = (id: string) => `gijutu.collection.${id}`;

export const speciesEntryId = (species: FishSpecies): string => species === "k8s" ? "fish-002" : "fish-001";

export const createCollection = (): Collection => {
  const entries = catalog.map(entry => {
    let caught = false;
    try { caught = localStorage.getItem(storageKey(entry.id)) === "caught"; } catch { /* best effort */ }
    return { ...entry, status: caught ? "caught" : entry.catalogStatus === "preview" ? "preview" : "unknown", catches: caught ? 1 : 0 };
  });
  return { entries, registered: entries.filter(entry => entry.status === "caught").length, activeTotal: entries.filter(entry => entry.catalogStatus === "active").length, catalogTotal: entries.length };
};

export const recordCollectionCatch = (collection: Collection, species: FishSpecies): Collection => {
  const id = speciesEntryId(species);
  try { localStorage.setItem(storageKey(id), "caught"); } catch { /* best effort */ }
  const entries = collection.entries.map(entry => entry.id === id ? { ...entry, status: "caught" as const, catches: entry.catches + 1 } : entry);
  return { ...collection, entries, registered: entries.filter(entry => entry.status === "caught").length };
};
