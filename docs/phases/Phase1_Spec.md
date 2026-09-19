# Confluence Media Gallery Phase 1 仕様書(Gallery最小実装)

| 項目 | 内容 |
|---|---|
| 層 | L3(フェーズ仕様) |
| 上位文書 | V1仕様書、開発・テスト環境ガイド |
| 対象 | V1仕様書 §16 Phase 1(macro/context/pagination、media分類、stable grid、Thumbnail、empty/error、hoverタイトル、viewport優先load)+§6.3のwriter thumbキャッシュ生成 |
| 実装 | Claude Code |
| 裁定・承認 | ユーザー |
| 承認 | ユーザー(2026-09-19。元proposal: `docs/proposals/2026-09-19_phase1-spec-draft.md`、thumb生成のPhase 1包含を含む全項目承認) |

## 0. 位置づけ

Phase 0で成立確認した経路の上に、Galleryの出荷可能な最小実装を構築する。Phase 0の確定事実を前提とする:

1. Thumbnail/Originalは同一の原寸配信(v1 download endpoint正規形)。中間解像度は存在しない
2. タイルの軽量化は`mg_thumbcache_*`添付(writer生成)で行い、未生成時は原寸fallback(V1 §6.3)
3. 生成素材はG1b(bridge一括)→G1c(Range分割4MB×N)で全サイズ取得可能
4. 節約策adapter・縮退state machine・E2E半自動計測はPhase 0資産を継続使用する

Viewer(Modal)、hover先読み、詳細パネル、動画音声UIはPhase 2〜4の範囲であり本フェーズに含めない。タイルclickはPhase 2まで診断記録のみのno-opとする。

## 1. 前提

1. Phase 0完了(P0-1〜P0-8合格。P0-7の最終一言確認済みであること)
2. scope 5種・manifest・policyはPhase 0クローズ時点のものを変更しない(manifest変更が必要になった場合は上申)
3. テストデータ: 既存のMG_00_Smoke/MG-02/MG-03/MG-05/MG-08/MG-09に加え、**MG-06-Perf-200(200件)**をWU-7で作成する(生成・uploadはPhase 0方式の自動実行。ユーザーは容量2GB内であることの事後確認のみ)
4. 運用: Phase 0で確立した自己merge・自律実行・E2E半自動方式(ガイド§7.1)・採番手順書を継続する

## 2. 範囲

含む: Gallery本実装(shell、一覧、分類、グリッド、Thumbnailロード、hoverタイトル、empty/error表示)、thumbキャッシュ生成・GC(writer)、性能検証(50件/200件)、probe UIの撤去。

含まない: Viewer/Modal(P2)、hover先読み・隣接preload・LRU/soft limit(P3)、詳細パネル・動画音声・診断レポートUI・Bridge events同期(P4)、Firefox/Safari/モバイル、staging/production、Marketplace準備(P5)。

## 3. 作業単位(WU)と依存関係

| WU | 内容 | 対応L2 |
|---|---|---|
| WU-0 | Phase 0 probe資産の撤去と引き継ぎ整理、bundle予算計測の開始 | §13.2、Phase0_Report §6 |
| WU-1 | Gallery shell・context・一覧pagination(逐次描画+順序確定) | §6.1 |
| WU-2 | MediaItem整形・media分類・thumbキャッシュ対応付け | §5.1、§5.2 |
| WU-3 | グリッドとタイル(CSS Grid、4:3、比率枠先行確保、frame分割) | §6.2 |
| WU-4 | Thumbnailロード(thumbキャッシュ優先→原寸fallback、viewport優先度) | §6.3、§9.1〜9.2最小 |
| WU-5 | thumbキャッシュ生成・書き戻し・GC(writer。①編集時+②writer閲覧時) | §5.2、§6.3、P0-8 |
| WU-6 | hoverタイトル、empty/error/権限/混雑(cold start 429)表示 | §6.4、§11、§11.1.2 |
| WU-7 | 性能検証(50件/200件、Cold/Warm、予算判定)と回帰E2E | §13.2、§13.3、ガイド§8 |
| WU-8 | Phase 1後Usage snapshot・register更新・Phase 1報告 | §4.7.3 |

