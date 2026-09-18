# P0-1(WU-2)Thumbnail直接表示 計測手順書

- 対象: deploy済みdevelopment(app v2.2.0以降)、`MG-00-Smoke` と `MG-08-Versioning`
- 分担: ブラウザ操作・DevTools読取・HAR取得=ユーザー、解析・表生成=Claude Code(ガイド§9)
- 条件(ガイド§8): Chrome現行→Edge現行の順で同一手順。throttlingは「カスタム: download/upload 100,000 kbit/s、latency 50 ms」を作成して適用

## 事前確認

- `MG-08-Versioning` の添付は**同名で2版以上**、かつ版どうしが**見た目で区別できる**画像であること(版検証を目視するため)
- screenshotやHARの**原本は必ず `local/` へ**(signed URLを含むためcommit・会話貼付禁止。会話へはJSON出力と読み値のみ)

## 手順(ブラウザごとに実施)

### A. Cold(初回)

1. macroのあるページ(`MG-00-Smoke`)を開き、F12 → Networkタブ → throttlingプロファイル適用
2. **「Disable cache」をON** → Application → Storage →「Clear site data」→ ページをreload
3. 画像行の**Thumbnail**ボタンをclick。probe表示を確認:
   - redirect probe の mode / status / Location(host+path) / Cache-Control / ETag
   - width=320 / 640 の画像とcaption(natural寸法、load/decode ms)
4. DevTools Networkで次を記録(メモでOK):
   - `thumbnail/download` 要求のstatus(302か)、**redirect先のhost名**
   - redirect先要求のstatusとSize列の値
5. Network右click →「Save all as HAR with content」→ **`local/` に保存**(ファイル名: `p0-1-<browser>-cold-<n>.har`)
6. 手順2〜5を**3回**繰り返す(Clear site dataから)

### B. Warm(2回目以降のcache確認)

1. **「Disable cache」をOFF**にしてページをreload
2. Thumbnailボタンをclick → probe内の**「同一URL再読込(cache確認)」を3回**click
3. 各回についてDevTools NetworkのSize列を記録。**302自体**と**redirect先**を分けて読む:
   - `(disk cache)` / `(memory cache)` / `304` / `200 + サイズ` のどれか
4. reloadから**3回**繰り返す

### C. version検証

1. `MG-08-Versioning` のページでThumbnailボタンをclick
2. 「version検証」セクションの3枚(`version=最新` / `version=旧` / `versionなし`)が期待どおりか目視:
   - 最新・versionなし → 新しい画像 / 旧版指定 → 古い画像
3. 結果をscreenshot(原本は `local/`)

### D. 提出

1. 診断パネル「JSONを出力」→ 内容をコピーして会話へ貼付(ブラウザごとに1回分)
2. B・Cの読み値(Size列、version目視結果)を箇条書きで会話へ
3. ブラウザversion(`chrome://version` / `edge://version`)、画面解像度、DPR(JSONのdevicePixelRatioでも可)を添える

## Claude Code側の後処理

- 貼付JSONと読み値から `requests-<browser>-<cold|warm>.md`(sanitize済みrequest table)と `result.md` を生成
- redirect先host一覧をWU-6の入力へ、302 cache挙動をWU-7の入力へ記録
