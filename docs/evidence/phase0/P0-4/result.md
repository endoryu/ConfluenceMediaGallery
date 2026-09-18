# P0-4 Fullscreen Modal result(WU-5)

- 計測日: 2026-09-19
- commit: 28f4313(v2.9.0)+ 5bf7f71(v2.10.0、probe改良)
- 環境: deploy済みdevelopment(ryu-dev.atlassian.net)
- ブラウザ: Chrome 152.0.7977.83 / Edge 153.0.4234.32、画面1920×1080、DPR 1
- ネットワークprofile: 未適用(独立性確認のみ低速3G throttling)。時間系は参考値

## 確認事項ごとの結果(V1仕様書 §14 P0-4と1対1)

| 確認事項 | 結果 | 根拠 |
|---|---|---|
| `size: fullscreen` のModalでViewer resourceを表示 | **成立** | Modal probe(v2.9.0)で全回成立 |
| Forge側ヘッダーの有無・実表示領域 | **ヘッダー表示あり**。実表示領域1920×841(1080画面) | ユーザー目視(A2a)。1080−ブラウザUI(約130px)−iframe841pxの残差約110pxがヘッダー等に整合 |
| `closeOnEscape: false` で自前handlerが `view.close()` で閉じる | **成立** | Esc捕捉→close成立(B1)。**native `<video controls>` にfocusがある状態のEscも成立**(B2)。closeボタンも成立(B3)。Edgeでも成立 |
| Gallery→Modal→GalleryのBridge `events` 往復 | **成立**。往復1〜4ms(中央値1ms、n=6) | mg-ping/mg-pong実測 |
| click→Modal.open()→Viewer DCL→first-paint | 下表 | epoch(Date.now)基準のiframe横断計測 |
| focus移動・復帰 | **成立**(open時Viewerへ、close後Galleryへ復帰。B4) | ユーザー確認 |
| Modal openとGallery初期ロードの独立性 | **成立**(低速3G下、一覧表示前に即時Modalボタンからopen) | ユーザー確認(E) |

## 起動時間(n=5、単位ms)

| 条件 | click→DCL 中央値 | click→first-paint 中央値 | 備考 |
|---|---|---|---|
| Warm | **23**(22〜31) | **59**(51〜71) | |
| Cold(DevTools閉) | 76 / 30 | 186 / 70 | 2回分 |
| Cold(DevTools展開) | 774〜800 | 904〜926 | DevTools展開による汚染として条件注記(3回分) |
| warm-up後の初回 | 29 / 22 | 67 / 54 | 下記warm-up実施後 |

- click→`Modal.open()`呼び出し: **2.1ms**(p0.click→p0.modal.open-called)— §13.2「click handler同期処理8ms未満」達成
- **Viewer warm-up(作業5)**: Gallery URLの`/gallery/`→`/viewer/`置換で同一ctx tokenのviewer resourceを非表示iframeでロード可能(load 44ms)。warm-up後のcold初回openは29/67msで、素のcold(76/186ms)より改善の示唆

## 合否

**合格**(合格条件「画像取得完了と独立にModalを開け、Viewer UIとGallery初期ロードが独立に進むこと」を満たす)。

## 上申事項

- **E-06(続行)**: Forgeヘッダーが表示されるため、V1 §7.2の閉じるボタン方針は「**Forgeヘッダーの閉じるボタンを正とし、自前の閉じるボタンは配置しない**」で確定する。§7.2の条件文を確定形へ改める改訂案はWU-10のproposalに含める
- E-07(Bridge events不到達)は**否定**(往復1ms)。§4.2のGalleryキャッシュ同期は維持

## 未実施と理由

1. Forgeヘッダーの表示内容(文言・ボタン構成)の詳細記録: screenshot整備時にまとめて取得(判定には有無のみで足りる)
2. スロットリング統制下のcold/warm系統計測: WU-7の標準セッション計測に統合
3. warm-upの厳密なA/B比較(cache消去を挟んだ反復): 効果の示唆は得られており、採否判断はWU-7の数値とあわせてPhase 1で行う
