# Cloud Runで図鑑をCloudflare D1へ保存する

ローカルではNode組み込みSQLiteを使い、Cloud Runでは設定によりCloudflare D1へ図鑑データを保存できます。D1はSQLite互換のマネージドDBで、Cloud Runインスタンスが停止・再作成されてもデータが残ります。Cloud Run内の `/tmp` は一時領域なので、D1設定がない場合の捕獲履歴は永続しません。

この変更ではD1接続コードを追加しましたが、Cloudflareアカウントへの接続、D1データベース作成、Cloud Run設定・デプロイは行っていません。D1の無料プランには読み書き・容量の上限があり、上限到達時はクエリが失敗します。Cloud Runや通信などDB以外の利用料も別途確認してください。[D1料金と無料枠](https://developers.cloudflare.com/d1/platform/pricing/) [Cloudflare APIのD1クエリ](https://developers.cloudflare.com/api/resources/d1/subresources/database/methods/query/)

## 設定手順

1. CloudflareのダッシュボードでD1データベースを作成します。日本から使う場合は、作成画面で選べるならプライマリ配置をAPACにします。無料プランのまま作成してください。
2. Cloudflare APIトークンを作ります。権限は対象アカウントの **D1 Read** と **D1 Write** に絞ります。トークンはブラウザーへ渡さず、Viteの `VITE_` 変数やGitへ置かないでください。
3. Google Cloud Secret Managerにトークンを登録します。アカウントIDとD1データベースIDは秘密ではありませんが、トークンはSecretとして管理してください。
4. Cloud RunサービスへIDとSecretを設定します。次の値は実際のサービス・リージョン・ID・Secret名に置き換えます。

   ```powershell
   gcloud run services update SERVICE `
     --region REGION `
     --update-env-vars CLOUDFLARE_ACCOUNT_ID=ACCOUNT_ID,CLOUDFLARE_D1_DATABASE_ID=DATABASE_ID `
     --update-secrets CLOUDFLARE_API_TOKEN=d1-api-token:latest
   ```

   Cloud Runの実行サービスアカウントには、Secret Managerの該当Secretを読む権限が必要です。

5. `DATABASE_URL` が既に設定されていないことを確認します。このアプリはD1とPostgreSQLの同時指定を拒否して起動エラーにします。PostgreSQLから切り替える場合、既存のCloud SQL接続を無効化・削除する前に利用状況とデータを確認してください。
6. 新しいCloud Runリビジョンをデプロイし、`/ready` がHTTP 200を返すことを確認します。このエンドポイントはD1への問い合わせも確認します。テーブル作成と魚種マスタ登録はアプリ起動時に自動実行します。

## 保存と失敗時の動作

- ローカルは `GIJUTU_DB_PATH`（既定 `data/gijutu-turi.sqlite`）のSQLiteを使います。
- D1モードは `CLOUDFLARE_ACCOUNT_ID`、`CLOUDFLARE_D1_DATABASE_ID`、`CLOUDFLARE_API_TOKEN` がすべて必要です。設定が一部だけの場合、SQLiteへ黙って切り替えず起動エラーにします。
- 釣果イベントとプレイヤー別の回数更新は一つのD1トランザクションバッチで処理します。一意なイベントキーと `changes()` 条件により、同じ捕獲イベントの再送で回数を二重加算しません。
- D1への保存に失敗した釣果は、成功通知より先に永続化されません。D1 APIが使えない場合は保存処理をエラーにし、ローカルSQLiteへ分岐して記録が分裂することを防ぎます。
- Cloud Runの一時SQLiteや手元のSQLiteにある過去データは自動移行されません。D1は初回起動時に魚種カタログを作るため、図鑑の既存履歴が必要なら別途エクスポート・移行が必要です。
- 永続化されるのは魚種カタログと捕獲履歴です。進行中の釣りルーム・WebSocket状態は引き続きCloud Runプロセス内にあり、インスタンス再起動で終了します。

## ローカルでD1を試す場合

ローカル開発は既定でファイルSQLiteを使います。Cloudflareの本番D1へローカル開発から接続する設定は `.env` に追加できますが、共有データを変更するため、通常の開発では推奨しません。Cloud Runの秘密情報と本番データベースは、開発用環境へコピーしないでください。
