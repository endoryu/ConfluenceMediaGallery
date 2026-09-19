# Proposal: Phase 0実測に基づくV1仕様書・Phase0_Spec改訂batch(WU-10)

- 日付: 2026-09-19
- 起案: Claude Code(WU-10。P0-1〜P0-8の実測帰結の集約)
- 状態: 承認待ち(承認後、ユーザー指示でL2/L3へ反映)
- 関連裁定: CSR-2026-004(writer化)、ESC-WU2-01、E-04/E-06、複数ユーザーテスト除外(2026-09-19)

## A. V1仕様書(L2)改訂diff

### A-1. §3.3 scope表 — 実測で確定した5 scopeへ(WU-6)

```diff
 - `read:attachment:confluence`
 - `read:user:confluence`:詳細パネルで更新者の表示名を解決する場合のみ
 - `write:attachment:confluence`:thumbキャッシュ添付の生成・版更新・削除のみに使用する。ユーザーコンテンツの変更には使用しない
+- `read:content-details:confluence`:v1 attachment作成APIが`write:attachment:confluence`とペアで要求する(WU-6実測401および公式docs)
+- `delete:attachment:confluence`:thumbキャッシュのGC(v2 attachments delete)に使用する
```

### A-2. §4.4 API表 — thumbキャッシュ操作の実測確定(WU-6)

```diff
-| thumbキャッシュupload | `POST /wiki/rest/api/content/{pageId}/child/attachment`(新規)/`POST .../attachment/{attachmentId}/data`(版更新) |
-| thumbキャッシュ削除 | `DELETE /wiki/rest/api/content/{attachmentId}`(自己管理thumbのみ) |
+| thumbキャッシュupload | `PUT /wiki/rest/api/content/{pageId}/child/attachment`(create-or-update。同名は版更新)/`POST .../attachment/{attachmentId}/data`(明示的版更新) |
+| thumbキャッシュ削除 | `DELETE /wiki/api/v2/attachments/{attachmentId}`(自己管理thumbのみ。v1 DELETE /content/{id}はscope不一致401) |
```

### A-3. §5.2 冪等命名の機構 — PUT前提へ修正(WU-6実測)

```diff
-同名uploadはConfluence仕様により同一添付の版更新となるため、重複生成は「余分な版」に収束し実害を持たない(冪等命名)。
+冪等性はPUT(create-or-update)で成立させる: 同名が存在すれば同一添付の版更新となり、重複生成は「余分な版」に収束し実害を持たない。POST(新規作成)は同名添付が存在すると400を返すため使用しない(WU-6実測)。
```

### A-4. §7.2 閉じるボタン — Forgeヘッダー正で確定(E-06、P0-4実測)

```diff
-- 閉じるボタンは、P0-4でForge fullscreen Modalにヘッダーが表示されないと確認できた場合に左上へ自前配置する。ヘッダーが表示される場合はForgeの閉じるボタンを正とする。
+- Forge fullscreen Modalはヘッダーを表示する(P0-4実測: 1080p画面で実表示領域1920×841)。閉じるボタンはForgeヘッダーの閉じるボタンを正とし、自前の閉じるボタンは配置しない。
```

### A-5. §4.5.4 基準値 — 実測による改訂(P0-6。E-09否定)

```diff
-| 1セッション | 代表値 約258ポイント |
-| 1セッション想定範囲 | 約194〜320ポイント |
-| 20セッション/週 | 代表値 約5,160ポイント |
-| 20セッションが同一UTC時に集中 | 65,000ポイント/時の約7.9% |
+| 1セッション | 代表値 約157ポイント(P0-6実測: 一覧51+詳細60+users-bulk 1+thumbnail 302×30) |
+| 1セッション想定範囲 | 約142〜172ポイント(302応答のオブジェクト加点解釈に幅) |
+| セッション内2回目 | 0ポイント(全セッションキャッシュ) |
+| セッション跨ぎ2回目 | 約112ポイント(mediaはHTTP cacheで再要求なし — P0-1実証) |
+| 20セッションが同一UTC時に集中 | 65,000ポイント/時の約4.8%。飽和は約20テナント |
```

### A-6. §7.4/§7.5 表示シーケンス — Preview段の実態化(P0-1/P0-2帰結)

縮小レンディション配信が存在しないため、Preview bucket(1280/1920/2560/3840)は取得手段を持たない。

```diff
-(§7.4)Shell → Thumbnail → Preview → Original の3段
+(§7.4)Shell → thumbキャッシュ(w640)→ Original の2段。thumbキャッシュ未生成時はShell → Original(原寸fallback)
-(§7.5)PreviewはViewer内の表示領域と devicePixelRatio から必要画素数を算出し、次のbucketから最小の十分な値を選ぶ。1280 / 1920 / 2560 / 3840 px
+(§7.5)中間解像度のPreview bucketは配信手段が存在しないため廃止する(P0-1/P0-2実測)。Viewerの初期表示はthumbキャッシュ(w640)、確定表示はOriginalとする
```

(§18の「Preview bucket」「Thumbnail最大幅」行も同旨で整理: Preview bucket行を削除、Thumbnail最大幅→thumbキャッシュ幅に一本化)

### A-7. §11.1.1 — 観測ヘッダーへbeta 2種を追記(P0-6)

```diff
+- 公式のbetaヘッダー `Beta-RateLimit-Policy` / `Beta-RateLimit` も観測対象に含める(Phase 1でadapterの抽出対象へ追加)
```

## B. Phase0_Spec(L3)改訂diff

### B-1. WU-6作業7 — 除外の記録(ユーザー裁定 2026-09-19)

```diff
-7. `MG-09-Permissions` で、閲覧制限ページ・制限付きAttachmentが権限のあるユーザーにだけ表示されることを、developer siteの第2ユーザーで確認する。
+7. `MG-09-Permissions` で、閲覧制限ページが権限のあるユーザーに表示されることを確認する(権限あり側)。第2ユーザーによる権限なし側の確認は、developer siteへのユーザー追加不可のためPhase 0から除外し、Phase 5(リリース前)の課題として引き継ぐ(ユーザー裁定 2026-09-19)。
```

### B-2. §1.2 テストページ名の実体注記

```diff
+注: 実site上のスモークページ名は `MG_00_Smoke`(アンダースコア)である。
```

## C. 反映時の付随作業

1. §18整理(A-6に伴うPreview bucket行削除等)
2. ガイドとの不一致チェック(禁止事項の変更なし=リリース可否に影響なし)
