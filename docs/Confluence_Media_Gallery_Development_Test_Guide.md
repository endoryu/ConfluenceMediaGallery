# Confluence Media Gallery 開発・テスト環境ガイド

| 項目 | 内容 |
|---|---|
| 層 | L2 |
| 対象 | Confluence Media Gallery（全バージョン・全環境、Marketplace無料掲載） |
| 前提 | VSCode / Git / Claude Codeによるローカル開発環境が稼働中 |
| 対象基盤 | Confluence Cloud / Atlassian Forge Custom UI |

## 0. 結論

### 0.0 前提

| 項目 | 内容 |
|---|---|
| 開発主体 | 個人開発者1名（設計・裁定はユーザー、実装はClaude Code） |
| 配布形態 | Atlassian Marketplaceに無料アプリとして掲載する公開配布 |
| 課金 | 無料アプリ。`app.licensing` は未宣言 |
| 開発期の費用 | Atlassian、Forge、CI、ホスティング、外部サービスの全てで0。0で成立しない要件はユーザー裁定を経て判断する |
| 公開後の費用 | 課金対象capabilityを使用せず、install数に関わらずForge費用0を維持する。課金防止ハーネスは公開後も恒久適用する |
| 統制主体 | 承認・記録はユーザー本人が行い、`docs/operations/cost-surface-register.md` に裁定記録を残す |

本プロジェクトでは、次の3段階を分離する。

| 段階 | 用途 | 実行形態 | 合否判定に使うもの |
|---|---|---|---|
| Local + Development | 日常実装、単体テスト、素早いUI確認 | VSCode、Claude Code、Vite、`forge tunnel` | 機能の途中確認 |
| Staging | リリース候補、CSP、認証、CDN、HTTP cache、Range、実性能 | `forge deploy -e staging` | V1の正式な技術・性能判定 |
| Production | 公開利用 | `forge deploy -e production` | 最終smoke test |

推奨トポロジーは以下である。

1. 日常開発には、無料のAtlassian cloud developer site（Confluence 5ユーザー、期限なし）を使う。developmentとstagingは同じsiteへ別環境としてinstallする。
2. すぐPoCを始める場合は、有効期間90日のForge demo siteを暫定利用してよい。
3. 本番相当の確認には、個人のConfluence Free site（10ユーザー・2 GB）を使う。ここへproduction環境をinstallし、公開前smoke testと公開後の自己利用を兼ねる。
4. Sandbox前提の検証項目はFree siteとdeveloper siteで代替する。
5. 障害報告はdeveloper siteで再現する。

Forgeは標準でdevelopment、staging、productionの3環境を持つ。`forge tunnel` はdevelopment環境で使用する。本アプリはForgeへのログ書き込みを0とするため、開発・運用手順の診断手段は再現可能なStaging環境とブラウザ側の非永続診断で構成する。

> Tunnelは開発速度のために使う。CDN、リダイレクト、CSP、ブラウザキャッシュの判定はdeploy済みbuildで行う。

### 0.1 恒久方針

本アプリの全バージョン、development／staging／productionの全環境、開発・検証・リリース・保守の全期間に、次の許可構成を適用する。

| 領域 | 許可 |
|---|---|
| Forge module | Confluence `macro` |
| 実行形態 | Custom UIの静的resource（`gallery`、`viewer`） |
| Bridge API | `requestConfluence`、`Modal`、`events`、`router`、`view` |
| runtime dependency | `@forge/bridge` |
| 通信先 | Confluence siteと、P0-5で確認したAtlassian Media host |
| データ保存 | ブラウザHTTP cacheとdocument内メモリ |
| ログ出力先 | 画面内の診断バッファ（仕様書Section 8.4）、ブラウザDevTools、tunnelのローカルterminal |
| 課金対象capability | 使用0 |
| Marketplace | 無料掲載。`app.licensing` 未宣言、editions／trialなし |
| 依存ライセンス | permissive licenseのみ |
| 外部サービス | 契約0、API key 0、egress 0 |
| Developer Space | 請求アカウント設定・請求同意済み、支払方法未登録 |
| 新規capability | 許可リストへ明示追加されたもの |

許可構成の更新経路はユーザー裁定であり、裁定は `cost-surface-register.md` に記録する。許可構成の外にある機能を必要とする要件は、本アプリから切り離し、別案件・別Forgeアプリ・別Developer Spaceとして設計する。

Forgeのログ書き込みは0を維持する。理由と再評価条件は仕様書Section 0.1に定める。本番での不具合triageは、仕様書Section 8.4の診断レポート（利用者が明示操作でコピーしsupport導線へ貼り付けるsanitize済みtext）で行う。

支払方法未登録は補助統制であり、本体はSection 4.1の課金防止ハーネス（正本は仕様書Section 4.7）による使用量0の維持である。ハーネスはmanifest・依存・source・build・通信origin・実Usageを機械検査し、検査不能またはUsage未確認は `UNKNOWN` としてfail closedでdeployを停止する。

### 0.2 関連文書との優先順位

| 文書 | 正本とする領域 |
|---|---|
| `Confluence_Media_Gallery_V1_Implementation_Spec.md` | 機能、API、性能、キャッシュ、PoC、課金防止ハーネス、Marketplace掲載要件、Definition of Done |
| `docs/operations/cost-surface-register.md` | 請求面の状態、baseline、ユーザー裁定記録 |
| 本ガイド | 開発環境、テスト環境、実行手順、証跡、CI/CD |

本ガイドと仕様書が矛盾する場合、機能・性能・恒久方針は仕様書を優先し、本ガイド側を修正する。恒久方針は2文書とcost-surface registerで一致していることをリリース条件とする。

## 1. 選択肢の全体像

### 1.1 Confluenceテストsiteの選択肢

| 選択肢 | 長所 | 制約 | 適性 |
|---|---|---|---|
| Forge demo development site | CLIから短時間で用意できる、seed dataあり、enterprise editionの挙動を確認できる | 既定90日で失効 | 最初のPoC |
| Atlassian cloud developer site | 無料・期限なし、自由にページ・権限・テストユーザーを構成可能 | Confluence 5ユーザー上限 | 日常開発・staging |
| 個人Confluence Free site | 顧客の多数派であるFreeプランそのもの。10ユーザー・2 GB | Sandboxなし、権限モデルが簡素、容量2 GB | Production直前確認・公開後の自己利用 |