依存: WU-0→WU-1→WU-2→WU-3→WU-4→WU-5、WU-6はWU-3後に並行可、WU-7はWU-4〜6後、WU-8は最後。manifest変更は本フェーズでは行わない(必要時は上申)。

### 停止条件

1. 課金メトリクス正値・費用正値・支払方法登録の検出(即時停止)
2. thumb生成が書込み権限外の副作用(ユーザーコンテンツ変更・削除)を起こした場合(即時停止・原因除去まで生成機能無効化)
3. §13.2予算の大幅未達(gzip予算超過25%以上、または200件でlong task恒常発生)で解決策が範囲内にない場合

## 4. WU詳細

### WU-0 probe資産の撤去と引き継ぎ整理

**作業**: `src/gallery/probes/*`・`probe-ui.ts`・`viewer-probe.ts`を削除し、Phase 1構成(§8参照)へ再配置する。viewer entryは「Phase 2まで空shell」に置き換える。E2E(P0系spec)は`tests/e2e/phase0/`へ移動し回帰資産として保持(既定実行から除外)。bundle size計測をverify:localの出力に追加する(§13.2予算の常時可視化)。

**合格条件**: verify:local GREEN、gallery bundle(自前コード)gzip実測値の記録開始。
**提出物**: 整理後のツリー、削除・引継の対応表(`docs/evidence/phase1/WU-0_migration.md`)。

### WU-1 Gallery shell・一覧pagination

**作業**(V1 §6.1の6手順を実装):
1. 静的HTML+背景を即描画(context取得やAPIを待たない)
2. `pageId`をcontextから取得、一覧1ページ目(limit=50)を要求
3. 1ページ目で分類・グリッド描画を開始、続きページは描画と並行取得
4. 全件取得後に順序確定(更新日時降順→attachmentId昇順)。再配置は一度
5. 一覧結果をGalleryセッション正本として保持(CachingConfluenceApi)
6. rate-limit machineを接続し、Blocked時は§11.1.2のcold start表示(WU-6で本表示)

**合格条件**: §13.3「API待機中に背景/placeholder表示」「1ページ目応答後、次のanimation frameで最初のタイルbatch」成立(E2E計測)。500件時も取得継続(検証は200件まで)。
**提出物**: 実装+単体テスト(mock)、`docs/evidence/phase1/WU-1_result.md`。

### WU-2 MediaItem整形・分類・thumb対応付け

**作業**: §5.1のMediaItem完全形(必須/任意フィールド)。kind分類(image/video/audio/unsupported)。`mg_thumbcache_<attachmentId>_v<version>_w<width>`のパースと元Attachmentへの対応付け(グリッドからの除外、tile画像への割当、版一致判定)。`mg_thumbcache_config`の読取(台帳・無効化フラグ)。

**合格条件**: 単体テストで命名パース・版ズレ判定・除外の全分岐を検証。
**提出物**: 実装+テスト、result.md。

### WU-3 グリッドとタイル

**作業**: §6.2の全項目 — CSS Grid、4:3、`object-fit: cover`、タイル最小幅220pxをdesign token化、比率枠の先行確保、タイル全体をclick/Enter/Space対象(Phase 1では診断記録のみ)、200件超のDOMを複数frameに分割追加(1frameあたりの追加タイル数は§11の固定パラメータ)。動画・音声は種別アイコン+汎用タイル(§2.1の一覧仕様の静的部分のみ)。

**合格条件**: 50件/200件でlayout shiftなし(比率枠)、200件追加中にアプリ起因long task 50ms超が0(§13.2)。
**提出物**: 実装+テスト、result.md(long task計測含む)。

### WU-4 Thumbnailロード

**作業**: §6.3 — thumbキャッシュ(w320/w640)を表示幅×DPRで選択(上限640)、無ければ原寸fallback。viewport優先度: 初回viewport内=eager/high(`fetchpriority`)、直近1画面=eager/auto、以遠=`loading=lazy`+IntersectionObserver/low。§9.1の優先順位のうちPhase 1該当分(viewport内Thumbnail>それ以外)を実装。失敗タイルはerror表示+個別Retry(§11表の該当行)。media load失敗はrate-limit machineへ通知。

