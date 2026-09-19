// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import type { AttachmentSummary } from '../../src/shared/types/media';
import { buildMediaModel } from '../../src/gallery/media-items';
import { buildViewerSnapshot } from '../../src/gallery/viewer-launch';
import { parseViewerSnapshot } from '../../src/viewer/snapshot';
import { ViewerApp, itemImageUrl } from '../../src/viewer/viewer-app';

function makeItem(id: string, overrides: Partial<AttachmentSummary> = {}): AttachmentSummary {
  return {
    attachmentId: id,
    pageId: 'page-1',
    title: `photo-${id}.png`,
    mediaType: 'image/png',
    kind: 'image',
    version: 2,
    ...overrides,
  };
}

const SITE = 'https://example.atlassian.net';

function makeShell(): HTMLElement {
  const root = document.createElement('div');
  root.className = 'mgv-viewer';
  root.innerHTML =
    '<div class="mgv-stage"><img class="mgv-image" alt="" hidden /></div><p class="mgv-status" hidden></p>';
  return root;
}

describe('buildViewerSnapshot(§7.1)', () => {
  const items = [
    makeItem('a1'),
    makeItem('a2', { kind: 'video', mediaType: 'video/mp4' }),
    makeItem('a3'),
  ];
  const model = buildMediaModel([
    ...items,
    makeItem('c1', { title: 'mg_thumbcache_a3_v2_w640', version: 5 }),
  ]);

  it('imageのみで列を構成し、選択indexとthumb参照(w640)を持つ', () => {
    const snapshot = buildViewerSnapshot({
      items,
      model,
      siteBaseUrl: SITE,
      pageId: 'page-1',
      attachmentId: 'a3',
      now: () => 1234,
    });
    expect(snapshot?.items.map((i) => i.attachmentId)).toEqual(['a1', 'a3']);
    expect(snapshot?.index).toBe(1);
    expect(snapshot?.items[1]?.thumb).toEqual({
      cacheAttachmentId: 'c1',
      cacheVersion: 5,
      width: 640,
    });
    expect(snapshot?.items[0]?.thumb).toBeUndefined(); // 原寸fallback
    expect(snapshot?.t0).toBe(1234);
  });

  it('video/audio・不在idはnull(Phase 4まで開かない)', () => {
    expect(
      buildViewerSnapshot({ items, model, siteBaseUrl: SITE, pageId: 'p', attachmentId: 'a2' }),
    ).toBeNull();
    expect(
      buildViewerSnapshot({ items, model, siteBaseUrl: SITE, pageId: 'p', attachmentId: 'zz' }),
    ).toBeNull();
  });

  it('build→parseの往復が一致する(JSON経由)', () => {
    const snapshot = buildViewerSnapshot({
      items,
      model,
      siteBaseUrl: SITE,
      pageId: 'page-1',
      attachmentId: 'a1',
      rateLimit: { phase: 'Degraded', retryAfterMs: 0 },
    });
    const parsed = parseViewerSnapshot(JSON.parse(JSON.stringify(snapshot)));
    expect(parsed).toEqual(snapshot);
  });
});

describe('parseViewerSnapshot(防御)', () => {
  it('不正入力はnull', () => {
    for (const bad of [
      null,
      {},
      { schemaVersion: 2 },
      { schemaVersion: 1, siteBaseUrl: SITE, pageId: 'p', index: 0, items: [] }, // 空
      { schemaVersion: 1, siteBaseUrl: SITE, pageId: 'p', index: 5, items: [{ attachmentId: 'a', pageId: 'p', version: 1, title: 't', kind: 'image' }] }, // index範囲外
      { schemaVersion: 1, siteBaseUrl: SITE, pageId: 'p', index: 0, items: [{ attachmentId: 'a' }] }, // item欠落
    ]) {
      expect(parseViewerSnapshot(bad)).toBeNull();
    }
  });
});

describe('ViewerApp.start(WU-1: 起動後の最初の処理=画像URL設定)', () => {
  it('thumb参照があればthumbの正規形URL、なければ原寸', () => {
    const withThumb = {
      attachmentId: 'a3',
      pageId: 'page-1',
      version: 2,
      title: 't',
      kind: 'image' as const,
      thumb: { cacheAttachmentId: 'c1', cacheVersion: 5, width: 640 },
    };
    expect(itemImageUrl(SITE, withThumb)).toBe(
      `${SITE}/wiki/rest/api/content/page-1/child/attachment/c1/download?version=5`,
    );
    const { thumb: _thumb, ...noThumb } = withThumb;
    expect(itemImageUrl(SITE, noThumb)).toBe(
      `${SITE}/wiki/rest/api/content/page-1/child/attachment/a3/download?version=2`,
    );
  });

  it('startでimgへsrc設定・表示され、markが打たれる', () => {
    const root = makeShell();
    const marks: string[] = [];
    const app = new ViewerApp({
      root,
      snapshot: {
        schemaVersion: 1,
        siteBaseUrl: SITE,
        pageId: 'page-1',
        index: 0,
        items: [
          { attachmentId: 'a1', pageId: 'page-1', version: 2, title: 't', kind: 'image' },
        ],
        t0: 0,
      },
      onMark: (name) => marks.push(name),
    });
    app.start();
    const img = root.querySelector<HTMLImageElement>('.mgv-image');
    expect(img?.getAttribute('src')).toContain('/child/attachment/a1/download?version=2');
    expect(img?.hidden).toBe(false);
    expect(marks).toContain('p2.viewer.image-url-set');
  });
});
