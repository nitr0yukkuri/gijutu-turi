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

アカウントのプランと実利用量を確認してから切り替えます。2026-10-18時点の公開料金表では、Workers Freeに1日あたり10万Workerリクエスト、Durable Objectsは10万リクエストと13,000 GB-s、D1は500万行読み取り・10万行書き込み・合計5 GBの枠があります。Workers Paidはアカウントあたり月額最低5 USDで、枠を超えた利用に従量料金が発生します。これは公開枠であり、このアカウントのプランや実額は未確認です。

このゲームの20Hz判定はDurable Object内で行い、毎tick D1には問い合わせません。ゲーム状態の保存は通常2秒間隔で、状態変更時に追加保存します。Durable Objectの保存量・行読み書き、実行時間とWebSocket入力数は利用量に数えられます。一方、Durable Objectsから送るWebSocketメッセージは課金対象外で、受信メッセージは20対1でリクエスト換算されます。D1はセッション、図鑑、捕獲時に利用します。Worker Logsはリクエストの10%を採取し、Workers Logsの料金体系は2026年12月1日に変更予定です。

Cloud Runを停止してもCloudflareが必ず無料になるわけではありません。切替前後にCloudflareダッシュボードで実プラン・Billable Usage・請求を確認してください。公開料金と実請求を混同せず、アカウントの利用実績なしに金額見積もりは出しません。

- [Workers・Durable Objects料金](https://developers.cloudflare.com/workers/platform/pricing/)
- [D1料金](https://developers.cloudflare.com/d1/platform/pricing/)
- [Workers Logs料金](https://developers.cloudflare.com/workers/observability/logs/workers-logs/)
