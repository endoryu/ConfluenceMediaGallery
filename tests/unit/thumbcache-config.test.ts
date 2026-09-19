import { describe, expect, it } from 'vitest';
import type { BinaryFetcher } from '../../src/gallery/thumbcache/chunked-fetch';
import {
  loadThumbcacheConfig,
  parseThumbcacheConfig,
} from '../../src/gallery/thumbcache/config';

const VALID = JSON.stringify({
  schemaVersion: 1,
  disabled: false,
  ledger: {
    '100': { version: 3, widths: [320, 640], generatedAt: '2026-09-19T00:00:00.000Z' },
    '200': { version: 1, widths: [320] },
  },
});

describe('parseThumbcacheConfig', () => {
  it('正常なconfigを解析する', () => {
    const config = parseThumbcacheConfig(VALID);
    expect(config?.schemaVersion).toBe(1);
    expect(config?.disabled).toBe(false);
    expect(config?.ledger['100']?.widths).toEqual([320, 640]);
    expect(config?.ledger['200']?.generatedAt).toBeUndefined();
  });

  it('無効化フラグを読む', () => {
    const config = parseThumbcacheConfig('{"schemaVersion":1,"disabled":true}');
    expect(config?.disabled).toBe(true);
    expect(config?.ledger).toEqual({});
  });

  it('壊れた入力はnull(命名スキャンへfallback)', () => {
    for (const bad of [
      'not json',
      '[]',
      'null',
      '{}', // schemaVersionなし
      '{"schemaVersion":"1"}', // 型違い
      '{"schemaVersion":2}', // 未来schema
    ]) {
      expect(parseThumbcacheConfig(bad), bad).toBeNull();
    }
  });

  it('ledgerの不正エントリは黙って捨てる', () => {
    const config = parseThumbcacheConfig(
      JSON.stringify({
        schemaVersion: 1,
        ledger: {
          ok: { version: 1, widths: [320, 'x', 640] },
          broken1: { widths: [320] },
          broken2: 'text',
        },
      }),
    );
    expect(Object.keys(config?.ledger ?? {})).toEqual(['ok']);
    expect(config?.ledger['ok']?.widths).toEqual([320, 640]);
  });
});

describe('loadThumbcacheConfig', () => {
  it('取得成功でconfigを返す', async () => {
    const fetcher: BinaryFetcher = {
      fetchBinary: () =>
        Promise.resolve({ ok: true, status: 200, blob: new Blob([VALID]) }),
    };
    const config = await loadThumbcacheConfig(fetcher, '/path');
    expect(config?.ledger['100']?.version).toBe(3);
  });

  it('取得失敗・壊れた内容はnull', async () => {
    const fail: BinaryFetcher = {
      fetchBinary: () => Promise.resolve({ ok: false, status: 404 }),
    };
    expect(await loadThumbcacheConfig(fail, '/path')).toBeNull();
    const broken: BinaryFetcher = {
      fetchBinary: () => Promise.resolve({ ok: true, status: 200, blob: new Blob(['{{']) }),
    };
    expect(await loadThumbcacheConfig(broken, '/path')).toBeNull();
    const throws: BinaryFetcher = {
      fetchBinary: () => Promise.reject(new Error('network')),
    };
    expect(await loadThumbcacheConfig(throws, '/path')).toBeNull();
  });
});
