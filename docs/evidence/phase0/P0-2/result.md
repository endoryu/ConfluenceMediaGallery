# P0-2 Original画像直接表示 result(WU-3)

- 計測日: 2026-09-18〜19
- commit: 786d5ef(probe v2.6.0→v2.7.0)
- 環境: deploy済みdevelopment(ryu-dev.atlassian.net)
- ブラウザ: Chrome 152.0.7977.83 / Edge 153.0.4234.32、DPR 1、スロットリング未適用(時間系は参考値)
- テストデータ: `MG-02-High-Resolution`(pageId 360652。8K PNG 40MB=att66165、1024×1024 ×2)、`MG-08-Versioning`(att196700系、JPEG 152KB、4版)

## 確認事項ごとの結果(V1仕様書 §14 P0-2と1対1)

| 確認事項 | 結果 | 根拠 |
|---|---|---|
| v1 download endpointの302先をnative `<img>`で表示 | **成立** | 8K PNG: natural 8192×8192、load 1061ms、decode 168ms。1024²/960×1200も成立 |
| 一覧レスポンスの`downloadLink`を同条件で表示。成立した方を正本 | **成立(条件付き)** | v2 `_links`は`/wiki`ベース相対で、`/wiki`前置で解決すれば表示成立(8K: load 2743ms、decode 374ms)。実体は**v1 endpointと同一endpoint**の別表記+付加query。付加queryは別cache entryを生む(再転送発生)ため、**正本=v1 download endpoint(versionのみの正規形URL)** |
| 版更新後に新版のHTTP cacheが使われるか | **成立** | version=旧で旧コンテンツ(load 355ms=実取得)、version無指定=最新(load 0.2ms=**最新版のcache entryを共有**) |
| 8K PNG/JPEGでprogressiveな転送・decode・再表示が安定 | **decode・再表示は安定**(decode 168〜374ms、long freeze等の異常なし)。progressive描画は**発生せず完成後一括表示**(目視。V1 §7.4の段階ロード設計はThumbnail→Original差し替えで担保する前提を維持) | 診断JSON+目視 |
| Gallery hover要求とViewer要求の同一cache entry再利用 | 未実施(WU-5完了後にL3作業6として実施) | — |

## 合否

**合格**(Originalのnative表示成立+再転送抑制の根拠: version無指定ロードのcache共有0.2ms、およびP0-1で実証済みのredirect chain全体のcache供給)。

## G1/G1b判定(P0-8前半、writer化proposalの前提ゲート)

| 経路 | 結果 |
|---|---|
| G1: `crossorigin`付き`<img>`→canvas.toBlob | **不成立**。CORSヘッダーなしでcrossoriginロード自体が失敗。通常ロード+canvasはtainted(SecurityError)— 3添付で再現 |
| **G1b: requestConfluenceでblob取得→createImageBitmap→canvas縮小→toBlob** | **成立**(一括取得はサイズ限界あり)。JPEG 152,640 bytes → 縮小Blob 21,047 bytes(image/jpeg)生成成功。40MB PNGは一括取得失敗(204 preflight → fetch failed) |
| **G1c: Range分割取得(4MB×N)→結合→縮小** | **成立**。v1 endpointはRange完全対応(`status=206`、`Content-Range: bytes 0-1023/40112676`)。**40,112,676 bytesを10chunk・7,362msで全量取得→縮小25,803 bytes(JPEG)生成成功** |
| (参考)legacy download経路のbridge取得 | 不成立(401) |
| (参考)legacy thumbnailsのサーバー側rendition | 8Kでも原寸(縮小renditionは存在しない) |

**判定: thumbキャッシュ書き戻しは全ファイルサイズで実装可能**(通常はG1b一括、bridge限界超はG1cのRange分割)。生成スキップが必要なのはRange失敗・128MB超のみで、その場合は原寸fallback(承認済み設計③)。P0-8のG1定義改訂はaddendum proposal参照。

## 上申事項

- ESC-WU3-01(続行): P0-8 G1定義の改訂+downloadLink正規化の§5.1/§5.2追記(`docs/proposals/2026-09-19_g1b-and-url-normalization.md`)
- E-04帰結: `downloadLink`は使用可能だが正本はv1 endpoint正規形(Section 5.1改訂はWU-10で本改訂に併合)

## Edge確認(短縮項目)

| 項目 | 結果 |
|---|---|
| 8K Original native表示 | **成立** |
| 同一URL再読込のcache | **初回の再読込のみ新規行(再検証)、以降は行なし**=2回目以降の再転送抑制成立 |

## 未実施と理由
- Cold/Warm系統3回計測・スロットリング条件: WU-7の標準セッション計測に統合
- bridge一括取得のサイズ上限の閾値特定: Range分割で全サイズ対応が確定したため優先度低(Phase 1で必要になれば計測)
- hover→Modal間cache再利用: WU-5完了後(L3作業6)
- DevTools Memory計測: 任意項目のためスキップ(decode時間で代替)
