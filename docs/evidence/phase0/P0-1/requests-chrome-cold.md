# P0-1 request table(Chrome / Cold中心。sanitize済み)

- 取得日: 2026-09-18。Chrome 152.0.7977.83、DPR 1、スロットリング未適用(時間は参考値)
- 環境: deploy済みdevelopment(ryu-dev.atlassian.net)、ページ `MG-08-Versioning`(pageId 196658)、添付 att196666
- 正本: ユーザーのDevTools目視+診断パネルJSON。HAR原本は `local/`。queryはすべて除去済み

| # | host / path | initiator | status | size | 備考 |
|---|---|---|---|---|---|
| 1 | ryu-dev.atlassian.net `/wiki/api/v2/pages/196658/attachments` | requestConfluence | 200 | - | レート制限系ヘッダー出現なし |
| 2 | ryu-dev.atlassian.net `/wiki/api/v2/attachments/att196666/thumbnail/download` | img | 302 | 約1.9kB(実転送) | Locationは`api.media.atlassian.com/file/{fileId}/binary`。**width/height queryは伝搬するが/binaryのため無効** |
| 3 | api.media.atlassian.com `/file/{fileId}/binary` | img(redirect先) | 200 | **207〜208kB(実転送)** | 原寸配信(当時の最新版1498×1811、原本202kB)。DevToolsプレビューで1498×1811確認 |
| 4 | (同一URL再読込 ×3) | img | - | **行なし** | 302・binaryとも新規要求なし=redirect chain全体がブラウザcacheから供給 |
| 5 | ryu-dev.atlassian.net `/wiki/download/thumbnails/196658/{fileName}` | img | 200 | バイト数未計測 | **最新版の原寸を配信**(縮小なし)。`?width=320/640`無効 |
| 6 | forge.cdn.prod.atlassian-dev.net(bridge/iframeResizer) | script | 200 | -(TAOなし) | アプリ基盤。partial=true |
| 7 | *.cdn.prod.atlassian-dev.net(アプリassets) | script | 200 | 3.4kB+28.0kB | 自前bundle+vendor-bridge |

## 計測値(診断パネルJSON、参考値)

| 項目 | 値 |
|---|---|
| img load(Cold、302+binary 207kB) | 1215ms(初回)/ 681〜743ms(2回目以降の別URL) |
| decode() | 6.9〜14.3ms |
| 同一URL再表示 | load 0.1〜0.7ms(cache hit、ネットワーク要求ゼロ) |
| requestConfluence redirect:manual | 不可(error。fallbackの通常requestで追従) |
