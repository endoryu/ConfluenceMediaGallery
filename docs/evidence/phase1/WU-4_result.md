# WU-4 result(Thumbnailロード)

- 計測日: 2026-09-19
- 環境: deploy済みdevelopment(ryu-dev.atlassian.net)、Windows 11、E2E半自動
- ブラウザ: Chrome(channel chrome)/ Edge(channel msedge)。DPR=1
- ネットワーク: スロットリングなし(§8プロファイル計測はWU-7)
- 対象ページ: MG-05-Perf-50(50画像、thumbキャッシュ未生成=全タイル原寸fallback)

## 確認事項と結果

| 確認事項(V1 §6.3 / §13.3 / Phase1_Spec WU-4) | 結果 | 根拠 |
|---|---|---|
| thumbキャッシュ(w320/w640)優先→原寸fallback | **成立**(fallback側) | resolver: selectThumb→null時に正規形原寸。E2Eで全img `data-fallback=1`(thumb未生成ページ)。thumb使用側はWU-5のE2Eで確認 |
| 要求bucket=表示幅×DPR以上の最小、上限640 | **成立** | `pickThumbBucket` 単体テスト(WU-2)+resolver接続 |
| 初回viewport=eager/high、直近1画面=eager/auto、以遠=lazy+IO/low | **成立** | 属性実測: high層あり、lazy層はIO交差までsrcなし。単体テストで3層境界 |
| Thumbnail取得はviewport周辺限定(§13.3) | **成立** | **50img中、lazy層41件がsrc未設定のまま**(スクロールなし時。Chrome/Edge一致)。要求18件のみ |
| Gallery初期表示のrequestはメタデータとThumbnailのみ(§13.3) | **成立** | gallery起点要求は正規形v1 download/api.mediaのみ(E2E全件検査) |
| メディアURLの正規形一元化(§5.2) | **成立** | UIはadapterのURL builderのみ経由。E2Eで非正規形0件 |
| 失敗タイルerror表示+個別Retry(§11) | **成立**(単体) | setTileError(⚠・img除去)→tile click=再割当て(fetchpriority=high)。実網羅はWU-6の状態表示と合わせて確認 |
| media失敗→rate-limit machine通知+疑いprobe | **成立**(実装+単体) | recordMediaFailure→shouldIssueProbe→安価REST 1件→probeFinished |
| 密度変化・リサイズ時は取得済み画像を維持 | **成立** | 再割当てを行わない設計(assignは一度) |

実測(スロットリングなし、各1回): 要求18件、転送 1,651,086 bytes(Chrome)/1,651,020 bytes(Edge)= **原寸fallback時の基準値**。thumb生成後の比較はWU-5/WU-7。

## 設計判断

画像ロードの開始は一覧確定(全ページ取得+順序確定)後とした。§6.3の「初回viewport内」は確定順に対して定義されるため。50件以下(一覧1ページ)では1ページ目描画とほぼ同時であり、§13.3の各条項に抵触しない。多ページ時の最適化(確定前の先行ロード)はPhase 3の範囲。

## 合否

**合格**。verify:local GREEN(fixture 33/33)。gallery gzip 6.91 kB / CSS 0.68 kB(予算40/10 kB)。

## 上申事項

なし。

## 未実施項目と理由

1. thumbキャッシュ使用経路のE2E: 実データのthumbはWU-5生成後に存在
2. スクロールによるlazy層の追従ロード確認・§8プロファイル計測: WU-7
