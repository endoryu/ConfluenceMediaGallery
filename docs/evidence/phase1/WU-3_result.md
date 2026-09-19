# WU-3 result(グリッドとタイル)

- 計測日: 2026-09-19
- 環境: deploy済みdevelopment(ryu-dev.atlassian.net)、Windows 11、E2E半自動
- ブラウザ: Chrome(channel chrome)/ Edge(channel msedge)。DPR=1
- ネットワーク: スロットリングなし(§8プロファイル計測はWU-7)
- 対象ページ: MG-05-Perf-50(50画像)

## 確認事項と結果

| 確認事項(V1 §6.2 / Phase1_Spec WU-3) | 結果 | 根拠 |
|---|---|---|
| CSS Grid、列数はコンテナ幅追従 | **成立** | computed display=grid、`repeat(auto-fill, minmax(var(--mg-tile-min),1fr))` |
| タイル最小幅220pxのdesign token | **成立** | `--mg-tile-min`=220px(E2Eでcomputed値確認、実測タイル幅≥219px) |
| 4:3比率枠を画像取得前から確保 | **成立** | aspect-ratio 4/3。実測比率誤差<0.02、**CLS=0.0000**(Chrome/Edge、hadRecentInput除外後) |
| 中央基準object-fit: cover | **成立**(規則定義) | `.mg-tile-media img`に定義済み(imgロードはWU-4で実測) |
| タイル全体をclick/Enter/Space対象 | **成立** | button要素。E2Eで3操作ともpageerror 0(Phase 1は診断記録のみ) |
| 200件超はDOM複数frame分割 | **成立**(機構) | TILES_PER_FRAME=50(constants、Phase1_Spec §11)。単体テストで120件→50/50/20の3frame分割を確認。200件実測はWU-7 |
| アプリ起因long task 50ms超=0 | **成立(50件)** | PerformanceObserver(longtask, buffered): **0件**(Chrome/Edge)。200件はWU-7 |
| 動画・音声は種別アイコン+汎用タイル | **成立** | ▶/♪アイコン(aria-hidden、アクセシブル名はbutton) |

計測raw: `local/e2e-results/p1-3-grid-*.json`(両ブラウザ各1回)

## 合否

**合格**。verify:local GREEN(65 tests、fixture 33/33)。gallery gzip 5.80 kB / CSS 0.68 kB(予算40/10 kB)。

## 上申事項

なし。

## 未実施項目と理由

1. 200件でのlayout shift・long task実測: MG-06作成(WU-7)後に実施
2. 実imgでのobject-fit確認: WU-4(Thumbnailロード)で実測
