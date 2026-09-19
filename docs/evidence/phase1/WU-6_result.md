# WU-6 result(hoverタイトル・状態表示)

- 計測日: 2026-09-19
- 環境: deploy済みdevelopment、Windows 11、E2E半自動
- ブラウザ: Chrome/Edge(channel)。DPR=1、スロットリングなし
- 対象ページ: MG-05-Perf-50(hover系)、MG-10-Empty(空状態。新規作成 pageId=721197)

## 確認事項と結果

| 確認事項(V1 §6.4/§11/§11.1.2) | 結果 | 根拠 |
|---|---|---|
| タイトル要素は初回DOM生成時から存在 | **成立** | WU-3実装+E2E(非hover時も要素あり・visibility:hidden) |
| :hover/:focus-visibleで即時表示、下端半透明背景 | **成立** | E2E: hoverでvisible、別タイルhoverで解除、キーボードfocusでvisible(両ブラウザ)。transition不使用 |
| 1行ellipsis+アクセシブル名 | **成立** | computed nowrap/ellipsis、aria-label=title(WU-1〜3実装) |
| 空状態「表示できる画像・動画・音声はありません」 | **成立** | E2E(MG-10-Empty): data-state=empty、タイル0 |
| 一覧失敗=短いメッセージ+Retry | **成立** | 単体(WU-1)+今回文言整備 |
| 一部ページ取得失敗=取得済み維持+「一部を取得できませんでした」+Retry | **成立(単体)** | controller: 途中失敗でreset せず、メッセージ切替 |
| 401/403=権限不足表示(Retryなし) | **成立(単体)** | state=forbidden、「添付を表示する権限がありません」 |
| 429=§11.1.2(混雑中+Retry-After目安+手動再読み込み) | **成立(単体)** | state=blocked、「約N秒後に再読み込みできます」+再読み込みbutton。初期ロード前Blockedも同表示 |
| Thumbnail失敗=種別別placeholder+タイトル維持 | **成立(単体)** | □/▶/♪ placeholder、タイトル要素維持、tile click=個別Retry(WU-4) |
| console出力0 | **成立** | E2E: gallery bundle起因のconsole message 0件(両ブラウザ) |

## 発見(記録)

OOPIF(macro iframe)では、親frame側へのマウス移動がiframeへ配送されず、`:hover`状態が残留する(実ユーザーの移動では発生しない自動化特有の挙動)。E2Eではiframe内の別要素へのhoverで解除を検証した。Phase 3のhover先読み(pointerenter/leave)設計時に、leave未発火ケースの考慮として参照のこと。

## 合否

**合格**。verify:local GREEN(93 tests、fixture 33/33)。gallery gzip 10.09 kB / CSS 0.83 kB(予算40/10 kB)。

## 上申事項

なし。

## 未実施項目と理由

1. 401/403・429・一部失敗の実site再現: developer siteで意図的に発生させる手段がない(レート枯渇再現は§3で禁止)。単体テストで全分岐を検証済み
2. 削除済み(404)タイルの実機確認: 版更新・削除が自然発生した際に確認(WU-4のerror経路と同一実装)
