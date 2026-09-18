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
+thumbキャッシュ添付の命名は `mg_thumbcache_<attachmentId>_v<version>_w<width>` とし、
+**拡張子を付けない**(誤ダウンロード・誤アップロード・ユーザー画像との混同を防ぐ。
+表示はupload時に設定するContent-Typeで成立し、native <img>は拡張子に依存しない)。
+ファイル名だけで所有者(本アプリ)・対象・版・サイズを一意に判定できる。
+一覧表示時、`mg_thumbcache_` prefixの添付はグリッドから除外し、対応する元Attachmentの
+タイル画像として使用する。同名uploadはConfluence仕様により同一添付の版更新となるため、
+重複生成は「余分な版」に收束し実害を持たない(冪等命名)。
+
+ページ単位の整合データとして `mg_thumbcache_config`(拡張子なし・JSON)を同じ命名系で置く:
+生成済みthumbの台帳(attachmentId→version→widths→生成時刻)、ページ単位の生成無効化フラグ、
+schema version。**正本はあくまで命名規則に基づく添付一覧のスキャン**とし、configは高速化と
+設定の器である(壊れても添付スキャンから再構築可能)。この方式は追加scopeを要しない
+(content propertyを使う場合はwrite:page系scopeが増えるため不採用)。
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
+| thumbキャッシュ形式 | JPEG品質0.8。元が透過PNG/GIF/SVGの場合はPNG(いずれも拡張子なし、Content-Typeで指定) |
+| thumb命名規則 | mg_thumbcache_<attachmentId>_v<version>_w<width>(拡張子なし) |
+| 整合データ | mg_thumbcache_config(JSON、ページごと1つ。台帳+ページ単位無効化フラグ) |
+| 旧版・孤児thumbのGC | writer実行時に命名規則スキャンで検出し削除(新版生成後の旧版、元Attachment消滅分) |
+| 生成の協調 | BroadcastChannelによるclaim(先着1 instance)+冪等命名。claim待ちjitter 50-250ms |
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

## 6. 副作用への対策(2026-09-18 ユーザー提案を反映)

| 副作用 | 対策 |
|---|---|
| 標準UIでの混同・誤DL/誤UL | `mg_thumbcache_` prefix+**拡張子なし**命名で所有者を明示し、画像として誤操作されない |
| 同時アクセスの重複生成 | 冪等命名(同名upload=版更新に收束)+BroadcastChannel claim協調(§7.2) |
| 版更新時の旧版・孤児 | writer実行時の命名規則スキャンでGC(元Attachment消滅分も検出・削除) |
| watcher通知・検索汚染 | 生成をwriterセッションに限定し頻度を最小化。通知抑制はAPI上不可のため残留(listing明記) |
| ユーザービリティ | 手動キャッシュクリア(macro内、writer限定表示)+ページ単位の生成無効化フラグ(`mg_thumbcache_config`) |
| site単位の無効化 | **V1では提供不可**。site全域設定の置き場がForge storage(恒久禁止)以外に存在しないため。ページ単位フラグ+アンインストールで代替し、listingへ明記。V1.1でglobalSettingsモジュール+設定の置き場を再検討 |

## 7. 未決事項の裁定案(2026-09-18 追記)

### 7.1 macro削除後のthumb削除経路 — 自動解決は原理的に不可能

macroがページから消えると、そのページで本アプリのコードが実行される契機が消滅する。実行契機を
持てるForge Trigger/Functionは恒久禁止のため、**「最後のmacro削除後の自動掃除」は本プロジェクトの
制約下に解が存在しない**。以下の緩和で受容する:

1. **事前クリア導線**: macro内の「キャッシュをクリア」ボタン(writer限定)を「macroを外す前に押す」
   運用としてREADME/listingに明記
2. **手動掃除の容易性**: `mg_thumbcache_` prefixにより標準の添付一覧から一括選別・削除が容易
3. **再追加時の自己修復**: macroを再追加すれば初回writer実行で台帳再構築・孤児GCが走る
4. **残骸の定量的軽さ**: thumbは1画像あたり2ファイル・数十KB級。残留しても容量・表示への実害は小さい
5. (任意・アプリ外)顧客admin向けにConfluence Automationで`mg_thumbcache_`添付を定期削除する
   レシピを文書提供できる(本アプリの機能ではない)

### 7.2 同一ページへの複数macro配置 — 協調プロトコルで解決

1. **冪等命名が最終防衛線**: 二重生成が起きても同名uploadは版更新に收束し、表示・容量への実害なし
2. **BroadcastChannel協調**: 同一アプリのmacro iframeは同一originのため、`BroadcastChannel`で
   instance間通信が可能(ネットワークAPIではなく恒久禁止に非抵触)。生成前に対象attachmentIdの
   claimを放送し、50-250msのjitter内に先着claimがあれば辞退する。生成結果も放送して他instanceの
   再取得を省く
3. **設定の一元化**: 無効化フラグ等はmacro instanceごとではなく`mg_thumbcache_config`(ページごと
   1つ)に置き、どのinstanceから変更しても全instanceに適用する
4. 表示自体は各instanceが独立に行う(read側は競合概念がない)

## 8. 残リスク

- G1(CORS)不成立の場合は本proposal失効(P0-8で判定)
- Marketplace審査でwrite scopeの説明責任が増える(§12の限定記述で対応)
- 添付一覧のthumb混入は標準UIに見える+watcher通知は抑制不可(仕様として受容し、listingへ明記)
- macro削除後の残骸は§7.1の緩和策による受容(自動掃除は不可能)
