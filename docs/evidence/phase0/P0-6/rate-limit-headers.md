# P0-6 レート制限ヘッダー観測記録(WU-7)

- 観測期間: 2026-09-18〜19(WU-1〜WU-7の全requestConfluence応答)
- 観測方法: adapterが全応答から次のヘッダーを抽出し診断バッファへ記録
  `ratelimit-limit` / `ratelimit-remaining` / `ratelimit-reset` / `x-ratelimit-limit` / `x-ratelimit-remaining` / `x-ratelimit-reset` / `retry-after` / `r`

## 結果

**全期間・全応答(一覧/詳細/users-bulk/302/upload/delete、いずれも2xx/3xx)で上記ヘッダーの出現は0件。**

- 例: `p0-6-headers-savings-on-*.json` → `withHeaders: 0/1`
- 解釈: 通常時(残量に余裕がある間)はヘッダーが付与されず、V1仕様書§11.1の「`r`出現=Degraded」は**残量逼迫時にのみ現れるシグナル**として設計どおり扱える
- 429の実サンプルは取得しない(クォータ枯渇再現は恒久禁止)。遷移はmock検証(`rate-limit-state.test.ts`)で担保

## 公式仕様上のヘッダー(2026-09-19、developer.atlassian.com/cloud/confluence/rate-limiting/)

- `X-RateLimit-Limit` / `X-RateLimit-Remaining` / `X-RateLimit-Reset` / `X-RateLimit-NearLimit` / `RateLimit-Reason` / `Retry-After`
- beta(ポイント系): `Beta-RateLimit-Policy` / `Beta-RateLimit`
- クォータはUTC毎時の頭でリセット

adapterの抽出対象にbeta 2種を追加する改訂はPhase 1で行う(観測0のため実害なし)。