Atlassian Sandbox（Premium以上）と顧客siteでの直接デバッグは費用0原則と利用者影響の観点から選択肢に含めない。

### 1.2 推奨の選び方

**最短で今日から開始**

- Forge demo siteをprovisionする。
- development環境をinstallする。
- Phase 0の画像URL、Modal、Range PoCを開始する。
- 並行してcloud developer siteと個人Confluence Free siteを作成する。

**固定開発環境（推奨）**

- cloud developer siteを1つ用意し、developmentとstagingを別環境としてinstallする。
- `(DEVELOPMENT)` と `(STAGING)` の表示を使い分ける。
- 個人Confluence Free siteにはproductionをinstallし、公開前smoke testと公開後の自己利用に使う。

demo siteは破壊的PoCと短期検証に使う。長期baselineと正式なStaging証跡の正本はcloud developer siteとする。

**環境差の扱い**

- developer siteとFree siteはいずれもFree相当の権限モデルである。設計はFree相当の権限モデルで成立するものに限る。
- 顧客環境で再現しない不具合は、developer siteに同条件のページを作って再現する。

## 2. Forge環境の役割

### 2.1 Development

用途：

- 作業中branchの動作確認
- `forge tunnel` を使った素早い反映
- Chrome DevToolsでのDOM、CSS、request、console確認
- Attachment APIの探索
- エラー再現

許容事項：

- 一時的なdebug表示
- ブラウザDevToolsおよびtunnelのローカルterminalへの一時的なdebug出力
- mockと実APIの切替
- 未完成UI
- 頻繁なdeploy／tunnel再起動

developmentの位置づけ：

- 性能の最終合否判定はStagingで行う。
- 使用データはテストデータとする。
- 共有baselineはStagingで取る。
- 診断手段はブラウザDevTools、Network HAR、Performance trace、Playwright trace、tunnelのローカルterminalとする。

複数の開発者が同時に作業する場合は、Forgeのcustom development environmentを各開発者に割り当てる。Claude Codeは同じ作業者の補助であり、単独開発中は共通のdevelopment環境を使う。別branchを同時にtunnelする必要が生じた時にcustom environmentを追加する。

### 2.2 Staging

用途：

- deploy済み静的resourceの動作確認
- manifest、scope、CSP、redirect hostの確認
- GalleryとViewerのbundleサイズ確認
- Thumbnail／Preview／OriginalのHTTP cache確認
- 動画Range requestとseek確認
- Cold／Warm cacheの正式計測
- 権限別ユーザー試験
- V1受け入れテスト

Stagingではbuildしたartifactをdeployする。これによりローカルdev server、Cloudflare tunnel、source map、hot reloadから独立した結果が得られる。

### 2.3 Production

用途：

- 承認済みcommit/tagのMarketplace配布
- 最小限のsmoke test
- 実利用監視

Productionのコードは承認済みcommitのみで構成する。問題が出た場合はdevelopmentまたはstagingで再現し、修正版を同じpromotion経路で上げる。

本アプリはForge Functionを持たずFrontend Logsも無効のため、Usage上のLogs writes期待値は0である。正値が報告された場合は `RED` として原因を修正する。

## 3. ローカル開発スタック

### 3.1 必須

| ツール | 推奨 | 理由 |
|---|---|---|
| Node.js | 24 LTS | Forge CLI、Vite、テスト、buildのローカル実行基盤 |
| npm | Node同梱版 | Forge公式手順との整合 |
| Forge CLI | `@forge/cli` の現行版 | deploy、install、tunnel、lint |
| VSCode | 現行版 | 実装、debug、terminal |
| Git | 現行版 | 変更管理、release tag |
| Chrome | 現行安定版 | tunnelと主要DevTools検証 |
| Edge | 現行安定版 | Windows利用者向けdeploy済みbuild確認 |

ForgeのCustom UI tunnelは公式にChromeとFirefoxをサポートする。日常のtunnel確認はChromeを正本とし、Edgeはdeploy済みdevelopment／stagingで確認する。

### 3.2 プロジェクト内dev dependency

| ツール | 用途 |
|---|---|
| TypeScript | 型検査 |
| Vite | Gallery／Viewerのmulti-page buildとlocal dev server |
| Vitest | 単体・統合テスト |
| jsdom | DOM動作の高速テスト |
| Playwright | 実ブラウザE2E、trace、screenshot、performance採取 |
| ESLint | 静的解析 |
| Prettier | 自動format |

V1実装はplain TypeScript／DOM／CSSで構成する。

本アプリはCustom UIのみで構成するため、`manifest.yml` のruntime指定はローカルtoolchainと独立である。Node.js 24の固定はローカルtoolchainの再現性のために行う。

### 3.3 バージョン固定

- `package-lock.json` をcommitする。
- `package.json` の `engines.node` を24系へ固定する。
- `.nvmrc` または同等ファイルでNode majorを記録する。
- CIとローカルで同じNode majorを使う。
- Staging合格時のForge CLI versionをrelease recordへ残す。
- Forge CLIの更新は専用commitで行う。

## 4. 推奨リポジトリ構成

```
/
├─ CLAUDE.md
├─ manifest.yml
├─ package.json
├─ package-lock.json
├─ tsconfig.json
├─ vite.config.ts
├─ CODEOWNERS
├─ .claude/
│  └─ skills/
├─ config/
│  └─ forge-cost-policy.json
├─ scripts/
│  ├─ verify-forge-cost-policy.mjs
│  └─ snapshot-forge-usage.mjs
├─ src/
│  ├─ gallery/
│  ├─ viewer/
│  └─ shared/
│     ├─ api/
│     ├─ cache/
│     ├─ media/
│     └─ types/
├─ tests/
│  ├─ unit/
│  ├─ integration/
│  ├─ e2e/
│  ├─ cost-guard/
│  │  └─ negative-fixtures/
│  └─ fixtures/
├─ test-results/
│  └─ cost-guard/
├─ docs/
│  ├─ phases/
│  ├─ evidence/
│  ├─ proposals/
│  └─ operations/
│     ├─ cost-surface-register.md
│     └─ usage-snapshots/
├─ local/
└─ dist/
```

