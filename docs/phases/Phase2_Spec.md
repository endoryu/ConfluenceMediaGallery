# Confluence Media Gallery Phase 2 仕様書(Viewer最小実装)

| 項目 | 内容 |
|---|---|
| 層 | L3(フェーズ仕様) |
| 上位文書 | V1仕様書、開発・テスト環境ガイド |
| 対象 | V1仕様書 §16 Phase 2(separate Viewer entry、fullscreen Modal、画像表示、close・前後移動・キーボード・focus復帰、縮退の待機表示§11.1.3) |
| 実装 | Claude Code |
| 裁定・承認 | ユーザー |
| 承認 | ユーザー(2026-09-20。元proposal: `docs/proposals/2026-09-20_phase2-spec-draft.md`) |

## 0. 位置づけと読み替え

Phase 1のGallery(セッション正本・タイル操作no-op・thumbキャッシュ)にFullscreen Viewerを接続する。Preview段はPhase 0裁定で廃止済みのため、§16の「image Thumbnail/Preview表示」は**§7.4の2段(thumbキャッシュw640→Original)**と読む。§9の優先度表のPreview行も同様(優先度1=Viewer Current thumb、3=Current Original)。

前提となるPhase 0/1の確定事実:
1. Modal起動はP0-4で実証済み(`openViewerModal`: fullscreen、closeOnEscape:false、onClose、実表示領域1920×841@1080p)
2. Viewer表示シーケンスは Shell→ThumbCache→Original(+原寸fallback)(§7.4)
3. 隣接先読み・priority queue・LRUはPhase 3、詳細パネル・動画音声ViewerはPhase 4

## 1. 前提

1. Phase 1完了(クローズ済み、2026-09-20)
2. scope 5種・manifest・policyは変更しない(必要時は上申)
3. テストデータ: 既存(MG_00_Smoke/MG-02/MG-03/MG-05/MG-06/MG-08〜10)で足りる。新規作成なし
4. 運用継続: 自己merge・自律実行・E2E半自動・計測定義(LAN実測+Cold=新規context — P1-E-05裁定)

## 2. 範囲

含む: Viewer entry本実装(shell/レイアウト)、起動経路(snapshot→Modal.open)、画像2段表示、ナビゲーション(close/前後/キーボード/focus復帰)、縮退待機表示(§11.1.3)、E2E・計測・回帰。

含まない: 隣接preload・hover preload・priority queue・LRU/soft limit(P3)、詳細パネル・`≡`ボタン・動画音声Viewer・Bridge events同期・診断コピーUI(P4)。**動画・音声タイルのclickはPhase 2でもno-op(診断記録)のまま**とし、Phase 4で接続する。

## 3. 作業単位(WU)と依存関係

| WU | 内容 | 対応L2 |
|---|---|---|
| WU-0 | Viewer shell・レイアウト(暗色背景、contain領域、前後ボタン44px、CSS token) | §7.2、§13.2 |
| WU-1 | 起動経路: tile click→compact snapshot→同一taskでModal.open、onCloseでfocus復帰 | §7.1、§13.3、§13.4 |
| WU-2 | 画像2段表示(thumb w640即設定→Original preload+decode→次frameで一度だけswap)+失敗系 | §7.4、§11 |
| WU-3 | ナビゲーション(前後ボタン/Arrow/Esc自前handler/端無効化/fit戻し) | §7.3 |
| WU-4 | 縮退状態のViewer共有と待機表示(§11.1.3の実値出し分け、非モーダル) | §11.1 |
| WU-5 | E2E・計測・回帰(起動計測、§13.3該当条項、a11y、Phase 1回帰) | §13.3、§13.4、ガイド§8 |
| WU-6 | Phase 2後Usage snapshot・register確認・Phase 2報告 | §4.7.3 |

依存: WU-0→WU-1→WU-2→WU-3→WU-4、WU-5はWU-3以降随時(確定はWU-4後)、WU-6は最後。

### 停止条件

1. 課金メトリクス正値・費用正値・支払方法登録の検出(即時停止)
2. Modal起動が成立しない構成変化(resource/manifest変更が必要になった場合は上申・停止)
3. §13.2予算(Viewer gzip 55KB/CSS 12KB)の25%超過で解決策が範囲内にない場合

## 4. WU詳細

### WU-0 Viewer shell・レイアウト

