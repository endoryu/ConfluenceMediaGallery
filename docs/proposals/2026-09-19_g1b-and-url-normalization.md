# Proposal(addendum): P0-8 G1定義のG1b経路への改訂とURL正規化

- 日付: 2026-09-19
- 起案: Claude Code(WU-3実測を受けて。親proposal: 2026-09-18_writer-thumbnail-cache.md)
- 状態: 承認待ち

## 背景(WU-3実測)

1. G1(crossorigin+canvas)は不成立: CORSヘッダーがなくcrossoriginロード自体が失敗、taintedでtoBlob不可
2. **G1b(bridge blob経路)が成立**: `requestConfluence`→`response.blob()`→`createImageBitmap`→canvas縮小→`toBlob`。JPEG 152KB→縮小21KBの生成に成功。cross-origin画像をcanvasへ直接入れないためtaintが発生しない
3. ただし40MB PNGはbridge取得失敗(応答サイズ/転送限界とみられる)→ 大容量は生成スキップ+原寸fallback
4. `downloadLink`(v2 `_links`)は`/wiki`ベース相対で、実体はv1 download endpointの別表記+付加query。付加queryは別cache entryを生む

## L2変更diff

### §14 P0-8 — G1定義の置換

```diff
-- `crossorigin` 付きメディアロードと `canvas.toBlob()`(または `OffscreenCanvas.convertToBlob`)の成立(G1)
+- G1: `requestConfluence()` で取得したBlobからの `createImageBitmap` → canvas縮小 → `toBlob()` の成立
+  (crossorigin+canvas直接経路はCORSヘッダー不在のため不成立と確定済み。WU-3実測)
+- G1の容量条件: bridge取得に失敗する大容量ファイルは生成対象外とし、原寸fallbackで表示する。
+  取得可能サイズの閾値特定とRange分割取得の採否はPhase 1で行う
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
