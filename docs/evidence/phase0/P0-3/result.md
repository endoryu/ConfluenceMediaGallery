# P0-3 動画・音声Range/seek result(WU-4)

- 計測日: 2026-09-19
- commit: 8c76989(probe v2.11.0+E2E自動計測ハーネス)
- 環境: deploy済みdevelopment(ryu-dev.atlassian.net)。**ガイド§7.1の半自動E2E**(ユーザーがheaded loginでstorageState作成→Playwrightが非破壊probe自動実行)による初の自動計測
- ブラウザ: Chrome 152 / Edge 153(Playwright channel、headless、viewport 1280×720、DPR 1)
- ネットワークprofile: スロットリング未適用。「全量DL前の再生開始」は転送速度に依存しない証拠(playing時点のbuffered≪duration、全量取得完了前のstream中断+seek時の新規Range)で判定
- テストデータ: `MG-03-Video-Audio`(pageId 196714)。90MB MP4×2(faststart/moov末尾)、MP3/WAV/M4A/Ogg/WebM(合成メディア、local/mg03から添付)
- 原本データ: `local/e2e-results/p0-3-*.json`(Chrome/Edge各7テスト、全14ファイル)

## 確認事項ごとの結果(V1仕様書 §14 P0-3と1対1)

| 確認事項 | 結果 | 根拠 |
|---|---|---|
| `preload=metadata` 時の取得byte数 | **faststart: metadata +610ms**(先頭streamのみ)/ **moov末尾: +1459ms**、先頭64KB相当+**末尾Range 2本**(bytes=91062272-、91160576-)を要した | request table参照 |
| 再生開始 | **全量DL前に開始**: playing +885ms時点で buffered **3.9s / 300s**(全量91.4MBの約2%) | statePlaying実測 |
| 任意位置seek | **成立**: 90%地点(270s)へのseekで**新規206**(`Range: bytes=81231872-`)発行、407msでseeked完了、再生継続 | request table |
| 連続seek時の再取得範囲 | **成立**: 25/50/75%への連続seekで各オフセットからの206を3本発行(bytes=23101440- / 45842432- / 68583424-) | request table |
| Viewer close時のbuffer解放 | pause→src解除→load()の実行を自動確認。**メモリ実測は未実施**(下記) | probe log |

音声・その他形式:

| 形式 | Chrome | Edge |
|---|---|---|
| MP3 | 再生○ seek○(seeked 252ms) | ○(242ms) |
| WAV | 再生○ seek○(223ms) | ○(235ms) |
| M4A | 再生○ seek○(233ms) | ○(239ms) |
| WebM(VP8) | 再生○ | 再生○ |
| Ogg(Vorbis) | 再生○ | 再生○ |

## sanitize済みrequest table(faststart MP4、Chrome。queryなし)

| # | host/path | status | Range(req) | Content-Range | bytes |
|---|---|---|---|---|---|
| 1 | ryu-dev.atlassian.net `/wiki/rest/api/content/{pageId}/child/attachment/{id}/download` | 302 | `bytes=0-` | - | 0(Rangeヘッダーがredirectへ伝搬) |
| 2 | api.media.atlassian.com `/file/{id}/binary` | **206** | `bytes=0-` | `bytes 0-…/91371687` | stream(browserが必要分で中断) |
| 3 | 同上(90%seek) | **206** | `bytes=81231872-` | `bytes 81231872-…` | 10.1MB |
| 4-6 | 同上(連続seek 25/50/75%) | **206**×3 | 各オフセット | 各オフセット〜 | - |

moov末尾版: #2の後に**末尾Range 2本**(318KB/220KB)→ `bytes=65536-` 再開、の計4本の206でmetadata確定。

## 合否

**合格**(合格条件「検証用大容量MP4で全量download完了前に再生開始とseekが可能」— Chrome/Edge両方で成立)。V1 §7.6のリリースゲート「Original URLがRange対応でseek時206」も成立。E-05(Range不成立)は**否定**。

## 付随する知見

1. Rangeヘッダーは302 redirect chainを通じてmedia `/binary` へ正しく伝搬し、mediaはaccept-ranges: bytesで任意オフセット206を返す(WU-3のG1c Range分割の裏付けと一貫)
2. moov末尾ファイルはmetadataに+849ms・追加Range 2本のコストを払う → Phase 1の実装知見: 生成するthumbは問題外だが、V1 §7.6の記述変更は不要(native実装がそのまま処理)
3. 自動計測ハーネス(1ラウンド約45秒/ブラウザ)が確立し、以後のWU-7/WU-9計測の主経路にできる

## 未実施と理由

1. buffer解放後のメモリ実測(DevTools Memory): 手動専用手段のため未実施。src解除+load()の実行は自動確認済み。必要ならWU-9の手動セッションで併せて目視する
2. スロットリング条件付き計測: 合否が転送速度非依存の証拠で確定したため省略。WU-7/WU-9の性能計測はガイド§8条件で実施する
