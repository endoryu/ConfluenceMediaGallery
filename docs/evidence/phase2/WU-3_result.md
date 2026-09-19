# WU-3 result(ナビゲーション)

- 計測日: 2026-09-20
- 環境: deploy済みdevelopment、Windows 11、E2E半自動(LAN実測)
- ブラウザ: Chrome/Edge(channel)。DPR=1
- 対象ページ: MG_00_Smoke(28画像、thumb生成済み)

## 確認事項と結果

| 確認事項(V1 §7.3 / Phase2_Spec WU-3) | 結果 | 根拠 |
|---|---|---|
| 前後ボタン/`ArrowLeft`/`ArrowRight`で移動 | **成立** | 単体+E2E(両ブラウザ、ボタン・キー両系統) |
| 先頭で「前へ」・末尾で「次へ」無効化 | **成立** | 単体(端全分岐)+E2E(先頭のprev disabled) |
| Esc=自前handler→`view.close()`(closeOnEscape:false前提) | **成立** | E2E: Esc→Modal閉鎖→起動元タイルへfocus復帰 |
| form control/native media上のキーはcontrolへ委ねる | **成立(単体)** | input上のArrow/Escが無効 |
| Enter/Spaceはfocus中のボタンのみ | **成立** | グローバルhandler非設置(native button挙動)。E2Eのボタン操作で確認 |
| 移動は snapshot列(セッション正本)のindex | **成立** | showItem(index±1)。単体で列順 |
| 新画像は毎回`fit`へ(transform除去) | **成立(単体)** | ズーム相当transformがナビでクリア(WU-3bの土台) |
| 直前表示画像への逆移動が次frameで表示(§13.3読み替え) | **成立** | E2E: ArrowLeftで直前srcへ即復帰(HTTPキャッシュ+decode済み)。系統計測はWU-5 |
| 画像altはAttachment title(§13.4) | **成立** | render毎にalt=title(単体+E2E) |
| 移動時の2段表示・stale破棄 | **成立** | WU-2の世代トークン(単体)。ナビ連打でも古いOriginalが出ない |

## 合否

**合格**。verify:local GREEN(21 files / 122 tests、fixture 33/33)。Phase 2 E2E 6/6(Chrome/Edge)。viewer bundle gzip 2.83 kB / CSS 0.66 kB(予算55/12 kB)。

## 上申事項

なし。

## 未実施項目と理由

1. ナビゲーション時間の系統計測(Cold/Warm・nav next-frame条件の定量): WU-5
2. 動画・音声のpause/source解放(§7.3): Phase 4(Viewer対象がimageのみのため対象外)