**作業**(§7.2): viewer entryの本実装骨格。暗色背景、メディア中央`contain`領域、前へ/次へボタン(左右端中央、hit area≧44×44)、コントロールはメディア縁に重ねる。閉じるボタンは配置しない(Forgeヘッダーが正)。`≡`はPhase 4まで配置しない。plain CSS 1ファイル(viewer.css、design token)。p2.viewer.* marks基盤。

**合格条件**: verify:local GREEN、viewer bundle gzip実測の記録開始(予算55KB/12KB)。
**提出物**: 実装+単体テスト、`docs/evidence/phase2/WU-0_result.md`。

### WU-1 起動経路とfocus復帰

**作業**:
1. compact snapshot(§7.1): `pageId`/`attachmentId`/`version`/`title`/`kind`/thumb参照(cache添付id・版・width)/Original参照+選択index+確定順のitem列(セッション正本から再現可能な最小JSON)
2. Gallery側: image kindタイルのclick handlerを「snapshot生成+`Modal.open()`」のみに置換(同一event task、同期のみ — §13.3。§13.2の8ms予算を維持)
3. Modal起動はGallery初期ロードと独立(一覧取得中でも開ける — P0-4/P0-5知見)…Phase 2では実タイルclickのみのため自然に成立
4. onClose→起動元タイルへfocus復帰(§13.4)。復帰先タイル喪失時はグリッドへ
5. Viewer側: `getModalContext()`でsnapshot受領→即座に画像URL設定(§13.3「起動後の最初の処理」)

**合格条件**: click→`Modal.open()`が同期のみ(E2E: click同期P95<8ms維持)、Viewer起動計測(dcl/first-paint。P0-4実測と比較)、close後のfocus復帰E2E。
**提出物**: 実装+テスト、result.md。

### WU-2 画像2段表示

**作業**(§7.4):
1. snapshotのthumb参照(w640優先)を即`<img>`へ設定(GalleryとURL一致=HTTPキャッシュ再利用)。thumbなしは原寸を直接表示(fallback)
2. Originalは別のpreload elementで`load`+`decode()`完了を待ち、**次のanimation frameで一度だけ**差し替え(即時、transitionなし)
3. Original失敗時は前段(thumb)表示を維持(§11表)。全て失敗時はエラーfallback+Retry+「Originalを開く」/Download導線
4. 差し替え中も常に前段画像が表示されている(§13.3)
5. URLはadapterの正規形builderのみ(§5.2)。Original preload laneは同時1(§9.2)

**合格条件**: 2段遷移の実測(thumb表示→Original swapのタイミング記録)、失敗系の単体全分岐、前段維持のE2E確認。
**提出物**: 実装+テスト、result.md。

### WU-3 ナビゲーション

**作業**(§7.3): 前後ボタン/`ArrowLeft`/`ArrowRight`、Escは自前handler(`closeOnEscape:false`前提)→`view.close()`。先頭/末尾で無効化。Enter/Spaceはfocus中のボタンのみ。移動時はsnapshot列のindexで前後(並び順=Galleryセッション正本)。新画像は毎回`fit`。移動先の表示はWU-2の2段シーケンス。直前に表示した画像(decode済み)への逆移動は次frameで表示(§13.3。隣接preloadはP3のため、対象は表示履歴のみ — 読み替え注記)。

**合格条件**: キーボード・ボタン両系統のE2E、端の無効化、Esc→close→focus復帰、逆移動next-frame表示の計測。
**提出物**: 実装+テスト、result.md。

### WU-4 縮退状態の共有と待機表示

**作業**: Viewer内にRateLimitStateMachineを持ち、snapshot経由で起動時のstate/Retry-After残を引き継ぐ(events同期はP4。Modal起動をまたぐ状態共有の最小実装 — §11.1)。§11.1.3の実値出し分け: Retry-After<60s「混雑のため一部の読み込みを待機中」(自動復帰)、≧60s「混雑のため読み込みを停止しています…」+手動再読み込み導線。Viewer内非モーダル表示。Blocked中はキャッシュ(表示済み画像・snapshot)で開閉・前後移動を継続し、新規要求は停止(§11.1)。

**合格条件**: 単体で全分岐(表示切替・自動復帰・Blocked中の操作継続)。実siteでの429再現は行わない(§3)。
**提出物**: 実装+テスト、result.md。

### WU-5 E2E・計測・回帰

