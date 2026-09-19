import { describe, expect, it } from 'vitest';
import { MockConfluenceApi } from '../../src/shared/api/mock-confluence-api';
import type { AttachmentSummary } from '../../src/shared/types/media';
import type { GalleryStatusState, GalleryView } from '../../src/gallery/gallery-controller';
import { GalleryController, compareGalleryOrder } from '../../src/gallery/gallery-controller';
import { isGalleryItem } from '../../src/gallery/media-items';

function makeItem(
  id: string,
  overrides: Partial<AttachmentSummary> = {},
): AttachmentSummary {
  return {
    attachmentId: id,
    pageId: 'page-1',
    title: `photo-${id}.png`,
    mediaType: 'image/png',
    kind: 'image',
    version: 1,
    updatedAt: '2026-09-01T00:00:00.000Z',
    ...overrides,
  };
}

class StubView implements GalleryView {
  readonly log: string[] = [];
  readonly appendedBatches: string[][] = [];
  statuses: { state: GalleryStatusState; message: string }[] = [];
  reorderCalls: string[][] = [];
  resetCount = 0;
  cleared = 0;

  showStatus(state: GalleryStatusState, message: string): void {
    this.statuses.push({ state, message });
  }
  clearStatus(): void {
    this.cleared += 1;
  }
  appendTiles(items: readonly AttachmentSummary[]): void {
    this.log.push('append');
    this.appendedBatches.push(items.map((i) => i.attachmentId));
  }
  reorderTiles(orderedIds: readonly string[]): void {
    this.reorderCalls.push([...orderedIds]);
  }
  resetTiles(): void {
    this.resetCount += 1;
  }
}

const syncRaf = (callback: () => void): void => callback();

describe('isGalleryItem', () => {
  it('mg_thumbcache_添付と非メディアを除外する', () => {
    expect(isGalleryItem(makeItem('1'))).toBe(true);
    expect(isGalleryItem(makeItem('2', { kind: 'video' }))).toBe(true);
    expect(isGalleryItem(makeItem('3', { kind: 'audio' }))).toBe(true);
    expect(isGalleryItem(makeItem('4', { kind: 'unsupported' }))).toBe(false);
    expect(isGalleryItem(makeItem('5', { title: 'mg_thumbcache_10_v1_w320' }))).toBe(false);
  });
});

describe('compareGalleryOrder', () => {
  it('更新日時降順、同一日時はattachmentId昇順(数値幅対応)', () => {
    const items = [
      makeItem('10', { updatedAt: '2026-09-01T00:00:00.000Z' }),
      makeItem('2', { updatedAt: '2026-09-01T00:00:00.000Z' }),
      makeItem('5', { updatedAt: '2026-09-03T00:00:00.000Z' }),
      makeItem('7', { updatedAt: '2026-09-02T00:00:00.000Z' }),
    ];
    const sorted = [...items].sort(compareGalleryOrder).map((i) => i.attachmentId);
    expect(sorted).toEqual(['5', '7', '2', '10']);
  });

  it('att形式idも数値部で昇順比較する', () => {
    const t = '2026-09-01T00:00:00.000Z';
    const items = [
      makeItem('att100', { updatedAt: t }),
      makeItem('att9', { updatedAt: t }),
      makeItem('att20', { updatedAt: t }),
    ];
    expect([...items].sort(compareGalleryOrder).map((i) => i.attachmentId)).toEqual([
      'att9',
      'att20',
      'att100',
    ]);
  });

  it('updatedAt欠落はcreatedAtへfallbackする', () => {
    const a = makeItem('1', { updatedAt: undefined as never, createdAt: '2026-09-05T00:00:00.000Z' });
    const b = makeItem('2', { updatedAt: '2026-09-04T00:00:00.000Z' });
    expect([b, a].sort(compareGalleryOrder)[0]?.attachmentId).toBe('1');
  });
});

