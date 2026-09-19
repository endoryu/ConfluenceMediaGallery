# WU-5 result(thumbキャッシュ生成・書き戻し・GC)

- 計測日: 2026-09-19
- 環境: deploy済みdevelopment(ryu-dev.atlassian.net)、Windows 11、E2E半自動
- ブラウザ: Chrome/Edge(channel)。DPR=1、スロットリングなし
- 対象ページ: MG_00_Smoke(画像28件)

## 確認事項と結果

| 確認事項(Phase1_Spec WU-5合格条件) | 結果 | 根拠 |
|---|---|---|
| 生成された`mg_thumbcache_*`が次回ロードでタイルに使われる | **成立** | E2E: 2回目ロードで**28/28タイルがthumb使用**(data-fallback=0)。2回目転送 **389,504 bytes**(原寸fallback時は同ページで数MB級) |
| 生成の実測 | **成立** | 28画像→51ファイル生成(w320+w640、小画像はw320のみ)+config。約84秒(idle逐次)、4xx/レート逼迫なし |
| GCが旧版を削除する | **成立(単体)** | stale(旧版・対象喪失)のみ削除、有効thumbは温存。E2Eでの版更新シナリオは未実施(下記) |
| 閲覧専用相当で原寸fallbackのまま成立 | **成立** | not-writer経路(単体)+disabled config経路(単体)。実siteの非writer検証はPhase 5積み残し(複数ユーザー不可) |
| ユーザーコンテンツへの書込み0 | **成立** | E2E: 生成前後の添付一覧比較 — 追加は命名規則内のみ、既存添付のid/version不変。書込みは命名ガード(`assertThumbcacheWriteTarget`)必須経由 |
| BroadcastChannel claim協調 | **成立(単体)** | 小token勝ち・active譲り・単独動作。実機は単一instanceのみ確認 |
| 中断再開の冪等性 | **成立(実機)** | 生成中断(ブラウザ終了)後の再訪で残分のみ生成(PUT create-or-update)。実測: 中断時3件→再開で48件追加、重複なし |
| 手動操作(クリア/無効化、writerのみ) | **成立** | E2E: .mg-adminボタン2個表示(writer)。動作は単体テスト |
| 表示をブロックしない(性能憲法下位) | **成立** | idle逐次(同時1件)。生成中もCLS=0・タイル表示先行(p1-3/p1-4合格維持) |

計測raw: `local/e2e-results/p1-5-thumbcache-*.json`(Chrome/Edge)

## 実装上の発見(実測による設計修正)

1. **v2 attachment idは`att66087`形式** — 命名規則のid部を英数字に拡張(`mg_thumbcache_<attXXXX>_v<n>_w<w>`)。L2 §5.2の値例`123456`は例示であり形式定義とは矛盾しない
2. **v1 content GET+expand=operationsはappスコープで401** — writer判定は`GET /wiki/api/v2/attachments/{id}/operations`(read:attachment系で成立)へ変更
3. attachmentId昇順の比較は`att`prefix+数値部の数値順に対応

## 合否

**合格**。verify:local GREEN(84 tests、fixture 33/33)。gallery gzip 9.99 kB / CSS 0.79 kB(予算40/10 kB)。

## 上申事項

なし(生成起因の429・レート逼迫は観測されず — P1-E-02該当なし)。

## 未実施項目と理由

1. 版更新→GCの実機E2E: テストfixtureの版を汚さないため単体テストで代替。MG-02等で版更新が自然発生した際に確認する
2. 非writerユーザーの実機確認: developer siteにユーザー追加不可(Phase 5積み残し、既裁定)
3. 生成前後のセッションポイント・転送量の系統比較: WU-7で50件ページ(MG-05)にて実施
