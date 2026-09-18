# Proposal(addendum): P0-8 G1定義のG1b経路への改訂とURL正規化

- 日付: 2026-09-19
- 起案: Claude Code(WU-3実測を受けて。親proposal: 2026-09-18_writer-thumbnail-cache.md)
- 状態: 承認待ち

## 背景(WU-3実測)

1. G1(crossorigin+canvas)は不成立: CORSヘッダーがなくcrossoriginロード自体が失敗、taintedでtoBlob不可
2. **G1b(bridge blob経路)が成立**: `requestConfluence`→`response.blob()`→`createImageBitmap`→canvas縮小→`toBlob`。JPEG 152KB→縮小21KBの生成に成功。cross-origin画像をcanvasへ直接入れないためtaintが発生しない
3. 40MB PNGはbridge一括取得に失敗するが、**G1c: Range分割取得で成立**: v1 download endpointはRange完全対応(206+Content-Range)。40,112,676 bytesを4MB×10chunk・7.4秒で全量取得し、縮小25,803 bytes(JPEG)の生成に成功。**大容量の生成スキップは不要**
4. legacy download経路(`/wiki/download/attachments/`)はbridge経由401で不成立。legacy thumbnails経路のサーバー側renditionは8Kでも原寸(縮小なし)
5. `downloadLink`(v2 `_links`)は`/wiki`ベース相対で、実体はv1 download endpointの別表記+付加query。付加queryは別cache entryを生む

## L2変更diff

### §14 P0-8 — G1定義の置換

```diff
-- `crossorigin` 付きメディアロードと `canvas.toBlob()`(または `OffscreenCanvas.convertToBlob`)の成立(G1)
+- G1: `requestConfluence()` で取得したBlobからの `createImageBitmap` → canvas縮小 → `toBlob()` の成立
+  (crossorigin+canvas直接経路はCORSヘッダー不在のため不成立と確定済み。WU-3実測)
+- G1の容量条件: bridge一括取得に失敗する大容量ファイルはRange分割取得(4MB×N、Content-Range結合、
+  上限128MB)で取得する(WU-3実測: 40MB PNG=10chunk/7.4秒→縮小25.8KB成立)。Range失敗・上限超過時
+  のみ生成をスキップし原寸fallbackとする。生成は性能憲法の全項目より下位でwriterセッションのみ
```

### §18 — thumb生成取得方式の行追加

```diff
+| thumb生成の素材取得 | requestConfluence一括→失敗時Range分割4MB×N(上限128MB)。それも失敗なら生成スキップ |
```

### §5.1 MediaItem `downloadLink` 行 — 改訂(E-04帰結)

```diff
-| `downloadLink` | 必須 | P0-2で確定した正本(v1 download endpointのURL、または一覧レスポンスの `downloadLink`/`_links.download`)。UIでの使用はP0-2確定後 |
+| `downloadLink` | 必須 | 正本はv1 download endpointの正規形URL(`/wiki/rest/api/content/{pageId}/child/attachment/{attachmentId}/download?version={n}`)。一覧レスポンスの `_links` は `/wiki` ベース相対の同一endpoint別表記であり、付加queryがHTTP cacheを分割するため直接使用しない(P0-2確定) |
```

### §5.2 — 追記

```diff
+メディアURLは上記正規形に一元化する。同一リソースを指す別表記・付加query付きURLは
+別cache entryとなり再転送を生むため、UIコードは必ずadapterのURL builderを経由する。
```

## L3変更

なし(WU-6のG2手順は親proposalのまま。G2のupload素材はG1b経路で生成したBlobを使用する)。
