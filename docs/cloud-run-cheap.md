# Cloud Run 安価構成

## 結論

このアプリをCloud Runでデモ公開する場合の推奨値は次のとおりです。

| 設定 | 値 | 理由 |
| --- | --- | --- |
| 最小インスタンス | `0` | アクセスがない時間の料金を止める |
| 最大インスタンス | `1` | PC画面とスマホ操作を同じインメモリルームへ固定する |
| CPU | `1` | WebSocketを2本使うため、CPUを極端に絞らず安定させる |
| メモリ | `512Mi` | Node/WebSocketとSQLiteを動かすデモ用の余裕を確保 |
| 同時実行数 | `80` | 通常のHTTPリクエストを1インスタンスで処理する |
| リクエストタイムアウト | `3600s` | WebSocketの長時間接続を許容する |
| CPU割り当て | リクエスト課金 | 待機中のCPU割り当てを抑える |
| セッションアフィニティ | 有効 | 同じインスタンスへ寄せる。ただし保証ではない |
| DB | 初期状態は `/tmp/gijutu-turi.sqlite`。D1環境変数を設定するとCloudflare D1 | SQLiteは再起動時に消える。永続化は[D1ガイド](./cloudflare-d1-persistence.md)を参照 |
| リージョン | `asia-northeast1` | 日本からの操作遅延を優先する場合 |

## デプロイ前の準備

フロントエンドをVercel、API/WebSocketをCloud Runに分離する場合は、Vercelのビルド環境変数に `VITE_BACKEND_URL=https://<Cloud RunのURL>` を設定します。Cloud Run側の `FRONTEND_ORIGIN` には、Vercel本番Origin（例：`https://example.vercel.app`）だけを設定します。末尾の`/`やパスは付けません。プレビュー環境も使う場合は必要なOriginだけをカンマ区切りで追加し、`*` は使いません。

Google Cloud CLIをインストールし、ログインとプロジェクト設定を行います。

```powershell
gcloud auth login
gcloud config set project PROJECT_ID
gcloud services enable run.googleapis.com cloudbuild.googleapis.com artifactregistry.googleapis.com
```

請求先が有効なGoogle Cloudプロジェクトが必要です。`PROJECT_ID`は実際のプロジェクトIDに置き換えてください。

## デプロイ

```powershell
gcloud run deploy gijutu-turi `
  --source . `
  --region asia-northeast1 `
  --allow-unauthenticated `
  --min 0 `
  --max 1 `
  --cpu 1 `
  --memory 512Mi `
  --concurrency 80 `
  --timeout 3600 `
  --session-affinity `
  --cpu-throttling `
  --no-cpu-boost `
  --update-env-vars "HOST=0.0.0.0,FRONTEND_ORIGIN=https://<VERCELの本番URL>,CLOUDFLARE_ACCOUNT_ID=<ACCOUNT_ID>,CLOUDFLARE_D1_DATABASE_ID=<DATABASE_ID>" `
  --update-secrets "CLOUDFLARE_API_TOKEN=d1-api-token:latest"
```

`--source .`はリポジトリ内のDockerfileを使ってビルドします。デプロイ後に表示されるHTTPS URLをPCで開き、PC画面のQRをスマホで読み取ります。
この例はD1を使う場合です。アカウントIDとデータベースIDを実際の値に置き換え、APIトークンをSecret Managerの`d1-api-token`として登録してください。`--update-env-vars`と`--update-secrets`は記載していない既存設定を保ちます。PostgreSQLを使う場合はD1変数と同時に設定せず、`DATABASE_URL`をSecretとして渡してください。本番で保存先を設定しない場合、Cloud Runの一時SQLiteへ誤保存しないようアプリが起動を拒否します。設定手順は[D1ガイド](./cloudflare-d1-persistence.md)または[Cloud SQL/PostgreSQLガイド](./cloud-sql-persistence.md)を参照してください。

Vercelと分離する場合、Application Load Balancerは使いません。VercelからCloud Runの`run.app` URLへAPI/WebSocket接続するため、ALBの固定転送ルール料金を避けられます。`FRONTEND_ORIGIN`には本番Vercel URLなど利用するOriginだけを設定します。

## 安さと正しさのトレードオフ

### 1. `min=0`

アクセスがないときはインスタンスを停止できるため、常時起動より安くなります。初回アクセスにはコールドスタートが発生します。

### 2. `max=1`

このアプリの部屋・ゲーム状態・WebSocket接続はNodeプロセスのメモリ内にあります。複数インスタンスになると、PCとスマホが別インスタンスへ分かれて接続できない可能性があります。そのため、現状のコードでは安定性のために最大1インスタンスに制限します。

