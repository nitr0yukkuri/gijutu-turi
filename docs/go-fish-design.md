# Go魚: 造形と参照記録

## 方針

ユーザー提供のGo Fishコンセプト画像を方向性の基準とする。画像自体をモデルに貼り付けず、360度確認できる独自の手続き型3D形状を作る。
頭は尖らせ、胴に厚みを持たせ、尾柄を絞る。透ける背びれ・胸びれ・腹びれ・尻びれと、二股に長く伸びた尾を作る。
皮膚は濃い青、眼球は黒、虹彩・体表のノード・光の経路はシアン。全身一様の強い発光やワイヤーフレームは避ける。

## 調べた公開リポジトリ

閲覧日: 2026-09-19。下記は設計研究の参照。魚のメッシュ、テクスチャ、第三者の実装コードのコピーは行っていない。

| 参照 | 確認した内容 | 今回への反映 |
| --- | --- | --- |
| [argonautcode/animal-proc-anim](https://github.com/argonautcode/animal-proc-anim) / [Fish.pde](https://github.com/argonautcode/animal-proc-anim/blob/main/Fish.pde)・[Chain.pde](https://github.com/argonautcode/animal-proc-anim/blob/main/Chain.pde) | 背骨に沿う体幅、体とヒレの位置関係、関節の連動 | 胴体断面のプロファイルと、体・ヒレ・光点に共通する連続変形。2Dチェーンの移植ではなく3D頂点変形として新規実装 |
| [WebGLSamples/WebGLSamples.github.io](https://github.com/WebGLSamples/WebGLSamples.github.io/tree/master/aquarium) / aquarium.html | 頂点位置に応じた泳ぎの変形、魚の反射・法線表現 | 頭を安定させ、後方ほど強い横振り。材質の反射と発光を分離し、変形に合わせ法線も補正 |
| [mrdoob/three.js](https://github.com/mrdoob/three.js) / webgl_gpgpu_birds.html | separation/alignment/cohesionと個体ごとの状態 | 複数個体が同じタイミングで揺れないよう位相を分離。ただし今回の7匹表示は造形確認用の分岐演出で、Boidsの実装ではない |
| [unclemattmakes/polyfish](https://github.com/unclemattmakes/polyfish) README | モデルビューアと生態シミュレーションの分離、頂点泳動 | ゲームの海を変更せず、造形確認用の独立ビューアを用意。モデルはシーンから分離した再利用APIにする |

## 使用したライブラリ

Three.js 0.186.0（既存依存、MIT）。インストール済みの配布物からOrbitControls、RoomEnvironment、EffectComposer、RenderPass、UnrealBloomPass、OutputPassとその依存ファイルをvendor/addonsへコピー。
ライセンスは `vendor/THREE-LICENSE.txt` に保持。別のモデル配布サイトの素材は利用していない。

## 実装

- `go-fish.js`: DOM非依存の `createGoFish({detail,phase})`。返り値は `group`、`update(time,{power,glow})`、`dispose()`。
- 独自の胴体断面メッシュ、8枚のヒレ、両眼、口・鰓、表面に沿う光の経路、4本の尾の光糸。
- ノードや細部は材質単位にまとめ、1匹12メッシュに抑制。群れは低詳細モデルを使用。
- ヒレの反射計算は内積の丸め誤差とゼロ長法線を保護。
- `go-fish.html`: 開発用のモデル確認。回転・拡大・角度切り替え・停止・1→7匹の分岐。

## 境界

最初の海は海のまま。モデル確認ページは海のメニューには追加しない。
その後の釣り実装で、捕獲時に全身と「Go魚」を初めて明確に見せるフローへ接続済み。
ファイト中は水面の七つの航跡と張力上昇で分岐を表現する。水中の七匹を描画するものではなく、実質量やBoidsを使った群れの力学でもない。
張力・捕獲判定は `src/ocean-game.ts`、スマホはモーションのキャスト／合わせとタッチのリール。実機センサーの感度調整は未確認。
参照画像の完全再現やGLBによる手作業モデルと同等の完成度を主張するものではない。
