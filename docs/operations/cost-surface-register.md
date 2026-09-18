# Cost Surface Register(請求面台帳)

正本: V1仕様書 §4.7.1・§4.7.3、ガイド §8.6。**値はユーザーが記入する**(Phase0_Spec WU-0作業7、WU-8a作業3)。
有効期間は最終確認から31日。請求plan、workflow、dependency、secret、network、配布設定の変更時は即時再確認する。
本ファイルは保護対象(CLAUDE.md §9)。変更はユーザーの明示承認を要する。

## 1. 請求面の状態

| ID | 請求面 | 恒久基準 | 現在の状態 | baseline確認日 | 最終確認日 | 確認者 |
|---|---|---|---|---|---|---|
| CS-DEV-SITE | Atlassian developer site | 無料cloud developer site(Confluence 5ユーザー) | (未記入) | (未記入) | (未記入) | (未記入) |
| CS-FREE-SITE | 個人Confluence Free site | Freeプラン(10ユーザー・2GB)、trialなし | (未記入) | (未記入) | (未記入) | (未記入) |
| CS-DEV-SPACE | Developer Space | 請求アカウント設定・請求同意のみ。支払方法未登録。Usage 0、USD 0.00 | 請求同意済み・支払方法未登録。App登録済み(Confluence Media Gallery、Space: CMGdev)。全メトリクス0/利用実績なし、USD 0.00(`usage-snapshots/2026-09-18-baseline.json`) | 2026-09-18 | 2026-09-18 | ユーザー |
| CS-CI-REPO | Source hosting / CI・CD | GitHub Free無料枠内。standard runner、無料分数・無料storage | GitHub Free。public repo(endoryu/ConfluenceMediaGallery)作成済み、standard runnerでActions稼働(publicは分数無制限無料)。暗号化secrets 2件(FORGE_EMAIL / FORGE_API_TOKEN、forge lint用。CSR-2026-002)登録済み | 2026-09-17 | 2026-09-18 | ユーザー |
| CS-EXTERNAL | 外部API / SaaS / CDN / storage / AI | 契約・API key・egressとも0 | (未記入) | (未記入) | (未記入) | (未記入) |
| CS-MARKETPLACE | Marketplace | 無料掲載。licensing / editions / trial / 有料plan / 広告費0 | (未記入) | (未記入) | (未記入) | (未記入) |
| CS-HOSTING | ホスティング(privacy policy / support URL) | 無料ホスティング・無料ドメイン | (未記入) | (未記入) | (未記入) | (未記入) |

## 2. 裁定記録

許可リスト・禁止事項の変更、CI provider planの確認は、ここに裁定として記録した範囲でのみ有効(CLAUDE.md §3・§6)。

| 裁定ID | 日付 | 対象請求面 | 内容 | 理由・根拠 | 裁定者 |
|---|---|---|---|---|---|
| CSR-2026-001 | 2026-09-17 | CS-CI-REPO | GitHub Free plan(アカウント endoryu)。publicリポジトリ・standard runner・無料枠内でCIを運用する | ユーザー申告(2026-09-17の会話)。planは外部から静的確認不能のため裁定記録方式(ガイド§4.1手順5)。リポジトリ作成・push後にActions利用量をBilling画面で再確認する | ユーザー |
| CSR-2026-002 | 2026-09-18 | CS-CI-REPO | forge lintのCI実行のため、Atlassian APIトークンをGitHub暗号化secrets(FORGE_EMAIL / FORGE_API_TOKEN)として登録・使用する | ガイド§10.3の経路。lint専用でCIからのdeployはなし。secretsはユーザーがGitHub UIで直接登録しClaude Codeを経由しない。会話に貼付された初代tokenは失効済み(2026-09-17) | ユーザー |

## 3. 機械可読ブロック

`verify:cost` が読む。裁定記録を追記したら下のYAMLにも同じ内容を反映する。
CI provider plan(surface: `ci-repository`)の有効な裁定記録(31日以内)がない場合、静的ゲートは `UNKNOWN` となりdeployは停止する。

<!-- cost-policy:machine-readable
adjudications:
  - id: CSR-2026-001
    surface: ci-repository
    decision: GitHub Free plan (account endoryu, public repo, standard runner, free tier)
    date: 2026-09-17
    confirmedBy: user
  - id: CSR-2026-002
    surface: ci-repository
    decision: Atlassian API token registered as GitHub encrypted secrets (FORGE_EMAIL / FORGE_API_TOKEN) for forge lint in CI
    date: 2026-09-18
    confirmedBy: user
-->