describe('GalleryController.loadAll', () => {
  it('ページ到着ごとに描画し、1ページ目で最初のbatchとclearStatusを行う', async () => {
    const items = Array.from({ length: 120 }, (_, i) => makeItem(String(i + 1)));
    const api = new MockConfluenceApi(items);
    const view = new StubView();
    let firstBatch = 0;
    const listCalls: string[] = [];
    const wrapped = new Proxy(api, {
      get(target, prop, receiver) {
        if (prop === 'listAttachments') {
          return (pageId: string, cursor?: string, limit?: number) => {
            view.log.push('list');
            listCalls.push(cursor ?? 'first');
            return target.listAttachments(pageId, cursor, limit);
          };
        }
        return Reflect.get(target, prop, receiver) as unknown;
      },
    });

    const controller = new GalleryController({
      api: wrapped,
      pageId: 'page-1',
      view,
      raf: syncRaf,
      onFirstBatch: () => {
        firstBatch += 1;
      },
    });
    const result = await controller.loadAll();

    expect(result.ok).toBe(true);
    expect(result.items.length).toBe(120);
    // list→append→list→append→list→append(1ページ目の描画は続きページ取得を待たない)
    expect(view.log).toEqual(['list', 'append', 'list', 'append', 'list', 'append']);
    expect(view.appendedBatches[0]?.length).toBe(50);
    expect(firstBatch).toBe(1);
    expect(view.cleared).toBe(1);
    expect(listCalls.length).toBe(3);
  });

  it('1ページがTILES_PER_FRAMEを超える場合はframe分割で追加する(§6.2)', async () => {
    const items = Array.from({ length: 120 }, (_, i) => makeItem(String(i + 1)));
    const api = new MockConfluenceApi(items);
    const view = new StubView();
    let rafCalls = 0;
    const controller = new GalleryController({
      api,
      pageId: 'page-1',
      view,
      limit: 250, // 1ページで120件を返させる(mockはlimitでslice)
      raf: (cb) => {
        rafCalls += 1;
        cb();
      },
    });
    const result = await controller.loadAll();

    expect(result.items.length).toBe(120);
    expect(view.appendedBatches.map((b) => b.length)).toEqual([50, 50, 20]);
    expect(rafCalls).toBe(3);
    // clearStatusとfirst-batchは最初のchunkのみ
    expect(view.cleared).toBe(1);
  });

  it('全件取得後に一度だけ確定順(更新日時降順→id昇順)でreorderする', async () => {
    const items = [
      makeItem('3', { updatedAt: '2026-09-01T00:00:00.000Z' }),
      makeItem('1', { updatedAt: '2026-09-03T00:00:00.000Z' }),
      makeItem('2', { updatedAt: '2026-09-02T00:00:00.000Z' }),
    ];
    const api = new MockConfluenceApi(items);
    const view = new StubView();
    const controller = new GalleryController({ api, pageId: 'page-1', view, raf: syncRaf });
    const result = await controller.loadAll();

    expect(view.reorderCalls).toEqual([['1', '2', '3']]);
    expect(result.items.map((i) => i.attachmentId)).toEqual(['1', '2', '3']);
  });

  it('thumbキャッシュ添付と非メディアはグリッドへ渡さない', async () => {
    const items = [
      makeItem('1'),
      makeItem('2', { title: 'mg_thumbcache_1_v1_w320' }),
      makeItem('3', { kind: 'unsupported', mediaType: 'application/pdf' }),
    ];
    const api = new MockConfluenceApi(items);
    const view = new StubView();
    const controller = new GalleryController({ api, pageId: 'page-1', view, raf: syncRaf });
    const result = await controller.loadAll();

    expect(result.items.map((i) => i.attachmentId)).toEqual(['1']);
    expect(view.appendedBatches).toEqual([['1']]);
    // WU-2: thumb対応表が構築される(mg_thumbcache_1_v1_w320 → 添付1のv1に有効)
    expect(result.model?.thumbsByTarget.get('1')?.[0]?.cacheAttachmentId).toBe('2');
    expect(result.model?.staleThumbs).toEqual([]);
  });

  it('0件はempty表示でok', async () => {
    const api = new MockConfluenceApi([]);
    const view = new StubView();
    const controller = new GalleryController({ api, pageId: 'page-1', view, raf: syncRaf });
    const result = await controller.loadAll();

    expect(result.ok).toBe(true);
    expect(result.items).toEqual([]);
    expect(view.statuses.at(-1)?.state).toBe('empty');
    expect(view.reorderCalls).toEqual([]);
  });

  it('一覧失敗はerror表示、Retry(再loadAll)で復旧しresetTilesされる', async () => {
    const api = new MockConfluenceApi([makeItem('1')]);
    api.setBehavior({ failStatus: 500 });
    const view = new StubView();
    const controller = new GalleryController({ api, pageId: 'page-1', view, raf: syncRaf });

    const failed = await controller.loadAll();
    expect(failed.ok).toBe(false);
    expect(view.statuses.at(-1)?.state).toBe('error');

    api.setBehavior({});
    const retried = await controller.loadAll();
    expect(retried.ok).toBe(true);
    expect(retried.items.map((i) => i.attachmentId)).toEqual(['1']);
    expect(view.resetCount).toBe(2);
  });
});