**合格条件**: 「Gallery初期表示のrequestはメタデータとThumbnailのみ」「Thumbnail取得はviewport周辺限定」(§13.3)をE2Eのrequest記録で確認。
**提出物**: 実装+テスト、result.md。

### WU-5 thumbキャッシュ生成・書き戻し・GC(writer)

**作業**(V1 §5.2/§6.3、P0-8実証済みprimitives):
1. 生成判定: 表示対象のうちthumb欠落/版ズレのitemを列挙。ページ単位無効化フラグ(config)を尊重
2. 権限判定: 生成は書込み可能ユーザーのセッションのみ(失敗時は静かにfallback継続)。編集コンテキスト(view context)での起動を優先経路①、閲覧中のwriterを経路②とする
3. 素材取得: bridge一括→失敗時Range分割4MB×N(上限128MB)→それも失敗なら当該itemはスキップ
4. 縮小: createImageBitmap→canvas(320/640、JPEG品質0.8、透過系はPNG)→拡張子なしBlob
5. 書込み: PUT create-or-update→config台帳更新。旧版・孤児thumbのGC(命名スキャン→v2 delete)
6. 協調: BroadcastChannel claim(先着1 instance、jitter 50〜250ms)
7. 全処理は性能憲法の全項目より下位(idle/低優先で逐次。同時1件)。表示をブロックしない
8. 手動操作: 「キャッシュをクリア」「このページで生成を無効化」(writerのみ表示)

**合格条件**: 生成された`mg_thumbcache_*`が次回ロードでタイルに使われる(E2E)。GCが旧版を削除する。閲覧専用相当(生成無効フラグ)で表示が原寸fallbackのまま成立する。ユーザーコンテンツへの書込みが発生しない(命名規則外への書込み0をE2Eのrequest記録で確認)。
**提出物**: 実装+テスト、result.md(生成時間・生成後のタイル転送量の前後比較を含む)。
**上申条件**: 生成起因の429/レート逼迫が観測された場合(生成レート制御の追加裁定)。

### WU-6 hoverタイトル・状態表示

**作業**: §6.4(hover/focus-visibleタイトル、1行ellipsis、アクセシブル名)。§11の表のPhase 1該当行: 空状態(Attachmentなし)、一覧取得失敗+Retry、権限不足、削除済み、非対応形式タイル。§11.1.2 cold start 429表示(Retry-After目安+手動再読込。11.1.3の段階表示本体はP2)。

**合格条件**: 各状態の表示を単体/E2Eで確認。console出力0維持。
**提出物**: 実装+テスト、result.md。

### WU-7 性能検証・回帰E2E

**作業**:
1. `MG-06-Perf-200`(200件)を自動生成・作成
2. ガイド§8条件(100Mbps/50ms、Cold/Warm各5回)で計測: First Usable Gallery(背景表示/最初のタイルbatch)、全件表示完了、long task、transferred bytes、request count。50件/200件、thumbあり/なし(fallback)の4条件
3. §13.2予算判定: gallery app code gzip≦40KB、CSS≦10KB、long task 50ms超=0(200件)、click handler同期<8ms(タイルclick計測)
4. P0系E2Eの回帰実行(P0-1/2/4/5/6が引き続き成立)
5. 標準セッションポイント再計測(thumb生成後: タイル=thumb転送に変わった後の実測)

**合格条件**: §13.2予算内、§13.3のPhase 1該当条項成立、回帰GREEN。
**提出物**: `docs/evidence/phase1/perf/result.md`(条件・中央値・P95)、回帰結果。
**上申条件**: 予算超過(超過幅と削減案を添えて)。

### WU-8 Usage snapshot・Phase 1報告

**作業**: 実site操作完了後の次回12:00 UTC更新後にユーザーがUsage/Billing確認(全メトリクス0・USD 0.00・支払方法未登録)→ snapshot記録・register更新 → `docs/evidence/phase1/Phase1_Report.md`(予算実測、上申と裁定、Phase 2着手推奨)。

