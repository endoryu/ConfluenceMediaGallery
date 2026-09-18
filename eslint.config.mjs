import js from '@eslint/js';
import prettier from 'eslint-config-prettier';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: [
      'dist/**',
      'local/**',
      'node_modules/**',
      'test-results/**',
      'tests/cost-guard/negative-fixtures/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['src/**/*.ts'],
    languageOptions: {
      globals: { ...globals.browser },
    },
    rules: {
      // 課金防止ハーネス(verify:cost)の一次防衛はAST検査。ESLintは補助線。
      'no-console': 'error',
      'no-restricted-globals': [
        'error',
        { name: 'fetch', message: 'Confluence通信は requestConfluence() のみ(CLAUDE.md §3)' },
        { name: 'XMLHttpRequest', message: '直接通信は禁止(CLAUDE.md §3)' },
        { name: 'WebSocket', message: '直接通信は禁止(CLAUDE.md §3)' },
        { name: 'EventSource', message: '直接通信は禁止(CLAUDE.md §3)' },
      ],
    },
  },
  {
    files: ['tests/**/*.ts', 'scripts/**/*.mjs'],
    languageOptions: {
      globals: { ...globals.node, ...globals.browser },
    },
  },
  {
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
    },
  },
  prettier,
);
