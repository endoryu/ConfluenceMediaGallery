import { describe, expect, it } from 'vitest';
import type { AttachmentSummary } from '../../src/shared/types/media';
import {
  buildMediaModel,
  isGalleryItem,
  pickThumbBucket,
  selectThumb,
} from '../../src/gallery/media-items';

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

function thumbOf(
  cacheId: string,
  targetId: string,
  targetVersion: number,
  width: number,
): AttachmentSummary {
  return makeItem(cacheId, {
    title: `mg_thumbcache_${targetId}_v${targetVersion}_w${width}`,
    mediaType: 'image/jpeg',
    version: 2,
  });
}

describe('buildMediaModel', () => {
  it('media・thumb・config・staleを分離する(全分岐)', () => {
    const model = buildMediaModel([
      makeItem('100', { version: 3 }),
      makeItem('200', { kind: 'video', mediaType: 'video/mp4' }),
      makeItem('300', { kind: 'unsupported', mediaType: 'application/pdf' }), // 非メディア
      thumbOf('900', '100', 3, 320), // 有効(版一致)
      thumbOf('901', '100', 3, 640), // 有効
      thumbOf('902', '100', 2, 320), // stale(旧版)
      thumbOf('903', '999', 1, 320), // stale(対象喪失)
      makeItem('800', { title: 'mg_thumbcache_config', kind: 'unsupported', mediaType: 'application/json' }),
    ]);

    expect(model.media.map((m) => m.attachmentId)).toEqual(['100', '200']);
    expect(model.configItem?.attachmentId).toBe('800');
    expect(model.thumbsByTarget.get('100')?.map((t) => t.width)).toEqual([320, 640]);
    expect(model.thumbsByTarget.get('100')?.[0]?.cacheAttachmentId).toBe('900');
    expect(model.thumbsByTarget.get('100')?.[0]?.cacheVersion).toBe(2);
    expect(model.thumbsByTarget.has('200')).toBe(false);
    expect(model.staleThumbs.map((t) => t.cacheAttachmentId).sort()).toEqual(['902', '903']);
  });

  it('thumb・configはグリッド対象から除外される', () => {
    expect(isGalleryItem(thumbOf('1', '2', 1, 320))).toBe(false);
    expect(
      isGalleryItem(makeItem('3', { title: 'mg_thumbcache_config', kind: 'unsupported' })),
    ).toBe(false);
  });
});

describe('pickThumbBucket', () => {
  it('表示幅×DPR以上の最小、上限640(V1 §6.3)', () => {
    expect(pickThumbBucket(220, 1)).toBe(320);
    expect(pickThumbBucket(320, 1)).toBe(320);
    expect(pickThumbBucket(321, 1)).toBe(640);
    expect(pickThumbBucket(220, 2)).toBe(640); // 440 → 640
    expect(pickThumbBucket(400, 2)).toBe(640); // 800 → 上限640
    expect(pickThumbBucket(100, 0.5)).toBe(320); // DPR<1は1として扱う
  });
});

describe('selectThumb', () => {
  const thumbs = [
    { cacheAttachmentId: 'a', cacheVersion: 1, targetAttachmentId: '1', targetVersion: 1, width: 320 },
    { cacheAttachmentId: 'b', cacheVersion: 1, targetAttachmentId: '1', targetVersion: 1, width: 640 },
  ] as const;

  it('希望bucket以上の最小を選ぶ', () => {
    expect(selectThumb(thumbs, 320)?.cacheAttachmentId).toBe('a');
    expect(selectThumb(thumbs, 640)?.cacheAttachmentId).toBe('b');
  });

  it('希望を満たすものがなければ最大幅、空はnull(原寸fallback)', () => {
    expect(selectThumb([thumbs[0]], 640)?.cacheAttachmentId).toBe('a');
    expect(selectThumb([], 320)).toBeNull();
    expect(selectThumb(undefined, 320)).toBeNull();
  });
});