方針：

- `src/shared/api` にForge Bridge依存を閉じ込める。
- UIロジックはinterface越しに `requestConfluence()` を呼ぶ。
- 単体テストでは同interfaceへmock adapterを注入する。
- `dist` はbuild出力とし、再生成可能にする。
- 実Attachment、認証状態、HAR、traceは `local/` に置く。
- `manifest.yml`、package／lockfile、cost policy、guard script、CI workflow、cost-surface registerはCODEOWNERS相当の保護対象にし、変更時はbranch protection越しに自己レビューを明示承認する。
- 使用量snapshotは数値・unit・時刻・commit SHAだけをsanitizeして保存する。
- `cost-surface-register.md` には請求面の状態と裁定記録IDを記録する。

推奨npm scripts：

| script | 内容 |
|---|---|
| `dev` | Vite local server |
| `build` | Gallery／Viewer production build |
| `typecheck` | `tsc --noEmit` |
| `lint` | ESLint |
| `format:check` | Prettier検査 |
| `test` | Vitest一回実行 |
| `test:watch` | Vitest watch |
| `test:e2e` | Playwright |
| `verify:cost` | 課金防止policy、manifest、依存、source、build、負例fixtureをfail closedで検査 |
| `verify:local` | typecheck + lint + test + build + `verify:cost` |
| `verify` | `verify:local` + `forge lint` + Runs on Atlassian適格性確認。App登録後に使用 |
| `audit:usage` | App Owner本人がread-onlyでUsageを取得しsanitizeしたsnapshotを生成（失敗時は手動確認へ切替） |

### 4.1 課金防止ハーネスの構成

`verify:cost` は本アプリの全バージョン・全環境に対する必須release gateである。

`config/forge-cost-policy.json` は正の許可リストを持つ。

| policy項目 | 初期許可 |
|---|---|
| Forge module | Confluence `macro` |
| resource | `gallery`、`viewer` の静的Custom UI |
| Bridge API | `requestConfluence`、Modal、events、router、viewの承認済み用途 |
| runtime dependency | `@forge/bridge` |
| network origin | Confluence siteとPoCで確認したAtlassian Media host |
| billable capability usage | 全項目0 |
| Marketplace／licensing | 無料掲載。`app.licensing` 未宣言、editions／trialなし |
| developer site／個人Confluence Free site | Free維持 |
| dependency license | permissive licenseのみ |
| CI／repository／external service | 無料枠内で増分費用0の構成 |

scriptは次の順序で検査し、いずれかが失敗・未実行・未知なら非0で終了する。

1. `manifest.yml` をYAMLとして構造解析し、許可リストと照合する。拒否対象の正本は仕様書Section 4.7.2とする。
2. `package.json` と `package-lock.json` を解析し、runtime dependencyとlockfile整合を許可リストと照合する。
3. TypeScript ASTを解析し、Bridge API、通信API、console出力を許可リストと照合する。
4. production build後のJS／HTML／CSSを再走査し、import、debug出力、通信originが許可リスト内であることを確認する。
5. CI／repository設定を解析し、runner、課金option、upload、retention、外部serviceが許可構成内であることを確認する。provider側planを静的確認できない場合は、有効な裁定記録IDがある場合に `GREEN`、それ以外は `UNKNOWN` とする。
6. 負例fixtureを1カテゴリずつ検査し、各fixtureが期待するrule IDで失敗することを確認する。
7. commit SHA、policy version、manifest hash、lockfile hash、cost-surface registerの確認日・証跡ID、rule別結果をJSON reportへ出力する。

manifestとpackageは構造解析、sourceはAST解析を主とし、build出力の文字列走査を最終防衛線として併用する。

### 4.2 ハーネス自己防衛

- `verify:cost` を `verify:local` とCI必須checkの両方へ組み込む。
- CIの合格条件は全検査の実行と全rule結果の記録とする。
- `manifest.yml`、policy、guard、package／lockfile、CI workflow、cost-surface registerの変更にはユーザー reviewerを要求する。
- policyは全環境・全期間で単一の許可リストとする。
- guard変更PRでは、既存の全負例に加えて変更対象ruleの負例を追加する。
- 新しいForge capabilityまたはmanifest keyを検出したら `UNKNOWN` としてpromotionを停止する。
- server側CI必須checkとbranch protectionを正本とする。
- `forge install` のscope確認は人手で行う。CI workflowやscriptの `forge install` は対話的scope確認を伴う形に限り、`verify:cost` の手順5で照合する。

## 5. テスト階層

### 5.0 Level 0：課金防止ゲート

すべての変更で最初に実行し、合格後にdeploy系作業へ進む。

対象：

- manifest許可リスト
- runtime dependencyとlockfile差分
- source ASTのBridge API・通信API・console出力
- production buildの識別子・通信origin
- cost-guard負例fixture
- report完全性とcommit SHA対応

静的ゲートの実行結果は `GREEN`、`RED`、`UNKNOWN` のいずれかとする。CIや解析の失敗、未知key、空reportは `UNKNOWN` である。Section 8.5の統合判定にある `RECOVERING` は実環境で正の累積Usageを検出した後の状態であり、静的ゲート単体の結果には現れない。

### 5.1 Level 1：Pure unit test

対象：

- MIME分類
- Preview size bucket選択
- `attachmentId:version:variant:sizeBucket` cache key（仕様書Section 5.2）
- Attachment version invalidation
- LRU eviction順序
- soft limit計算
- priority queue
- pagination merge
- 日時・サイズ・duration表示format
- 縮退state machine（仕様書Section 11.1）

特徴：

- Confluenceもブラウザも不要
- Claude Codeが最も高速かつ確実に自動実行できる
- 変更ごとに必須

### 5.2 Level 2：DOM／integration test

対象：

