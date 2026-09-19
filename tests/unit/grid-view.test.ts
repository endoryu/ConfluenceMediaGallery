// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import type { AttachmentSummary } from '../../src/shared/types/media';
import { GridView } from '../../src/gallery/grid-view';

function makeItem(id: string, overrides: Partial<AttachmentSummary> = {}): AttachmentSummary {
  return {
    attachmentId: id,
    pageId: 'page-1',
    title: `photo-${id}.png`,
    mediaType: 'image/png',
    kind: 'image',
    version: 1,
    ...overrides,
  };
}

function makeShell(): HTMLElement {
  const root = document.createElement('div');
  root.className = 'mg-gallery';
  root.innerHTML = '<p class="mg-status" data-state="loading">読み込み中…</p><ul class="mg-grid"></ul>';
  return root;
}

function tileIds(root: HTMLElement): string[] {
  return [...root.querySelectorAll<HTMLButtonElement>('.mg-tile')].map(
    (b) => b.dataset['attachmentId'] ?? '',
  );
}

describe('GridView', () => {
  it('タイルをbutton+タイトル要素付きで生成する(§6.2/§6.4)', () => {
    const root = makeShell();
    const view = new GridView(root, () => undefined, () => undefined);
    view.appendTiles([makeItem('1'), makeItem('2', { kind: 'video', title: 'clip.mp4' })]);

    const tiles = root.querySelectorAll<HTMLButtonElement>('button.mg-tile');
    expect(tiles.length).toBe(2);
    expect(tiles[0]?.getAttribute('aria-label')).toBe('photo-1.png');
    // タイトル要素は初回DOM生成時から存在する
    expect(tiles[1]?.querySelector('.mg-tile-title')?.textContent).toBe('clip.mp4');
    expect(tiles[1]?.querySelector('.mg-tile-media')?.textContent).toBe('動画');
  });

  it('同一attachmentIdの再appendは無視する', () => {
    const root = makeShell();
    const view = new GridView(root, () => undefined, () => undefined);
    view.appendTiles([makeItem('1')]);
    view.appendTiles([makeItem('1'), makeItem('2')]);
    expect(tileIds(root)).toEqual(['1', '2']);
  });

  it('reorderTilesは指定順へ一度で並べ替える', () => {
    const root = makeShell();
    const view = new GridView(root, () => undefined, () => undefined);
    view.appendTiles([makeItem('1'), makeItem('2'), makeItem('3')]);
    view.reorderTiles(['3', '1', '2']);
    expect(tileIds(root)).toEqual(['3', '1', '2']);
  });

  it('clickでonActivateにattachmentIdが渡る', () => {
    const root = makeShell();
    const activated: string[] = [];
    const view = new GridView(root, (id) => activated.push(id), () => undefined);
    view.appendTiles([makeItem('7')]);
    root.querySelector<HTMLButtonElement>('.mg-tile')?.click();
    expect(activated).toEqual(['7']);
  });

  it('error表示は再試行buttonを持ち、clickでonRetryが呼ばれる', () => {
    const root = makeShell();
    let retried = 0;
    const view = new GridView(root, () => undefined, () => {
      retried += 1;
    });
    view.showStatus('error', '添付一覧を取得できませんでした');
    const status = root.querySelector<HTMLElement>('.mg-status');
    expect(status?.dataset['state']).toBe('error');
    status?.querySelector('button')?.click();
    expect(retried).toBe(1);

    view.clearStatus();
    expect(status?.hidden).toBe(true);
    expect(status?.querySelector('button')).toBeNull();
  });

  it('resetTilesでグリッドが空になり再appendできる', () => {
    const root = makeShell();
    const view = new GridView(root, () => undefined, () => undefined);
    view.appendTiles([makeItem('1')]);
    view.resetTiles();
    expect(tileIds(root)).toEqual([]);
    view.appendTiles([makeItem('1')]);
    expect(tileIds(root)).toEqual(['1']);
  });
});
