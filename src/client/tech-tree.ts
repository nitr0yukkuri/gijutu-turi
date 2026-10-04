import type { FishSpeciesId } from "../fish-species.js";

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
    summary: "処理の並行性と、値の所有を考える。",
    speciesIds: ["fish-001", "rust-001"],
  },
  {
    id: "asynchronous",
    label: "非同期",
    summary: "イベントを待ち、順番に次へ渡す。",
    speciesIds: ["js-001"],
  },
  {
    id: "interface",
    label: "見た目",
    summary: "構造を保ちながら、状態を表現する。",
    speciesIds: ["css-001"],
  },
  {
    id: "runtime",
    label: "実行環境",
    summary: "アプリを包み、まとまりとして動かす。",
    speciesIds: ["whale-001", "k8s-001"],
    relationship: "コンテナ実行と、コンテナ群のオーケストレーションは関連する技術です。",
  },
];

/** Dashed links show related ideas, never unlock order or prerequisites. */
export const TECH_TREE_FISH_LINKS: readonly TechTreeFishLink[] = [
  { id: "systems", from: "fish-001", to: "rust-001", route: "direct" },
  { id: "presentation", from: "css-001", to: "js-001", route: "bridge" },
  { id: "operations", from: "whale-001", to: "k8s-001", route: "direct" },
];

export const TECH_TREE_NODE_DETAILS: Record<FishSpeciesId, TechTreeNodeDetails> = {
  "fish-001": {
    name: "Go",
    technology: "並行処理",
    concept: "複数の処理を同時に進める考え方。",
    gameExpression: "一匹が群れに分かれ、複数の方向から同時に引く。",
  },
  "whale-001": {
    name: "Docker",
    technology: "コンテナ化",
    concept: "アプリと実行環境をまとめ、同じ条件で動かしやすくする。",
    gameExpression: "重い引きと慣性を残しながら、ゆっくり泳ぐ。",
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
    gameExpression: "短く鋭く突進し、軌道を残さず向きを変える。",
  },
  "js-001": {
    name: "JavaScript",
    technology: "イベントループと非同期処理",
    nodeLabel: "イベントループ\n非同期処理",
    concept: "待ち時間で処理を止めず、完了したイベントを順番に扱う。",
    gameExpression: "頭から尾へ波を伝え、途切れず泳ぎ続ける。",
  },
};
