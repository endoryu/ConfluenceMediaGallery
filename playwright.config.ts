import { existsSync } from 'node:fs';
import { defineConfig } from '@playwright/test';

// 実site E2E(ガイド §7)。認証状態は local/storageState.json(ユーザーが
// scripts/e2e-login.mjs で作成。commit禁止)。ブラウザはインストール済みの
// Chrome/Edgeをchannel指定で使用する(追加ダウンロードなし)。
// trace/HAR/screenshot等の原本は local/ 配下へ(CLAUDE.md §10)。
const STORAGE_STATE = 'local/storageState.json';

// Phase 0 probe時代のspec(tests/e2e/phase0/)は回帰資産として保持し、既定実行
// から除外する(Phase1_Spec §5.5)。明示実行: $env:PW_PHASE0='1'; npx playwright test
const RUN_PHASE0 = process.env['PW_PHASE0'] === '1';

export default defineConfig({
  testDir: 'tests/e2e',
  testIgnore: RUN_PHASE0 ? [] : ['**/phase0/**'],
  outputDir: 'local/playwright-output',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 240_000,
  reporter: [['list']],
  use: {
    trace: 'off',
    ...(existsSync(STORAGE_STATE) ? { storageState: STORAGE_STATE } : {}),
    // 計測probeの自動再生を許可(muted再生も併用)
    launchOptions: { args: ['--autoplay-policy=no-user-gesture-required'] },
  },
  projects: [
    { name: 'chrome', use: { channel: 'chrome' } },
    { name: 'edge', use: { channel: 'msedge' } },
  ],
});
