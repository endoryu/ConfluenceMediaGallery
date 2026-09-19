// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import type { AttachmentSummary } from '../../src/shared/types/media';
import {
  TileLoader,
  estimateTilesPerViewport,
  priorityForIndex,
} from '../../src/gallery/tile-loader';

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

/** IOをテストから駆動する擬似observer */
function fakeObserverFactory(): {
  create: (cb: IntersectionObserverCallback) => IntersectionObserver;
  intersect: (target: Element) => void;
} {
  let callback: IntersectionObserverCallback | null = null;
  const observed = new Set<Element>();
  const observer = {
    observe: (el: Element) => observed.add(el),
    unobserve: (el: Element) => observed.delete(el),
    disconnect: () => observed.clear(),
    takeRecords: () => [],
    root: null,
    rootMargin: '',
    thresholds: [],
  } as unknown as IntersectionObserver;
  return {
    create: (cb) => {
      callback = cb;
      return observer;
    },
    intersect: (target) => {
      callback?.(
        [{ target, isIntersecting: true } as unknown as IntersectionObserverEntry],
        observer,
      );
    },
  };
}

describe('priorityForIndex(§6.3の3層)', () => {
  it('初回viewport=high、直近1画面=auto、以遠=low', () => {
    expect(priorityForIndex(0, 12)).toBe('high');
    expect(priorityForIndex(11, 12)).toBe('high');
    expect(priorityForIndex(12, 12)).toBe('auto');
    expect(priorityForIndex(23, 12)).toBe('auto');
    expect(priorityForIndex(24, 12)).toBe('low');
  });
});

describe('estimateTilesPerViewport', () => {
  it('列数・行数・タイル幅を概算する', () => {
    // 幅700px、min220、gap8 → 3列。タイル幅(700-16)/3=228、高さ171
    const est = estimateTilesPerViewport(700, 900, 220, 8);
    expect(est.columns).toBe(3);
    expect(est.tileWidth).toBeCloseTo(228, 0);
    expect(est.rows).toBe(Math.ceil(900 / (est.tileWidth * 0.75 + 8)));
    expect(est.count).toBe(est.columns * est.rows);
  });

  it('狭い幅でも最低1列', () => {
    expect(estimateTilesPerViewport(100, 500, 220, 8).columns).toBe(1);
  });
});

describe('TileLoader.assign', () => {
  it('high/autoは即時src設定、fetchpriority付与', () => {
    const loader = new TileLoader({
      resolveSrc: () => ({ src: 'mock://thumb/1', isOriginalFallback: false }),
      createObserver: fakeObserverFactory().create,
    });
    const host = document.createElement('span');
    loader.assign(host, makeItem('1'), 'high', 228);
    const img = host.querySelector('img');
    expect(img?.getAttribute('src')).toBe('mock://thumb/1');
    expect(img?.getAttribute('fetchpriority')).toBe('high');
    expect(img?.dataset['fallback']).toBe('0');
  });

  it('lowはIO交差までsrcを与えない(viewport周辺限定 — §13.3)', () => {
    const fake = fakeObserverFactory();
    const loader = new TileLoader({
      resolveSrc: () => ({ src: 'mock://original/2', isOriginalFallback: true }),
      createObserver: fake.create,
    });
    const host = document.createElement('span');
    loader.assign(host, makeItem('2'), 'low', 228);
    const img = host.querySelector('img');
    expect(img?.loading).toBe('lazy');
    expect(img?.getAttribute('src')).toBeNull();
    fake.intersect(host);
    expect(img?.getAttribute('src')).toBe('mock://original/2');
    expect(img?.dataset['fallback']).toBe('1');
  });

  it('resolveSrcがnull(動画等)はimgを作らない', () => {
    const loader = new TileLoader({
      resolveSrc: () => null,
      createObserver: fakeObserverFactory().create,
    });
    const host = document.createElement('span');
    loader.assign(host, makeItem('3', { kind: 'video' }), 'high', 228);
    expect(host.querySelector('img')).toBeNull();
  });

  it('load/errorイベントでonLoaded/onFailureが呼ばれる', () => {
    const events: string[] = [];
    const loader = new TileLoader({
      resolveSrc: () => ({ src: 'mock://thumb/4', isOriginalFallback: false }),
      onLoaded: (item) => events.push(`loaded:${item.attachmentId}`),
      onFailure: (item) => events.push(`failed:${item.attachmentId}`),
      createObserver: fakeObserverFactory().create,
    });
    const host = document.createElement('span');
    loader.assign(host, makeItem('4'), 'high', 228);
    const img = host.querySelector('img');
    img?.dispatchEvent(new Event('load'));
    img?.dispatchEvent(new Event('error'));
    expect(events).toEqual(['loaded:4', 'failed:4']);
  });
});
