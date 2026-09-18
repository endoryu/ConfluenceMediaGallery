# WU-1 probe app骨格 結果記録

- 実施日: 2026-09-18
- commit: 63a0ac1(実装merge)+ 2f7cad6(resource構成修正)
- 環境: deploy済みdevelopment(install先: ryu-dev.atlassian.net、app version 2.1.0)
- 本記録はWU-1の機能確認であり、性能証跡ではない(条件未統制。P0性能証跡はWU-2以降で§6.2の条件に従い取得する)

## 合格条件との対応(Phase0_Spec §4 WU-1)

| 合格条件 | 結果 | 根拠 |
|---|---|---|
| deploy済みdevelopmentでmacroを置くとAttachment一覧が表示される | **合格** | `MG-00-Smoke`(pageId 229378)で一覧表示。`GET /wiki/api/v2/pages/{pageId}/attachments` → 200。診断パネルJSON(下記)をユーザーが取得 |
| `verify`(`forge lint` 含む)が通る | **合格** | ローカル`forge lint`: No issues found。deploy時lint: No issues found。verify:local GREEN |
| Runs on Atlassian適格の表示 | **合格** | `forge deploy -e development` 出力に「eligible for the Runs on Atlassian program」(v2.0.0/v2.1.0とも) |

## deploy / installログ(sanitize済み)

```
forge deploy -e development
  Running forge lint... No issues found.
  √ Deployed  (v2.0.0 → 修正後 v2.1.0)
  i The version of your app [2.1.0] ... is eligible for the Runs on Atlassian program.

forge install --site ryu-dev.atlassian.net --product confluence -e development
  (scope確認はユーザーが対話実行)
forge install list
  Installation ID: bc42999c-4270-4088-b304-5608ed65ac01
  development / Site / ryu-dev.atlassian.net: Confluence / Version 2 / Up-to-date
```

## 実機での観測(参考値。Cold 1回、throttling・ブラウザ条件は未統制)

診断パネル出力(2026-09-18T12:51:35Z、ユーザー取得、pathのcontext token部は`<ctx>`へ置換):

- `p0.gallery.context.start→end`: 約197ms(view.getContext)
- `p0.api.list.start→end`: 約3072ms(一覧取得、初回Cold)
- responseMeta: `/wiki/api/v2/pages/229378/attachments` status 200、**レート制限系ヘッダーの出現なし**(WU-7の入力)
- request inventory(WU-6のhost一覧入力):
  - `forge.cdn.prod.atlassian-dev.net/global-bridge.js`(partial: true=Timing-Allow-Originなし)
  - `forge.cdn.prod.atlassian-dev.net/iframeResizer.contentWindow.min.js`(partial: true)
  - `<app>.cdn.prod.atlassian-dev.net/<appId>/<env>/<ver>/gallery/<ctx>/assets/index-*.js`(3,441 bytes)
  - 同上 `/assets/vendor-bridge-*.js`(28,025 bytes)

## 実装時の検出と対処

1. Vite既定のビルドは共有assetsを`/assets/`絶対パスで参照し、Forgeのresource単位配信では404 → iframe空白。entryごとの自己完結ビルド+`base: './'`へ変更(2f7cad6)。
2. `@forge/bridge` bundleのSDK内部文字列がbuild走査に検出 → vendor chunk分離(WU-0_cost-guard-rules.md 実測記録4)。

## 関連インシデント

- INCIDENT-001(2026-09-18): ユーザー個人site(ryuendo.atlassian.net)にPremium 30日トライアルが検出され即時停止 → 本プロジェクトのForge操作起因ではないことを確認(install先はryu-devのみ、Forge CLIはsite planに作用しない)。ユーザーがFreeへ変更し解消。支払方法は一貫して未登録。詳細はcost-surface-register裁定記録。

## 未実施と理由

- probeボタンの実動作(Thumbnail/Original/Modal): WU-2/WU-3/WU-5の範囲
- Edge・throttling条件下の計測: P0証跡はWU-2以降でガイド§8の条件に従い取得
- `read:user:confluence`(users-bulk): WU-6でscope追加時に検証
