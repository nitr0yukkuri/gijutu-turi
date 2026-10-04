import type { FishSpeciesId } from "../fish-species.js";
import { K8S_FISH_ROUTE_PATH } from "../fishing-routes.js";

export type TechTreeBranch = {
  id: string;
  label: string;
  summary: string;
  speciesIds: readonly FishSpeciesId[];
  relationship?: string;
};

export type TechTreeNodeDetails = {
  technology: string;
  concept: string;
  gameExpression: string;
  routeHref: string;
};

/**
 * Branches group related fields; they are not hard technical prerequisites.
 * Each technology node is revealed by catching its corresponding fish.
 */
export const TECH_TREE_BRANCHES: readonly TechTreeBranch[] = [
  {
    id: "logic",
    label: "プログラムを設計する",
    summary: "処理の並行性と、値の所有を考える。",
    speciesIds: ["fish-001", "rust-001"],
  },
  {
    id: "interface",
    label: "見た目を組み立てる",
    summary: "構造を保ちながら、状態を表現する。",
    speciesIds: ["css-001"],
  },
  {
    id: "runtime",
    label: "実行環境を運用する",
    summary: "アプリを包み、まとまりとして動かす。",
    speciesIds: ["whale-001", "k8s-001"],
    relationship: "コンテナ実行と、コンテナ群のオーケストレーションは関連する技術です。",
  },
  {
    id: "asynchronous",
    label: "処理を流し続ける",
    summary: "イベントを待ち、順番に次へ渡す。",
    speciesIds: ["js-001"],
  },
];

export const TECH_TREE_NODE_DETAILS: Record<FishSpeciesId, TechTreeNodeDetails> = {
  "fish-001": {
    technology: "並行処理",
    concept: "複数の処理を同時に進める考え方。",
    gameExpression: "一匹から群れに分かれ、複数の方向から同時に引く動きで表現しています。",
    routeHref: "/gofish",
  },
  "whale-001": {
    technology: "コンテナ化",
    concept: "アプリと実行環境をまとめ、同じ条件で動かしやすくする考え方。",
    gameExpression: "環境ごと背負う重さや、動きに残る慣性をクジラの引きで表現しています。",
    routeHref: "/dockerwhale",
  },
  "css-001": {
    technology: "構造と見た目の分離",
    concept: "コンテンツの構造を保ちながら、見た目を別に調整する考え方。",
    gameExpression: "魚の形は保ったまま、状態に応じて色・模様・発光が変わります。",
    routeHref: "/cssfish",
  },
  "k8s-001": {
    technology: "オーケストレーション",
    concept: "複数のコンテナ化されたアプリをまとめて運用し、必要な数を保つ考え方。",
    gameExpression: "一匹の本体に二つの影が追従します。影は別の釣果として数えません。",
    routeHref: K8S_FISH_ROUTE_PATH,
  },
  "rust-001": {
    technology: "所有権とムーブ",
    concept: "値を安全に扱うため、誰が使うかと所有権の移動を明示する考え方。",
    gameExpression: "鋭く短い突進のあとに軌道を残さず向きを変える動きで、所有権の移動を表現しています。",
    routeHref: "/rustfish",
  },
  "js-001": {
    technology: "イベントループと非同期処理",
    concept: "待ち時間で処理を止めず、完了したイベントを順番に扱う考え方。",
    gameExpression: "頭から尾へ遅延する連続波と、全身が途切れず進むくねりで表現しています。",
    routeHref: "/jseel",
  },
};
