# 技術釣り — 技術構成とアーキテクチャ分析

この文書は、2026-10-02時点の `C:\src\gijutu-turi` 作業ツリーを、設定ファイルではなく実際の import・起動経路・ランタイム処理をたどって整理したもの。作業ツリーには未コミットの K8s 魚表現・挙動変更が含まれるため、その内容も現在のコードとして記述している。デプロイ済み環境の状態を示すものではない。

## 1. 結論

技術釣りは、ブラウザーで動く3D釣りゲームと、釣り判定・部屋管理を行う Node.js サーバーを組み合わせたリアルタイムWebアプリである。PC画面とスマートフォンを1つの釣り部屋へ接続し、スマートフォンを入力端末、PCを3D表示端末として使える。

大きな設計方針は、サーバーをゲーム状態の唯一の権威とし、クライアントは入力と表示を担当すること。魚の位置・速度・泳ぎの位相・釣果判定はサーバーが進め、Three.jsはそのスナップショットを補間して魚・水・糸・竿などを描く。捕獲記録はローカルではSQLite、Cloud Runでは設定によりCloudflare D1へ保存する。

「K8sレヴィアタン」は魚種名であり、現状のデプロイ基盤にKubernetesは使われていない。リポジトリにあるデプロイ手段はDockerコンテナと、Cloud Run / Vercelを組み合わせる案である。

## 2. 構成図

```text
PCブラウザー (React UI + Three.js WebGL)
       │ 表示スナップショット / 入力
       │ WebSocket: /ocean-ws
スマートフォン (Reactコントローラー)
       └──────────────┬───────────────┘
                      ▼
       Node.js 22 + Hono + @hono/node-server
       ├─ Ocean Rooms: ルーム、接続、入力制限
       ├─ OceanFishingGame: 20Hzの権威シミュレーション
       ├─ HTTP API: セッション作成、図鑑取得、health/readiness
       └─ CollectionRepository ─ SQLite (local) / Cloudflare D1 (Cloud Run)

開発: Vite :8788 ─proxy─ backend :8787
本番: Docker 1プロセスでクライアント静的ファイル + API + WebSocket
別案: Vercel (静的クライアント) + Cloud Run (API/WebSocket/D1)
```

## 3. 技術スタック

| 領域 | 採用技術・用途 |
| --- | --- |
| 言語 | TypeScript。ブラウザー、Node.js、ビルド設定、検証スクリプトで共有。Three.js境界の一部はJavaScript相当の型検査除外あり |
| 実行環境 | Node.js 22系。ES Modules (`package.json` の `type: module`)、ブラウザーはネイティブESM |
| UI | React 19系、React DOM、TSX。SSRなし。CSSは `ocean.css` 等の手書きスタイルで、Tailwind等のUIフレームワークはない |
| 3D | Three.js 0.186系、WebGLRenderer、独自ShaderMaterial/GLSL、手続き生成した魚・竿・糸・水面 |
| Three.js配布 | Viteの `three` alias は `vendor/three.module.js` を参照。実配信も `vendor/` の配布物を許可リストから返す。npmの `three` 依存とvendorの二重管理には注意 |
| 開発・ビルド | Vite 8系、`@vitejs/plugin-react`、TypeScript 5.8系、`tsx`。クライアントは `dist/client`、Node側は `dist` へ出力 |
| HTTP | Hono 4系を `@hono/node-server` でNode HTTPサーバーに接続 |
| 双方向通信 | `ws` 8系。HTTPサーバーのupgradeを `/ocean-ws` に渡し、部屋単位にPC表示端末・スマホ操作端末を接続 |
| 入力検証 | Zod 4系。HTTPセッション作成とWebSocketから来るゲームアクションを検証 |
| 永続化 | ローカルはNode組み込みSQLite (`DatabaseSync`)、Cloud RunではD1環境変数設定時にCloudflare D1 APIを利用。`DATABASE_URL` のPostgreSQL接続も任意で残る |
| PWA | Web App ManifestとService Worker。静的画面・ビルド資産をキャッシュし、API/WSはキャッシュしない |
| 音 | Web Audio APIで生成する海の環境音（低い水音と不規則な水面の寄せ引き）・効果音。外部音源ファイルに依存しない |
| テスト | Node.js `node:test` + `tsx`。純粋関数・ゲーム・DB・ルーム・レンダリング計算を検証。統合/モデル検証スクリプトもある |
| CI | GitHub Actions、Ubuntu、Node 22。型検査、テスト、ビルド、Ocean統合検証、魚モデル検証、Docker image build |
| コンテナ | `node:22-slim` のマルチステージDockerfile。ビルド段階と本番依存のみの実行段階を分離 |
| 配信設定 | Vercel設定はVite静的出力用。Cloud Runはリポジトリ文書上のNodeコンテナ運用案 |

