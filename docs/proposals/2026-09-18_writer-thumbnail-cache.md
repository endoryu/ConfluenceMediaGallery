# Proposal: 読み取り専用根幹の変更 — writer化とサムネイルキャッシュ書き戻し

- 日付: 2026-09-18
- 起案: Claude Code(WU-2 / ESC-WU2-01の裁定を受けて)
- 裁定者: ユーザー(2026-09-18の会話で方向を裁定済み。本文書はその正式化)
- 状態: **承認待ち**(承認後、ユーザー指示でL2/L3へ反映。別commit・本proposalのパスをcommit messageに記載)

## 1. 背景と裁定

WU-2(P0-1)の実測で以下が確定した:

1. 本アプリから到達可能な**縮小サムネイル経路は存在しない**。v2 thumbnail endpointのredirect先は`/file/{id}/binary`(原本配信)でwidth/height無効。legacy `/wiki/download/thumbnails/`も最新版原寸を配信。mediaの縮小endpoint(`/file/{id}/image`)は署名tokenを自前生成できず利用不可
2. 原寸配信のタイル表示はCold実測でload 600ms〜1.2s級(207kB JPEG、スロットリングなし・dev site)。8K級素材では大幅悪化が予想され、**性能憲法(V1 §13.1)と体感性能受け入れ条件(§13.3)を満たせない見込み**
3. HTTP cacheは完全に有効(同一URL再表示はネットワーク要求ゼロ)。痛点は「各ユーザーの初回表示」に限定される

ユーザー裁定(2026-09-18): **読み取り専用の根幹を変更しwriterアプリとする。設計は①編集時生成+②writer遅延生成+③原寸fallbackの組み合わせを正式承認。**

## 2. 承認済み設計の要旨

アプリが原寸画像からブラウザ内で縮小サムネイルを生成し、**ページ添付として書き戻す**。以降の全閲覧者(閲覧専用ユーザー含む)はその添付を読む。

| # | 機構 | 内容 |
|---|---|---|
| ① | 編集時生成 | macroは編集画面でもrenderされる。編集コンテキスト検出時に不足・陳腐化したthumbを生成・upload(編集者=必ず書き込み権限を持つ) |
| ② | writer遅延生成 | 閲覧時にthumb欠落/版ズレを検出し、**閲覧者に書き込み権限がある場合のみ**生成・upload。権限がなければ何もしない |
| ③ | 原寸fallback | thumbが無い間は原寸を直接表示(WU-2で実証済みの経路)。読者は常に閲覧可能 |

前提ゲート(未確定・Phase 0で確認):

- **G1: CORS pixel読み出し** — `crossorigin`付きロードと`canvas.toBlob()`(または`OffscreenCanvas.convertToBlob`)が media host に対して成立すること。**不成立なら本proposalは失効し再裁定**(WU-3にprobe追加)
- **G2: upload roundtrip** — `requestConfluence()`によるattachment作成・版更新・削除がCustom UIから成立すること(WU-6のscope upgrade後にprobe)

## 3. L2(V1仕様書)変更diff

### §2.1 V1に含む機能 — 行追加

```diff
+| キャッシュ | writerによる縮小サムネイル添付の生成・書き戻し(編集時+writer閲覧時)、版ズレ検出、原寸fallback |
```

### §2.2 V1以降の扱い — 行変更

```diff
-| Attachmentのアップロード、更新、削除、名称変更 | 別案件 |
+| ユーザーAttachmentのアップロード、更新、削除、名称変更 | 別案件(本アプリが書き込むのは自己管理のthumbキャッシュ添付のみ) |
```

### §3.3 権限 — 全面改訂

```diff
-API呼び出しはログイン中ユーザーとして行い、そのユーザーが閲覧できるAttachmentを表示する。V1は読み取り専用とし、以下のGranular Scopeを使用する。
-
-- `read:attachment:confluence`
-- `read:user:confluence`:詳細パネルで更新者の表示名を解決する場合のみ
+API呼び出しはログイン中ユーザーとして行い、そのユーザーが閲覧できるAttachmentを表示する。表示は全ユーザー、thumbキャッシュの生成・書き戻しは書き込み権限を持つユーザーのセッションでのみ行う(権限昇格なし。Forge Functionは引き続き恒久禁止)。以下のGranular Scopeを使用する。
+
+- `read:attachment:confluence`
+- `read:user:confluence`:詳細パネルで更新者の表示名を解決する場合のみ
+- `write:attachment:confluence`:thumbキャッシュ添付の生成・版更新・削除のみに使用する。ユーザーコンテンツの変更には使用しない
```

### §4.4 API — 行追加

