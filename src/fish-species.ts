// `whale-001` is retained as the stable ID from the earlier preview catalog.
// Reusing it lets existing SQLite files upgrade without losing references.
export type FishSpeciesId = "fish-001" | "whale-001" | "css-001" | "k8s-001" | "rust-001" | "js-001";
export type FishSilhouetteKey = "go-school" | "docker-whale" | "css-fish" | "cluster-leviathan" | "rust-striped-marlin" | "js-eel";

export type FishSpeciesDefinition = {
  id: FishSpeciesId;
  number: number;
  name: string;
  classification: string;
  tagline: string;
  description: string;
  habitat: string;
  rarity: string;
  modelKey: "go-fish" | "docker-whale" | "css-fish" | "cluster-leviathan" | "rust-swordfish" | "js-eel";
  silhouetteKey: FishSilhouetteKey;
  unknownTitle: string;
  unknownHint: string;
  traits: readonly string[];
  observation: string;
  catalogStatus: "active" | "preview";
  /** Keep experimental species out of the ordinary encounter rotation. */
  randomEncounter?: boolean;
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
    silhouetteKey: "go-school",
    unknownTitle: "群れに分かれる魚影",
    unknownHint: "1匹に見えるが、動きが複数に分かれる。",
    traits: ["同時に複数方向へ引く", "群れのように動く", "引きが分散して見える"],
    observation: "沖で群れを作る魚。",
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
    silhouetteKey: "docker-whale",
    unknownTitle: "深く沈む大きな魚影",
    unknownHint: "掛かった瞬間に重くなり、ゆっくりと進路を変える。",
    traits: ["初動が重い", "慣性が残る", "深い場所を好む"],
    observation: "大きな何かを背負った魚影。",
    catalogStatus: "active",
  },
  {
    id: "css-001",
    number: 3,
    name: "CSS fish",
    classification: "STYLE SPECIES",
    tagline: "同じ姿でも、状態で表情が変わる。",
    description: "魚の構造は変えず、状態に応じて色・模様・発光が変化する。CSSの構造と見た目の分離を表す魚。",
    habitat: "カスケード海域",
    rarity: "UNCOMMON",
    modelKey: "css-fish",
    silhouetteKey: "css-fish",
    unknownTitle: "小さな色変わりの魚影",
    unknownHint: "形は変わらないが、状態によって色や模様が変わる。",
    traits: ["小さめで素直な引き", "状態で色が変わる", "模様と発光が変化する"],
    observation: "同じ形のまま、表情を変える魚。",
    catalogStatus: "active",
  },
  {
    id: "k8s-001",
    number: 4,
    name: "K8sレヴィアタン",
    classification: "CLUSTER SPECIES",
    tagline: "一匹を追うと、影が群れをつくる。",
    description: "深海で本体の動きに追従する二つの影を従える古代魚。群れは増えても、針に掛かる本体は一匹だけ。",
    habitat: "深海クラスター海溝",
    rarity: "LEGENDARY",
    modelKey: "cluster-leviathan",
    silhouetteKey: "cluster-leviathan",
    unknownTitle: "影を従える古代魚",
    unknownHint: "本体の周囲に二つの影が現れ、引きに合わせて隊形を変える。",
    traits: ["二つの影が本体を追う", "強い初動と短い突進", "影は釣果として数えない"],
    observation: "影の位置は、本体の泳ぎと引きに遅れて追従する。",
    catalogStatus: "active",
    randomEncounter: false,
  },
  {
    id: "rust-001",
    number: 5,
    name: "Rustカジキ",
    classification: "OWNERSHIP SPECIES",
    tagline: "ひとつの軌道を、最後まで所有する。",
    description: "青い縦縞と長い吻を持つカジキ。一匹の本体が短い突進を決め、古い軌道を残さず向きを変える。Rustの所有権と移動を、鋭い引きとして体験する魚。",
    habitat: "所有権の外洋",
    rarity: "RARE",
    // This key is already stored in catch records; keep it stable while the
    // display identity and silhouette evolve to the striped marlin.
    modelKey: "rust-swordfish",
    silhouetteKey: "rust-striped-marlin",
    unknownTitle: "青い縞をまとう魚影",
    unknownHint: "長い丸い吻と高い背びれ、側面に走る青い縞が見える。",
    traits: ["青い縦縞が側面に並ぶ", "長い丸い吻と高い背びれ", "短い突進を繰り返す"],
    observation: "濃い青の背から銀白色の腹へ移る体に、青い縦縞が浮かぶ。",
    catalogStatus: "active",
  },
  {
    id: "js-001",
    number: 6,
    name: "JSアナゴ",
    classification: "ASYNC SPECIES",
    tagline: "全身の波で泳ぐ、砂泥底の魚。",
    description: "砂泥底にすむマアナゴをモデルに、体側の白い点と尾まで続くひれを再現。全身を使う泳ぎをJavaScriptのイベントループと非同期処理に重ねた。",
    habitat: "沿岸の砂泥底",
    rarity: "UNCOMMON",
    modelKey: "js-eel",
    silhouetteKey: "js-eel",
    unknownTitle: "白い点が並ぶ細長い魚影",
    unknownHint: "砂泥底を進む体側に白い点が並び、背びれと尻びれが尾まで続く。",
    traits: ["体側に白い点が並ぶ", "背びれと尻びれが尾まで続く", "全身をくねらせて泳ぐ"],
    observation: "側面の白い点と、背中から尾へ続く低いひれが特徴。",
    catalogStatus: "active",
  },
];

export const DEFAULT_FISH_SPECIES_ID: FishSpeciesId = "fish-001";

/** Select one catchable species for the unqualified `/` route. */
export const randomActiveFishSpeciesId = (random: () => number = Math.random): FishSpeciesId => {
  const active = FISH_SPECIES.filter(species => species.catalogStatus === "active" && species.randomEncounter !== false);
  const sample = Math.max(0, Math.min(1 - Number.EPSILON, random()));
  return active[Math.floor(sample * active.length)]?.id ?? DEFAULT_FISH_SPECIES_ID;
};

export const isFishSpeciesId = (value: unknown): value is FishSpeciesId =>
  typeof value === "string" && FISH_SPECIES.some(species => species.id === value);

export const getFishSpecies = (id: FishSpeciesId): FishSpeciesDefinition =>
  FISH_SPECIES.find(species => species.id === id) ?? FISH_SPECIES[0]!;

// The first encounter stays deterministic for demos. After a successful catch
// the next cast rotates to the other active species; an escape retries the same
// species so failure does not unexpectedly change the lesson.
export const nextFishSpeciesId = (current: FishSpeciesId, catches: number): FishSpeciesId =>
  catches > 0
    ? ({ "fish-001": "whale-001", "whale-001": "rust-001", "rust-001": "js-001", "js-001": "fish-001", "css-001": "fish-001", "k8s-001": "fish-001" } as const)[current]
    : current;
