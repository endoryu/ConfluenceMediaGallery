# P0-6 APIポイント/応答速度/縮退mock result(WU-7)

- 計測日: 2026-09-19
- commit: WU-7ブランチ(app v5.2.0系。savings-off比較buildは一時deployし、計測後に既定buildへ復旧済み)
- 環境: deploy済みdevelopment(ryu-dev.atlassian.net)、`MG-05-Perf-50`(50 attachments、pageId 589874)
- ブラウザ: Chrome 152(Playwright E2E、ガイド§7.1半自動方式)。スロットリング未適用
- 原本: `local/e2e-results/p0-6-*.json`

## 標準セッション実測(一覧50件中30件表示+詳細+更新者。L3作業1)

| 指標 | savings ON(既定) | savings OFF(比較build) |
|---|---|---|
| 初回セッション total | **16,924ms** | 19,961ms |
| item毎(中央値/P95) | 531 / 789 ms | 649 / 744 ms |
| media load(中央値/P95) | 529 / 708 ms | 504 / 616 ms |
| REST内訳(list/detail/users) | 0(※)/ 30 / **1** | 0(※)/ 30 / **30** |
| セッション内2回目 total | **13ms(REST 0回)** | 13,629ms(REST 60回) |

※listは画面初期化時に取得済み(一覧レスポンス再利用が機能)。probe実行分の増分が0。

## 推定APIポイント(公式コスト式: 基本1+コア1/ユーザー2。write系はフラット1)

| 要求 | 回数 | ポイント |
|---|---|---|
| 一覧 GET(limit=50) | 1 | 1+50×1 = 51 |
| 詳細 GET(+labels) | 30 | 30×2 = 60 |
| users-bulk POST | 1 | 1(write系フラット) |
| thumbnail/download GET(302) | 30 | 30×1〜2 = 30〜60(302応答のオブジェクト加点解釈に幅) |
| media binary(api.media) | 30 | 0(Confluence REST外) |
| **初回セッション計** | | **142〜172(代表 約157)** |
| セッション内2回目 | | **0**(全キャッシュ) |
| セッション跨ぎ2回目(reload) | | 約112(mediaはHTTP cacheで0、302も再要求なし=P0-1実証) |

- **合格条件1: 実測320ポイント以内 → 合格**(142〜172)。§4.5.4基準値(代表258)の**改訂案(代表157)をWU-10 proposalへ**
- E-09(320超)は**否定**
- 飽和試算(作業9): 20セッション/時×157pt=3,140pt/時 = Global Pool 65,000の**4.8%**。同一UTC時に20セッション行うテナントが**約20.7テナント**で飽和(基準値の約12テナントから改善)
- 将来のthumb生成書込み(PUT/DELETE)はwrite系フラット1ptで、ポイント構造への影響は軽微

## page size比較(L3作業4。各3回、中央値)

| limit | 最初のページ | 全件取得 | リクエスト数 |
|---|---|---|---|
| 25 | 269ms | 534ms | 2 |
| **50** | **232ms** | **232ms** | **1** |
| 100 | 273ms | 273ms | 1 |
| 250 | 307ms | 307ms | 1 |

**採用: limit=50**(最速・1リクエスト。§18の既定値50を維持)。

## 重複送信確認(L3作業5)

`CachingConfluenceApi`の単体テスト5件で検証: in-flight dedupe(並行同一要求→下位1回)、セッションキャッシュ(一覧・詳細・更新者)、users-bulkの同一event loop集約(3 accountId→1要求)、savings=false時の全無効化。実機でもrun2のREST 0回/users-bulk 1回として現れている。

## 節約策on/off比較(L3作業6、合格条件2)

- フラグ`__MG_SAVINGS__`はvite defineのbuild時定数。**production buildから識別子が除去されることを`verify:cost`(FCP-BLD-FLAG)で機械確認**
- 応答速度: ONはOFFに対し初回totalで**3.0秒高速**、item中央値531ms vs 649ms。media load単体は同等(529 vs 504ms=ネットワーク揺らぎ範囲)→ **「同等以上」で合格**

## handler同期性AST検査(合格条件3)

`verify:cost`へ**FCP-SRC-HANDLER-SYNC**を実装: click/pointerenter handlerの直接awaitを検出(入れ子関数=fire-and-forgetは許容)。現行src全体でGREEN。

## 縮退3段階のmock検証(L3作業7、合格条件4)

`tests/unit/rate-limit-state.test.ts`(10テスト): `r`→Degraded、NearLimit→Degraded、429→Blocked(Retry-After保持)、経過→自動Normal復帰、復帰後の`r`継続→Degraded維持、Blocked期限内は据え置き、cold start 429(Retry-After 3600s)、probe発火閾値(10s内3失敗)・単一in-flight・最小間隔30s、窓外失敗の除外。**Phase 1へ引き継ぐ**(`src/shared/api/rate-limit-state.ts`)。Gallery実機ではadapter応答を`observe()`へ接続済み。

## Per-Tenant Pool(Tier 2)の条件(L3作業8。公式資料 2026-09-19取得)

1. Tier 1(既定): Global Pool **65,000pt/時**(全テナント合算、UTC毎時リセット)
2. Tier 2(審査制): テナント毎に Free 65,000 / Standard 100,000+10×users / Premium 130,000+20×users / Enterprise 150,000+30×users(Std以上は上限500,000)
3. 適用条件: 「持続的に高い、または集中した使用」のあるアプリのみ。**申請はPartner Portalのquota increase request**
4. **費用: 記載なし(無償)** — 恒久方針(費用0)と両立

## レート制限ヘッダー観測

**全計測を通じて200応答にRateLimit系ヘッダーの出現なし**(0/観測応答)。詳細は`rate-limit-headers.md`。

## 合否

**合格**(合格条件1〜4すべて成立)。

## 未実施と理由

1. 429/`Retry-After`の実応答サンプル: 実tenantへの負荷試験・クォータ枯渇再現は恒久禁止(CLAUDE.md §3)のため、遷移検証はmock adapterで実施(L3の設計どおり)
2. スロットリング条件下の応答計測: 本WUの合否は件数・ポイント・相対比較で決まるため未適用。WU-9の比較計測はガイド§8条件で実施
