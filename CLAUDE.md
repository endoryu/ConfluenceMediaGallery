# CLAUDE.md — Confluence Media Gallery

Confluence Cloud向けForge Custom UIマクロ。ページ添付の画像・動画・音声をArtStation風グリッドとFullscreen Viewerで閲覧する読み取り専用アプリ。Atlassian Marketplaceに無料アプリとして公開する。個人開発、費用0原則。

## §1 役割

- **ユーザー**：設計権限者。仕様の決定、裁定、認証、site管理、Production判断、費用に関わる全判断を持つ。
- **Claude Code**：実装者。本ファイルと正本文書の範囲内で実装・検証・証跡整理を行う。範囲外の判断は上申する（§5）。

Claude Codeは独立した担当者ではなく、ユーザーの作業の補助である。ユーザーに代わって承認しない。

## §2 正本文書と優先順位

| 層 | 文書 | 役割 |
|---|---|---|
| L2 | `docs/Confluence_Media_Gallery_V1_Implementation_Spec.md` | 機能、API、性能、キャッシュ、課金防止ハーネス、DoD |
| L2 | `docs/Confluence_Media_Gallery_Development_Test_Guide.md` | 開発環境、テスト階層、実行手順、証跡、CI/CD |
| L3 | `docs/phases/Phase<N>_Spec.md` | フェーズごとのWU、依存、合格条件、提出物、上申条件 |
| 運用 | `docs/operations/cost-surface-register.md` | 請求面の状態、baseline、裁定記録 |
| 本書 | `CLAUDE.md` | Claude Codeの行動規範 |

矛盾時の優先：機能・性能・禁止事項はL2仕様書 → ガイド → L3 → 本書。手順・証跡形式はガイド → L3。本書はいずれも上書きしない。

着手時は、対象PhaseのL3全文と、L3が参照するL2の節だけを読む。L2全文の読込は指示があった場合のみ。

## §3 恒久禁止事項

以下は全バージョン・全環境・全期間に適用する。機能要望、利便性、レビュー指摘、probeであることを理由に緩和しない。解除経路はユーザー裁定と `cost-surface-register.md` への記録のみ。

**Forge／課金**
- Forge Function、Resolver、Trigger、Scheduled Trigger、webtrigger、consumer、queue
- KVS、Custom Entity Store、SQL、Object Store、Container
- Forge LLM、Rovo、外部生成AI API
- Forge Frontend Logs、Forgeへの意図的なログ書き込み、production buildに残る `console.error`／`console.log`
- `app.licensing`、editions、trial、有料化
- EAP、Preview、許可リスト外の新規capability
- `remotes`、external authentication provider、`permissions.external` の追加（P0-5裁定なし）
- Developer Spaceへの支払方法登録

**通信・依存**
- `fetch`、`XMLHttpRequest`、`WebSocket`、`EventSource`、`sendBeacon` の直接使用。Confluence通信は `src/shared/api` 内の `requestConfluence()` のみ
- `@forge/bridge` 以外のruntime dependency
- copyleftライセンス（GPL、AGPL、LGPL等）、license不明のpackage
- 外部S3、CDN、proxy、監視SaaS、有料外部サービス

**UI**
- React、UI component library、animation library、gallery library
- transition、fade、slide、scale等の装飾アニメーション
- IndexedDB、Cache API、Service Worker、localStorageによる永続キャッシュ
- APIポイント節約目的のdebounce、待機、先読み抑止（L2 §4.5.2）

**ハーネス・CI**
- `verify:cost` の迂回、warning-only化、`continue-on-error`、負例fixtureの削除
- 有料CI plan、従量runner、artifact／LFS upload、外部build service
- `forge install --confirm-scopes`、`--non-interactive`

**操作**
- `forge deploy -e production`、`forge install ... -e production`（ユーザーの手動操作）
- `forge register` の再実行、`--personal` 登録
- staging未検証commitのproduction deploy
- 実tenantに対する負荷試験、クォータ枯渇再現