バージョン表記は `package.json` が指定するメジャー/マイナー範囲を記載している。ロックファイルが決める個別の解決バージョンとは区別すること。

## 4. 起動・ビルド経路

### 開発

- `npm run dev` が `scripts/dev.ts` を通じてバックエンドとViteを別プロセスで起動する。
- Viteは通常 `0.0.0.0:8788`、API/WebSocketサーバーは `0.0.0.0:8787`。
- Viteは `/api`、`/health`、`/ready`、`/ocean-ws` と公開アセットをバックエンドへproxyする。ブラウザーからは原則同じ開発オリジンに見える。
- `/health` はプロセス生存確認、`/ready` は図鑑ストアへの疎通を含む準備完了確認。DBが使えないとき `/ready` は503を返す。
- `npm run dev:server` は `tsx` で `src/index.ts` を実行する。`src/index.ts` は `server.ts` を読み込む薄い入口。
- `BACKEND_PORT`、`VITE_PORT` を変更可能。これらは `.env.example` には載っていないため、READMEが実質的な設定説明になっている。

### 本番ビルド

- `npm run build` は `vite build` のあと `tsc -p tsconfig.server.json` を実行。
- Viteは `index.html`、魚モデルビューアー2ページ、Service Workerを入力に `dist/client` を生成する。
- `base: "./"`、`publicDir: false`。ロゴ、favicon、ライセンス表示はVite pluginが明示的に出力へコピーする。
- サーバーはビルド済みクライアント資産を `dist/client` から配信する。開発/互換用の一部ルートは許可リストのソースファイルへfallbackする。
- `npm start` は `node dist/index.js`。

## 5. ブラウザー・スマートフォンの責務

`src/client/App.tsx` が画面とReact UIを組み立て、`src/client/useOceanRuntime.ts` が接続、入力、図鑑、音、センサー、レンダラーのライフサイクルを束ねる。魚種ルートは `src/client/fishing-route.ts` と共有定義 `src/fishing-routes.ts` を使い、魚のカタログ/ID/モデル/図鑑説明は `src/fish-species.ts` を中心に決める。

PC画面はThree.jsの海とゲーム表示を担当し、キーボード・ポインター入力を送る。海のsceneはPC側で動的importするため、スマートフォン操作画面では初期表示時に重い3Dレンダラーをダウンロードしない。QRコードから開いたスマートフォンは `?controller=<roomId>` を持つコントローラー画面となり、タッチ、加速度/回転センサーを使ってキャスト・合わせ・リール・竿アクションを送る。センサーを使えない環境にもタッチ操作がある。

プレイヤーIDはブラウザーの `localStorage`、直近のルーム情報と魚種選択は `sessionStorage` を使う。QRに含まれるルームIDは推測困難なランダム値だが、URLを知る人が接続できる共有用トークンとして扱う必要がある。アカウント認証はない。

`PhoneReelControl` は押下中を巻き、離すと巻きを止めるUI。スマホの竿アクションは `RodStrokeMotion` が引いて戻す一往復を端末上で検出し、サーバーには `rod-pump` として送る。センサー許可、WebGL失敗、タブ非表示、再接続などの状態処理も `useOceanRuntime` に寄っている。

## 6. サーバー・ゲーム状態

### HTTP/API

- `POST /api/ocean-sessions`: プレイヤーIDと任意の魚種IDを検証し、ルームを作成。セッション数と送信元IPにインメモリのレート制限を適用。
- `GET /api/collection?playerId=...`: プレイヤー別図鑑を返す。`playerId` は検証し、API CORSは `FRONTEND_ORIGIN` に限定可能。
- `GET /health`: プロセスのhealth応答。DB接続やルーム処理全体の準備完了を確認する深いreadiness probeではない。
- HTML/静的資産: 公開パスのallow-listとビルド資産用のパス検査を使い、`.env` やソースツリーを一般ファイル配信しない。

