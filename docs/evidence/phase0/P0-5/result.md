# P0-5 CSP/egress/Runs on Atlassian適格性 result(WU-6)+ P0-8後半(G2)

- 計測日: 2026-09-19
- commit: d64731e系列(app v3.0.0→v5.1.0)
- 環境: deploy済みdevelopment(ryu-dev.atlassian.net)
- ブラウザ: Chrome 152 / Edge 153(E2E自動計測、ガイド§7.1半自動方式)
- 原本: `local/e2e-results/p0-5-*.json`、`p0-8-g2-*.json`

## 確認事項ごとの結果(V1仕様書 §14 P0-5と1対1)

| 確認事項 | 結果 | 根拠 |
|---|---|---|
| リダイレクト先hostの一覧 | **`api.media.atlassian.com`(/file/{id}/binary)のみ**。アプリ配信は`forge.cdn.prod.atlassian-dev.net`/`*.cdn.prod.atlassian-dev.net`(egress対象外のプラットフォーム配信) | P0-1〜P0-3の全request記録+本計測 |
| `permissions.external`未宣言で全種別ロード | **成立**。画像(thumbnail/original)・動画・音声すべて宣言ゼロでロード済み。**アプリ起因CSP violation: 0件**(Chrome/Edge。Confluence本体のノイズ227〜236件は発生元判別で対象外と確認) | CSP自動収集E2E |
| Runs on Atlassian適格 | **成立**(v2.0.0〜v5.1.0の全deployで適格表示) | forge deploy出力 |
| `forge lint` | **成立**(全deployでNo issues) | deploy出力 |
| scope追加時のupgrade手順 | **記録済み**: manifest変更→`forge deploy --approve MAJOR_VERSION_RULE`(scope変更はメジャー更新)→`forge install --upgrade`で**ユーザーがscope差分を対話確認**(計3回実施) | 本WU実績 |
| `read:attachment:confluence`のみで一覧・thumbnail・download | **成立**(v2.x期の実測=P0-1/P0-2/P0-3はこのscope単独で取得) | 各result.md |
| users-bulk(`read:user:confluence`) | **成立**(1件解決、Chrome/Edge) | scope probe |
| 権限別表示(MG-09) | **権限あり側: 成立**(read/update制限=本人のみのページで一覧表示)。**権限なし側(第2ユーザー)はユーザー裁定によりPhase 0スコープ除外**(下記) | E2E+裁定 |

## 確定したscopeセット(実測+公式docsで裏取り)

| scope | 用途 | 根拠 |
|---|---|---|
| `read:attachment:confluence` | 一覧・thumbnail・download | P0-1〜3 |
| `read:user:confluence` | users-bulk(更新者名) | 本計測 |
| `write:attachment:confluence` | thumbキャッシュupload/版更新 | G2 |
| `read:content-details:confluence` | v1 attachment作成の必須ペア(欠くと401「scope does not match」) | G2実測+docs |
| `delete:attachment:confluence` | thumbキャッシュGC(v2 delete) | G2実測(v1 deleteは401のためv2使用) |

## P0-8後半: G2 write roundtrip

**成立(Chrome/Edge)**: `mg_thumbcache_g2probe_v1_w320`(拡張子なし)を upload 200 → 版更新 200 → 削除 204。

実測による設計修正2点(WU-10のL2 batch proposalへ):

1. **v1 POST(新規作成)は同名添付で400**を返し自動版更新しない。冪等な作成or版更新は**PUT `/child/attachment`(create-or-update)**が正解 → §5.2「冪等命名」の機構記述を修正
2. 削除は**v2 `DELETE /wiki/api/v2/attachments/{id}`**を使用(§4.4のAPI表を修正)

## 合否

**合格**(合格条件「egress宣言ゼロ・最小scopeで動作し、Runs on Atlassian適格であること」)。E-08(egress宣言なしにロードできない種別)は**否定**。

## 上申・積み残し

1. **積み残し(ユーザー裁定 2026-09-19)**: 第2ユーザーによる権限なし側の表示確認は、developer siteへのユーザー追加が不可能なためPhase 0スコープから除外。**リリース前(Phase 5)の課題**として引き継ぐ(L3 WU-6作業7の改訂はWU-10 batch)
2. WU-10 L2 batch項目: §3.3 scope表(5 scope化)、§4.4 API表(PUT create-or-update、v2 delete)、§5.2冪等命名の機構、E-06(§7.2ヘッダー正)

## 未実施と理由

1. 権限なし側の表示確認: 上記積み残し裁定のとおり
2. redirect先hostのallowlist検証ロジック実装: Phase 1(初期値`api.media.atlassian.com`はpolicyの`runtimeAllowlist.mediaHosts`へ確定済み)
