// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { RateLimitStateMachine } from '../../src/shared/api/rate-limit-state';
import type { ViewerSnapshot } from '../../src/shared/types/viewer-snapshot';
import { ViewerApp } from '../../src/viewer/viewer-app';

const SITE = 'https://example.atlassian.net';

function makeSnapshot(count = 2): ViewerSnapshot {
  return {
    schemaVersion: 1,
    siteBaseUrl: SITE,
    pageId: 'page-1',
    index: 0,
    items: Array.from({ length: count }, (_, i) => ({
      attachmentId: `a${i + 1}`,
      pageId: 'page-1',
      version: 1,
      title: `photo-${i + 1}.png`,
      kind: 'image' as const,
    })),
    t0: 0,
  };
}

function makeShell(): HTMLElement {
  const root = document.createElement('div');
  root.innerHTML =
    '<div class="mgv-stage"><img class="mgv-image" alt="" hidden /></div>' +
    '<button class="mgv-nav mgv-nav--prev" type="button"></button>' +
    '<button class="mgv-nav mgv-nav--next" type="button"></button>' +
    '<p class="mgv-status" hidden></p>';
  return root;
}

describe('RateLimitStateMachine export/restore(§11.1の共有)', () => {
  it('Blockedを期限つきで引き継ぎ、期限内はBlocked・超過はNormal', () => {
    const now = 1000;
    const source = new RateLimitStateMachine(() => now);
    source.observe({ status: 429, rateLimitHeaders: { 'retry-after': '90' } });
    const state = source.exportState();
    expect(state.phase).toBe('Blocked');
    expect(state.blockedUntilEpoch).toBe(1000 + 90_000);

    const within = new RateLimitStateMachine(() => now + 10_000);
    within.restoreState(state);
    expect(within.canIssueRequests()).toBe(false);
    expect(within.blockedRemainingMs).toBe(80_000);

    const after = new RateLimitStateMachine(() => now + 100_000);
    after.restoreState(state);
    expect(after.canIssueRequests()).toBe(true);
  });

  it('Degradedを引き継ぐ', () => {
    const machine = new RateLimitStateMachine();
    machine.restoreState({ phase: 'Degraded', retryAfterMs: 0 });
    expect(machine.current).toBe('Degraded');
    expect(machine.canPrefetch()).toBe(false);
  });
});

describe('ViewerApp Blocked待機表示(§11.1.3)', () => {
  function makeBlockedApp(remainingMs: number) {
    const root = makeShell();
    const scheduled: { cb: () => void; ms: number }[] = [];
    let blocked = true;
    const rateLimit = {
      canIssueRequests: () => !blocked,
      get blockedRemainingMs() {
        return remainingMs;
      },
      recordMediaFailure: () => undefined,
    };
    const app = new ViewerApp({
      root,
      snapshot: makeSnapshot(),
      raf: (cb) => cb(),
      createPreload: () => document.createElement('img'),
      rateLimit,
      schedule: (cb, ms) => scheduled.push({ cb, ms }),
    });
    return {
      root,
      app,
      scheduled,
      unblock: () => {
        blocked = false;
      },
      img: () => root.querySelector<HTMLImageElement>('.mgv-image') as HTMLImageElement,
      status: () => root.querySelector<HTMLElement>('.mgv-status') as HTMLElement,
    };
  }

  it('60秒未満: 待機中メッセージ・導線なし・自動復帰で表示再開', () => {
    const h = makeBlockedApp(30_000);
    h.app.start();
    expect(h.img().getAttribute('src')).toBeNull(); // 新規media要求なし(§11.1)
    expect(h.status().textContent).toBe('混雑のため一部の読み込みを待機中');
    expect(h.status().querySelector('button')).toBeNull();
    expect(h.scheduled[0]?.ms).toBe(30_050);

    h.unblock();
    h.scheduled[0]?.cb(); // Retry-After経過→自動復帰(§11.1.3)
    expect(h.img().getAttribute('src')).toContain('/a1/');
    expect(h.status().hidden).toBe(true);
  });

  it('60秒以上: 停止メッセージ+手動再読み込み導線', () => {
    const h = makeBlockedApp(120_000);
    h.app.start();
    expect(h.status().textContent).toContain('読み込みを停止しています');
    const reload = h.status().querySelector<HTMLButtonElement>('.mgv-reload');
    expect(reload).toBeTruthy();

    h.unblock();
    reload?.click(); // 手動再読み込み
    expect(h.img().getAttribute('src')).toContain('/a1/');
  });

  it('Blocked中も前後移動は継続する(§11.1: キャッシュ範囲で応答)', () => {
    const h = makeBlockedApp(30_000);
    h.app.start();
    h.root.querySelector<HTMLButtonElement>('.mgv-nav--next')?.click();
    expect(h.app.currentIndex).toBe(1); // indexは進む(要求は出さない)
    expect(h.img().getAttribute('src')).toBeNull();
  });

  it('media失敗はrecordMediaFailureへ通知される(§11.1.1)', () => {
    const root = makeShell();
    let failures = 0;
    const app = new ViewerApp({
      root,
      snapshot: makeSnapshot(),
      raf: (cb) => cb(),
      createPreload: () => document.createElement('img'),
      rateLimit: {
        canIssueRequests: () => true,
        blockedRemainingMs: 0,
        recordMediaFailure: () => {
          failures += 1;
        },
      },
    });
    app.start();
    root.querySelector('.mgv-image')?.dispatchEvent(new Event('error'));
    expect(failures).toBe(1);
  });
});
