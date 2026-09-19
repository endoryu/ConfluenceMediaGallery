# Phase 0 報告書(性能PoC)

- 作成日: 2026-09-19
- 対象: Phase0_Spec(L3)WU-0〜WU-10、V1仕様書 §14 P0-1〜P0-8
- 環境: deploy済みdevelopment(ryu-dev.atlassian.net)、Chrome 152 / Edge 153
- 計測方式: WU-4以降はガイド§7.1の半自動E2E(ユーザーheaded login+Playwright自動probe)を主経路とした

## 1. P0ゲート判定サマリ

| ゲート | 判定 | 根拠証跡 |
|---|---|---|
| P0-1 Thumbnail直接表示 | **合格** | `docs/evidence/phase0/P0-1/result.md` |
| P0-2 Original直接表示 | **合格** | `docs/evidence/phase0/P0-2/result.md` |
| P0-3 動画・音声Range/seek | **合格** | `docs/evidence/phase0/P0-3/result.md` |
| P0-4 Fullscreen Modal | **合格** | `docs/evidence/phase0/P0-4/result.md` |
| P0-5 CSP/egress/RoA適格 | **合格** | `docs/evidence/phase0/P0-5/result.md` |
| P0-6 APIポイント/縮退 | **合格** | `docs/evidence/phase0/P0-6/result.md`、`rate-limit-headers.md` |
| P0-7 課金防止ハーネス | **静的ゲート合格・baseline GREEN。Phase 0後snapshot(WU-8b)はユーザー確認待ち** | `test-results/cost-guard/*.json`、`docs/operations/usage-snapshots/2026-09-18-baseline.json` |
| P0-8 thumbキャッシュ書き戻し | **合格**(G1b/G1c+G2) | P0-2/P0-5 result.md |

重要な実測帰結: **縮小サムネイル配信は本アプリから到達不能**(thumbnail endpoint=/binary原寸、legacy=原寸、media /image=署名不可)→ ユーザー裁定によりwriter化(thumbキャッシュ書き戻し)へ設計変更(CSR-2026-004)。生成はG1b(bridge blob)+G1c(Range分割4MB×N)で**全サイズ実装可能**。

## 2. 除外経路(V1から外す・使わないことが確定した経路)

| 経路 | 判定根拠 |
|---|---|
| v2 thumbnail endpointの`width`/`height`による縮小 | redirect先が`/file/{id}/binary`(原本配信)でパラメータ無効(P0-1) |
| legacy `/wiki/download/thumbnails/` のサーバー側rendition | 8Kでも原寸配信。`?width=`無効(P0-1追補) |
| media `/file/{id}/image`(縮小endpoint)の直接利用 | 署名tokenを自前生成できない(P0-2) |
| `crossorigin`+canvasによるpixel読み出し(G1) | CORSヘッダー不在でロード不能、tainted(P0-2) |
| legacy `/wiki/download/attachments/` のbridge取得 | 401(P0-2) |
| 一覧`_links`のdownloadLink直接使用 | /wikiベース相対+付加queryがcache分割。正本はv1正規形(E-04) |
| v1 POST(新規)による同名thumb更新 | 同名400。PUT create-or-updateを使用(P0-8) |
| Preview bucket(1280〜3840) | 中間解像度の配信手段が存在しない(改訂proposal A-6) |

## 3. 上申事項と裁定の記録