### WebSocketルーム

`src/ocean-room.ts` はルームIDからゲーム状態、接続、入力キューを引く。ルームは最大128、1ルーム最大8ソケット、スマホcontrollerは1接続。PC displayが未接続だとゲーム入力は処理されず、controller接続後はPCとスマホの同時操作を抑止する。Originを検査するが、Originはブラウザー保護向けであり、アカウント認証の代わりにはならない。

各接続は毎秒40メッセージを上限とし、JSONとZod unionでアクションを検査する。一回操作は最大16件のキューを通して次のゲームtickで消費する。リールは押下状態を400msのleaseとして保持し、releaseメッセージが失われても巻きっぱなしにならないようにする。竿アクションは300ms間隔を課す。送信先の送信待ちデータが64KB以上ならそのbroadcastをスキップする。

部屋のゲームは50msごとの固定tick（20Hz）で進む。部屋とゲーム状態はNodeプロセスのメモリに存在し、無接続30分後に片付ける。broadcastにはゲーム状態、サーバー時刻、竿stroke番号、接続数が含まれる。

### 権威シミュレーション

`src/ocean-game.ts` がidle/casting/waiting/biting/fighting/caught/escaped/retrieving等の釣りphase、入力結果、張力、距離、スタミナ、捕獲/逃走を決定する。キャスト強度から飛距離を決め、アタリには共有 `hook-timing.ts` の時間窓を使う。ファイト中のリール可否・魚のモードと魚種別抵抗はサーバー側で判定される。逃走判定もサーバー側にあり、描画側から釣果を書き換えられない。

釣果に到達するとルーム側callbackが捕獲イベントをDBへ記録し、その後クライアントは図鑑を読み直す。event keyを一意化して、同じイベントの再処理による二重加算を防ぐ。

## 7. 魚の泳ぎと描画

この設計は「魚の動き」と「魚の見え方」を分ける。

1. `FishLocomotion` (`src/fish.ts`) はサーバーtick上で位置、速度、向き、gait、body waveを更新する。加速度・抵抗・heading smoothingを使う。
2. `src/fish-behavior.ts` は魚種別fight profileを持ち、mode（休止/突進/警戒/分裂相当）、gait、抵抗、スタミナ、パルス等を決める。K8sは一匹が本体であり、二つの影は表示上のechoで釣果・サーバー魚数を増やさない。
3. `ocean-contract.ts` のスナップショットを20Hzでクライアントへ送る。
4. `ocean-scene.ts` は最大16個の魚スナップショットを保持し、サーバー時刻を100ms遅らせて位置・速度・向き・body wave等を補間する。
5. 魚モデルは手続き生成メッシュとGLSLで見た目の胴体波、ひれ等を作る。水面も複数波とリップルのfragment shaderで描く。糸は動的buffer上の曲線を水面位置で乾湿に分ける。竿のたわみ、泡/航跡、カメラ演出、K8s影は表示層の計算。

結果として、通信遅延時にも両端末のゲーム判定はサーバーで一致し、描画は滑らかさを補う。表示に使う揺れやechoがゲーム上の魚状態へ逆流しないのが重要な境界。

Three.jsのメインscene、魚モデル、魚水面材質、図鑑プレビューなど一部は `@ts-nocheck`。これはvendored Three.jsに型宣言がない境界を簡略化する一方、描画コード内部の型エラーをTypeScriptが発見しない。メイン描画は命令的に一つの大きなscene/controllerへ集約されており、機能追加時に回帰テストと小さな純粋関数への分離が重要。

通信DTOは `ocean-contract.ts` のZod schemaと型を共有する。サーバーは `wireSnapshot()` で公開フィールドを明示的に選び、`initialDistance` と `biteRemaining` 等のシミュレーション専用値をWebSocketへ含めない。`fightTime` はK8sの水面突進表示が使うため、表示用の共有フィールドとしてschemaに含む。ブラウザーは受信JSONを検証してからUI/sceneへ渡す。

## 8. 永続データ・魚カタログ