- hover titleの表示class
- `≡` のpanel stateと `aria-expanded`
- 左右キー、`Esc`、focus復帰
- Thumbnail → Preview → Original state transition
- decode成功／失敗
- request cancelとcleanup
- empty、403、404、unsupported fallback
- レート制限縮退の3段階遷移、probe発行、cold start時の429表示（仕様書Section 11.1）
- global error handlerの捕捉、診断バッファのring buffer動作、sanitize、clipboard書き込みが明示操作でのみ発生すること（仕様書Section 8.4）

Forge APIはadapter越しにmockする。429、`RateLimit`／`X-RateLimit-NearLimit`／`Retry-After` ヘッダー、native media requestの失敗はすべてmock adapterで再現する。

### 5.3 Level 3：Development site + tunnel

対象：

- 実Confluence context
- 実Attachment API
- Modal起動
- 実際のiframe内レイアウト
- 素早いCSS／UI反復
- console error

限界：

- Custom UI assetはlocal dev server経由になる。
- tunnel自体がCloudflare経由である。
- deploy済みresourceとcache／CSP／timingは異なり得る。
- tunnel中のlogはlocal terminalへ出る。
- manifest変更後はdeployが必要で、scope/module変更時はinstall upgradeも必要になる。

P0の実装探索に使い、P0合格証跡はdeploy済みdevelopmentまたはstagingで取る。

### 5.4 Level 4：Deploy済みDevelopment

対象：

- production build artifact
- manifest反映
- CSP
- redirect先host
- deployed bundle path
- 初回install／upgrade

開発中でも、次の場合はtunnelを止めてdeploy済みdevelopmentで確認する。

- `manifest.yml` 変更
- permissions変更
- Gallery／Viewer resource構成変更
- media host／CSP変更
- cacheまたはnetwork性能を評価するとき

### 5.5 Level 5：Staging E2E／performance

対象：

- V1受け入れテスト全体
- Chrome／Edge
- Firefox／Safariの基本動作
- タブレット／スマートフォンのグリッド、Viewer、画面上ボタンの基本動作
- Cold／Warm cache
- 権限ユーザー差
- 50／200／500件
- 8K画像
- 大容量動画Range／seek
- Viewer close後のmemory
- Confluence標準Viewerとの比較
- P0-6のAPIポイント／重複要求／応答速度比較、302レスポンスのキャッシュ可否実測、公式コスト式による1セッション実測ポイント
- P0-6のレート制限縮退（`Normal` → `Degraded` → `Blocked` → `Normal`）のmock adapter遷移検証
- P0-7の課金防止ハーネス正常系・負例・実Usage 0確認

ここが正式なrelease gateである。

### 5.6 Level 6：Production smoke

対象を最小化する。

- macroが表示される。
- 代表画像1件が開く。
- `≡`、左右移動、`Esc` が動く。
- 権限外データが見えない。
- 重大console errorがない。

負荷試験、500件試験、大容量download試験はStagingで行う。

## 6. テスト用Confluence構成

### 6.1 推奨space

`Media Gallery Test` のような専用spaceを作り、一般ユーザーから隔離する。

### 6.2 推奨ページ

| ページ | 内容 | 目的 |
|---|---|---|
| `MG-00-Smoke` | 画像3、動画1、音声1 | 日常確認 |
| `MG-01-Image-Formats` | JPEG、PNG、WebP、GIF、AVIF、SVG | codec／alpha／animation |
| `MG-02-High-Resolution` | 4K、8K、縦長、横長 | Preview／Original／decode |
| `MG-03-Video-Audio` | 小／大MP4、WebM、MP3、WAV、M4A | metadata、再生、Range、seek |
| `MG-04-Unsupported` | PSD、EXR、TGA、非対応codec | fallback |
| `MG-05-Perf-50` | 画像40、動画5、音声5。非対応形式は別枠で2件以上 | 標準性能・APIポイント計測 |
| `MG-06-Perf-200` | 合計200件 | long task／scroll／memory |
| `MG-07-Perf-500` | 合計500件 | V1上限確認 |
| `MG-08-Versioning` | 同じAttachmentを繰り返し更新 | cache invalidation |
| `MG-09-Permissions` | 閲覧制限付きAttachment／page | 403／ユーザー差 |
| `MG-10-Errors` | 削除、リンク切れ、通信遮断用 | 404／retry／partial failure。429はmock adapterで検証する |

### 6.3 テストデータ方針

- 機密性のない生成データを使う。
- Originalのfile hash、解像度、MIME、サイズ、versionをローカルのtest manifestへ記録する。
- 大容量ファイル本体はローカルとConfluence siteに置く。
- 実プロジェクト画像を使う場合は個人Confluence Free siteだけに置く。
- versioning用Attachment以外は固定し、performance baseline取得後も同じデータを使う。
- データ更新履歴をテスト結果と同時に記録する。
- APIポイント検証は実request数、返却object数、公開算定式、通常利用時に返るrate-limit headerから評価する。実tenantへの負荷は標準セッション相当に留める。

## 7. E2E認証の扱い

### 7.1 V1の認証試験方針

実site E2Eは「ユーザーによる初回ログイン + ローカルPlaywright」の半自動方式にする。

1. ユーザーがheaded browserでAtlassianへログインする。
2. MFA／SSOはユーザー自身が完了する。
3. Playwrightの認証状態を `local/` へ保存する。
4. 以後、Claude Codeはその既存認証状態を使って非破壊E2Eを実行できる。
5. session失効時はユーザーが再ログインする。

password、MFA code、API tokenはユーザーが保持する。認証状態ファイルは `local/` に置く。

### 7.2 CI E2E

V1のCIは単体・integration・build・`forge lint` で構成する。実site E2Eはローカルで実施する。理由：

- SSO／MFA／session expiryの影響が大きい。
- Attachment URLや認証stateのsecret管理が必要になる。
- UI変更によるflaky testが起こりやすい。
- まずローカルPlaywrightで安定性を証明する。

実site E2EのCI化は、専用service account、認証情報管理、利用規約、管理者承認を別計画で確認したうえで、恒久方針の範囲内で判断する。

## 8. 性能測定環境

