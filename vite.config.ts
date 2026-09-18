import { resolve } from 'node:path';
import { defineConfig } from 'vite';

// Gallery と Viewer は別 entry(CLAUDE.md §8)。
// root を src に置き、dist/gallery・dist/viewer へ出力する。
export default defineConfig({
  root: 'src',
  publicDir: false,
  build: {
    outDir: resolve(import.meta.dirname, 'dist'),
    emptyOutDir: true,
    sourcemap: false,
    // polyfill は production build に fetch() を残すため無効化する(課金防止ハーネス build走査)。
    // 対象ブラウザ(Chrome/Edge現行)は modulepreload をnative対応済み。
    modulePreload: { polyfill: false },
    rollupOptions: {
      input: {
        gallery: resolve(import.meta.dirname, 'src/gallery/index.html'),
        viewer: resolve(import.meta.dirname, 'src/viewer/index.html'),
      },
    },
  },
});