将来、多人数同時利用をする場合は、部屋状態をRedisなどの共有ストアへ移し、WebSocket接続を複数インスタンスで同期してから`max`を増やします。

### 3. 捕獲履歴の永続化

Cloud Runの `/tmp` はインスタンス固有で、インスタンス停止時に永続保存されません。本番はD1またはPostgreSQLを必須とし、未設定なら起動しません。現在の稼働リビジョンが一時SQLiteを使っている場合、そのリビジョンの履歴は再起動・再デプロイ・スケール移動で消え得ます。

永続化が必要な場合はCloudflare D1を選べます。Cloud RunからD1 APIへ接続し、起動時に図鑑スキーマと魚種マスタを初期化します。Cloud SQLを作成せずに済みますが、D1 APIトークンの設定と無料枠上限の確認が必要です。設定は[Cloudflare D1永続化ガイド](./cloudflare-d1-persistence.md)を参照してください。

### 4. WebSocketの料金

WebSocketは接続中、HTTPリクエストが開いたままになるため、プレイ中のインスタンスは停止しません。`min=0`でも、プレイ中の接続時間分は課金対象になり得ます。

クライアントは接続切断時に再接続する設計にしています。Cloud RunのWebSocket接続はサービスのリクエストタイムアウト上限（現行最大60分）の対象で、セッションアフィニティもベストエフォートです。長時間運用では再接続を前提にします。[WebSocketの公式ガイド](https://cloud.google.com/run/docs/triggering/websockets)

料金ページに表示されるリクエスト課金のアクティブ時間単価を使った概算では、1 vCPU + 512MiBを接続中ずっと動かすと、`$0.000024 + 0.5 × $0.0000025 = $0.00002525/秒`、約`$0.091/時間`です。730時間連続なら無料枠適用前で約`$66/月`ですが、無料枠・リージョン・通貨・割引で変わります。Cloud Runの無料枠は請求先単位で共有されるため、低頻度のデモならコンピュート部分が無料枠内に収まる可能性があります。Cloud Build、Artifact Registry、外向き通信は別に確認してください。

最新単価は [Cloud Run pricing](https://cloud.google.com/run/pricing) と [Pricing Calculator](https://cloud.google.com/products/calculator) で確認します。

### 5. プロモーションクレジットとの関係

プロモーションクレジットは対象サービス・SKUだけに自動適用されます。Cloud RunやArtifact Registryの削減が表示されても、無料枠とクレジットが混在することがあります。ALBの転送ルールは別のNetworking料金になるため、クレジット対象とは仮定せず、請求レポートの「コスト削減」列で確認します。

技術釣りはVercelフロントエンド＋Cloud Runバックエンドの構成で、`min=0`、`max=1`、リクエスト課金、1 vCPU、512MiBを推奨します。通常の短時間デモはこの構成でクレジット内に収まりやすい一方、PCとスマホのWebSocketを長時間開きっぱなしにすると、その接続時間に応じたCloud Run料金が発生します。

## デプロイ後の確認

```powershell
$serviceUrl = gcloud run services describe gijutu-turi --region asia-northeast1 --format='value(status.url)'
Invoke-WebRequest "$serviceUrl/health"
Invoke-WebRequest "$serviceUrl/ready"
Write-Output $serviceUrl
```

確認項目は次のとおりです。

1. `/health`が`ok: true`を返す（プロセスの生存確認）。
2. `/ready`が`ok: true`と`collectionBackend: "d1"`または`"postgres"`を返す（永続DBへの疎通を含む準備完了確認）。DBが使えない場合は`503`になる。`"sqlite"`ならローカル開発環境であり、本番では起動しない。
3. PCでトップ画面を開き、ペアリングダイアログにQRが表示される。
4. スマホでQRを読み取り、PCと同じ部屋へ接続できる。
5. スマホの「振る」「引く」「巻く」でPC側の釣り状態が同期する。
6. HTTPS配下でスマホのモーション許可が表示される。

## 料金を抑える運用チェック

- 不要なサービスは削除または停止する。
- `min=0`を維持する。
- 現状は`max=1`を維持する。
- ログを大量に出さない。
- WebSocketを使わない静的確認時は、接続を閉じる。
- 請求アラートを低い金額で設定する。

料金の最終確認は、利用リージョン・CPU/メモリ・実際の接続時間・無料枠の適用状況で変わるため、Google Cloudの料金画面で行います。