`CollectionRepository` を通して保存先を切り替える。既定は `src/collection-db.ts` の同期SQLite (`node:sqlite`)。`CLOUDFLARE_ACCOUNT_ID`、`CLOUDFLARE_D1_DATABASE_ID`、`CLOUDFLARE_API_TOKEN` の3つを設定すると `src/d1-collection-db.ts` がD1 APIを使う。`DATABASE_URL` を設定したPostgreSQLモードも互換用に残しているが、D1と同時には設定できない。各保存先は起動時に `FISH_SPECIES` をupsertし、同じ3テーブルを用意する。

- `fish_species`: 魚種マスタと表示メタデータ
- `player_collections`: プレイヤー×魚種ごとの釣果回数、初回/直近日時
- `collection_catch_events`: イベントキーによる冪等な捕獲履歴

捕獲処理はイベント記録と集計更新を一つのD1バッチトランザクションにまとめ、新規イベントの場合だけ集計を加算する。イベントキーの一意制約と `changes()` 条件により、再送時の二重加算を防ぐ。ローカル既定DBは `data/gijutu-turi.sqlite`、環境変数 `GIJUTU_DB_PATH` で変更できる。Cloud RunでD1を使う場合、APIトークンはSecret Managerから `CLOUDFLARE_API_TOKEN` として渡す。D1設定がなければDockerfile既定の `/tmp` SQLiteとなり、再起動後の永続化は保証されない。

## 9. 配信・運用

### Docker / Cloud Run

DockerはNode 22 slimのマルチステージ構成。実行段階はproduction依存のみをinstallし、ポート8080、`HOST=0.0.0.0` で単一Nodeサーバーを起動する。D1環境変数がそろえばCloudflare D1、未設定なら `/tmp/gijutu-turi.sqlite` を使う。互換用の `DATABASE_URL` はPostgreSQLを選ぶ。Cloud Run向けのリポジトリ文書は、部屋がプロセスメモリにあるため最大1インスタンスを推奨し、WebSocket接続とsession affinityを運用上の制約として説明している。

D1接続コードは実装されているが、D1データベース作成とCloud Run環境変数・Secret設定は運用者の設定が必要。D1未設定時の `/tmp` SQLiteは永続化されない。インスタンス再起動では進行中の部屋も消え、セッションアフィニティはベストエフォートで、複数インスタンスの協調機構ではない。

### Vercel

`vercel.json` は `dist/client` を配信するViteフロントエンド構成。Node API/WebSocketサーバーはVercel設定からは起動しないため、利用するなら別backendを用意し、ビルド時 `VITE_BACKEND_URL` とbackend側 `FRONTEND_ORIGIN` を合わせる必要がある。正規魚種pathと、共有別名から生成する `/fish=...` の各pathをrewriteする。`src/fishing-routes.test.ts` がVercel rewriteと共有別名の一致、およびK8s正規pathのrewrite・末尾スラッシュredirectを検査する。`/?fish=k8s` は互換用query routeとして引き続き使える。

### PWAとオフライン

`src/service-worker.ts` はバージョン付きcacheを作り、HTML・CSS・主要ビルド資産を事前cacheし、同一originのビルドassetsはnetwork-first + cache fallbackで扱う。APIと `/ocean-ws` は対象外。オフラインで画面資産を開けることと、釣りを続けられることは別で、ゲーム進行・捕獲記録にはオンラインサーバーが必要。

## 10. 検証・CI

- `npm run typecheck`: 全体TypeScript型検査。
- `npm test`: Node test runnerで `src/**/*.test.ts` を実行。
- `npm run test:ocean`: 起動済みbackendに対する公開ルート、ルーム、入力、WebSocketの統合検証。
- `npm run test:fish` / `npm run test:whale`: 手続き生成モデルの構造・描画契約を検証。
- CIはさらにproduction buildとDocker image buildを行う。

テストは泳ぎ・魚種挙動、hook timing、ルーム、SQLite、魚体presentation、竿flex、糸、水中表示などを細かく分けている。ブラウザー全体の実機WebGL/スマホセンサー自動E2Eや、本番デプロイ後の継続監視まではこのCIに含まれない。

## 11. アーキテクチャレビュー（優先順）

### P1 — 部屋状態と永続化が単一プロセス前提