| ID | 事象 | 裁定 |
|---|---|---|
| ESC-WU0-01〜05 | CI plan裁定/CODEOWNERS/repo作成/CI secrets/register前倒し | すべて解決(CSR-2026-001/002、register実施) |
| INCIDENT-001 | 個人siteのPremiumトライアル検出→即時停止 | Forge操作起因ではないと確認、ユーザーがFree復帰(CSR-2026-003) |
| E-02(302非cache) | — | **否定**(chain全体がcache供給) |
| ESC-WU2-01 | 縮小サムネイル経路の不存在 | **writer化を裁定**(CSR-2026-004、proposals/2026-09-18_writer-thumbnail-cache.md) |
| E-04(downloadLink) | v1正規形へ一元化 | 反映済み+batch proposal A-2 |
| E-05(Range不成立) | — | **否定**(206完全対応) |
| E-06(Forgeヘッダー) | ヘッダー表示あり | Forgeヘッダー正で確定(batch proposal A-4) |
| E-07(events不到達) | — | **否定**(往復1〜4ms) |
| E-08(egress必要) | — | **否定**(宣言ゼロで全種別ロード) |
| E-09(320pt超) | — | **否定**(実測142〜172pt。基準値改訂 batch A-5) |
| E-10/E-11(Usage正値/支払方法) | — | 未発生(baseline GREEN。WU-8bで最終確認) |
| E-12(CI無料枠不成立) | — | 未発生(public無料枠で全check稼働) |
| 積み残し | 第2ユーザーによる権限なし側確認(ユーザー追加不可) | Phase 0除外、**Phase 5課題**(ユーザー裁定 2026-09-19) |
| 積み残し | ryu-dev siteの2026/10/18更新バナーの再確認 | 月次確認に組込(register CS-DEV-SITE) |

## 4. V1仕様書・ガイド改訂案

- 反映済み: writer化一式(2026-09-18_writer-thumbnail-cache.md)、G1b/URL正規化(2026-09-19_g1b-and-url-normalization.md)
- **承認待ちbatch**: `docs/proposals/2026-09-19_phase0-revisions.md`(scope 5種、PUT/v2 delete、冪等機構、§7.2ヘッダー正、§4.5.4基準値157pt、Preview bucket廃止、L3の除外注記)

## 5. WU-9 標準Viewer比較baseline

計測条件: 標準側=Chrome+CDP throttling 100Mbps/50ms・cache制御、Cold/Warm各5回。probe側=Warm5回(macro iframeはOOPIFのためCDP throttling/cache制御が届かない制約あり。数値は無throttle参考)。

| 画像 | 標準 Cold(med/P95) | 標準 Warm | 標準の表示上限 | probe paint(med) | probe 原寸表示(med) |
|---|---|---|---|---|---|
| 1080p | 449/478ms | 53/93ms | 1920 | 34ms | 610ms |
| 4K | 482/510ms | 54/102ms | 3840 | 34ms | 657ms |
| 8K | 502/512ms | 56/107ms | **4096(rendition上限)** | 34ms | 611ms(**原寸7680表示**) |

主要知見: 標準viewerは8Kを4096px renditionに縮退。probe Viewerは原寸表示可能(品質優位・転送負担はwriter thumbキャッシュ設計で緩和)。詳細・条件差・制約は `docs/evidence/phase0/baseline/standard-viewer.md`。

体感評価: (ユーザー記入欄 — 未記入)

## 6. Phase 1へ引き継ぐコード / Phase 0で役目を終えるコード

**引き継ぐ**(そのままPhase 1 scaffoldの土台):

1. `src/shared/api/` 一式: `ConfluenceApi` interface、`ForgeConfluenceApi`(+Range/binary/write)、`CachingConfluenceApi`(節約策)、`RateLimitStateMachine`、mock adapter、bridge wrappers(Modal/events/view)
2. `src/shared/types/`、`src/shared/constants.ts`(§18対応)、`src/shared/diagnostics/`
3. 課金防止ハーネス一式(policy、guard、負例33、CI)
4. E2Eハーネス(`tests/e2e/helpers.ts`、login/setupスクリプト群)
5. 単体テスト(rate-limit 10、caching 5、他)

**役目を終える**: `src/gallery/probes/*`、`src/gallery/probe-ui.ts`、`src/viewer/viewer-probe.ts`(probe UI全体)。Phase 1のGallery/Viewer本実装で置換する。

## 7. Phase 1着手の推奨

**推奨: 可**。条件は次の2点の完了のみ:

1. **WU-8b**: 次回12:00 UTC更新後のUsage確認(ユーザー)→ 全メトリクス0・USD 0.00・支払方法未登録 → snapshot記録(`GREEN`)
2. batch proposal(§4)の承認と反映

Phase 1の設計前提は本報告の§1〜2で確定した実測事実(原寸配信、writer thumbキャッシュ、Range分割、scope 5種、点数157pt級、page size 50)に基づくこと。
