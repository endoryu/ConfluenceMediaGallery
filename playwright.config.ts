import { defineConfig, devices } from '@playwright/test';

// E2E は Phase 0 の後続 WU(ユーザー希望時)で使用する。
// trace/HAR 等の原本は local/ 配下に置く(CLAUDE.md §10)。
export default defineConfig({
  testDir: 'tests/e2e',
  outputDir: 'local/playwright-output',
  fullyParallel: false,
  retries: 0,
  reporter: [['list']],
  use: {
    trace: 'off',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
