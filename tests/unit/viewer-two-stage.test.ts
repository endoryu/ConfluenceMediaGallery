// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import type { ViewerSnapshot } from '../../src/shared/types/viewer-snapshot';
import { ViewerApp } from '../../src/viewer/viewer-app';

const SITE = 'https://example.atlassian.net';

function makeSnapshot(withThumb: boolean, count = 1): ViewerSnapshot {
  return {
    schemaVersion: 1,
    siteBaseUrl: SITE,
    pageId: 'page-1',
    index: 0,
    items: Array.from({ length: count }, (_, i) => ({
      attachmentId: `a${i + 1}`,
      pageId: 'page-1',
      version: 2,
      title: `photo-${i + 1}.png`,
      kind: 'image' as const,
      ...(withThumb
        ? { thumb: { cacheAttachmentId: `c${i + 1}`, cacheVersion: 5, width: 640 } }
        : {}),
    })),
    t0: 0,
  };
}

function makeShell(): HTMLElement {
  const root = document.createElement('div');
  root.className = 'mgv-viewer';
  root.innerHTML =
    '<div class="mgv-stage"><img class="mgv-image" alt="" hidden /></div><p class="mgv-status" hidden></p>';
  return root;
}

interface Harness {
  root: HTMLElement;
  app: ViewerApp;
  marks: string[];
  preloads: HTMLImageElement[];
  rafQueue: (() => void)[];
  flushRaf: () => void;
  img: () => HTMLImageElement;
}

function makeHarness(snapshot: ViewerSnapshot): Harness {
  const root = makeShell();
  const marks: string[] = [];
  const preloads: HTMLImageElement[] = [];
  const rafQueue: (() => void)[] = [];
  const app = new ViewerApp({
    root,
    snapshot,
    raf: (cb) => rafQueue.push(cb),
    createPreload: () => {
      const el = document.createElement('img');
      // jsdomはdecode未実装のためstub(§7.4のload+decode待ちを模擬)
      (el as { decode: () => Promise<void> }).decode = () => Promise.resolve();
      preloads.push(el);
      return el;
    },
    onMark: (name) => marks.push(name),
  });
  return {
    root,
    app,
    marks,
    preloads,
    rafQueue,
    flushRaf: () => {
      while (rafQueue.length) rafQueue.shift()?.();
    },
    img: () => root.querySelector<HTMLImageElement>('.mgv-image') as HTMLImageElement,
  };
}

const tick = (): Promise<void> => new Promise((r) => setTimeout(r, 0));

describe('ViewerApp 2段表示(§7.4)', () => {
  it('thumb即表示→Original preload成功→次frameで一度だけswap', async () => {
    const h = makeHarness(makeSnapshot(true));
    h.app.start();
    expect(h.img().src).toContain('/child/attachment/c1/download?version=5'); // 前段=thumb
    h.img().dispatchEvent(new Event('load'));
    expect(h.marks).toContain('p2.viewer.stage1-visible');

    expect(h.preloads.length).toBe(1);
    expect(h.preloads[0]?.src).toContain('/child/attachment/a1/download?version=2');
    h.preloads[0]?.dispatchEvent(new Event('load'));
    await tick();
    // swapはraf内で一度だけ。raf実行までは前段(thumb)のまま(§13.3)
    expect(h.img().src).toContain('/c1/');
    expect(h.rafQueue.length).toBe(1);
    h.flushRaf();
    expect(h.img().src).toContain('/child/attachment/a1/download?version=2');
    expect(h.marks.filter((m) => m === 'p2.viewer.original-swap').length).toBe(1);
  });

  it('thumbなしは原寸を直接表示し、preloadしない', () => {
    const h = makeHarness(makeSnapshot(false));
    h.app.start();
    expect(h.img().src).toContain('/child/attachment/a1/download?version=2');
    expect(h.preloads.length).toBe(0);
  });

  it('Original失敗はthumb表示を維持する(§11)', async () => {
    const h = makeHarness(makeSnapshot(true));
    h.app.start();
    h.img().dispatchEvent(new Event('load')); // thumb表示済み
    h.preloads[0]?.dispatchEvent(new Event('error'));
    await tick();
    expect(h.img().src).toContain('/c1/'); // thumb維持
    expect(h.img().hidden).toBe(false);
    expect(h.root.querySelector('.mgv-status')?.textContent).toBe(''); // エラーUIなし
  });

  it('すべて失敗でエラーfallback(Retry/Originalを開く/ダウンロード)、Retryで再実行', async () => {
    const h = makeHarness(makeSnapshot(true));
    h.app.start();
    h.img().dispatchEvent(new Event('error')); // thumbも失敗
    h.preloads[0]?.dispatchEvent(new Event('error'));
    await tick();
    const status = h.root.querySelector<HTMLElement>('.mgv-status');
    expect(status?.hidden).toBe(false);
    expect(status?.textContent).toContain('画像を読み込めませんでした');
    const open = status?.querySelector<HTMLAnchorElement>('.mgv-open-original');
    expect(open?.href).toContain('/child/attachment/a1/download?version=2');
    expect(open?.target).toBe('_blank');
    expect(status?.querySelector('.mgv-download')?.getAttribute('download')).toBe('photo-1.png');
    expect(h.img().hidden).toBe(true);

    status?.querySelector<HTMLButtonElement>('.mgv-retry')?.click();
    expect(status?.hidden).toBe(true); // エラーUI解除
    expect(h.img().hidden).toBe(false);
    expect(h.preloads.length).toBe(2); // 該当要求だけ再実行(§11)
  });

  it('原寸fallbackの失敗は即エラーfallback(全滅)', () => {
    const h = makeHarness(makeSnapshot(false));
    h.app.start();
    h.img().dispatchEvent(new Event('error'));
    expect(h.root.querySelector<HTMLElement>('.mgv-status')?.hidden).toBe(false);
  });

  it('ナビ後のstale preload完了は無視される(世代トークン)', async () => {
    const h = makeHarness(makeSnapshot(true, 2));
    h.app.start();
    const firstPreload = h.preloads[0];
    h.app.showItem(1); // 先へ移動(WU-3経路)
    expect(h.img().src).toContain('/c2/');
    firstPreload?.dispatchEvent(new Event('load')); // 旧世代の完了
    await tick();
    h.flushRaf();
    expect(h.img().src).toContain('/c2/'); // a1へ差し替わらない
    // 新世代のpreloadは進行(a2)
    expect(h.preloads[1]?.src).toContain('/child/attachment/a2/download?version=2');
  });
});
