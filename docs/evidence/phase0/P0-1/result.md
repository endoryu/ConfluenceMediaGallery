# P0-1 Thumbnail直接表示 result(WU-2)

- 計測日: 2026-09-18
- commit: 0a1f551(probe v2.5.0系列。実装経緯は4ca43e0→594fb3b→f56f8c9→0a1f551)
- 環境: deploy済みdevelopment(ryu-dev.atlassian.net)
- ブラウザ: Chrome 152.0.7977.83(**Edgeは未実施**、下記)
- DPR: 1 / 画面解像度: 未記録 / ネットワークprofile: **スロットリング未適用**(時間系数値は参考値。合否判定は条件非依存の項目で実施)
- テストデータ: `MG-08-Versioning`(pageId 196658)att196666 = JPEG、4版(v1/v2=1498×1811、v3/v4=960×1200、原本202kB級)

## 確認事項ごとの結果(V1仕様書 §14 P0-1と1対1)

| 確認事項 | 結果 | 根拠 |
|---|---|---|
| 302先をnative `<img>`で表示できるか | **成立** | 全ロード成功(requests-chrome-cold.md #2→#3)。decode 7〜14ms |
| 認証cookie/tokenの引き継ぎ | **成立** | signed URL(`?token=`)へのredirectで追加認証なしに表示 |
| `width`/`height`/`version`の反映 | **width/height: 不成立、version: 成立** | width/heightはLocationに伝搬するがredirect先が`/file/{id}/binary`(原本配信)のため無効(320/640/width単独すべて原寸)。versionは正確(v指定で各版、無指定で最新。全4版で確認) |
| 同一URL再表示がHTTP cache hitになるか | **成立** | 再読込×3でDevToolsに302・binaryとも新規行なし=chain全体cache供給、load 0.1〜0.7ms |
| CSPに追加hostが必要か | **不要(現時点)** | `permissions.external`未宣言のままapi.media.atlassian.comからロード成立。CSP violationの体系的確認はWU-6 |

## 合否

**合格**(合格条件「ThumbnailまたはPreviewをnative image requestで表示できること」を満たす)。

ただし重要な但し書き: **本アプリから到達可能な縮小サムネイル経路は存在しない**(上申ESC-WU2-01)。

- v2 thumbnail endpoint → `/file/{id}/binary`(原寸)
- legacy `/wiki/download/thumbnails/{pageId}/{fileName}` → 最新版の原寸。`?width=`無効
- mediaの縮小endpoint(`/file/{id}/image`)は署名tokenを自前生成できず利用不可(Confluence本体のインライン極小サムネイルはこの経路)
- 外部proxy/CDNによる縮小は恒久禁止(CLAUDE.md §3)

## 上申事項

- **ESC-WU2-01**(続行): Thumbnail=原寸配信を前提とした設計改訂。詳細はWU完了報告の上申キュー参照。V1仕様書 §6.3(size bucket)・§7.5(Preview)・§18(Thumbnail最大幅)・§4.5.4(ポイント基準)へ影響。改訂案はWU-10で`docs/proposals/`へ
- 302 cache成立によりE-02(302が cacheされない懸念)は**否定**。2回目セッションのThumbnail再表示はAPIポイント消費0(WU-7の入力)

## 未実施と理由

- **Edge**: 未実施。Chrome分の判定確定を優先した。短縮手順(表示可否・cache挙動・1クリック)で別途実施する
- スロットリング適用条件での時間計測: 合否に影響しないため未実施。WU-7/WU-9の性能計測はガイド§8条件で実施する
- Warm(ページreload跨ぎのdisk cache)の系統的3回計測: 同一document内のcache hitは確認済み。reload跨ぎはEdgeラウンドで併せて確認する
- screenshot: 原本は`local/`(ユーザー保存)。sanitize済み版の整備はEdgeラウンド後にまとめて行う
