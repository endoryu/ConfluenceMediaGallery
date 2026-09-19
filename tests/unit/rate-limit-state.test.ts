import { describe, expect, it } from 'vitest';
import {
  RATE_PROBE_FAILURE_THRESHOLD,
  RATE_PROBE_MIN_INTERVAL_MS,
} from '../../src/shared/constants';
import { RateLimitStateMachine } from '../../src/shared/api/rate-limit-state';

function machineAt(start = 0): { m: RateLimitStateMachine; setNow: (t: number) => void } {
  let now = start;
  const m = new RateLimitStateMachine(() => now);
  return {
    m,
    setNow: (t: number) => {
      now = t;
    },
  };
}

describe('RateLimitStateMachine(V1仕様書 §11.1)', () => {
  it('rヘッダー出現でDegraded、消滅でNormalへ戻る', () => {
    const { m } = machineAt();
    expect(m.current).toBe('Normal');

    m.observe({ status: 200, rateLimitHeaders: { r: '10' } });
    expect(m.current).toBe('Degraded');
    expect(m.canPrefetch()).toBe(false);
    expect(m.canIssueRequests()).toBe(true);

    m.observe({ status: 200, rateLimitHeaders: {} });
    expect(m.current).toBe('Normal');
    expect(m.canPrefetch()).toBe(true);
  });

  it('X-RateLimit-NearLimit: trueでもDegraded', () => {
    const { m } = machineAt();
    m.observe({ status: 200, rateLimitHeaders: { 'x-ratelimit-nearlimit': 'true' } });
    expect(m.current).toBe('Degraded');
  });

  it('429でBlocked、Retry-After経過で自動Normal復帰', () => {
    const { m, setNow } = machineAt(1000);
    m.observe({ status: 429, rateLimitHeaders: { 'retry-after': '30' } });
    expect(m.current).toBe('Blocked');
    expect(m.retryAfterMs).toBe(30_000);
    expect(m.canIssueRequests()).toBe(false);

    setNow(1000 + 29_999);
    expect(m.current).toBe('Blocked');
    setNow(1000 + 30_000);
    expect(m.current).toBe('Normal');
  });

  it('復帰後もrが出続ける間はDegradedを維持する', () => {
    const { m, setNow } = machineAt(0);
    m.observe({ status: 429, rateLimitHeaders: { 'retry-after': '10' } });
    setNow(10_000);
    expect(m.current).toBe('Normal');
    m.observe({ status: 200, rateLimitHeaders: { r: '2' } });
    expect(m.current).toBe('Degraded');
  });

  it('Blocked期限内の200観測では状態を変えない', () => {
    const { m, setNow } = machineAt(0);
    m.observe({ status: 429, rateLimitHeaders: { 'retry-after': '60' } });
    setNow(1000);
    m.observe({ status: 200, rateLimitHeaders: {} });
    expect(m.current).toBe('Blocked');
  });

  it('cold start: 初回観測が429ならBlockedとRetry-Afterを保持する(§11.1.2)', () => {
    const { m } = machineAt();
    m.observe({ status: 429, rateLimitHeaders: { 'retry-after': '3600' } });
    expect(m.current).toBe('Blocked');
    expect(m.retryAfterMs).toBe(3_600_000);
  });

  it('phase変更listenerが発火する', () => {
    const { m } = machineAt();
    const events: string[] = [];
    m.onChange((next, prev) => events.push(`${prev}->${next}`));
    m.observe({ status: 200, rateLimitHeaders: { r: '1' } });
    m.observe({ status: 429, rateLimitHeaders: { 'retry-after': '1' } });
    expect(events).toEqual(['Normal->Degraded', 'Degraded->Blocked']);
  });

  it('probe発火: 窓内の失敗が閾値未満なら発火しない', () => {
    const { m, setNow } = machineAt(0);
    for (let i = 0; i < RATE_PROBE_FAILURE_THRESHOLD - 1; i += 1) {
      setNow(i * 1000);
      m.recordMediaFailure();
    }
    expect(m.shouldIssueProbe()).toBe(false);
  });

  it('probe発火: 閾値到達で1本だけ発火し、完了まで再発火しない', () => {
    const { m, setNow } = machineAt(0);
    for (let i = 0; i < RATE_PROBE_FAILURE_THRESHOLD; i += 1) {
      setNow(i * 100);
      m.recordMediaFailure();
    }
    expect(m.shouldIssueProbe()).toBe(true);
    expect(m.shouldIssueProbe()).toBe(false); // in-flight
    m.probeFinished();
    // 完了直後は最小間隔内のため発火しない
    for (let i = 0; i < RATE_PROBE_FAILURE_THRESHOLD; i += 1) m.recordMediaFailure();
    expect(m.shouldIssueProbe()).toBe(false);
    setNow(RATE_PROBE_MIN_INTERVAL_MS + 1000);
    for (let i = 0; i < RATE_PROBE_FAILURE_THRESHOLD; i += 1) m.recordMediaFailure();
    expect(m.shouldIssueProbe()).toBe(true);
  });

  it('古いmedia失敗は窓から除外される', () => {
    const { m, setNow } = machineAt(0);
    m.recordMediaFailure();
    m.recordMediaFailure();
    setNow(20_000);
    m.recordMediaFailure();
    expect(m.shouldIssueProbe()).toBe(false);
  });
});
