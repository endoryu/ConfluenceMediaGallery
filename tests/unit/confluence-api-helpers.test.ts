import { describe, expect, it } from 'vitest';
import { extractRateLimitHeaders } from '../../src/shared/api/confluence-api';
import { extractCursor } from '../../src/shared/api/v2-mapping';

describe('extractCursor', () => {
  it('_links.nextからcursorを取り出す', () => {
    expect(
      extractCursor('/wiki/api/v2/pages/123/attachments?limit=50&cursor=abc%3D%3D'),
    ).toBe('abc==');
  });

  it('cursorがなければundefined', () => {
    expect(extractCursor('/wiki/api/v2/pages/123/attachments?limit=50')).toBeUndefined();
    expect(extractCursor(undefined)).toBeUndefined();
  });
});

describe('extractRateLimitHeaders', () => {
  it('レート制限系ヘッダーのみ抽出する', () => {
    const headers = new Map<string, string>([
      ['retry-after', '30'],
      ['x-ratelimit-remaining', '10'],
      ['r', 'x'],
      ['content-type', 'application/json'],
    ]);
    const result = extractRateLimitHeaders({ get: (n) => headers.get(n) ?? null });
    expect(result).toEqual({ 'retry-after': '30', 'x-ratelimit-remaining': '10', r: 'x' });
  });
});
