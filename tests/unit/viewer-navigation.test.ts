// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import type { ViewerSnapshot } from '../../src/shared/types/viewer-snapshot';
import { ViewerApp } from '../../src/viewer/viewer-app';

const SITE = 'https://example.atlassian.net';

function makeSnapshot(count: number, index = 0): ViewerSnapshot {
  return {
    schemaVersion: 1,
    siteBaseUrl: SITE,
    pageId: 'page-1',
    index,
    items: Array.from({ length: count }, (_, i) => ({
      attachmentId: `a${i + 1}`,
      pageId: 'page-1',
      version: 1,
      title: `photo-${i + 1}.png`,
      kind: 'image' as const,
    })),
    t0: 0,
  };
}

function makeShell(): HTMLElement {
  const root = document.createElement('div');
  root.className = 'mgv-viewer';
  root.innerHTML =
    '<div class="mgv-stage"><img class="mgv-image" alt="" hidden /></div>' +
    '<button class="mgv-nav mgv-nav--prev" type="button" disabled>p</button>' +
    '<button class="mgv-nav mgv-nav--next" type="button" disabled>n</button>' +
    '<p class="mgv-status" hidden></p>';
  document.body.append(root); // keydownはdocumentで受ける
  return root;
}

function makeApp(root: HTMLElement, snapshot: ViewerSnapshot, onClose?: () => void): ViewerApp {
  return new ViewerApp({
    root,
    snapshot,
    raf: (cb) => cb(),
    createPreload: () => document.createElement('img'),
    ...(onClose ? { onCloseRequest: onClose } : {}),
  });
}

const key = (k: string, target?: Element): void => {
  (target ?? document.body).dispatchEvent(
    new KeyboardEvent('keydown', { key: k, bubbles: true }),
  );
};

describe('ViewerAppナビゲーション(§7.3)', () => {
  it('前後ボタンで移動し、端で無効化される', () => {
    const root = makeShell();
    const app = makeApp(root, makeSnapshot(3));
    app.start();
    const prev = root.querySelector<HTMLButtonElement>('.mgv-nav--prev');
    const next = root.querySelector<HTMLButtonElement>('.mgv-nav--next');
    const img = root.querySelector<HTMLImageElement>('.mgv-image');

    expect(prev?.disabled).toBe(true); // 先頭
    expect(next?.disabled).toBe(false);
    next?.click();
    expect(img?.src).toContain('/a2/');
    next?.click();
    expect(img?.src).toContain('/a3/');
    expect(next?.disabled).toBe(true); // 末尾
    expect(prev?.disabled).toBe(false);
    prev?.click();
    expect(img?.src).toContain('/a2/');
    root.remove();
  });

  it('ArrowLeft/Rightで移動、端では何もしない', () => {
    const root = makeShell();
    const app = makeApp(root, makeSnapshot(2));
    app.start();
    const img = root.querySelector<HTMLImageElement>('.mgv-image');
    key('ArrowLeft'); // 先頭でのprevはno-op
    expect(img?.src).toContain('/a1/');
    key('ArrowRight');
    expect(img?.src).toContain('/a2/');
    key('ArrowRight'); // 末尾でno-op
    expect(img?.src).toContain('/a2/');
    expect(app.currentIndex).toBe(1);
    root.remove();
  });

  it('Escで自前handlerがclose要求を出す(§7.3)', () => {
    const root = makeShell();
    let closed = 0;
    makeApp(root, makeSnapshot(1), () => {
      closed += 1;
    }).start();
    key('Escape');
    expect(closed).toBe(1);
    root.remove();
  });

  it('form control上のキーはcontrolに委ねる(§7.3)', () => {
    const root = makeShell();
    let closed = 0;
    const app = makeApp(root, makeSnapshot(2), () => {
      closed += 1;
    });
    app.start();
    const input = document.createElement('input');
    root.append(input);
    key('ArrowRight', input);
    key('Escape', input);
    expect(app.currentIndex).toBe(0);
    expect(closed).toBe(0);
    root.remove();
  });

  it('ナビで表示状態がfitへ戻り(transform除去)、alt=title(§13.4)', () => {
    const root = makeShell();
    const app = makeApp(root, makeSnapshot(2));
    app.start();
    const img = root.querySelector<HTMLImageElement>('.mgv-image');
    if (img) img.style.transform = 'scale(2)'; // ズーム相当の状態を模擬
    app.showItem(1);
    expect(img?.style.transform).toBe('');
    expect(img?.alt).toBe('photo-2.png');
    root.remove();
  });
});
