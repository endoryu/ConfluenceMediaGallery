# WU-4 result(縮退状態の共有と待機表示)

- 記録日: 2026-09-20
- 環境: deploy済みdevelopment(回帰)、単体テスト(縮退分岐)
- 対応L2: §11.1、§11.1.3

## 確認事項と結果

| 確認事項(V1 §11.1/§11.1.3 / Phase2_Spec WU-4) | 結果 | 根拠 |
|---|---|---|
| 縮退状態のGallery→Viewer共有(snapshot経由の最小実装) | **成立** | RateLimitStateMachine.exportState/restoreState。Blockedは期限epochで引継ぎ、期限超過はNormalへ丸め(単体) |
| §11.1.3の実値出し分け(<60s/≧60s) | **成立(単体)** | 30s=「混雑のため一部の読み込みを待機中」(導線なし)、120s=「読み込みを停止しています…」+再読み込みbutton |
| Retry-After経過後の自動復帰 | **成立(単体)** | scheduleでの再render→表示再開 |
| Blocked中は新規media要求を停止 | **成立(単体)** | render入口で遮断(src未設定)。§11.1「REST+native media両方」 |
| Blocked中もViewer開閉・前後移動は継続 | **成立(単体)** | ナビでindexは進み要求は出ない(キャッシュ範囲で応答) |
| Viewer内非モーダル表示 | **成立** | .mgv-status(overlay、操作を遮らない) |
| media失敗→recordMediaFailure(補助情報 §11.1.1) | **成立(単体)** | 前段・Original両方のerror経路 |
| 回帰(Normal時に影響なし) | **成立** | Phase 2 E2E 6/6(Chrome/Edge) |

## スコープ注記

Viewer内からのレート制限疑いprobe(安価REST 1件)は未接続(Phase 2のViewerはREST要求を発行しないため検知主経路がない)。Phase 3の隣接先読み(REST/media要求の増加)導入時にGallery同等のprobe接続を行う。

## 合否

**合格**。verify:local GREEN(22 files / 129 tests、fixture 33/33)。viewer bundle gzip 3.31 kB / CSS 0.66 kB(予算55/12 kB)。

## 上申事項

なし。

## 未実施項目と理由

1. 実siteでの429・Blocked再現: クォータ枯渇再現は恒久禁止(§3)。単体で全分岐を検証