禁止事項に抵触する解決策しか見つからない場合は、その旨を上申して停止する。代替として迂回案（Function proxy、外部CDN等）を提示しない。

## §4 裁量範囲

L2／L3の決定範囲内はすべて事前承認済みの裁量であり、ユーザーへ質問せず実装を進める。具体的には：

- L3のWUに記載された作業、計測、テスト、提出物の作成
- L2 §18の固定パラメータの範囲内での定数調整（変更はcommit messageに理由を記す）
- テストコード、mock adapter、fixture、sanitize script、計測基盤の実装詳細
- 内部モジュール分割、命名、型設計
- `forge deploy -e development`、`forge install ... -e development`（ユーザーが対象siteを明示済みの場合。scope変更時のupgradeはユーザーの差分確認を待つ）

## §5 上申

L2／L3の範囲外に出る判断、仕様の欠陥・矛盾、否決案より良い代替案、DoD未達の残留は**上申キュー**に積み、独立して進められる作業を続行する。上申はWU完了報告または停止時にまとめて提示する。

**即時停止**（ユーザーの応答を待つ）：
- 恒久禁止事項（§3）に抵触しない解決策がない
- 課金対象メトリクスの正値、算定費用の正値、支払方法登録の検出
- L3の停止条件に該当（Phase 0ではE-03、E-08、E-10、E-11）
- L3に記載のない破壊的操作（ファイル削除、リポジトリ操作、site設定変更）が必要
- 上申内容が後続WUの前提を壊す

上申の形式：ID、発生WU、事象、選択肢、推奨、影響範囲。推奨は1つに絞る。

## §6 仕様変更手順

Claude CodeはL2／L3を直接編集しない。

1. 変更案を`docs/proposals/<date>_<topic>.md` にdiff形式で作成する。
2. ユーザーが承認する。
3. 承認後、ユーザーの指示でL2／L3へ反映する（別commit、commit messageに proposal のパスを記す）。
4. 禁止事項の変更は `cost-surface-register.md` の裁定記録IDを伴わない限り反映しない。

L2とガイドの禁止事項が不一致になる変更はリリース不可とする。

## §7 ワークフロー

**毎変更**
1. feature branch（`phase<N>/wu-<X>-<topic>`）で作業する。
2. 実装とテストを同時に更新する。
3. `npm run verify:local` を通す（typecheck、lint、test、build、`verify:cost`）。失敗したままcommitしない。
4. cost-guard report（`test-results/cost-guard/<sha>.json`）が生成されていることを確認する。
5. commit messageは `[WU-X] <要約>` とし、本文に対応するL3の節を記す。

**deploy系**
- `manifest.yml`、permissions、resource構成、media hostを変更したら、tunnelではなくdeploy済みdevelopmentで確認する。
- `forge deploy` と `forge install --upgrade` は直列化する。並行して複数WUがmanifestを変更しない。
- deploy前に `verify:cost` が `GREEN` であることを確認する。`RED`／`RECOVERING`／`UNKNOWN` ならdeployしない。

**WU完了時**
- L3の提出物を所定パスへ配置する。
- result.mdにL3 §7.2の必須項目を記入する。
- 上申キューを提示する。

## §8 コーディング規約

- TypeScript strict、plain DOM、plain CSS。framework不使用。
- Gallery（`src/gallery/`）とViewer（`src/viewer/`）は別entry。ViewerコードをGallery bundleに含めない。
- `@forge/bridge` のimportは `src/shared/api/` に閉じる。UIコードはadapter interface（`ConfluenceApi`）越しに呼ぶ。
- 単体テストはmock adapterを注入する。`@forge/bridge` をjsdomで動かさない。
- 実Attachment、認証状態、HAR、traceをテストに持ち込まない。
- global error handler（L2 §8.4）は `console.error` を呼ばず、再throwしない。
- 計測・診断出力は画面内のtextareaまたは診断バッファへ。console、Forge、外部へ出さない。
- 節約策比較フラグ（Phase 0）はTypeScript定数とし、production buildで除去されることをbuild走査で確認する。
- 数値パラメータはL2 §18に対応する一箇所の定数モジュールに集約する。
- ESLint／Prettierの設定に従う。formatに関するレビュー指摘は出さない。

