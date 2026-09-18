# P0-4(WU-5)Fullscreen Modal 計測手順書

- 対象: deploy済みdevelopment(v2.9.0以降)。各行の**Modal**ボタンがWU-5 probe
- Chrome → Edge。cold/warmの起動時間は各5回(L3 §4 WU-5作業4)

## A. 基本動作(1回目のclickで確認)

1. 任意の画像行で**Modal**ボタンをclick → 全画面のModalが開く
2. 報告してほしいもの:
   - **Forge側ヘッダー(タイトルバー/閉じる×ボタン)が表示されているか**(§7.2の閉じるボタン方針を確定する最重要項目)
   - Viewer内の「innerWidth × innerHeight」の値(画面解像度と比べて全画面か)
   - Gallery側のModal probeセクションの「viewer-ready: click→DCL=…ms click→paint=…ms」と「events往復: …ms」

## B. Esc動作

1. Modalを開いた状態で**Esc** → 閉じるか(Gallery側logに `modal closed: payload={"reason":"escape"}` が出るか)
2. もう一度開き、**video controls(再生ボタン等)をclickしてfocusを移してからEsc** → 閉じるか
3. 「閉じる(view.close)」ボタンでも閉じるか
4. Modal open時にfocusがViewer側へ移るか、close後にGallery側へ戻るか(Tabを1回押してどこにfocusが当たるかで判断)

## C. cold / warm起動 各5回

1. **Cold**: ページをreload(Disable cache ON)→ Modalボタン → 「click→DCL / click→paint」を記録 → Escで閉じる。これを5回
2. **Warm**: Disable cache OFFでreloadせずに開閉を5回(2回目以降がwarm)
3. 5回分の数値は診断JSONにも残るので、最後に「JSONを出力」を貼付でOK

## D. warm-up効果(作業5)

1. ページreload(cold状態)→ **「Viewer warm-up試行(非表示iframe)」ボタン** → 数秒待つ
2. その後Modalボタン → click→DCL/paintが**Cの cold 5回と比べて**速くなったか
3. warm-upボタンの結果log(iframe load成立/失敗)も報告

## E. 独立性(作業8)

1. ページをreload直後、**Attachment一覧の表がまだ出る前に**Modalボタンを押せる場合は押す(間に合わなければ「間に合わず」でOK)
2. Modalが一覧表示と独立に開くかを報告

## F. 提出

- A/B/D/Eの観察結果+「JSONを出力」の内容(Chrome分)。Edgeは A・B のみでOK
