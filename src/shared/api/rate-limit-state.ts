/**
 * 段階的縮退 state machine(V1仕様書 §11.1。Phase 1へ引き継ぐ)。
 * UIから独立。遷移条件:
 * - Normal:   RateLimitに残量`r`が出現しない
 * - Degraded: `r` 出現、または `X-RateLimit-NearLimit: true`
 * - Blocked:  429受領。`Retry-After` 経過まで新規要求停止 → 自動でNormal復帰
 *             (復帰後も`r`が出続ける間はDegraded維持 = 次のobserveで再遷移)
 * media load失敗はステータスを持たないため、閾値超過でprobe(安価なREST 1件)を
 * 発行する判定のみ提供する(指数バックオフ+jitter、単一in-flight)。
 */
import {
  RATE_BLOCKED_DEFAULT_MS,
  RATE_PROBE_FAILURE_THRESHOLD,
  RATE_PROBE_FAILURE_WINDOW_MS,
  RATE_PROBE_MAX_INTERVAL_MS,
  RATE_PROBE_MIN_INTERVAL_MS,
} from '../constants';

export type RateLimitPhase = 'Normal' | 'Degraded' | 'Blocked';

export interface RateLimitObservation {
  readonly status: number;
  readonly rateLimitHeaders: Readonly<Record<string, string>>;
}

export type PhaseListener = (phase: RateLimitPhase, previous: RateLimitPhase) => void;

function parseRetryAfterMs(headers: Readonly<Record<string, string>>): number {
  const raw = headers['retry-after'];
  if (raw !== undefined) {
    const seconds = Number(raw);
    if (Number.isFinite(seconds) && seconds >= 0) return seconds * 1000;
  }
  return RATE_BLOCKED_DEFAULT_MS;
}

function hasRemainingSignal(headers: Readonly<Record<string, string>>): boolean {
  return headers['r'] !== undefined || headers['x-ratelimit-nearlimit'] === 'true';
}

export class RateLimitStateMachine {
  private phase: RateLimitPhase = 'Normal';
  private blockedUntil = 0;
  private lastRetryAfterMs = 0;
  private readonly listeners: PhaseListener[] = [];
  private readonly mediaFailures: number[] = [];
  private probeInFlight = false;
  private lastProbeAt = -Infinity;
  private probeIntervalMs = RATE_PROBE_MIN_INTERVAL_MS;

  constructor(private readonly now: () => number = () => Date.now()) {}

  get current(): RateLimitPhase {
    this.tick();
    return this.phase;
  }

  get retryAfterMs(): number {
    return this.lastRetryAfterMs;
  }

  onChange(listener: PhaseListener): () => void {
    this.listeners.push(listener);
    return () => {
      const i = this.listeners.indexOf(listener);
      if (i >= 0) this.listeners.splice(i, 1);
    };
  }

  private setPhase(next: RateLimitPhase): void {
    if (next === this.phase) return;
    const previous = this.phase;
    this.phase = next;
    for (const listener of [...this.listeners]) listener(next, previous);
  }

  /** Blocked残り時間(ms)。非Blockedは0(§11.1.3の実値出し分け用) */
  get blockedRemainingMs(): number {
    this.tick();
    return this.phase === 'Blocked' ? Math.max(0, this.blockedUntil - this.now()) : 0;
  }

  /** Gallery→Viewer引継ぎ用の状態(§11.1「双方で共有」— snapshot経由の最小実装) */
  exportState(): { phase: RateLimitPhase; retryAfterMs: number; blockedUntilEpoch?: number } {
    this.tick();
    return {
      phase: this.phase,
      retryAfterMs: this.lastRetryAfterMs,
      ...(this.phase === 'Blocked' ? { blockedUntilEpoch: this.blockedUntil } : {}),
    };
  }

  /** 引継ぎ状態の復元。Blocked期限超過はNormalへ丸める */
  restoreState(state: {
    phase: RateLimitPhase;
    retryAfterMs: number;
    blockedUntilEpoch?: number;
  }): void {
    this.lastRetryAfterMs = state.retryAfterMs;
    if (state.phase === 'Blocked' && state.blockedUntilEpoch !== undefined) {
      this.blockedUntil = state.blockedUntilEpoch;
      if (this.now() < this.blockedUntil) this.setPhase('Blocked');
      return;
    }
    if (state.phase === 'Degraded') this.setPhase('Degraded');
  }

  /** Blocked期限の経過を反映する(自動Normal復帰 — §11.1) */
  tick(): void {
    if (this.phase === 'Blocked' && this.now() >= this.blockedUntil) {
      this.setPhase('Normal');
    }
  }

  /** requestConfluence応答の観測(検知の主経路 — §11.1.1) */
  observe(observation: RateLimitObservation): void {
    this.tick();
    if (observation.status === 429) {
      this.lastRetryAfterMs = parseRetryAfterMs(observation.rateLimitHeaders);
      this.blockedUntil = this.now() + this.lastRetryAfterMs;
      this.setPhase('Blocked');
      // 429を確認できたのでprobe要求は解消し、バックオフを進める
      this.probeIntervalMs = Math.min(this.probeIntervalMs * 2, RATE_PROBE_MAX_INTERVAL_MS);
      return;
    }
    if (this.phase === 'Blocked') return; // 期限内は据え置き(tickで復帰)
    if (hasRemainingSignal(observation.rateLimitHeaders)) {
      this.setPhase('Degraded');
    } else {
      this.setPhase('Normal');
      this.probeIntervalMs = RATE_PROBE_MIN_INTERVAL_MS;
    }
  }

  /** 新規要求を発行してよいか(Blocked中はREST・native mediaとも停止 — §11.1) */
  canIssueRequests(): boolean {
    this.tick();
    return this.phase !== 'Blocked';
  }

  /** 先読み(hover/隣接)を発行してよいか(Degraded以上で停止 — §11.1) */
  canPrefetch(): boolean {
    this.tick();
    return this.phase === 'Normal';
  }

  /** native media load失敗の記録(補助情報 — §11.1.1) */
  recordMediaFailure(): void {
    const at = this.now();
    this.mediaFailures.push(at);
    while (this.mediaFailures.length > 0 && (this.mediaFailures[0] ?? 0) < at - RATE_PROBE_FAILURE_WINDOW_MS) {
      this.mediaFailures.shift();
    }
  }

  /**
   * レート制限疑いprobe(安価なREST 1件)を今発行すべきか。
   * 発行する場合はtrueを返し、in-flightを立てる。呼び出し側はprobe完了時に
   * probeFinished()を呼ぶ。jitterは呼び出し側スケジューラで加える。
   */
  shouldIssueProbe(): boolean {
    this.tick();
    if (this.phase === 'Blocked') return false;
    if (this.probeInFlight) return false;
    if (this.mediaFailures.length < RATE_PROBE_FAILURE_THRESHOLD) return false;
    const at = this.now();
    if (at - this.lastProbeAt < this.probeIntervalMs) return false;
    this.probeInFlight = true;
    this.lastProbeAt = at;
    return true;
  }

  probeFinished(): void {
    this.probeInFlight = false;
    this.mediaFailures.length = 0;
  }
}