## §9 ディレクトリとgit管理範囲

```
/
├─ CLAUDE.md                     # git管理
├─ manifest.yml, package*.json, tsconfig.json, vite.config.ts
├─ CODEOWNERS
├─ .claude/
│  └─ skills/                    # git管理
├─ config/forge-cost-policy.json
├─ scripts/
├─ src/{gallery,viewer,shared}/
├─ tests/{unit,integration,e2e,cost-guard,fixtures}/
├─ test-results/
│  └─ cost-guard/*.json          # git管理（release証跡）。それ以外のtest-resultsは管理外
├─ docs/                         # .md はすべてgit管理
│  ├─ Confluence_Media_Gallery_V1_Implementation_Spec.md
│  ├─ Confluence_Media_Gallery_Development_Test_Guide.md
│  ├─ phases/Phase<N>_Spec.md
│  ├─ evidence/phase<N>/         # sanitize済み証跡（md、sanitize済みscreenshot）
│  ├─ proposals/
│  └─ operations/
│     ├─ cost-surface-register.md
│     └─ usage-snapshots/*.json  # sanitize済み
├─ local/                        # git管理外。開発ログ、HAR／trace原本、未sanitize screenshot、run ledger
└─ dist/                         # git管理外
```

- `docs/` 配下の `.md` とsanitize済み証跡は全てgit管理する。
- Claude Codeの作業ログ、上申キューの下書き、run ledger、HAR／trace原本、未sanitize screenshot、Usage画面のscreenshot原本は `local/` に置く。`local/` は `.gitignore` で除外する。
- skillを作成する場合は `.claude/skills/<name>/SKILL.md` に置き、git管理する。
- 保護対象（`manifest.yml`、`package.json`、`package-lock.json`、`config/`、`scripts/verify-forge-cost-policy.mjs`、`.github/workflows/`、`cost-surface-register.md`、`CODEOWNERS`、本書）の変更はユーザーの明示承認を要する。

## §10 Secret・commit禁止

以下はいかなる場合もcommitせず、会話やログにも貼らない。

- Atlassian API token、`FORGE_API_TOKEN`、`FORGE_EMAIL`、login cookie
- Playwright `storageState`
- `.env`、`.env.local` 等のlocal endpoint設定
- signed attachment URL、redirect先URL全体
- HAR、Performance trace、Playwright traceの原本
- 顧客・実プロジェクトのAttachment本体
- productionから取得した未加工レスポンス
- Developer Console／Billing Consoleのscreenshot原本

ユーザーからpassword、MFA code、tokenが渡された場合は使用せず、その旨を伝えて削除を促す。

## §11 実行環境

- Windows、PowerShell。コマンド例はPowerShell構文で書く。
- Node.js 24 LTS、npm同梱版、Forge CLI現行版（更新は専用commit）。
- `forge tunnel` はChromeで確認する。Edgeはdeploy済みbuildで確認する。
- `forge login`、`forge register`、`forge whoami` はユーザーが実行する。Claude Codeは状態確認と手順提示のみ。

## §12 報告形式

- 結論を先に書く。経緯は後。
- 変更ファイルの一覧とdiff要約を付ける。
- 計測値は条件（環境、ブラウザ、Cold／Warm、回数）を必ず併記し、中央値とP95で示す。
- 未実施項目と理由を明示する。「たぶん動く」は書かない。
- 上申キューは§5の形式で末尾にまとめる。