## 5. 実装規約(Phase 1追加分)

1. probe時代の診断textareaは廃止し、診断バッファ+§8.4の収集のみ残す(コピーUIはP4)。UIへの計測値表示はしない
2. thumb生成モジュールは`src/gallery/thumbcache/`に隔離し、読取り側(タイル表示)から独立してテスト可能にする
3. 生成・GC・configの各書込みは必ず命名規則ガード関数を通す(`mg_thumbcache_`前置以外への書込みAPI呼び出しをコードパス上不可能にする)。単体テストで負例を持つ
4. CSSはplain CSS 1ファイル/entry。design tokenはCSS custom properties
5. E2E specは`tests/e2e/phase1/`。P0回帰は`tests/e2e/phase0/`(既定実行から除外し、WU-7で明示実行)

## 6. 環境と計測条件

Phase 0と同一(deploy済みdevelopment=証跡正本、ガイド§8条件、E2E半自動)。OOPIF制約(throttling/cache制御がmacro iframeへ届かない)は、First Usable Gallery系の計測をページ全体のreloadベースで行うことで回避する(cold=CDP cacheDisabled+reloadは親frameに適用され、iframe資産はforge CDN経由のため親のdisable対象になるかをWU-7冒頭で確認し、不可なら手動DevTools 1回で補正する)。

## 7. 証跡

`docs/evidence/phase1/`(WU-0_migration.md、WU-N result.md、perf/、Phase1_Report.md)。result.md必須項目はPhase0_Spec §7.2と同一。

## 8. Phase 1のDefinition of Done

1. WU-0〜WU-8の提出物が揃っている
2. §16 Phase 1の4項目+thumbキャッシュ生成が実装され、§13.2予算・§13.3該当条項を満たす
3. ハーネス`GREEN`、Phase 1後snapshotで全メトリクス0・USD 0.00・支払方法未登録
4. P0回帰E2EがGREEN
5. ユーザーがPhase 2着手を承認している

## 9. 責任分界(Phase 1)

| 作業 | ユーザー | Claude Code |
|---|---|---|
| 実装・テスト・計測・証跡 | PRレビュー(自己merge委任継続) | 主担当 |
| MG-06作成(200件生成・upload) | 容量の事後確認 | 自動実行 |
| Usage/Billing確認(WU-8) | 必須 | snapshot記録 |
| 体感確認(グリッド表示・hover) | 任意(推奨) | 手順提示 |
| 上申裁定 | 必須 | 起案 |

## 10. 上申候補

| ID | 事項 | 発生WU | 裁定の選択肢 | 停止区分 |
|---|---|---|---|---|
| P1-E-01 | bundle予算(40KB)超過 | WU-7 | 削減/予算改訂 | 続行 |
| P1-E-02 | thumb生成が429/逼迫を誘発 | WU-5 | 生成レート制御追加/生成頻度裁定 | 続行(逼迫解消まで生成停止) |
| P1-E-03 | 200件でlong task恒常発生 | WU-3/7 | frame分割粒度変更/仮想化検討(P3前倒し) | 続行 |
| P1-E-04 | 生成がユーザーコンテンツへ影響 | WU-5 | 原因除去まで生成機能無効化 | **即時停止** |
| P1-E-05 | OOPIF制約でcold計測が成立しない | WU-7 | 手動補正1回/計測定義の改訂 | 続行 |

## 11. Phase 1固定パラメータ(§18に準拠+追加)

| パラメータ | 値 |
|---|---|
| 一覧page size | 50 |
| タイル最小幅/比率 | 220 CSS px / 4:3 |
| thumb選択bucket | 320 / 640(表示幅×DPR以上の最小、上限640) |
| DOM frame分割 | 1frameあたり追加タイル50件(新規。実測で調整可、§4裁量) |
| thumb生成の同時実行 | 1件ずつ(idle優先) |
| 生成素材取得 | 一括→Range分割4MB×N(上限128MB) |
| 計測 | Cold/Warm各5回、中央値・P95 |