### 8.1 正本条件

- Stagingへdeployしたproduction build
- source map／debug UIなし
- 同じ端末、同じユーザー、同じページ、同じAttachment
- ブラウザversion、画面解像度、device pixel ratioを記録
- ネットワークprofileを固定
- Confluence標準Viewerと本Viewerを同一条件で比較

### 8.2 Cold／Warmの分離

| 試験 | 方法 |
|---|---|
| Cold | 対象siteのcacheを消してから1回だけ測定 |
| Warm | Cold完了後、cacheを保持したまま同じ操作を測定 |
| hover-preloaded | 対象tileへ規定時間hover後にclick |
| no-hover | keyboardまたは即clickで開く |

Chrome DevToolsの「Disable cache」はCold測定時だけ使用する。

### 8.3 取得する証跡

- Network HARまたはsanitized request table
- Performance trace
- Playwright trace
- screenshot／短い画面録画
- click → Modal shell
- click → first media
- click → Preview decoded
- click → Original decoded
- next操作 → next media
- request count／transferred bytes
- Confluence REST request数、返却object数、推定APIポイント
- 取得できる場合はrate-limit response header
- 50 ms超long task
- Viewer close前後のheap snapshot

HAR、trace、screenshotの原本は `local/` に置き、sanitizeした数値結果を `docs/evidence/` に残す。

### 8.4 Tunnel測定の扱い

Tunnelで得た値は相対的な開発参考値とする。`forge tunnel` はlocal codeとAtlassian siteをCloudflare経由で接続し、Custom UIではlocal dev serverをproxyするため、deploy済みCDN配信とは経路が異なる。V1性能要件の合否はdeploy済みbuildで判定する。

### 8.5 Forge使用量の定量監視

Atlassian Developer Consoleの `Usage and costs` を正本とし、development、staging、production、custom development environmentを含む全環境を確認する。日次データは12:00 UTCに更新されるため、合格証跡は更新後の値で取る。

本アプリの内部許容値は、Functions、KVS read／write、Logs write、SQL compute／request／storage、Object Store、LLM、Containers、および算定費用のすべてについて0である。正値を1つでも検出した時点で `RED` とする。

統合判定は次のとおりとする。

| 状態 | 条件 | deploy／promotion |
|---|---|---|
| `GREEN` | 静的ゲート合格、全Usage 0、Forge cost USD 0.00、全請求面の増分費用0、支払方法未登録、48時間以内のsnapshotと有効なcost-surface registerあり | 可 |
| `RED` | 検出対象、Usage／費用の正値、支払方法、有料plan／従量設定、Usage Alertのいずれか | 即時凍結 |
| `RECOVERING` | 原因除去と静的ゲート合格後、現時点の増分0を確認済みだが、当月累積Usage／費用が正値、または最終invoiceが未確定 | 凍結継続 |
| `UNKNOWN` | active trial／plan移行待ち、dashboard未更新、snapshot期限切れ、cost-surface registerが31日超または請求面証跡不備、検査／API失敗、新項目未判定 | 凍結 |

| タイミング | 実施内容 |
|---|---|
| App登録後・初回deploy前 | 全項目0、または対象期間の利用実績なしを示す正常な空状態、USD 0.00、支払方法未登録をbaseline化 |
| staging試験後 | 次回12:00 UTC更新後に環境別Usageと前回差分を保存 |
| production前 | 48時間以内のsnapshotと同一commitのcost-guard reportを照合 |
| production初回7日 | 毎日、日次更新後に確認 |
| 安定運用 | 毎週、月末、翌月最初の請求確認日に確認 |
| 月次 | Developer Site／個人Confluence Free site／CI・repository／外部契約／Marketplaceの差分と増分費用0を確認し、cost-surface registerを更新 |
| manifest／Forge CLI／料金表変更 | 新capability・新課金項目を再監査。支払方法登録がForge利用の必須条件へ変更された場合はSection 0.1の方針をユーザー裁定で再審査 |

`audit:usage` は、ユーザーがApp Ownerのtoken管理を承認した場合に利用するread-only補助である。公式App resource usage APIは呼出アカウントがApp Owner本人である必要があるため、tokenはローカルのOS資格情報ストアに置く。自動取得に失敗した場合は `UNKNOWN` とし、OwnerまたはBilling AdminがDeveloper Consoleで手動確認する。

Developer ConsoleのUsage metricsは直近60日分を参照できる。月次snapshotは対象月の終了から60日以内に取得する。production siteに紐づく最初の5 sandboxでのForge使用量は課金対象外であり、Usage画面での表示形式は初回staging試験時に確認してsnapshotの解釈ルールへ記録する。

snapshotには次を残す。

- 取得UTCと対象期間
- App ID、environment、commit SHA
- resource名、値、unit、前回差分
- Usage and costsの算定費用
- 支払方法の有無
- 確認者とcost-guard policy version

Developer Consoleが対象期間の「利用実績なし」を正常に示す空状態は、表示値0と同義に扱う。権限不足、画面／APIの読込失敗、日次更新前、対象期間・environment未選択による空表示は `UNKNOWN` とする。cost-surface registerの有効期間は最終確認から31日であり、請求plan、workflow、dependency、secret、network、配布設定の変更時は即時再確認する。

月内累積値は原因修正後も維持されるため、復旧確認では絶対値に加えて日次差分を見る。原因修正版の静的ゲート合格、現時点の全請求面の増分0、Forge cost USD 0.00、日次更新をまたぐ2回連続の増分0を確認した時点で `RECOVERING` とする。次の月次請求期間で全Usageの絶対値0、全請求面の増分費用0、未解決invoice／pre-dunningなしを確認した時点で、ユーザーが `GREEN` 復帰を記録する。

### 8.6 Forge外の請求面監視

ユーザーは `docs/operations/cost-surface-register.md` と顧客証跡を用い、Forgeの `Usage and costs` に加えて次を確認する。

