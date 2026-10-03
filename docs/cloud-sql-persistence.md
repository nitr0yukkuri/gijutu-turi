# Cloud Runの図鑑DBを永続化する

ローカルは既定でSQLite、`DATABASE_URL` を設定した環境ではPostgreSQLを使います。Cloud Runの `/tmp` SQLiteはインスタンス終了で消えるため、Cloud SQL for PostgreSQL等のPostgreSQLを接続したときに図鑑記録が再起動後も残ります。

この変更で接続コードは追加しましたが、Cloud SQLインスタンスの作成・Cloud Runへの接続設定はまだ行っていません。新規インスタンスには継続料金が発生します。Cloud SQLはインスタンス稼働時間と確保したストレージ等が課金対象なので、作成前にリージョンと料金を確認してください。[Cloud SQL料金](https://cloud.google.com/sql/pricing) [料金FAQ](https://docs.cloud.google.com/sql/docs/postgres/faq)

## 既存のCloud SQLを接続する

1. PostgreSQLインスタンスとCloud Runを同じリージョンにします。Cloud Runのサービスアカウントには `roles/cloudsql.client`、接続文字列を読む権限には `roles/secretmanager.secretAccessor` が必要です。[Cloud RunからCloud SQLへ接続](https://docs.cloud.google.com/sql/docs/postgres/connect-run) [Cloud RunのSecret設定](https://docs.cloud.google.com/run/docs/configuring/services/secrets)
2. Cloud Runサービスにインスタンス接続名 `PROJECT:REGION:INSTANCE` を追加します。コンソールのCloud SQL connections、または次のコマンドを使います。

   ```powershell
   gcloud run services update gijutu-turi `
     --region asia-northeast1 `
     --add-cloudsql-instances PROJECT:REGION:INSTANCE
   ```

3. Secret ManagerにPostgreSQL接続URLを登録し、Cloud Runの `DATABASE_URL` として参照します。Unix socketを使う接続URLの形は次のとおりです。ユーザー名・パスワード・DB名を実値にし、パスワードにURL予約文字がある場合はURLエンコードしてください。

   ```text
   postgresql://DB_USER:URL_ENCODED_PASSWORD@/DB_NAME?host=/cloudsql/PROJECT:REGION:INSTANCE
   ```

   Secretを `gijutu-db-url` として作成済みなら、特定のバージョンを指定してCloud Runへ関連付けます。

   ```powershell
   gcloud run services update gijutu-turi `
     --region asia-northeast1 `
     --update-secrets DATABASE_URL=gijutu-db-url:VERSION
   ```

   Secretの値そのものを `.env`、シェル履歴、Gitへ書かないでください。Cloud RunはSecret Managerの値を環境変数として起動時に読みます。[Secretの環境変数利用](https://docs.cloud.google.com/run/docs/configuring/services/secrets)

4. Cloud Runに新しいリビジョンをデプロイし、起動ログにDB接続エラーがないことを確認します。アプリ起動時にテーブル作成と魚種マスタのupsertを行います。捕獲後に図鑑を再読込し、さらにCloud Runのインスタンス再起動後も回数が残ることを確認します。

## データと注意点

- `DATABASE_URL` がなければ既存どおりSQLiteを使います。ローカル開発にCloud SQL接続は不要です。
- PostgreSQLへ切り替えると新しいDBから始まります。Cloud Runの一時SQLiteやローカルSQLiteの既存データは自動コピーしません。残したい捕獲履歴がある場合は切替前に個別移行が必要です。
- 永続化されるのは魚種カタログ、図鑑の捕獲数、捕獲イベントです。進行中の釣りルームやWebSocket状態は引き続きプロセスメモリ上にあり、再起動で終了します。
- Cloud SQLインスタンス作成・請求設定・接続権限の変更は、このガイド作成では実行していません。
