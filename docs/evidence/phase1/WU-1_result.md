# WU-1 result(Gallery shell・一覧pagination)

- 計測日: 2026-09-19
- commit: phase1/wu-1-shell(deploy版build。SHAはPR mergeで確定)
- 環境: deploy済みdevelopment(ryu-dev.atlassian.net)、Windows 11、E2E半自動(storageState)
- ブラウザ: Chrome(channel chrome、152系)/ Edge(channel msedge、現行stable)。DPR=1
- ネットワーク: スロットリングなし(機能確認+frame内遅延計測。ガイド§8プロファイルでの性能計測はWU-7)
- 対象ページ: MG-05-Perf-50(50画像)

## 確認事項と結果

| 確認事項(Phase1_Spec WU-1合格条件) | 結果 | 根拠 |
|---|---|---|
| API待機中に背景/placeholder表示(§13.3) | **成立** | 静的HTML shell(.mg-status/.mg-grid)がJS実行前から存在(index.html)。E2Eで両要素の存在を確認 |
| 1ページ目応答後、次のanimation frameで最初のタイルbatch(§13.3) | **成立** | mark `p1.gallery.list.page1`→`p1.gallery.tiles.first-batch` 差分: Chrome 0.6ms / Edge 0.7ms(1回、`local/e2e-results/p1-1-shell-*.json`) |
| §6.1手順(context→1ページ目limit50→逐次描画→全件後に一度だけ順序確定) | **成立** | 単体テスト(list→append交互、reorder 1回、確定順=更新日時降順→attachmentId昇順)+E2Eでtiles=50・`p1.gallery.list.complete` |
| 一覧=セッション正本、再送契機は明示Retryのみ | **成立** | CachingConfluenceApi経由+sessionItems保持。Retryの復旧は単体テスト |
| rate-limit machine接続(Blocked時は取得停止) | **成立**(表示の本実装はWU-6) | main.tsでobserve接続、Blocked時loadを停止しblocked表示 |
| gallery起点の初期requestはメタデータのみ | **成立** | E2E NetworkRecorder(frame帰属): gallery iframe起点のmedia/binary要求0件 |
| 500件超も取得継続 | **単体レベルで成立**(120件3ページのpagination) | 実データ200件はWU-7(MG-06)で検証 |

## 合否

**合格**。verify:local GREEN(10 files / 47 tests、fixture 33/33)。bundle実測: gallery app code gzip **5.40 kB**(予算40 kB)、CSS gzip **0.64 kB**(予算10 kB)。

## 上申事項

なし。

## 未実施項目と理由

1. ガイド§8プロファイル(100Mbps/50ms、Cold/Warm各5回)での性能計測: WU-7で50件/200件まとめて実施
2. 200件・多ページ実データでのE2E: MG-06作成(WU-7)後
