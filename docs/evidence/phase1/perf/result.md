# WU-7 result(性能検証・回帰E2E)

- 計測日: 2026-09-19
- 環境: deploy済みdevelopment(ryu-dev.atlassian.net)、Windows 11、E2E半自動(p1-7-perf.spec.ts、MG_PERF=1)
- ブラウザ: Chrome(channel chrome、主計測)/ Edge(channel msedge、代表条件)。DPR=1
- ネットワーク: **LAN実測・スロットリングなし**(CDP throttlingがOOPIF macro iframeへ届かない既知制約。→上申P1-E-05)
- Cold=新規browser context(HTTPキャッシュ空)、Warm=同一contextで再ナビゲーション。各5回、中央値/P95
- 条件: 50件(MG-05)/200件(MG-06)× thumbあり/なし(なし=キャッシュ削除+生成無効化フラグで作成)
- raw: `local/e2e-results/p1-7-perf-*.json`、`p1-7-click-*.json`

## 1. ロード計測(Chrome、中央値/P95 ms)

**First Usable(dcl→最初のタイルbatch)/ 一覧確定(dcl→list.complete)/ eager層media完了(dcl→settle)**

| 条件 | First Usable | 一覧確定 | media完了 | media転送(中央値) | media要求 |
|---|---|---|---|---|---|
| 50件・thumbなし Cold | 490 / 538 | 664 / 696 | 1463 / 1507 | **1,977,262 B** | 48 |
| 50件・thumbなし Warm | 323 / 991 | 539 / 1202 | 939 / 1631 | 1,977,185 B | 48 |
| 50件・thumbあり Cold | 516 / 798 | 1344 / 1724 | 1928 / 2196 | **204,244 B** | 48 |
| 50件・thumbあり Warm | 394 / 462 | 990 / 1107 | 1400 / 1586 | 204,048 B | 48 |
| 200件・thumbなし Cold | 529 / 550 | 1568 / 1768 | 2123 / 2639 | **1,331,526 B** | 48 |
| 200件・thumbなし Warm | 344 / 386 | 1332 / 1407 | 1755 / 1803 | 1,331,380 B | 48 |
| 200件・thumbあり Cold | 554 / 675 | 4068 / 4431 | 4464 / 4981 | **211,136 B** | 48 |
| 200件・thumbあり Warm | 366 / 663 | 3052 / 3444 | 3404 / 3818 | 211,060 B | 48 |

Edge(50件・thumbあり): Cold FU 457/690、転送204,216B — Chromeと同等。

**要点**
1. thumbキャッシュにより初期表示のmedia転送が **50件: −89.7%、200件: −84.1%**(1.98MB→204KB / 1.33MB→211KB)
2. First Usable(placeholder→最初のタイル枠)は全条件で **Cold中央値 457〜554ms**。件数・thumb有無にほぼ非依存(§6.1の設計どおり)
3. media要求48件=eager層24タイル×(download 302+media本体)。**lazy層はスクロールまで取得しない**(200件でも要求数は同じ — §13.3のviewport限定)
4. 一覧確定は添付総数に比例(limit50の直列pagination。200件+thumb400+config=601件→13ページで約4.1s)。**Phase 3の改善候補**(並行取得/limit調整)として記録
5. **署名URL(api.media)は訪問毎に異なり302は非キャッシュのため、原寸はWarmでも全量再転送される**。thumbキャッシュも同様に再転送されるが絶対量が小さい(204KB)。永続キャッシュは§3で禁止のため、これは仕様上の到達点

## 2. §13.2実装予算の判定

| 項目 | 目標 | 実測 | 判定 |
|---|---|---|---|
| Gallery app code | gzip ≦40KB | **10.09KB**(vendor-bridge 27.99KBは除外対象) | **合格** |
| Gallery CSS | gzip ≦10KB | **0.83KB** | **合格** |
| 外部runtime dependency | 0 | 0(@forge/bridgeのみ=platform配布分) | **合格** |
| アプリ起因long task 50ms超(200件) | 0件 | **0件**(全40サンプルで観測0 — spec内assert) | **合格** |
| click handler同期処理 | <8ms(P95) | **0.30ms**(Chrome)/**0.40ms**(Edge)(20 clicks) | **合格** |
| layout shift | (§6.2比率枠) | CLS **0.0000**(全条件・全サンプル、hadRecentInput除外) | **合格** |

## 3. §13.3(Phase 1該当条項)の判定

| 条項 | 判定 | 根拠 |
|---|---|---|
| API待機中に背景/placeholder表示 | **合格** | 静的HTML shell(p1-1) |
| 1ページ目応答後、次frameで最初のタイルbatch | **合格** | page1→first-batch 中央値 0.6〜1.0ms(全条件) |
| 初期表示requestはメタデータとThumbnailのみ | **合格** | 全galleryリクエストが正規形v1 download/api.media/一覧系のみ(全ロードでassert) |
| Thumbnail取得はviewport周辺限定 | **合格** | 200件でもmedia要求48件・lazy層はsrc未設定(p1-4/p1-7) |

## 4. 標準セッションポイント(再計測)

gallery 1セッション(閲覧のみ、生成なし)のREST要求実測(thumbあり):
- 50件ページ: **6要求**(一覧4ページ〈150添付+config〉+operations 1+config取得1)
- 200件ページ: **15要求**(一覧13ページ+operations 1+config取得1)

thumbなし時の算定値: 50件=4要求、200件=6要求(一覧ページ数の差)。Phase 0基準(§4.5.4=157pt/セッション、Viewer 30件込み)に対し、Phase 1のGallery初期化は大幅に軽い。media(native img)はREST点数外。生成セッションは初回のみ+N要求(素材取得+PUT)で、実測中に429・逼迫なし。

## 5. 回帰E2E

- Phase 1回帰(p1-1〜p1-6): **Chrome/Edge 12件全合格**(thumb生成後の状態でも成立)
- P0系specの回帰: probe UI前提のためPhase 1 buildでは実行不能。同等の不変条件で代替(→上申P1-E-06):
  - P0-1/P0-2(Thumbnail/Original配信・正規形・cache挙動)→ タイル実ロード+正規形URL全件検査(p1-1/p1-4/p1-7)
  - P0-5(CSP/scope)→ 許可host以外への要求0(p1-7全ロードでassert)+cost-guard GREEN
  - P0-6(セッションポイント)→ 本§4で再計測
  - P0-4(Modal)→ Viewer未実装のため対象外。Phase 2で回帰
  - アーカイブされたP0 specは`tests/e2e/phase0/`(PW_PHASE0=1、probe時代buildに対してのみ)

## 6. 合否

**合格**(§13.2予算内、§13.3該当条項成立、回帰GREEN)。ただし計測条件2点の読み替えを上申する(P1-E-05/P1-E-06)。

## 7. 未実施項目と理由

1. ガイド§8のネットワークプロファイル(100Mbps/50ms)適用: CDP throttlingがOOPIF iframeに届かないため未適用(LAN実測)。相対比較(thumb有無・件数)は有効。→P1-E-05
2. 500件試験: L2 §6.2のとおり検証上限は500件だがV1性能保証は500件まで・検証データは200件(Phase1_Spec §4 WU-7)。500件データ作成はPhase 3(仮想化検討)と併せて判断
3. スクロール時のlazy層追従ロードの定量化: Phase 3(優先度・lane制御)で計測
