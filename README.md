# GIJUTU TURI

技術の性質を、魚の生態・挙動・釣り上げるときの抵抗として体験するWeb釣りシミュレーター。

## Concept

技術名を魚に貼って解説を読むのではなく、

1. 魚を観察する
2. 挙動を予測する
3. スマートフォンを釣り竿として操作する
4. 魚を釣り上げる
5. その性質のモデルになった技術を知る

という順番で、遊びながら技術の特徴に触れる。

## Target event

[JOGI HACK 2026](https://jogiken.connpass.com/event/401694/)

JOGI HACK向けに、Webアプリとしてのリアルタイム入力、魚の状態シミュレーション、Procedural Animation、技術特性とゲーム挙動の対応を検証する。

## Planned stack

- React + TypeScript + Vite
- Three.js + React Three Fiber
- Hono + Node.js
- WebSocket
- Zod
- pnpm
- Biome

スマートフォンからキャスト・フック・リールなどの入力を送り、PC・大画面側で海と魚を描画する。魚の状態はサーバーを正として管理する。

## Design principles

- 技術要素を外しても、釣り自体が遊びたくなること
- 魚を平面のアイコンではなく、泳ぐ身体として表現すること
- 技術の性質を説明文ではなく、魚の挙動と攻略方法に落とすこと
- まず魚1種類・技術1種類を深く作ること
- Honoやライブラリ名を売りにせず、体験と設計を見せること

## Analysis

企画、UX、Fish Engine、通信設計、MVP、JOGI HACK向けの評価方針は [Issue #1](https://github.com/nitr0yukkuri/gijutu-turi/issues/1) にまとめている。
