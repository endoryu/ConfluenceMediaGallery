import { describe, expect, it } from 'vitest';
import { CachingConfluenceApi } from '../../src/shared/api/caching-confluence-api';
import { MockConfluenceApi } from '../../src/shared/api/mock-confluence-api';
import type { AttachmentSummary } from '../../src/shared/types/media';

const items: AttachmentSummary[] = Array.from({ length: 3 }, (_, i) => ({
  attachmentId: `a${i}`,
  pageId: 'p1',
  title: `f${i}.png`,
  mediaType: 'image/png',
  kind: 'image',
  version: 1,
  authorId: `acc-${i}`,
}));

const users = items.map((i) => ({ accountId: i.authorId!, displayName: `User ${i.authorId}` }));

function count(mock: MockConfluenceApi, prefix: string): number {
  return mock.calls.filter((c) => c.startsWith(prefix)).length;
}

describe('CachingConfluenceApi(WU-7作業5: 重複送信確認)', () => {
  it('in-flight dedupe: 並行同一要求は下位へ1回だけ届く', async () => {
    const mock = new MockConfluenceApi(items);
    mock.setBehavior({ delayMs: 20 });
    const api = new CachingConfluenceApi(mock);

    await Promise.all([api.listAttachments('p1'), api.listAttachments('p1'), api.listAttachments('p1')]);

    expect(count(mock, 'list:')).toBe(1);
    expect(api.stats.dedupeHits).toBe(2);
  });

  it('セッションキャッシュ: 2回目以降は下位呼び出しなし(一覧・詳細)', async () => {
    const mock = new MockConfluenceApi(items);
    const api = new CachingConfluenceApi(mock);

    await api.listAttachments('p1');
    await api.listAttachments('p1');
    await api.getAttachment('a1');
    await api.getAttachment('a1');

    expect(count(mock, 'list:')).toBe(1);
    expect(count(mock, 'get:')).toBe(1);
    expect(api.stats.cacheHits).toBe(2);
  });

  it('users-bulk集約: 同一event loop内の複数要求が1回のbulkに集約される', async () => {
    const mock = new MockConfluenceApi(items, users);
    const api = new CachingConfluenceApi(mock);

    const [u1, u2] = await Promise.all([
      api.resolveUsers(['acc-0']),
      api.resolveUsers(['acc-1', 'acc-2']),
    ]);

    expect(count(mock, 'users:')).toBe(1);
    expect(mock.calls.find((c) => c.startsWith('users:'))).toBe('users:3');
    expect(u1.map((u) => u.accountId)).toEqual(['acc-0']);
    expect(u2.map((u) => u.accountId)).toEqual(['acc-1', 'acc-2']);
  });

  it('更新者キャッシュ: 解決済みaccountIdは再要求しない', async () => {
    const mock = new MockConfluenceApi(items, users);
    const api = new CachingConfluenceApi(mock);

    await api.resolveUsers(['acc-0', 'acc-1']);
    await api.resolveUsers(['acc-0']);

    expect(count(mock, 'users:')).toBe(1);
  });

  it('savingsEnabled=false: 全節約策が無効(毎回下位へ届く)', async () => {
    const mock = new MockConfluenceApi(items, users);
    const api = new CachingConfluenceApi(mock, false);

    await Promise.all([api.listAttachments('p1'), api.listAttachments('p1')]);
    await api.getAttachment('a1');
    await api.getAttachment('a1');
    await api.resolveUsers(['acc-0']);
    await api.resolveUsers(['acc-0']);

    expect(count(mock, 'list:')).toBe(2);
    expect(count(mock, 'get:')).toBe(2);
    expect(count(mock, 'users:')).toBe(2);
    expect(api.stats.dedupeHits).toBe(0);
    expect(api.stats.cacheHits).toBe(0);
  });
});
