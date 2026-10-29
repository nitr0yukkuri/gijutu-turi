import type { FishSpeciesId } from "../fish-species.js";
import { RIVER_FISH_DESIGNS } from "../river-fish-designs.js";

export type TechTreeBranch = {
  id: string;
  label: string;
  summary: string;
  speciesIds: readonly FishSpeciesId[];
  relationship?: string;
};

export type TechTreeFishLink = {
  id: string;
  from: FishSpeciesId;
  to: FishSpeciesId;
  route: "direct" | "bridge";
};

export type TechTreeNodeDetails = {
  name: string;
  technology: string;
  nodeLabel?: string;
  concept: string;
  gameExpression: string;
};

/**
 * Branches group related fields; they are not hard technical prerequisites.
 * Each technology node is revealed by catching its corresponding fish.
 */
export const TECH_TREE_BRANCHES: readonly TechTreeBranch[] = [
  {
    id: "logic",
    label: "設計",
    summary: "Goの並行処理とRustの所有権を扱う。",
    speciesIds: ["fish-001", "rust-001"],
  },
  {
    id: "asynchronous",
    label: "非同期",
    summary: "イベントループと非同期処理を扱う。",
    speciesIds: ["js-001"],
  },
  {
    id: "interface",
    label: "見た目",
    summary: "CSSで構造と見た目を分ける。",
    speciesIds: ["css-001"],
  },
  {
    id: "runtime",
    label: "実行環境",
    summary: "DockerコンテナとKubernetesの運用を扱う。",
    speciesIds: ["whale-001", "k8s-001"],
    relationship: "コンテナ実行と、コンテナ群のオーケストレーションは関連する技術です。",
  },
  { id: "river-concurrency", label: "並行処理と運用", summary: "並行処理と、群れをまとめる運用を扱う。", speciesIds: ["river-ayu", "river-ugui"] },
  { id: "river-systems", label: "所有権と長期実行", summary: "安全な値の受け渡しと、長く動く処理を扱う。", speciesIds: ["river-yamame", "river-koi"] },
  { id: "river-interface", label: "状態とイベント", summary: "見た目の状態変化と、イベントへの反応を扱う。", speciesIds: ["river-oikawa", "river-kawamutsu"] },
  { id: "river-runtime", label: "実行環境と基盤", summary: "実行環境と、システムを支える基盤を扱う。", speciesIds: ["river-namazu", "river-ginbuna"] },
  { id: "river-data", label: "柔軟な処理と検索", summary: "柔軟な手順と、条件に合うデータの検索を扱う。", speciesIds: ["river-dojo", "river-kamatsuka"] },
];

/** Dashed links show related ideas, never unlock order or prerequisites. */
export const TECH_TREE_FISH_LINKS: readonly TechTreeFishLink[] = [
  { id: "systems", from: "fish-001", to: "rust-001", route: "direct" },
  { id: "presentation", from: "css-001", to: "js-001", route: "bridge" },
  { id: "operations", from: "whale-001", to: "k8s-001", route: "direct" },
  { id: "river-concurrency", from: "river-ayu", to: "river-ugui", route: "direct" },
  { id: "river-systems", from: "river-yamame", to: "river-koi", route: "direct" },
  { id: "river-interface", from: "river-oikawa", to: "river-kawamutsu", route: "direct" },
  { id: "river-runtime", from: "river-namazu", to: "river-ginbuna", route: "direct" },
  { id: "river-data", from: "river-dojo", to: "river-kamatsuka", route: "direct" },
];

const OCEAN_NODE_DETAILS: Record<Exclude<FishSpeciesId, `river-${string}`>, TechTreeNodeDetails> = {
  "fish-001": {
    name: "Go",
    technology: "並行処理",
    concept: "複数の処理を同時に進める考え方。",
    gameExpression: "複数の魚が別々の方向から同時に引く。",
  },
  "whale-001": {
    name: "Docker",
    technology: "コンテナ化",
    concept: "アプリと実行環境をまとめ、同じ条件で動かしやすくする。",
    gameExpression: "重く引き、ゆっくり進路を変える。",
  },
  "css-001": {
    name: "CSS",
    technology: "構造と見た目の分離",
    concept: "構造を保ちながら、見た目を別に調整する。",
    gameExpression: "形を保ったまま、色・模様・発光が変わる。",
  },
  "k8s-001": {
    name: "Kubernetes",
    technology: "オーケストレーション",
    concept: "コンテナ化されたアプリをまとめて運用し、必要な数を保つ。",
    gameExpression: "本体に二つの影が追従する。釣れるのは本体だけ。",
  },
  "rust-001": {
    name: "Rust",
    technology: "所有権とムーブ",
    concept: "値を安全に扱うため、所有者と所有権の移動を明確にする。",
    gameExpression: "短く突進した後、すぐに進路を変える。",
  },
  "js-001": {
    name: "JavaScript",
    technology: "イベントループと非同期処理",
    nodeLabel: "イベントループ\n非同期処理",
    concept: "待ち時間で処理を止めず、完了したイベントを順番に扱う。",
    gameExpression: "頭から尾へ波を伝え、途切れず泳ぎ続ける。",
  },
};

const RIVER_NODE_DETAILS = Object.fromEntries(RIVER_FISH_DESIGNS.map(design => {
  const [name, technology = design.technology] = design.technology.split(" · ");
  return [design.id, {
    name,
    technology,
    concept: design.technologyConcept,
    gameExpression: design.gameBehavior,
  }];
})) as Record<`river-${string}`, TechTreeNodeDetails>;

export const TECH_TREE_NODE_DETAILS = { ...OCEAN_NODE_DETAILS, ...RIVER_NODE_DETAILS } as Record<FishSpeciesId, TechTreeNodeDetails>;
