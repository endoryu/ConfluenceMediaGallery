# WU-0 cost-guard 負例fixtureと対応rule ID

- 作成日: 2026-09-17
- 正本: V1仕様書 §4.7.2(検出カテゴリ)、ガイド §4.1(検査順序)、Phase0_Spec WU-0 作業5
- 検証方法: `npm run verify:cost` の手順6(負例fixture自己試験)。各fixtureを対応analyzerに単体で通し、期待rule IDが検出結果に含まれることを確認する。1件でも不一致なら `FCP-FIX-MISS`(RED)、fixture欠落は `FCP-FIX-MISSING`(UNKNOWN)で非0終了する。

## 負例fixture一覧(33カテゴリ)

| # | カテゴリ | fixture | 検査層 | 期待rule ID |
|---|---|---|---|---|
| 1 | function | `function/manifest.yml` | manifest構造 | `FCP-MAN-FUNCTION` |
| 2 | resolver | `resolver/manifest.yml` | manifest構造 | `FCP-MAN-RESOLVER` |
| 3 | trigger | `trigger/manifest.yml` | manifest構造 | `FCP-MAN-TRIGGER` |
| 4 | scheduledTrigger | `scheduledTrigger/manifest.yml` | manifest構造 | `FCP-MAN-SCHEDULED-TRIGGER` |
| 5 | consumer | `consumer/manifest.yml` | manifest構造 | `FCP-MAN-CONSUMER` |
| 6 | webtrigger | `webtrigger/manifest.yml` | manifest構造 | `FCP-MAN-WEBTRIGGER` |
| 7 | queue | `queue/manifest.yml` | manifest構造 | `FCP-MAN-QUEUE` |
| 8 | storage | `storage/manifest.yml` | manifest構造 | `FCP-MAN-STORAGE` |
| 9 | sql | `sql/manifest.yml` | manifest構造 | `FCP-MAN-SQL` |
| 10 | objectStore | `objectStore/manifest.yml` | manifest構造 | `FCP-MAN-OBJECT-STORE` |
| 11 | container | `container/manifest.yml` | manifest構造 | `FCP-MAN-CONTAINER` |
| 12 | llm | `llm/manifest.yml` | manifest構造 | `FCP-MAN-LLM` |
| 13 | rovo | `rovo/manifest.yml` | manifest構造 | `FCP-MAN-ROVO` |
| 14 | remotes | `remotes/manifest.yml` | manifest構造 | `FCP-MAN-REMOTES` |
| 15 | externalAuth | `externalAuth/manifest.yml` | manifest構造 | `FCP-MAN-EXTERNAL-AUTH` |
| 16 | licensing | `licensing/manifest.yml` | manifest構造 | `FCP-MAN-LICENSING` |
| 17 | wildcardHost | `wildcardHost/manifest.yml` | manifest構造 | `FCP-MAN-WILDCARD-HOST` |
| 18 | nonAtlassianOrigin | `nonAtlassianOrigin/manifest.yml` | manifest構造 | `FCP-MAN-NON-ATLASSIAN-ORIGIN` |
| 19 | runtimeDependency | `runtimeDependency/package.json` | package構造 | `FCP-PKG-RUNTIME-DEP` |
| 20 | copyleftLicense | `copyleftLicense/package-lock.json` | lockfile license | `FCP-PKG-COPYLEFT` |
| 21 | unknownLicense | `unknownLicense/package-lock.json` | lockfile license | `FCP-PKG-LICENSE-UNKNOWN` |
| 22 | fetch | `fetch/bad.ts` | source AST | `FCP-SRC-FETCH` |
| 23 | xhr | `xhr/bad.ts` | source AST | `FCP-SRC-XHR` |
| 24 | websocket | `websocket/bad.ts` | source AST | `FCP-SRC-WEBSOCKET` |
| 25 | eventSource | `eventSource/bad.ts` | source AST | `FCP-SRC-EVENTSOURCE` |
| 26 | sendBeacon | `sendBeacon/bad.ts` | source AST | `FCP-SRC-SENDBEACON` |
| 27 | invoke | `invoke/bad.ts` | source AST | `FCP-SRC-INVOKE` |
| 28 | consoleError | `consoleError/bad.ts` | source AST | `FCP-SRC-CONSOLE-ERROR` |
| 29 | consoleLog | `consoleLog/bad.ts` | source AST | `FCP-SRC-CONSOLE-LOG` |
| 30 | globalHandlerCallsConsoleError | `globalHandlerCallsConsoleError/bad.ts` | source AST | `FCP-SRC-HANDLER-CONSOLE` |
| 31 | ciPaidRunner | `ciPaidRunner/workflow.yml` | CI設定 | `FCP-CI-RUNNER` |
| 32 | ciArtifactUpload | `ciArtifactUpload/workflow.yml` | CI設定 | `FCP-CI-ARTIFACT-UPLOAD` |
| 33 | confirmScopes | `confirmScopes/workflow.yml` | CI設定 | `FCP-CI-CONFIRM-SCOPES` |

