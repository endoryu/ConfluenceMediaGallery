# P0-2(WU-3)Original直接表示 計測手順書

- 対象: deploy済みdevelopment(v2.6.0以降)、`MG-02-High-Resolution`(1080p/4K/8K)、`MG-08-Versioning`
- 各行の**Original**ボタンがWU-3 probeです。P0-1で確認済みの操作(DevTools、Size列の読み方)は同じ

## A. 正本候補の比較(MG-02の各画像で1回ずつ)

1. 1080p/4K/8Kの各行でOriginalボタンをclick
2. probe表示の以下を報告:
   - redirect probe(mode / status / Location host+path / Cache-Control)
   - `v1 endpoint` と `downloadLink` のcaption(natural寸法、load/decode ms)。**どちらが成立したか**が正本確定の材料です
3. 8K行では、読込中に**画像が段階的に描画されるか(progressive)**を目視で報告
4. (任意)DevTools → 「メモリ」タブ等でロード前後のメモリ増を確認できれば理想。難しければスキップ可

## B. cache確認(8K行で)

1. 「同一URL再読込」×3回 → DevToolsに新しい行が出るか(302側/media側を分けて)

## C. version検証(MG-08の行で)

1. Originalボタン → version検証セクション(旧版/versionなし)の見た目とnatural値

## D. G1: CORS読み出し(自動表示)

probe末尾の「G1: CORS読み出し(canvas.toBlob)」の表を**そのまま報告**してください(crossoriginロード / Blob取得 / size / taintedエラー / note)。**これがproposalの前提ゲートで、最重要項目です。**

## E. 提出

- 「JSONを出力」の内容を貼付
- A〜Dの読み値・目視結果
- HAR/screenshot原本は `local/` へ
