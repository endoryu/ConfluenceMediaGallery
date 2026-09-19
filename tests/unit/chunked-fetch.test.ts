import { describe, expect, it } from 'vitest';
import type { BinaryFetchOptions, BinaryFetchResult } from '../../src/shared/api/confluence-api';
import type { BinaryFetcher } from '../../src/gallery/thumbcache/chunked-fetch';
import { chunkedFetchBinary } from '../../src/gallery/thumbcache/chunked-fetch';

const CHUNK = 4 * 1024 * 1024;

/** total bytesを持つ仮想binaryをRange対応で返すstub */
function rangeFetcher(total: number, opts: { failAtOffset?: number } = {}): {
  api: BinaryFetcher;
  ranges: string[];
} {
  const ranges: string[] = [];
  const api: BinaryFetcher = {
    fetchBinary(_path: string, o?: BinaryFetchOptions): Promise<BinaryFetchResult> {
      const range = o?.range ?? '';
      ranges.push(range);
      const m = range.match(/bytes=(\d+)-(\d+)/);
      if (!m) return Promise.resolve({ ok: true, status: 200, blob: new Blob([new Uint8Array(total)]) });
      const start = Number(m[1]);
      if (opts.failAtOffset !== undefined && start >= opts.failAtOffset) {
        return Promise.resolve({ ok: false, status: 500, note: 'stub failure' });
      }
      const end = Math.min(Number(m[2]), total - 1);
      const size = end - start + 1;
      return Promise.resolve({
        ok: true,
        status: 206,
        blob: new Blob([new Uint8Array(size)]),
        contentType: 'image/png',
        contentRange: `bytes ${start}-${end}/${total}`,
      });
    },
  };
  return { api, ranges };
}

describe('chunkedFetchBinary', () => {
  it('4MB×Nで全量を結合する', async () => {
    const total = CHUNK * 2 + 1000;
    const { api, ranges } = rangeFetcher(total);
    const progress: number[] = [];
    const result = await chunkedFetchBinary(api, '/path', (loaded) => progress.push(loaded));
    expect(result.blob?.size).toBe(total);
    expect(result.total).toBe(total);
    expect(result.chunks).toBe(3);
    expect(ranges[0]).toBe(`bytes=0-${CHUNK - 1}`);
    expect(progress.at(-1)).toBe(total);
    expect(result.blob?.type).toBe('image/png');
  });

  it('Range非対応(200)は全量1回として扱う', async () => {
    const api: BinaryFetcher = {
      fetchBinary: () =>
        Promise.resolve({ ok: true, status: 200, blob: new Blob([new Uint8Array(123)]) }),
    };
    const result = await chunkedFetchBinary(api, '/path');
    expect(result.blob?.size).toBe(123);
    expect(result.chunks).toBe(1);
    expect(result.note).toContain('Range無視');
  });

  it('Content-Range不明はblobなしで返す', async () => {
    const api: BinaryFetcher = {
      fetchBinary: () =>
        Promise.resolve({ ok: true, status: 206, blob: new Blob([new Uint8Array(10)]) }),
    };
    const result = await chunkedFetchBinary(api, '/path');
    expect(result.blob).toBeUndefined();
    expect(result.note).toContain('Content-Range不明');
  });

  it('上限128MB超過は取得しない', async () => {
    const { api, ranges } = rangeFetcher(129 * 1024 * 1024);
    const result = await chunkedFetchBinary(api, '/path');
    expect(result.blob).toBeUndefined();
    expect(result.note).toContain('上限128MB');
    expect(ranges.length).toBe(1);
  });

  it('途中chunk失敗はnoteを返し結合しない', async () => {
    const { api } = rangeFetcher(CHUNK * 3, { failAtOffset: CHUNK });
    const result = await chunkedFetchBinary(api, '/path');
    expect(result.blob).toBeUndefined();
    expect(result.note).toContain('chunk失敗');
  });

  it('初回chunk失敗はstatusをnoteに含める', async () => {
    const api: BinaryFetcher = {
      fetchBinary: () => Promise.resolve({ ok: false, status: 404 }),
    };
    const result = await chunkedFetchBinary(api, '/path');
    expect(result.blob).toBeUndefined();
    expect(result.note).toContain('status=404');
  });
});
