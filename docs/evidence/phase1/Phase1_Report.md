# Phase 1 完了報告(Gallery最小実装)

- 記録日: 2026-09-19
- 対象: Phase1_Spec WU-0〜WU-8
- main: 0100a55(WU-7 merge時点)

## 1. 結論

Phase 1のDoD(Phase1_Spec §8)は、**ユーザー確認2点を残して達成**。

1. WU-0〜WU-7の提出物: 完了(WU-0_migration、WU-1〜WU-6 result、perf/result)
2. §16 Phase 1の4項目+thumbキャッシュ生成: 実装・実測済み。§13.2予算・§13.3該当条項は全合格
3. ハーネスGREEN(全commit、fixture 33/33)。Phase 1後snapshotはGREEN(暫定)— **残: 本日12:00 UTC更新後のユーザーUsage確認**(P0-7最終確認と同一の目視で兼用可)
4. 回帰E2E: Phase 1一式12件(Chrome/Edge)合格。P0回帰は同等不変条件で代替(上申P1-E-06)
5. **残: ユーザーのPhase 2着手承認**

**Phase 2(Fullscreen Viewer)着手推奨 = 可**。Gallery側のセッション正本・タイル操作(現在no-op)・marks基盤・E2Eハーネスは、Viewer接続を前提に整備済み。

## 2. 主要実測(詳細は perf/result.md)

| 指標 | 実測 | 予算 |
|---|---|---|
| Gallery app code / CSS(gzip) | 10.09 KB / 0.83 KB | 40 KB / 10 KB |
| First Usable(Cold中央値) | 457〜554 ms(全条件で件数非依存) | - |
| 200件 long task 50ms超 / CLS | 0件 / 0.0000 | 0件 / 比率枠 |
| click handler同期(P95) | 0.30 ms(Chrome)/ 0.40 ms(Edge) | <8 ms |
| media転送(初期表示) | thumbで **−89.7%**(50件: 1.98MB→204KB)/ **−84.1%**(200件: 1.33MB→211KB) | - |
| 標準セッションREST | 6要求(50件・thumbあり)/ 15要求(200件・thumbあり) | Phase 0比で大幅軽量 |

## 3. thumbキャッシュ(CSR-2026-004の実装完了)

- 生成実績: MG_00_Smoke 51、MG-05 100、MG-06 400ファイル+config。**429・レート逼迫・ユーザーコンテンツ変更いずれも0**(命名ガード必須経由+E2E前後比較で検証)
- 生成はidle逐次でCLS/long taskに影響なし。中断再開の冪等性を実機確認(PUT create-or-update)
- 手動操作(クリア/このページで無効化)はwriterのみ表示

## 4. 実測による設計確定・発見

1. v2 attachment idは`att<数字>`形式 → 命名規則`mg_thumbcache_<attId>_v<n>_w<w>`のid部を英数字に確定
2. writer判定は`GET /wiki/api/v2/attachments/{id}/operations`(v1 content GET+expand=operationsはappスコープで401)
3. 署名URL(api.media)は訪問毎に変わり302は非キャッシュ → 原寸はWarmでも全量再転送。thumbキャッシュの価値の根拠
4. 一覧paginationは添付総数に比例(thumb含め601件→13ページ≈4.1s)→ **Phase 3改善候補**(limit調整・並行取得)
5. OOPIF: 親frameへのマウス移動がiframeに届かず:hoverが残留(自動化特有)→ Phase 3のpointerleave設計の参考
6. requestConfluenceは親frame発行(bridge)→ E2Eの要求計上はendpoint署名で行う

## 5. テストデータ(追加)

- MG-06-Perf-200(pageId 622935、200画像 10.7MB+thumb 400+config)
- MG-10-Empty(pageId 721197、空状態確認用)
- 容量: 追加分約15MB(2GB上限に対し余裕。ユーザーの事後確認は任意)

## 6. 上申キュー(§5形式)

| ID | 発生WU | 事象 | 選択肢 | 推奨 | 影響範囲 |
|---|---|---|---|---|---|
| P1-E-05 | WU-7 | CDP throttlingがOOPIF macro iframeへ届かず、ガイド§8のネットワークプロファイル(100Mbps/50ms)を適用できない。LAN実測(スロットリングなし)+Cold=新規contextで計測した | a) 本計測定義(LAN実測)を§8の代替として承認 b) 手動DevTools throttlingで別途1回補正 | **a**(相対比較〈thumb有無・件数〉は有効。絶対値はLAN条件と明記済み) | WU-7証跡の有効性。以降のPhaseも同定義を使用 |
| P1-E-06 | WU-7 | P0系E2Eはprobe UI前提のためPhase 1 buildで実行不能。P0-1/2/5/6は同等不変条件(正規形URL全件検査・許可host限定・セッションポイント再計測)で代替、P0-4はPhase 2で回帰 | a) 読み替えを承認(L3の「P0系E2Eの回帰実行」を同等不変条件と読む) b) probe UIを別resourceで併存維持 | **a**(bはbundle・保守コスト増) | WU-7証跡の有効性 |
| P1-E-07 | WU-8 | cost-surface-register.md(保護対象)のCS-DEV-SPACE行「最終確認日」をPhase 1後確認で更新したい | a) Usage確認後にClaude Codeが日付更新(内容は最終確認日と参照snapshot追記のみ) b) ユーザーが直接編集 | **a** | register鮮度(31日) |

## 7. ユーザーへの依頼(残件)

1. **本日21:00 JST(12:00 UTC)以降にDeveloper Console/BillingのUsageを一言確認**(全メトリクス0・USD 0.00・支払方法未登録)。この1回でP0-7の無条件確定とPhase 1 snapshotの確定を兼ねる
2. 上申P1-E-05/P1-E-06/P1-E-07の裁定
3. Phase 2(Fullscreen Viewer)着手の承認 → 承認後、Phase 2のL3仕様書を起草(§6手順)
4. (任意)体感確認: MG-05/MG-06のグリッド表示・hoverタイトル・writer用手動操作ボタン