部屋、WebSocket、レート制限がプロセスメモリ、Cloud Run文書のDBが `/tmp`。現状のデモ要件では単純だが、複数インスタンス化・再起動耐性・長期図鑑のいずれにも不足する。水平スケールするなら、共有room/event基盤（例: Redis等）と永続DBを先に設計する必要がある。単に最大インスタンス数を増やしても正しくならない。

### 対応済み — WebSocket受信検証と内部状態の混線

`ocean-contract.ts` に魚のvector/body-wave/gaitを含むruntime schemaを置き、クライアントは検証成功時だけ状態を適用する。サーバーは `wireSnapshot()` で送信フィールドをallow-listし、現在使わない内部計算値を外へ漏らさない。共有 `FISH_GAITS` とhook結果一覧からschema enumを作るため、値の重複も避けた。`ocean-contract.test.ts` とOcean統合probeで不正形状・内部値漏れを検知する。

### 対応済み — 旧protocolと現行魚泳ぎ型の依存混在

現行起動経路は `OceanFishingGame` / `OceanMessage`。魚gait/body-waveの共有語彙を `fish-contract.ts` に分離し、現行server/rendererは旧 `protocol.ts` に依存しない。旧 `FishingSimulation` / `GameSnapshot` / `ClientMessage` は互換性確認用のtest-only実装として残すが、production server buildからは除外した。コード自体を削除せず、利用実態を分けた。

### P2 — 描画・入力hookが大きく、型検査除外の境界が広い

`useOceanRuntime.ts` はWebSocket、モーション、入力、音、図鑑、PWA、Three.js lifecycleまで持つ。`ocean-scene.ts` と魚モデルも `@ts-nocheck`。変更速度は上がるが、状態条件の組合せと描画回帰を追う負担が増す。接続hook、device input hook、collection hook、scene controllerに段階分割し、描画入出力を型のあるDTOに限定するのが有効。

### 対応済み — Vercelの旧魚種path

Vercelに共有別名の各旧path rewriteを追加し、`src/fishing-routes.test.ts` で設定漏れを検出する。Vercel側設定はJSONなので別名文字列そのものは重複するが、テストで共有一覧とのdriftを防ぐ。

### P3 — 同期SQLiteとin-memory rate limitは小規模向け

`DatabaseSync` は一回の捕獲時に同期I/OをNodeイベントループ上で行う。低トラフィックには簡素だが、DB遅延・大規模読込はWebSocket tick/broadcastにも影響し得る。Rate limiterもプロセスごとの状態で、複数instance間共有・再起動耐性はない。現状の小規模デモでは妥当だが、性能/セキュリティ保証を過大評価しない。

### P3 — 設定・成果物の細部

- `package.json` の `three` と `vendor/three.module.js` の双方があり、Vite aliasで実行時の参照先が変わる。更新時にnpm packageだけを更新すると表示側へ反映されない可能性があるため、vendored版の更新手順と出所を記録する。
- 開発Vite proxyは現行endpoint `/ocean-ws` に一本化した。
- `vercel.json` は静的frontend向けで、Docker/Cloud Runとはサーバー責務が異なる。配備手順にはbackend URL・CORS・WS Originをひとまとまりの環境設定として記載する。
- `go-fish` chunk はビルドサイズ警告の500KB閾値を超える。メインsceneを動的importにし、通常のスマホ操作画面ではこの3D chunkを取得しないようにした。PCの海では必要になるため、初期描画が遅い場合は魚種別renderer分割やvendor管理を次に検討する。

## 12. 推奨する次の設計作業

1. `useOceanRuntime` を接続・端末入力・図鑑/音の責務へ小さく分け、各境界を単体テスト可能にする。
2. Three.jsの型境界を細くし、scene/modelの `@ts-nocheck` を段階的に減らす。
3. PCの3D初期表示が重い場合、魚種別rendererやThree.js vendor chunkの分割を測定ベースで行う。
4. Cloud Runを複数instance化する必要が出た段階で、room共有・永続DB・rate limit共有の順に基盤を拡張する。

現在のデモ規模では、サーバー権威のゲーム判定、検証可能なWire契約、魚種レジストリ、冪等な捕獲記録、描画と判定の分離はよい土台である。最も大きな未解決制約は、単一プロセスに結びついたルームと一時DB、次に大きなデスクトップ3D chunkとモノリシックなランタイムhookである。
