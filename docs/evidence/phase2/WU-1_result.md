# WU-1 result(起動経路とfocus復帰)

- 計測日: 2026-09-20
- 環境: deploy済みdevelopment、Windows 11、E2E半自動(LAN実測)
- ブラウザ: Chrome/Edge(channel)。DPR=1
- 対象ページ: MG_00_Smoke(28画像、thumb生成済み)

## 確認事項と結果

| 確認事項(V1 §7.1/§13.3/§13.4 / Phase2_Spec WU-1) | 結果 | 根拠 |
|---|---|---|
| click handler=snapshot生成+`Modal.open()`のみ(同期) | **成立** | viewer-launch.ts(純関数)+main.ts(`void openViewerModal`)。await直下なし(FCP-SRC-HANDLER-SYNC GREEN) |
| compact snapshot(§7.1の必須項目+index+並び順) | **成立** | ViewerSnapshot型(URL文字列は持たず正規形builderで再構成 — §5.2/§10)。build→parse往復一致を単体テスト |
| 起動後の最初の処理=画像URL設定(§13.3) | **成立** | ViewerApp.start(mark `p2.viewer.image-url-set`)。E2Eで正規形URL・naturalWidth>0確認 |
| thumbキャッシュ(w640)優先→原寸fallback | **成立** | selectThumb(640)で参照選択。単体+E2E(thumbありページで全thumb) |
| 閉じる=Forgeヘッダー(自前close非配置) | **成立** | E2E: "Close Modal"ボタンで閉鎖(自動化ではキーボード活性化。overlayのpointer interceptを記録) |
| close後のfocus復帰(§13.4) | **成立** | E2E: 起動元タイルへ復帰(両ブラウザ)。親のfocus管理がiframe focusを奪うため0/150/500msの再フォーカスで確定 |
| 起動計測(click t0→dcl/first-paint) | **記録** | Chrome dcl 2129ms(viewer資産のcold取得含む)/Edge 78ms(warm)。Cold/Warm系統計測はWU-5 |
| snapshot防御parse(不正はエラーfallback表示) | **成立** | 単体(壊れ形6種null)+不正時の非モーダルメッセージ |

## 実装上の発見(記録)

1. **一覧確定前のタイルclickは無視される**(セッション正本確定後にsnapshot可 — §6.1/§7.1の帰結)。50件1ページでは窓は数百ms。改善(部分列での起動)はPhase 3検討事項として記録
2. Forge fullscreen Modalのヘッダーはoverlayがpointer判定をinterceptする(自動化ではkeyboard活性化が確実)。実ユーザーのclickは通常どおり機能(手動確認)
3. Modal close直後、親のfocus管理がgallery iframeのfocusを一時奪う → 復帰は短い再試行で確定
4. p1-6のhover E2EはOOPIFへのpointer配送flakeがあり、re-hover+pollへ安定化(アプリ側変更なし)

## 合否

**合格**。verify:local GREEN(19 files / 111 tests、fixture 33/33)。Phase 1回帰+p2-1(Chrome/Edge)GREEN。viewer bundle gzip 1.81 kB / CSS 0.60 kB(予算55/12 kB)。

## 上申事項

なし。

## 未実施項目と理由

1. Cold/Warm系統の起動計測(P0-4対比): WU-5でまとめて実施
2. 500件snapshotのサイズ実測(P2-E-03): WU-5の計測時に確認