| 請求面 | 合格条件 | 確認時期 |
|---|---|---|
| Atlassian cloud developer site | 無料developer siteのまま | 初回、月次 |
| 個人Confluence Free site | Free、active trialなし、10ユーザー以下、2 GB以下 | 初回、月次、trial勧誘表示時 |
| Developer Space | 請求アカウント設定・請求同意済み、支払方法未登録、USD 0.00 | 初回、リリース前、月次 |
| Source hosting／CI/CD | GitHub Freeの無料枠内。standard runner、無料分数・storage内 | CI導入前、月次、workflow変更時 |
| 外部API／SaaS／CDN／storage／AI | 契約、API key、egressともに0 | dependency／secret／network変更時、月次 |
| Marketplace | 無料listing、licensing無効、editions／trialなし、プロモーション費用0 | リリース前、月次 |
| ホスティング（privacy policy／support） | 無料ホスティング、無料ドメイン | 初回、月次 |

既存の無料契約は、本アプリのためにplan、ユーザー数、容量、optionを維持する場合に増分費用0のbaselineとして扱う。active trial、確認不能、31日を超えた証跡は `UNKNOWN` とする。Atlassian製品のUIに表示されるtrial開始・アップグレード勧誘を受諾した場合は即時 `RED` とし、trial期間中であっても解除を優先する。

## 9. 手動作業とClaude Code作業の分離

### 9.1 原則

- 認証、権限承認、site管理、Production判断、Marketplace掲載操作、費用に関わる全ての裁定はユーザーが所有する。
- 再現可能なコード生成、静的検査、自動テスト、結果解析はClaude Codeが所有する。
- 実siteを変更するCLI操作は、対象site／environmentをユーザーが明示した場合にClaude Codeが実行する。
- Production deploy／installはユーザーの手動操作とする。

### 9.2 責任分界表

| タスク | ユーザー手動 | Claude Code | 備考 |
|---|---|---|---|
| test site選定（developer site／Free site） | 主担当 | 助言 | 無料範囲の確認が必要 |
| site／space作成 | 主担当 | 明示依頼時に補助 | 管理者権限を伴う |
| Atlassian API token作成 | 必須 | — | tokenはOS資格情報ストアに置く |
| `forge login` | 必須 | 状態確認 | promptとsecret入力は手動 |
| App登録 | 承認・実行 | scaffold準備 | `forge register` は1回 |
| manifest設計 | レビュー | 主担当 | scope最小化 |
| TypeScript／CSS実装 | レビュー | 主担当 | 常に完全な実装単位で変更 |
| unit／integration test作成 | レビュー | 主担当 | mock adapter使用 |
| local lint／test／build | 任意確認 | 主担当 | 毎変更で実行 |
| `forge tunnel` 起動 | 共同 | 明示依頼時に実行 | signed-in browserはユーザー側 |
| browserでの初回SSO／MFA | 必須 | — | credentialはユーザーが保持 |
| 実Attachment upload | 主担当 | 明示依頼時に補助 | 機密性と外部変更を伴う |
| DevTools計測 | 共同 | instrumentation／解析 | 体感評価はユーザー確認 |
| Playwright E2E | 初回認証 | 主担当 | auth stateは `local/`。利用規約・顧客規程の範囲内で実施 |
| staging deploy | 承認 | 明示依頼時に実行 | deploy済みcommitを固定 |
| scope/install upgrade承認 | 必須 | command準備 | 権限差分を人間が確認 |
| Production go/no-go | 必須 | 証跡整理 | 人間の最終責任 |
| Production deploy/install | 手動 | — | tagとcommit SHAを確認 |
| Developer Space公開／Marketplace listing作成・審査提出 | 必須 | listing文面・スクリーンショット・scope説明の下書き | Partner Agreement受諾と公開操作は本人 |
| privacy policy／supportページ公開 | 承認・公開 | 下書き作成 | 無料ホスティング |
| 障害解析 | 利用者から診断レポートを受領し提供 | 主担当 | 再現はdevelopment／stagingで行う。診断レポート（仕様書Section 8.4）はsanitize済みだが、Issueへ貼る前にユーザーが内容を目視確認する |

### 9.3 Phase 0 PoCの分担

| PoC | ユーザー | Claude Code |
|---|---|---|
| Thumbnail直接表示 | test pageとAttachment準備 | probe UI、network instrumentation、結果解析 |
| Original直接表示 | 4K／8Kデータをupload | URL解決、decode timing、cache検証コード |
| Range／seek | 大容量MP4をupload | request／206／seek計測とログ整理 |
| Fullscreen Modal | 操作感と視覚応答を評価 | separate entry、timing marks、keyboard実装 |
| CSP／権限 | install／scope承認 | manifest最小化、redirect host監査、`forge lint` |
| APIポイント／応答速度 | 標準セッションの操作確認 | request inventory、重複検出、推定ポイント、中央値・P95比較 |
| 課金防止ハーネス | Billing Console／Usage and costsと全請求面を確認し、支払方法未登録・増分費用0・裁定記録IDを提示 | policy、静的検査、負例fixture、sanitize済みUsage snapshot、cost-surface register、commit対応reportを作成 |

詳細は `docs/phases/Phase0_Spec.md` に定める。

## 10. Secret・Git管理

### 10.1 Commit対象

- `CLAUDE.md`
- `manifest.yml`（App IDを含む）
- source code
- test code
- mock JSONから機密情報を除去したfixture
- `package-lock.json`
- `docs/` 配下の `.md` とsanitize済み証跡
- `test-results/cost-guard/*.json`
- `.claude/skills/`

### 10.2 `local/` に置くもの

- Atlassian API token、`FORGE_API_TOKEN`
- login cookie
- Playwright `storageState`
- `.env.local` 等のlocal endpoint設定
- signed attachment URL
- 生HAR／trace
- 顧客Attachment本体
- productionから取得した未加工レスポンス
- 開発ログ、上申キュー下書き、run ledger
- Usage画面のscreenshot原本

`local/` は `.gitignore` で除外する。

### 10.3 CI secret

将来CI deployを導入する場合、`FORGE_EMAIL` と `FORGE_API_TOKEN` をCIの暗号化secretとして保存する。tokenはlogへ出さず、production deploy jobにはmanual approvalを設定する。

## 11. 日常開発フロー

### 11.1 通常変更

