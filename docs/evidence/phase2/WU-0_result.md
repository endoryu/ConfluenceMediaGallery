# WU-0 result(Viewer shell・レイアウト)

- 記録日: 2026-09-20
- 対応L3: Phase2_Spec §4 WU-0
- 環境: ローカル(verify:local)。deploy確認はWU-1(起動経路接続)と併合

## 確認事項と結果

| 確認事項(V1 §7.2 / Phase2_Spec WU-0) | 結果 | 根拠 |
|---|---|---|
| 暗色背景・メディア中央contain領域 | **成立** | 静的HTML+viewer.css(`--mgv-bg`、`.mgv-stage`/`object-fit: contain`) |
| 前後ボタン: 左右端中央、hit area≧44×44、縁に重ねる | **成立** | `--mgv-hit: 44px` token、absolute配置。初期disabled(WU-3で活性化) |
| 閉じるボタン非配置(Forgeヘッダーが正)・`≡`非配置(P4) | **成立** | button要素は前後の2個のみ(単体テストでガード) |
| 状態変化は即時(transition/animation不使用 — §3) | **成立** | CSSプロパティ検査(単体テスト) |
| plain CSS 1ファイル/entry、design token | **成立** | viewer.css(CSS custom properties) |
| p2.viewer.* marks基盤・診断読み出し口 | **成立** | `p2.viewer.dcl` mark、`__MG_DIAG__` |

## bundle予算計測の開始(§13.2)

| bundle | raw | gzip | 予算 |
|---|---|---|---|
| viewer app code(index-*.js) | 0.85 kB | **0.46 kB** | ≦55 kB |
| viewer CSS | 1.27 kB | **0.60 kB** | ≦12 kB |
| vendor(@forge/bridge) | -(WU-0では未参照。WU-1で追加) | - | 対象外 |

## 合否

**合格**。verify:local GREEN(17 files / 98 tests、fixture 33/33)。

## 上申事項

なし。

## 未実施項目と理由

1. deploy済みdevelopmentでの表示確認: Viewerへの到達経路(tile click)がWU-1のため、WU-1と併せて確認する
