# WU-0 probe資産の撤去と引き継ぎ整理(migration対応表)

- 記録日: 2026-09-19
- 対応L3: Phase1_Spec §4 WU-0
- 環境: ローカル(Windows 11、Node.js 24、verify:local)。実site操作なし

## 1. 削除・移設・保持の対応表

| Phase 0資産 | 処置 | 引き継ぎ先 / 理由 |
|---|---|---|
| `src/gallery/probes/original-probe.ts` の `chunkedFetchBinary` | **移設** | `src/gallery/thumbcache/chunked-fetch.ts`(WU-5素材取得。G1c実証コード。interfaceを`BinaryFetcher`最小形に変更) |
| `src/gallery/probes/original-probe.ts` の `downscaleToJpegBlob` | **移設** | `src/gallery/thumbcache/downscale.ts`(WU-5縮小処理。G1b実証コード。maxWidth引数化。形式出し分けはWU-5) |
| `src/gallery/probes/`(probe-dom / thumbnail / original / media / modal / scope / session) | 削除 | probe目的完了(P0-1〜P0-8証跡確定済み)。上記2関数以外に本実装再利用なし |
| `src/gallery/probe-ui.ts`、`src/viewer/viewer-probe.ts` | 削除 | 同上 |
| `src/shared/probe/marks.ts` | **移設** | `src/shared/diagnostics/marks.ts`(Phase 1計測で継続使用。`p1.*` mark) |
| `src/shared/probe/diagnostics-panel.ts`(診断textarea) | 削除 | Phase1_Spec §5.1(UI計測値表示の廃止)。診断は`DiagnosticBuffer`+global error handlerのみ |
| `src/shared/probe/request-inventory.ts` | 削除 | textarea表示専用。E2EのNetworkRecorder(CDP)が代替 |
| `src/gallery/main.ts` / `src/viewer/main.ts` | 置換 | Gallery=WU-1向け最小shell、Viewer=Phase 2まで空shell |
| `src/shared/api/*`(ConfluenceApi、ForgeConfluenceApi、CachingConfluenceApi、RateLimitStateMachine、mock、v2-mapping、context、modal、events) | **保持** | Phase 1本実装で使用(WU-1で再接続)。WU-0時点ではbundle未参照 |
| `src/shared/diagnostics/*`、`src/shared/types/media.ts`、`src/shared/constants.ts` | 保持 | 継続使用 |
| `tests/unit/{probe-ui,thumbnail-probe,original-probe,media-probe,modal-probe,scope-probe,viewer-probe}.test.ts` | 削除 | 対象コード削除に伴う。移設2関数には新規テストを作成 |
| `tests/unit/{chunked-fetch,downscale}.test.ts` | **新規** | chunkedFetchBinary全分岐(結合/200 fallback/Content-Range不明/128MB上限/途中失敗/初回失敗)、downscaleの非throw保証 |
| `tests/e2e/p0-{3,5,6,9}*.spec.ts` | **移動** | `tests/e2e/phase0/`。回帰資産として保持、既定実行から除外(playwright.config `testIgnore`、`PW_PHASE0=1`で明示実行) |
| `tests/e2e/helpers.ts` | 保持 | Phase 1 E2E(`tests/e2e/phase1/`)と共用 |

注: `tests/e2e/phase0/`のspecはprobe UIのボタン操作を前提とするため、**probe UIを含む版(main `67b4bac`以前)のdeploy に対してのみ実行可能**。Phase 1 UIに対する回帰の中身(CSP・セッションポイント等)はWU-7でPhase 1 spec側に再実装して判定する。

## 2. 整理後のsrcツリー

```
src/
├─ gallery/
│  ├─ index.html
│  ├─ main.ts            # WU-0最小shell(WU-1で§6.1実装)
│  └─ thumbcache/        # WU-5生成モジュール隔離先(Phase1_Spec §5.2)
│     ├─ chunked-fetch.ts
│     └─ downscale.ts
├─ viewer/
│  ├─ index.html
│  └─ main.ts            # Phase 2まで空shell
└─ shared/
   ├─ api/               # adapter群(保持)
   ├─ diagnostics/       # diagnostic-buffer / global-error-handler / marks
   ├─ types/media.ts
   ├─ constants.ts
   └─ savings-flags.d.ts
```

## 3. bundle予算計測の開始(§13.2)

計測はverify:local内のvite build出力(gzip表示)を正とする(`package.json`は保護対象のため新規scriptは追加しない。§4裁量の範囲で判断)。WU-0時点の実測:

| bundle | raw | gzip | 予算 |
|---|---|---|---|
| gallery app code(index-*.js) | 1.01 kB | **0.53 kB** | ≦40 kB(gzip) |
| gallery vendor(@forge/bridge) | -(WU-0では未参照) | - | 予算対象外(参考記録) |
| viewer app code | 0.82 kB | 0.44 kB | (Phase 2予算) |

参考: probe時代最終値(main `67b4bac`)= gallery app code gzip 12.74 kB + vendor-bridge 27.99 kB。

## 4. 合否と根拠

**合格**: verify:local GREEN(typecheck / eslint / vitest 8 files 33 tests / build / verify:cost GREEN、負例fixture 33/33)。gzip実測の記録を開始(上表)。

## 5. 上申事項

なし。

## 6. 未実施項目と理由

1. deploy(development)での確認: WU-0はUI実体のない再構成のため、WU-1のshell実装とまとめてdeploy確認する(manifest・resource構成の変更なし)。
