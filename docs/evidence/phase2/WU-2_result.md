# WU-2 result(画像2段表示)

- 計測日: 2026-09-20
- 環境: deploy済みdevelopment、Windows 11、E2E半自動(LAN実測)
- ブラウザ: Chrome/Edge(channel)。DPR=1
- 対象ページ: MG_00_Smoke(28画像、thumb生成済み)

## 確認事項と結果

| 確認事項(V1 §7.4/§11 / Phase2_Spec WU-2) | 結果 | 根拠 |
|---|---|---|
| thumb(w640)即設定→Original preload+decode→次frameで一度だけswap | **成立** | 単体(swapはraf 1回のみ・raf前は前段維持)+E2E(mark `p2.viewer.original-swap`、swap後src=元attachmentの正規形、naturalWidth>0) |
| GalleryとthumbURL一致(HTTPキャッシュ再利用狙い) | **成立** | 同じ正規形builder(v1DownloadPath)を共用 |
| Original失敗時はthumb表示を維持 | **成立(単体)** | preload error→thumb維持・エラーUIなし |
| すべて失敗時はエラーfallback+Retry+「Originalを開く」/ダウンロード | **成立(単体)** | 3導線の生成・Retryで該当要求のみ再実行(§11) |
| 原寸fallback(thumbなし)は1段直接表示 | **成立(単体)** | preload未生成を確認 |
| ナビ後のstale preload破棄(世代トークン) | **成立(単体)** | showItem後に旧preload完了→差し替わらない(WU-3の前提) |
| 差し替え中も常に前段画像を表示(§13.3) | **成立** | swapはsrc差し替えのみ(要素置換なし)。E2Eでswap後も表示継続 |
| Original preload lane同時1(§9.2) | **成立** | render毎に単一preload。並行なし |

## プロセス記録(逸脱と是正)

FCP-SRC-HANDLER-RETHROWの新規検出(imgのerrorリスナー+開発時assert throwの組合せをルールが検知)に対し、コード側からthrowを除去して適合(§8.4の趣旨どおり。ハーネスは無変更)。**是正前に検証とdeployを`;`連結したコマンドでRED状態のbuildが一度deployされた**(§7違反、影響は当該throw有無のみで請求面への影響なし)。GREEN確認後に即時再deployし、以後deployはGREEN確認後の独立コマンドとする。

## 合否

**合格**。verify:local GREEN(20 files / 117 tests、fixture 33/33)。E2E 4/4(Chrome/Edge)。viewer bundle gzip 2.42 kB / CSS 0.66 kB(予算55/12 kB)。

## 上申事項

なし(§7逸脱は上記のとおり自己是正・記録済み。裁定不要と判断するが、必要なら指示を乞う)。

## 未実施項目と理由

1. 失敗系(Original失敗・全滅)の実機E2E: 実siteで安全に失敗を再現する手段がない(単体で全分岐)。版更新等で自然発生時に確認
2. thumb→swapのタイミング系統計測: WU-5
