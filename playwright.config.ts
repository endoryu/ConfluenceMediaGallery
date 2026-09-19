import { existsSync } from 'node:fs';
import { defineConfig } from '@playwright/test';

// 実site E2E(ガイド §7)。認証状態は local/storageState.json(ユーザーが
// scripts/e2e-login.mjs で作成。commit禁止)。ブラウザはインストール済みの
// Chrome/Edgeをchannel指定で使用する(追加ダウンロードなし)。
// trace/HAR/screenshot等の原本は local/ 配下へ(CLAUDE.md §10)。
const STORAGE_STATE = 'local/storageState.json';

export default defineConfig({
  testDir: 'tests/e2e',
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