複数ruleが同時に発火するfixture(例: `queue` は `FCP-MAN-CONSUMER` も発火)は、期待rule IDが検出結果に**含まれる**ことを合格とする。

## fixtureを持たない検査rule(正常系・完全性)

| rule ID | 内容 |
|---|---|
| `FCP-MAN-PARSE` / `FCP-MAN-UNKNOWN-KEY` / `FCP-MAN-MODULE` / `FCP-MAN-MACRO` / `FCP-MAN-RESOURCE` / `FCP-MAN-SCOPE` / `FCP-MAN-APP` / `FCP-MAN-EXTERNAL-PERMISSION` | manifest正許可リスト照合。未知keyは `UNKNOWN`(fail closed) |
| `FCP-PKG-LOCK-SYNC` / `FCP-PKG-PARSE` | package.json / lockfile整合・解析可能性 |
| `FCP-SRC-BRIDGE-API` / `FCP-SRC-BRIDGE-SCOPE` / `FCP-SRC-FORGE-API` / `FCP-SRC-EXTERNAL-IMPORT` / `FCP-SRC-CONSOLE-OTHER` | Bridge API許可リスト、`src/shared/api` 外のbridge import、外部package import、その他console |
| `FCP-SRC-HANDLER-REQUIRED` / `FCP-SRC-HANDLER-ENTRY` / `FCP-SRC-HANDLER-RETHROW` | global error handler の登録必須・entry組込・再throw禁止(V1仕様書 §8.4) |
| `FCP-BLD-MISSING` / `FCP-BLD-CONSOLE` / `FCP-BLD-COMM` / `FCP-BLD-FORGE-API` / `FCP-BLD-ORIGIN` | production build走査(最終防衛線) |
| `FCP-CI-MISSING` / `FCP-CI-PARSE` / `FCP-CI-LFS` / `FCP-CI-RETENTION` / `FCP-CI-UNKNOWN-ACTION` / `FCP-CI-PROD-DEPLOY` / `FCP-CI-PLAN` | CI/repository設定。provider planは register の裁定記録IDで判定(ガイド §4.1 手順5) |
| `FCP-FIX-MISSING` / `FCP-FIX-MISS` / `FCP-EXEC` | fixture自己試験と検査完全性(実行不能は非0) |

## 判定

- `GREEN`: 検出0。exit 0。
- `RED`: 検出対象あり。exit 1。
- `UNKNOWN`: 未知key、解析不能、裁定記録不備等。exit 1(fail closed)。

## WU-0実装時の実測記録

初回実行で静的ゲートが実際に検出した事項(ハーネスの有効性確認を兼ねる):

1. Viteのmodulepreload polyfillがproduction buildに `fetch()` を残す → `FCP-BLD-COMM` で検出。`vite.config.ts` で `modulePreload.polyfill: false` として除去(対象ブラウザChrome/Edgeはnative対応)。
2. `@forge/bridge@7` のtransitive依存 `@forge/*` 5packageのlicense表記が非SPDX(`SEE LICENSE IN LICENSE.txt`、Forge Terms) → L2 §0.1が `@forge/bridge` を明示許可するため、policyの `trustedScopes: ["@forge/"]` としてSPDX照合を免除。第三者packageには適用されない。
3. `argparse`(transitive)のPython-2.0はpermissiveのため許可リストへ追加。
