/**
 * 複数macro instance間の生成協調(V1 §5.2裁定、Phase1_Spec WU-5作業6)。
 * BroadcastChannelで先着1 instanceのみが生成を実行する。
 * 手順: 起動時にjitter(50〜250ms)待ち→claim送出→短い応答窓で競合確認。
 * 自分より小さいtokenのclaim/activeを受けたら譲る(決定的な勝者選択)。
 */

export interface ClaimChannel {
  postMessage(message: unknown): void;
  addEventListener(type: 'message', listener: (event: MessageEvent) => void): void;
  close(): void;
}

export interface ClaimOptions {
  readonly pageId: string;
  /** テスト注入用channel factory(既定はBroadcastChannel) */
  readonly createChannel?: (name: string) => ClaimChannel;
  readonly random?: () => number;
  readonly wait?: (ms: number) => Promise<void>;
}

export const CLAIM_JITTER_MIN_MS = 50;
export const CLAIM_JITTER_MAX_MS = 250;
const CLAIM_WINDOW_MS = 200;

interface ClaimMessage {
  kind: 'mg-thumbcache-claim' | 'mg-thumbcache-active';
  token: number;
}

function isClaimMessage(data: unknown): data is ClaimMessage {
  if (typeof data !== 'object' || data === null) return false;
  const m = data as Record<string, unknown>;
  return (
    (m['kind'] === 'mg-thumbcache-claim' || m['kind'] === 'mg-thumbcache-active') &&
    typeof m['token'] === 'number'
  );
}

export class ThumbcacheClaim {
  private readonly token: number;
  private channel: ClaimChannel | null = null;
  private yielded = false;
  private active = false;

  constructor(private readonly options: ClaimOptions) {
    this.token = (options.random ?? Math.random)();
  }

  /** 生成権を獲得できたらtrue。falseなら他instanceに譲る */
  async acquire(): Promise<boolean> {
    const create =
      this.options.createChannel ??
      ((name: string) => new BroadcastChannel(name) as unknown as ClaimChannel);
    try {
      this.channel = create(`mg-thumbcache-${this.options.pageId}`);
    } catch {
      return true; // BroadcastChannel不可の環境では単独動作とみなす
    }
    this.channel.addEventListener('message', (event) => {
      const data: unknown = event.data;
      if (!isClaimMessage(data)) return;
      if (data.kind === 'mg-thumbcache-active') {
        this.yielded = true; // 稼働中instanceがいる
        return;
      }
      if (data.token < this.token) this.yielded = true;
      else if (this.active) this.channel?.postMessage({ kind: 'mg-thumbcache-active', token: this.token });
    });
    const wait = this.options.wait ?? ((ms) => new Promise<void>((r) => setTimeout(r, ms)));
    const random = this.options.random ?? Math.random;
    const jitter =
      CLAIM_JITTER_MIN_MS + random() * (CLAIM_JITTER_MAX_MS - CLAIM_JITTER_MIN_MS);
    await wait(jitter);
    if (this.yielded) return this.finishAcquire(false);
    this.channel.postMessage({ kind: 'mg-thumbcache-claim', token: this.token });
    await wait(CLAIM_WINDOW_MS);
    if (this.yielded) return this.finishAcquire(false);
    this.active = true;
    return true;
  }

  private finishAcquire(result: boolean): boolean {
    if (!result) this.release();
    return result;
  }

  release(): void {
    this.channel?.close();
    this.channel = null;
    this.active = false;
  }
}
