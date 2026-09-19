# WU-5 result(Viewer計測・回帰E2E)

- 計測日: 2026-09-20
- 環境: deploy済みdevelopment(ryu-dev.atlassian.net)、Windows 11、E2E半自動(p2-5-perf.spec.ts、MG_PERF=1)
- ブラウザ: Chrome(主計測)/ Edge(代表)。DPR=1
- ネットワーク: LAN実測・スロットリングなし+Cold=新規browser context(P1-E-05裁定の計測定義)
- 対象: MG_00_Smoke(28画像、thumb生成済み)。Cold/Warm各5回(Edgeは各2回)、中央値/P95
- raw: `local/e2e-results/p2-5-launch-*.json`、`p2-5-session-*.json`

## 1. Viewer起動計測(Chrome、中央値/P95 ms)

| 指標 | Cold | Warm | P0-4 baseline(probe期) |
|---|---|---|---|
| click→viewer DCL | **52** / 2065 | **25** / 233 | Warm 23 / Cold 76〜 |
| click→first-paint | **100** / 2072 | **73** / 121 | Warm 59 |
| DCL→画像URL設定 | 7.1 / 9.4 | 6.7 / 9.0 | -(§13.3「起動後の最初の処理」) |
| DCL→前段(thumb)表示 | 301 / 465 | 268 / 405 | - |
| DCL→Original swap完了 | 350 / 521 | 394 / 519 | - |

- Cold P95の2065msは新規contextの初回CDN edge取得1回分(中央値52msに対する外れ値として記録)
- Edge(smoke、各2回): cold dcl 52 / warm dcl 28 / warm swap 339 — Chromeと同水準
- **P0-4対比: 同水準を維持**(warm dcl 25 vs 23ms。snapshot parse+本実装化での劣化なし)
- §13.3「起動後の最初の処理は画像URL設定」: mark順序をE2Eでassert(url-set ≤ first-paint、全ロード)

## 2. snapshotサイズ(P2-E-03)

| ページ | items | JSONサイズ |
|---|---|---|
| MG_00_Smoke | 28 | 5,416 bytes |
| MG-06-Perf-200 | 200 | **32,918 bytes** |

500件推定 ≈ 82KB。Modal contextとして問題なし(P2-E-03は上申不要と判定)。

## 3. 標準セッション(Viewer 28件連続ナビ、Chrome 1回)

| 指標 | 実測 | 対比 |
|---|---|---|
| RESTリクエスト(app起因) | **3要求**(一覧2+operations 1) | Phase 0基準 §4.5.4=157pt/セッション → **約2%** |
| viewer media要求 | 86(28件×〈thumb+Original〉+redirect) | media(native img)はREST点数外 |
| viewer media転送 | 5,518,779 bytes(原寸28枚含む) | Viewerは確定表示にOriginalを使うため設計どおり |

Phase 2のViewerは詳細・更新者APIを呼ばない(Phase 4で詳細パネルと共に追加)ため、セッションポイントはGallery初期化分のみ。

## 4. §13.2予算・§13.3該当条項

| 項目 | 目標 | 実測 | 判定 |
|---|---|---|---|
| Viewer app code | gzip ≦55KB | **3.35KB**(vendor-bridge除く) | **合格** |
| Viewer CSS | gzip ≦12KB | **0.66KB** | **合格** |
| click handler同期(snapshot生成+Modal.open込み) | <8ms | click→open呼び出しはp1-7方式で0.3〜0.4ms水準(WU-1) | **合格** |
| 起動後最初の処理=画像URL設定 | §13.3 | DCL→7msでsrc設定、first-paint前(全ロードassert) | **合格** |
| 画像差し替え時は常に前段表示 | §13.3 | swapはsrc差し替えのみ(E2E p2-2で表示継続確認) | **合格** |
| decode済み画像への逆移動=次frame表示 | §13.3(読み替え: 表示履歴) | p2-3で即時復帰確認(定量は隣接preload導入のPhase 3で本計測) | **合格** |

## 5. 回帰

- Phase 1(p1-1〜p1-6)+Phase 2(p2-1〜p2-3): **Chrome/Edge 18件全合格**
- P0-4相当(起動計測・close・focus復帰・Gallery独立性)はp2-1/p2-5が本実装で再現

## 6. 合否

**合格**(予算内・§13.3成立・回帰GREEN)。

## 7. 未実施項目と理由

1. ネットワークプロファイル(100Mbps/50ms)適用: OOPIF制約(P1-E-05裁定の計測定義を継承)
2. ナビゲーション速度の系統計測(連打・遠距離移動): 隣接preload(Phase 3)導入時に基準値ごと計測
