import { describe, expect, it } from 'vitest';
import type { ClaimChannel } from '../../src/gallery/thumbcache/claim';
import { ThumbcacheClaim } from '../../src/gallery/thumbcache/claim';

/** 同期配送の擬似BroadcastChannelバス */
function makeBus(): { create: (name: string) => ClaimChannel; posts: unknown[] } {
  const listeners = new Set<(event: MessageEvent) => void>();
  const posts: unknown[] = [];
  return {
    posts,
    create: () => {
      const own = new Set<(event: MessageEvent) => void>();
      const channel: ClaimChannel = {
        postMessage(message: unknown) {
          posts.push(message);
          for (const listener of listeners) {
            if (!own.has(listener)) listener({ data: message } as MessageEvent);
          }
        },
        addEventListener(_type, listener) {
          own.add(listener);
          listeners.add(listener);
        },
        close() {
          for (const listener of own) listeners.delete(listener);
          own.clear();
        },
      };
      return channel;
    },
  };
}

const instantWait = (): Promise<void> => Promise.resolve();

describe('ThumbcacheClaim', () => {
  it('単独instanceは獲得できる', async () => {
    const bus = makeBus();
    const claim = new ThumbcacheClaim({
      pageId: 'p1',
      createChannel: bus.create,
      random: () => 0.5,
      wait: instantWait,
    });
    expect(await claim.acquire()).toBe(true);
    expect(bus.posts.some((m) => (m as { kind: string }).kind === 'mg-thumbcache-claim')).toBe(true);
    claim.release();
  });

  it('2 instanceでは小さいtokenが勝つ(先着1 — V1 §5.2)', async () => {
    const bus = makeBus();
    const a = new ThumbcacheClaim({
      pageId: 'p1',
      createChannel: bus.create,
      random: () => 0.1,
      wait: instantWait,
    });
    const b = new ThumbcacheClaim({
      pageId: 'p1',
      createChannel: bus.create,
      random: () => 0.9,
      wait: instantWait,
    });
    const [ra, rb] = await Promise.all([a.acquire(), b.acquire()]);
    expect(ra).toBe(true);
    expect(rb).toBe(false);
    a.release();
  });

  it('稼働中(active)通知を受けたら譲る', async () => {
    const bus = makeBus();
    const bystander = bus.create('mg-thumbcache-p1');
    const claim = new ThumbcacheClaim({
      pageId: 'p1',
      createChannel: bus.create,
      random: () => 0.5,
      wait: async () => {
        bystander.postMessage({ kind: 'mg-thumbcache-active', token: 0.01 });
        await Promise.resolve();
      },
    });
    expect(await claim.acquire()).toBe(false);
  });

  it('BroadcastChannel不可の環境は単独動作とみなす', async () => {
    const claim = new ThumbcacheClaim({
      pageId: 'p1',
      createChannel: () => {
        throw new Error('unavailable');
      },
      wait: instantWait,
    });
    expect(await claim.acquire()).toBe(true);
  });
});
