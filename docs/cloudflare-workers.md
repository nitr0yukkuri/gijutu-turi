# Cloudflare Workersへの移行

## 構成

- `src/cloudflare/worker.ts` が静的画面、API、WebSocketの入口です。Viteの `dist/client` をWorkers Static Assetsで同じオリジンから配ります。
- `src/cloudflare/ocean-room.ts` は1つの釣りルームをDurable Objectで管理します。ゲーム判定は共有の `OceanFishingGame` を使い、魚が動くフェーズだけ20Hzで更新します。アイドル中は更新タイマーを止め、WebSocket Hibernation APIで休止できる構成です。
- `DB` は既存の `gijutu-turi-collections` D1データベースを直接バインドします。捕獲記録をコピーせず、今あるセッションと図鑑を継続利用します。Worker初回利用時に既存と同じテーブル・魚種マスタを `IF NOT EXISTS` とupsertで整えます。
- Durable Objectの部屋上限は全体128、接続は1部屋8、無接続の部屋は30分後に回収します。

## ローカル確認

```powershell
npm ci
npm run dev:cloudflare
```

Wranglerは既定でローカルD1を使います。本番D1へ接続する設定は入れていません。画面/APIの確認後、PC表示とスマートフォン用コントローラーを同じ部屋へ接続して動きを確認してください。

## デプロイ

CloudflareにWorker `gijutu-turi` がまだない場合は、先にDashboardから同名のWorkerを一度作成します。Worker単位のEditor権限は既存Workerの更新・デプロイ用で、新規Worker作成はできません。[Workersの権限](https://developers.cloudflare.com/workers/authorization/workers/)

GitHub Actions用のAPIトークンは、アカウントを対象にしつつ、Workers EditorをこのWorkerだけに割り当てます。D1 bindingを使うWorkerのデプロイには、別途D1権限は不要です。同じCloudflareアカウントのD1データベースへトークンで直接アクセスさせる構成にはしていません。[Bindingsに必要な権限](https://developers.cloudflare.com/workers/authorization/workers/#bindings)

トークン値はGitHubリポジトリ設定のActions secretsへ `CLOUDFLARE_API_TOKEN` として保存します。コードやチャットには貼りません。登録すると、`main` への関連ファイル変更または手動実行でデプロイできます。

```powershell
npm run deploy:cloudflare
```

WorkerのURLは `gijutu-turi.<workers.devのサブドメイン>.workers.dev` になります。カスタムドメインはこの変更では追加していません。まず `/health` と `/ready`、画面、PC・スマートフォン接続、釣果保存、既存図鑑を確認し、共有URLをCloudflare側へ切り替えます。確認完了後にCloud Runサービスを停止します。切替確認より先にCloud Runを削除すると公開URLが停止します。

## 費用の見方

Workers、Durable Objects、D1の実額はCloudflareアカウントのプランと利用量で変わります。特に釣り中は20Hz更新のためDurable Objectが稼働し、接続中ずっと無償枠に収まるとは限りません。Cloud Runの停止でGCP側の実行費は止められますが、Cloudflare料金がゼロになるとは限りません。デプロイ前にCloudflareのプラン・請求画面を確認し、実請求と無料枠・見積りを分けて判断してください。