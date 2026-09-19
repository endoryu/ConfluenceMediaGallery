# WU-2 result(MediaItem整形・分類・thumbキャッシュ対応付け)

- 記録日: 2026-09-19
- 環境: ローカル単体テスト(jsdom不要のpure logic中心)。実site操作なし
- 対応L2: §5.1(MediaItem)、§5.2(命名・config・URL正規形)

## 確認事項と結果

| 確認事項(Phase1_Spec WU-2合格条件) | 結果 | 根拠 |
|---|---|---|
| 命名パース全分岐 | **成立** | `parseThumbcacheName`: 正例+負例10種(拡張子付き・要素欠落・非数値・大文字・前後置)を単体テスト |
| 版ズレ判定 | **成立** | `buildMediaModel`: 版一致のみ有効、旧版・対象喪失はstale(GC候補)へ分離 |
| グリッド除外 | **成立** | `mg_thumbcache_*`・config・非メディア(unsupported)を除外。controller統合テストで確認 |
| `mg_thumbcache_config` 読取 | **成立** | schema検証つきparse(壊れた入力6種はnull=命名スキャンへfallback)、不正ledgerエントリの黙殺、fetch失敗時null |
| 命名ガード(§5.3の前倒し) | **成立** | `assertThumbcacheWriteTarget`: 規則外ファイル名5種でthrow(負例テスト)。WU-5の書込み系はこれを必須経由とする |

## 実装

- [naming.ts](../../../src/gallery/thumbcache/naming.ts) — parse/build/ガード
- [config.ts](../../../src/gallery/thumbcache/config.ts) — 台帳・無効化フラグ・schemaVersion(正本は命名スキャン)
- [media-items.ts](../../../src/gallery/media-items.ts) — MediaModel構築、`pickThumbBucket`(表示幅×DPR以上の最小、上限640)、`selectThumb`(なければ原寸fallback=null)
- GalleryController: 一覧全件→MediaModel構築、結果にmodel(thumb対応表・stale・config参照)を追加

MediaItemの任意項目のうち `labels`(個別詳細)と `width/height/duration`(element metadata)は表示先(詳細パネル=Phase 4、Viewer=Phase 2)の実装時に取得する。メディアURLは引き続きadapterのURL builderのみを経由する(§5.2)。

## 合否

**合格**。verify:local GREEN(13 files / 64 tests、fixture 33/33)。gallery gzip 5.77 kB(予算40 kB)。

## 上申事項

なし。

## 未実施項目と理由

1. 実siteでのthumb対応付けE2E: 実データの`mg_thumbcache_*`はWU-5(生成)後に存在するため、WU-5のE2Eで確認する
