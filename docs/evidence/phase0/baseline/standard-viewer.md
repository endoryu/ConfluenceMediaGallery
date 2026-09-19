# WU-9 Confluence標準Viewer比較baseline

- 計測日: 2026-09-19
- 環境: deploy済みdevelopment(ryu-dev.atlassian.net)、`MG-05-Perf-50`(pageId 589874)
- ブラウザ: Chrome 152(Playwright、ガイド§7.1半自動方式)
- 対象: 本文埋め込みの代表画像 mg05-1080p.jpg(1920×1080)/ mg05-4k.jpg(3840×2160)/ mg05-8k.jpg(7680×4320)
- 原本: `local/e2e-results/p0-9-standard-*.json`、`p0-9-probe-*.json`

## 計測条件

| 側 | 条件 |
|---|---|
| 標準Viewer | 埋め込み画像click→media viewer。CDP throttling 100Mbps/RTT50ms、Cold=cache無効+ページreload、Warm=cache有効。各5回 |
| probe Viewer | Modal probe(click→viewer paint)+Viewer内media表示ms。Warm 5回。**macro iframeはOOPIFのためCDP throttling/cache制御が届かず、無throttle参考値**(制約として記録) |

計測定義: 標準=click→高解像度画像の表示(naturalWidth閾値)。probe=click→viewer first-paint、および原寸imgのload完了。

## 結果(中央値 / P95、ms)

### 標準Viewer

| 画像 | Cold click→高解像度 | Warm click→高解像度 | 表示解像度上限 | Cold応答数 | long task |
|---|---|---|---|---|---|
| 1080p | 449 / 478 | 53 / 93 | 1920(原寸) | 200件/5回 | 10 |
| 4K | 482 / 510 | 54 / 102 | 3840(原寸) | 200件/5回 | 10 |
| 8K | 502 / 512 | 56 / 107 | **4096(rendition上限。原寸7680は非表示)** | 200件/5回 | 11 |

※応答数はページreload込みのmedia系応答合計(Cold 5回分)。

### probe Viewer(参考: 無throttle)

| 画像 | click→viewer paint | viewer内media表示(原寸load) | 表示解像度 |
|---|---|---|---|
| 1080p | 34 / 2168(初回のみviewer bundle cold) | 610 / 720 | 原寸 |
| 4K | 34 / 46 | 657 / 696 | 原寸 |
| 8K | 34 / 41 | 611 / 714 | **原寸7680を表示可能** |

## 観察

1. **標準viewerは8Kを4096px renditionへ縮退**して表示する(media変換基盤の恩恵)。本アプリは原寸を表示できる(品質優位)が、その分の転送・decodeを負う(writer thumbキャッシュ設計の動機と整合)
2. 標準のcold約450〜500msはrendition(≤4096)配信+専用UIの合算。probeのmedia表示610〜657msは**原寸**(8Kで40MB級)を含む値であり、条件が異なる。正式な優劣判定はPhase 5(V1 §15.4)
3. probeのclick→paint 34msは標準のwarm 53〜56msより速い(Viewer shell起動はForge Modalでも十分軽い)
4. 標準viewerでもlong task ~10件/5回(プラットフォーム固有分の目安)

## 体感評価(ユーザー記入欄)

- 標準Viewer: (未記入)
- probe Viewer: (未記入)

## 上申・未実施

1. probe側のthrottling/cache統制計測はOOPIF制約により未実施(数値は参考)。Phase 5の受け入れ判定時は、手動DevTools throttlingでの比較(ガイド§8正本条件)を1回実施して補正する
2. 追加条件(20Mbps/RTT100ms)は本baselineでは未実施(Phase 5で判定に使う場合に取得)
