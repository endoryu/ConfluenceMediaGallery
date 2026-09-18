import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/unit/**/*.test.ts', 'tests/integration/**/*.test.ts'],
    exclude: ['tests/e2e/**', 'tests/cost-guard/**'],
    // 既定は node。DOM が必要なテストはファイル先頭の
    // `// @vitest-environment jsdom` docblock で個別に切り替える。
    environment: 'node',
  },
});