1. feature branchを作る。
2. Claude Codeが実装とunit／integration testを同時に更新する。
3. Claude Codeが `typecheck`、lint、test、build、`verify:cost` を実行し、cost-guard reportを生成する。
4. 必要ならdevelopment environmentでtunnelを起動する。
5. ユーザーが実Confluence画面で操作感を確認する。
6. Claude Codeがconsole／network／traceを解析し修正する。
7. `manifest.yml`、runtime dependency、source、build、通信originが許可構成内であり、Forge Frontend Logsが無効であることを機械検査する。
8. deploy済みdevelopmentでmanifest／CSP／cache差を確認する。
9. commitする。

### 11.2 Staging候補

1. 対象commit SHAを固定する。
2. clean install相当で `npm ci` する。
3. `verify` を通す。
4. `verify:cost` の正常系・全負例を通し、reportのcommit SHAが対象SHAと一致することを確認する。`GREEN` の候補だけを進める。
5. stagingへdeployする。
6. scope変更時はinstall upgradeを実行し、ユーザーが差分を確認する。
7. Staging test matrixを実施する。
8. Cold／Warm性能証跡を保存する。
9. 次回の日次Usage更新後に全課金対象メトリクス0、USD 0.00を確認し、snapshotを保存する。
10. V1 Definition of Doneと照合する。

### 11.3 Production

1. Staging合格commitへrelease tagを付ける。
2. tagのcommit SHAとStaging検証SHAが同じことを確認する。
3. cost-guard reportが `GREEN` で、release tagのcommit SHA、manifest hash、lockfile hashと一致することを確認する。
4. 48時間以内のUsage snapshotで全課金対象メトリクス0、USD 0.00、支払方法未登録を確認し、31日以内のcost-surface registerで全請求面の増分費用0を確認する。
5. ユーザーがProduction goを承認する。
6. productionへdeploy／install upgradeする。
7. 最小smoke testを行う。
8. 次回の日次Usage更新後に増分0を確認する。`GREEN` 以外なら新規操作とpromotionを凍結する。
9. 問題があればdevelopment／stagingで修正し、新versionとして再deployする。

### 11.4 Marketplace公開（初回）

1. Developer Consoleでアプリの配布設定をsharing有効にする。
2. Developer Spaceの請求アカウント設定と請求同意を確認し、支払方法が未登録であることを確認する。
3. Developer Space adminとしてSettingsの「Make public on Marketplace」からPartner Agreementを受諾して公開する（取り消し不可のためユーザーが実行）。
4. Marketplaceで無料listingを作成し、productionにdeploy済みの本アプリを選択する。
5. Privacy & Securityタブ、EUA（Atlassian標準）、privacy policy URL、support URL、scopeの必要理由を記入する。
6. 審査に提出する。審査中のlistingは固定される。
7. 承認後、個人Confluence Free siteへMarketplace経由でinstallし直し、Section 5.6のsmoke testを行う。
8. 次回の日次Usage更新後に増分0を確認する。

### 11.5 Marketplace公開後の更新

1. Section 11.1〜11.3を実施する。
2. scope・permissions・egressを維持するversionはproductionへのdeployで顧客へ反映される。
3. scope・permissions・egressを変更するversionはMarketplaceへ新versionを公開し、顧客の再install／upgradeが必要になることをリリースノートに明記する。
4. 公開後7日間は毎日Usageを確認する。

## 12. 初回セットアップ手順

### 12.1 ユーザーが最初に行うこと

1. 開発siteを用意する。
   - 最短：Forge demo site（90日）
   - 長期推奨：Atlassian cloud developer site（go.atlassian.com/cloud-dev、無料、Confluence 5ユーザー）
   - 本番相当：個人Confluence Free site（10ユーザー・2 GB）
2. Node.js 24 LTSを導入する。
3. Forge CLIを導入する。
4. Atlassian API tokenを作成する。scoped tokenで `forge login` が成立するかを確認し、失敗した場合は通常のAPI tokenを使う。tokenはOS資格情報ストアに保管する。
5. `forge login` をユーザー自身で完了する。
6. 開発siteでAppをinstallできる権限（site admin）を確認する。
7. 本アプリ専用のDeveloper Spaceを作成し、Developer Space IDを控える。
8. Developer Spaceの請求アカウント設定と請求同意を行い、支払方法を登録せずに完了できることを確認する。支払方法登録が必須と表示された場合は作業を止め、Section 0.0の裁定事項として記録する。
9. Atlassianアカウントの2段階認証を有効にする（Marketplace Partner要件）。
10. GitHubリポジトリ（public）を作成する。

PowerShellでの確認コマンド：

```powershell
node --version
npm --version
npm install --global @forge/cli@latest
forge --version
forge login
forge whoami
```

Demo siteを使う場合：

```powershell
forge site provision
```

### 12.2 Claude Codeが続けて行うこと

1. リポジトリ状態と既存ファイルを非破壊で監査する。
2. Vite multi-page、TypeScript、Vitest、Playwrightを含む完全なproject scaffoldを作る。
3. Gallery／Viewer用のmanifest resourceと最小scopeを定義する。
4. `forge-cost-policy.json`、cost guard、全検出カテゴリの負例fixture、CODEOWNERS相当の保護設定を作る。
5. npm scripts、`.gitignore`、test adapter、fixtureを作る。
6. `verify:local` を通し、完全なcost-guard reportを生成する。
7. Appが未登録なら、ユーザーが作成した専用Developer Spaceを明示して1回 `forge register` を行える状態にする。
8. App登録直後かつ初回deploy前に、ユーザーがUsage 0または正常な「利用実績なし」表示／USD 0.00／支払方法未登録／全請求面の増分費用0のbaselineを提示し、Claude Codeがsecret-freeの値をcost-surface registerと検査reportへ紐付ける。
9. 登録後に `verify` を実行し、`forge lint` まで通す。

既存のsource treeをClaude Codeが作った後に登録する場合：

```powershell
$DeveloperSpaceId = "<developer-space-id>"
forge register --developer-space-id $DeveloperSpaceId "Confluence Media Gallery"
```