```diff
+| thumbキャッシュupload | `POST /wiki/rest/api/content/{pageId}/child/attachment`(新規)/`POST .../attachment/{attachmentId}/data`(版更新)|
+| thumbキャッシュ削除 | `DELETE /wiki/rest/api/content/{attachmentId}`(自己管理thumbのみ) |
```

### §5.2 キャッシュキー — 追記

```diff
+thumbキャッシュ添付の命名は `mg-thumb.<attachmentId>.v<version>.w<width>.<jpg|png>` とし、
+ファイル名だけで対象・版・サイズを一意に判定できるようにする。一覧表示時、この命名規則に
+一致する添付はグリッドから除外し、対応する元Attachmentのタイル画像として使用する。
```

### §6.3 Thumbnailロード — 方針変更

```diff
-要求サイズはタイルの表示幅 × `devicePixelRatio` 以上となる最小size bucketを選ぶ。上限は640 pxとする。
+タイルはthumbキャッシュ添付(w320/w640)を優先ロードし、存在しない・版が古い場合は原寸を
+直接表示する(fallback)。要求bucketはタイル表示幅 × `devicePixelRatio` 以上の最小、上限640px。
+fallback表示中にwriter権限があれば生成・書き戻しを非同期で行い、次回以降の閲覧者に供する。
+生成処理は性能憲法(§13.1)の全項目より下位とし、表示をブロックしない。
```

### §12 セキュリティ・プライバシー — 変更

```diff
-- scopeはSection 3.3の2つとする。
+- scopeはSection 3.3の3つとする。write scopeの用途は自己管理のthumbキャッシュ添付に限定し、
+  ユーザーコンテンツを変更しない。削除対象は命名規則(§5.2)に一致する添付のみとする。
-- Marketplace listingのPrivacy & Securityタブの記載(保存データなし、外部送信なし、Forge storage不使用、egressなし)と実装を常に一致させ、
+- Marketplace listingのPrivacy & Securityタブの記載(保存データは顧客site内のthumbキャッシュ添付のみ、
+  外部送信なし、Forge storage不使用、egressなし)と実装を常に一致させ、
+- scope必要理由に `write:attachment:confluence`:縮小サムネイルキャッシュの生成 を追記。
```

### §14 実装前PoCゲート — 追加

```diff
+### P0-8 thumbキャッシュ書き戻し成立性
+確認事項: crossorigin付きメディアロードとcanvas.toBlob()の成立(G1)、requestConfluenceによる
+attachment新規作成・版更新・削除のroundtrip(G2)、生成thumbのnative <img>表示。
+合格条件: G1・G2がChromeで成立すること。G1不成立の場合、本機能を除外し原寸+メモリ内縮小構成へ
+戻す(再裁定)。
```

### §18 固定パラメータ — 追加

```diff
+| thumbキャッシュ幅 | 320 / 640 px(長辺fit) |
+| thumbキャッシュ形式 | JPEG品質0.8。元が透過PNG/GIF/SVGの場合はPNG |
+| thumb命名規則 | mg-thumb.<attachmentId>.v<version>.w<width>.<ext> |
+| 旧版thumbのGC | 新版thumb生成成功後、同attachmentIdの旧版thumbをwriterが削除 |
```

## 4. L3(Phase0_Spec)変更diff

```diff
 WU-3(P0-2)作業に追加:
+8. crossorigin付き<img>ロードとcanvas.toBlob()の成立性を確認する(G1。P0-8の前半)。
 WU-6(P0-5)作業に追加:
+9. manifest scopeへ write:attachment:confluence を read:user:confluence と同時に追加し、
+   upgrade時のscope差分をユーザーが確認する。upload/版更新/削除のroundtrip probe(G2)を実施する。
```

(scope変更のmanifest編集はWU-6の1回に束ね、§7「manifestの変更は1WUずつ」を維持する)

## 5. ハーネス・運用への影響(承認後に実施)

- `config/forge-cost-policy.json` の `allowedScopes` へ `write:attachment:confluence` を追加(保護対象変更。**裁定記録CSR-2026-004**をcost-surface-registerへ同時記録)
- CLAUDE.md冒頭の「読み取り専用アプリ」記述の更新(保護対象。ユーザー承認要)
- 課金への影響: なし(Forge billable capability使用ゼロ維持。書込みはrequestConfluence)。顧客siteのストレージをthumb分消費する事実をlisting/READMEに明記

## 6. 残リスク

- G1(CORS)不成立の場合は本proposal失効(P0-8で判定)
- Marketplace審査でwrite scopeの説明責任が増える(§12の限定記述で対応)
- 添付一覧のthumb混入は命名規則フィルタで自アプリからは秘匿できるが、**標準UIの添付一覧には見える**(仕様として受容し、listingへ明記)
