import { resolve } from 'node:path';
import { defineConfig } from 'vite';

// Gallery と Viewer は別 entry(CLAUDE.md §8)。
// Forge は resource(dist/gallery、dist/viewer)をディレクトリ単位で配信するため、
// entryごとに自己完結したビルドを行い、asset参照は相対パス(base: './')にする。
// 実行: `vite build --mode gallery` と `--mode viewer`(npm run build で両方)。
export default defineConfig(({ mode }) => {
  const entry = mode === 'viewer' ? 'viewer' : 'gallery';
  return {
    root: `src/${entry}`,
    base: './',
    publicDir: false,
    build: {
      outDir: resolve(import.meta.dirname, `dist/${entry}`),
      emptyOutDir: true,
      sourcemap: false,
      // polyfill は production build に fetch() を残すため無効化する(課金防止ハーネス build走査)。
      // 対象ブラウザ(Chrome/Edge現行)は modulepreload をnative対応済み。
      modulePreload: { polyfill: false },
      rollupOptions: {
        output: {
          // @forge/bridge(唯一の許可runtime依存)を専用chunkへ分離する。
          // 自コードchunkはverify:costのbuild走査を全面適用、vendor chunkは
          // policy.build.vendorChunkPrefixes により文字列走査を免除(第一者SDK内部)。
          manualChunks(id: string): string | undefined {
            return id.includes('node_modules') ? 'vendor-bridge' : undefined;
          },
        },
      },
    },
  };
});