`<developer-space-id>` はユーザーが作成したMedia Gallery専用Developer Space IDへ置き換える。登録は `--developer-space-id` 指定で行う。登録後はDeveloper Consoleでアプリの所属Developer Space、Owner、App Adminを確認する。

`forge register` は同じAppで1回行う。再登録は新しいApp IDを生成し、以前の環境との接続を失う。

### 12.3 最初のdeploy／install

`your-site.atlassian.net` は実際の開発siteへ置き換える。

```powershell
$ForgeSite = "your-site.atlassian.net"
npm ci
npm run verify
forge deploy -e development
forge install --site $ForgeSite --product confluence -e development
```

Demo siteへinstallする場合はsite URLの代わりに次を使用する。

```powershell
npm ci
npm run verify
forge deploy -e development
forge install --demo-site --product confluence -e development
```

manifestのscope変更後は以下を使用し、表示されるscope差分をユーザーが確認する。

```powershell
$ForgeSite = "your-site.atlassian.net"
forge deploy -e development
forge install --upgrade --site $ForgeSite --product confluence -e development
```

Custom UI dev serverとtunnelは別terminalで実行する。

```powershell
npm run dev
```

```powershell
forge tunnel -e development
```

Custom UI resourceの `tunnel.port` とViteのportを一致させる。`manifest.yml` のtunnel設定を追加・変更した後は、再度developmentへdeployしてからtunnelを起動する。

Chromeで `Listening for requests...` が出ているのに要求が届かない場合は、`chrome://flags/#local-network-access-check` が「Enabled (Blocking)」以外であることを確認する。

## 13. CI/CD

**初回実装から全バージョンへ恒久適用するCI検査**

- `npm ci`
- typecheck
- ESLint
- unit／integration test
- production build
- `verify:cost` のmanifest／dependency／AST／build／origin検査
- cost-guard負例fixtureの全件失敗確認
- cost-guard reportの完全性・commit SHA・hash検査
- `forge lint`

CIはGitHub Actionsの無料枠で運用する。publicリポジトリのstandard runnerを使う。CI導入時点でGitHubの現行無料枠をユーザーが確認し、cost-surface registerに記録する。無料枠で必須checkを成立させられない場合はローカルの `verify:local` を必須とし、費用を伴う構成への移行はユーザー裁定を経る。

**Phase 0完了後に検討するもの**

- `main` へのmergeでStaging deployを実行する構成
- Staging install upgradeのmanual approval
- Productionのrelease tag + manual approval
- 実site E2E、自動Production deploy、自動scope upgrade、自動Marketplace version公開は、それぞれ別計画で恒久方針の範囲内で判断する

CIの必須check、policyの許可範囲、CODEOWNERS相当の保護は、変更時にユーザーの明示承認を要する。Usage取得APIをCIへ追加する場合は、App Owner tokenの保管・期限・失効・監査を別途ユーザー裁定し、取得失敗を `UNKNOWN` としてdeployを止める。

## 14. 構成判断一覧

| 領域 | 本プロジェクトの判断 |
|---|---|
| サーバー処理 | Custom UIで完結する。共有キャッシュ、proxy、変換処理はブラウザとAtlassian側に委ねる |
| データ保存 | ブラウザHTTP cacheとdocument内メモリ |
| AI・外部サービス | 使用0 |
| CI | GitHub Free、standard runner、無料枠内 |
| 課金設定 | `app.licensing` 未宣言、editions／trial／有料planなし、trial勧誘は辞退する |
| 依存ライセンス | permissive licenseのみ |
| egress | 宣言0。追加はP0-5の裁定を経る |
| 新規capability | 許可リストへの明示追加を経て使用する |
| ログ | 画面内の診断バッファ。Forgeへの書き込み0 |
| 支払方法 | Developer Spaceへ未登録 |
| 課金メトリクス | 内部許容値0 |
| ハーネス | policy、guard script、負例fixture、CI必須checkは常時有効 |
| Usage snapshot | 48時間以内・取得済みの状態でproductionへ進む |
| App登録 | `--developer-space-id` 指定で1回 |
| test環境 | development／staging／productionの3環境 |
| 性能判定 | deploy済みbuildで行う |
| Original取得 | native image request |
| unit test | mock adapter |
| Bridge依存 | `src/shared/api` に閉じる |
| secret | OS資格情報ストアと `local/` |
| scope変更 | 人手で差分を確認してupgrade |
| production deploy | staging検証済みcommitのみ |
| DevTools Disable cache | Cold測定時のみ |

## 15. 推奨する直近の進行

1. ユーザーがdemo site、cloud developer site、個人Confluence Free siteを用意する。
2. Claude Codeが現在のリポジトリでNode／npm／Forge CLI／Git状態をread-only監査する。
3. Claude CodeがV1 project scaffold、自動テスト基盤、課金防止ハーネスと全負例fixtureを一括作成する。
4. ユーザーが `forge login`、Developer Space作成、請求同意、App登録を行い、Usage 0または正常な「利用実績なし」表示／USD 0.00／支払方法未登録、および全請求面の増分費用0のbaselineを取得する。
5. Claude CodeがPhase 0用の最小probeを実装する。
6. ユーザーとClaude Codeで、Thumbnail、Original、Range、Modal、CSP、APIポイント／応答速度、課金防止ハーネスの順にP0-1〜P0-7を通す。
7. 次回の日次Usage更新で全課金対象メトリクス0を確認する。
8. 合格した配信経路を使ってGallery本実装へ進む。
9. V1 Definition of Done達成後にSection 11.4のMarketplace公開を行う。

P0-2でOriginalのnative表示が不合格の場合、Original機能をブロックし、恒久方針の範囲内で成立する別方式が確定した時点で本実装へ進む。

## 16. 公式資料

- Forge environments and versions
- Forge tunneling
- Forge tunnel CLI reference
- Getting started with Forge
- Provision a Forge demo site
- Forge register CLI reference
- List a Forge app on the Atlassian Marketplace
- Publish a Developer Space to the Atlassian Marketplace
- Billing and payments in Developer Spaces
- Runs on Atlassian
- Runtime egress permissions
- Forge Terms
