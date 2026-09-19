// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { downscaleToJpegBlob } from '../../src/gallery/thumbcache/downscale';

// jsdomはcreateImageBitmap/canvas 2dを提供しない。実ブラウザでの成立性はP0-8
// (G1b)で実証済みのため、ここでは失敗時にthrowせずnote付きで返すことのみ検証する。
describe('downscaleToJpegBlob', () => {
  it('decode不能環境ではblob=nullとnoteを返す(throwしない)', async () => {
    const result = await downscaleToJpegBlob(document, new Blob([new Uint8Array(4)]));
    expect(result.blob).toBeNull();
    expect(result.note).toContain('decode/縮小失敗');
  });
});