**作業**:
1. `tests/e2e/phase2/` 新設: 起動(click→Modal→画像表示)、2段swap、ナビ、Esc/close/focus復帰、a11y(アクセシブル名、focus移動)
2. 計測(LAN実測、Cold/Warm各5回、中央値/P95): click→viewer dcl、dcl→first-paint、thumb表示→Original swap完了。P0-4実測(標準Viewer比較のbaseline/standard-viewer.md)と対比
3. §13.3該当条項判定+console出力0+正規形URL/許可host不変条件
4. Phase 1回帰(p1-1〜p1-6)+P0-4相当の回帰をphase2 specとして再実装
5. 標準セッション(§4.5.4: Viewer 30件閲覧)のREST・転送量を再実測し、Phase 0の157ptと対比

**合格条件**: §13.2予算内(viewer gzip≦55KB/CSS≦12KB)、§13.3成立、Phase 1回帰GREEN。
**提出物**: `docs/evidence/phase2/perf/result.md`、回帰結果。
**上申条件**: 予算超過、Modal挙動の実測不一致(ヘッダー領域・closeOnEscape等)。

### WU-6 Usage snapshot・Phase 2報告

**作業**: 実site操作完了後の次回12:00 UTC更新後にユーザーがUsage/Billing確認→snapshot記録・register最終確認日更新(P1-E-07方式)→`docs/evidence/phase2/Phase2_Report.md`(Phase 3着手推奨を含む)。

## 5. 実装規約(Phase 2追加分)

1. Viewerコードは`src/viewer/`に閉じ、Gallery bundleへ含めない(CLAUDE.md §8)。snapshot型は`src/shared/types/`に置き両entryで共有
2. Viewer状態機械(2段表示・ナビ)はDOM分離しmock注入で単体テスト可能にする
3. `@forge/bridge`呼び出しは既存adapter(view-context/viewer-modal)経由のみ
4. 装飾アニメーション・transitionは使用しない(§3)。差し替え・状態変化は即時
5. E2EはOOPIF Modal iframeの発見helper(`/viewer/`)をhelpers.tsへ追加する

## 6. 環境と計測条件

Phase 1と同一(deploy済みdevelopment、E2E半自動、LAN実測+Cold=新規context — P1-E-05裁定を継承)。Viewer Modal iframeもOOPIFのため、throttling不適用の制約は同様。

## 7. 証跡

`docs/evidence/phase2/`(WU-N result.md、perf/、Phase2_Report.md)。必須項目はPhase0_Spec §7.2と同一。

## 8. Phase 2のDefinition of Done

1. WU-0〜WU-6の提出物が揃っている
2. §16 Phase 2の5項目(読み替え含む)が実装され、§13.2予算・§13.3該当条項・§13.4該当項目を満たす
3. ハーネスGREEN、Phase 2後snapshotで全メトリクス0・USD 0.00・支払方法未登録
4. Phase 1回帰E2EがGREEN
5. ユーザーがPhase 3着手を承認している

## 9. 責任分界(Phase 2)

| 作業 | ユーザー | Claude Code |
|---|---|---|
| 実装・テスト・計測・証跡 | PRレビュー(自己merge委任継続) | 主担当 |
| Usage/Billing確認(WU-6) | 必須 | snapshot記録・register更新 |
| 体感確認(Viewer操作感) | 任意(推奨。特にfullscreenの操作感・Esc/前後) | 手順提示 |
| 上申裁定 | 必須 | 起案 |

## 10. 上申候補

| ID | 事項 | 発生WU | 裁定の選択肢 | 停止区分 |
|---|---|---|---|---|
| P2-E-01 | viewer bundle予算(55KB)超過 | WU-5 | 削減/予算改訂 | 続行 |
| P2-E-02 | Forge Modal実挙動の変化(ヘッダー領域・closeOnEscape・focus挙動) | WU-1/3 | 実測に合わせたL2改訂proposal | 続行(実測記録) |
| P2-E-03 | snapshotサイズがModal context上限に当たる(500件時) | WU-1 | snapshot圧縮/参照方式の裁定 | 続行(500件は性能保証外) |
| P2-E-04 | 起動経路でユーザーコンテンツへの副作用を検出 | 全WU | 原因除去まで停止 | **即時停止** |

## 11. Phase 2固定パラメータ(§18に準拠+追加)

| パラメータ | 値 |
|---|---|
| Viewer初期画像 | thumbキャッシュ w640(なければ原寸fallback) |
| Original preload lane | 同時1(§9.2) |
| 差し替え | 次のanimation frameで一度、即時 |
| 操作ボタンhit area | 最低44×44 CSS px(§7.2) |
| 待機表示閾値 | Retry-After 60秒(§11.1.3、§18) |
| 計測 | Cold/Warm各5回、中央値・P95(LAN実測 — P1-E-05) |
