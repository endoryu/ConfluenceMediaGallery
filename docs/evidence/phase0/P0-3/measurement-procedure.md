# P0-3(WU-4)動画・音声 Range/seek 計測手順書

対象: deploy済みdevelopment(v2.11.0以降)、`MG-03-Video-Audio`。動画・音声の行では**Original**ボタンがMedia probe(video/audio要素)になります。転送量・Range/206の正本はDevToolsです。

## 1. 大容量MP4(faststart版)— 最重要

1. DevTools Networkを開き、フィルタに `download` と入力
2. `MG03-video-90MB-faststart.mp4` の行で **Original** ボタンをclick
3. **loadedmetadata時点の転送量**: probeのlogに `loadedmetadata: +◯ms` が出た時点で、Networkのmedia行(`download`)の**サイズ列の値**を読む(90MB全量か、数百KB〜数MBの部分かが焦点)
4. media行をclick → 「ヘッダー」タブで以下を報告:
   a. **ステータスコード**(206か200か)
   b. リクエストヘッダーに **`range:`** があるか(例: `bytes=0-`)
   c. レスポンスヘッダーに **`content-range:`** があるか
5. **スロットリングを「カスタム20Mbps」**(download 20000kbit/s, latency 100ms)に設定
6. probeの**「再生」**ボタン → 全量DL完了を待たずに再生が始まるか(bufferedが部分範囲のまま再生されることをprobeのbuffered表示で確認)
7. native controlsのシークバーで**未取得位置(例: 4分あたり)へseek** → 再生が継続するか+Networkに**新しい206行**が増えるか
8. **「連続seek(25→50→75%)」**ボタン → probeのseeked所要ms(3件)と、Networkに追加された206行の数
9. **「close相当」**ボタン → (任意)DevTools → Memoryタブ等でメモリが下がるか。難しければスキップ可
10. スロットリングを「制限なし」に戻す

## 2. moov末尾版MP4(比較)

1. `MG03-video-90MB-moovend.mp4` の行でOriginal
2. `loadedmetadata: +◯ms` の値と、その時点までにNetworkへ出たmedia行の**本数とステータス**(先頭+末尾の2本のRange取得が出るか)

## 3. 音声(MP3 / WAV / M4A)

1. 各行でOriginal → 再生 → シークバーで任意seek
2. 各形式について「再生可否 / seek可否」を一語ずつ

## 4. WebM / Ogg(再生可否のみ)

1. Chromeで各行 → 再生可否
2. Edgeで同じく再生可否

## 5. Edge(faststart MP4のみ)

1. Original → 再生開始 → 任意seek → 可否を報告

## 6. 提出

1. 上記1〜5の読み値・可否
2. 「JSONを出力」の内容(Chrome分)
