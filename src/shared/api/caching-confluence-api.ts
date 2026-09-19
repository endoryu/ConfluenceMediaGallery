/**
 * 節約策adapter(V1仕様書 §4.5.1、Phase0_Spec WU-7作業5)。
 * - in-flight重複排除: 同一APIキーの進行中要求はPromiseを共有
 * - セッション内キャッシュ: 一覧・詳細(attachmentId単位)・更新者
 * - users-bulk集約: 同一event loop内の未解決accountIdを1要求へ(microtask flush)
 * savingsEnabled=false で全節約策を無効化できる(節約策比較用。呼び出し側で
 * build時定数 __MG_SAVINGS__ を渡し、production buildでは定数畳み込みされる)。
 */
import type { AttachmentDetail, AttachmentPage, UserSummary } from '../types/media';
import type { ConfluenceApi } from './confluence-api';

export interface SavingsStats {
  listCalls: number;
  detailCalls: number;
  userCalls: number;
  dedupeHits: number;
  cacheHits: number;
}

export class CachingConfluenceApi implements ConfluenceApi {
  readonly stats: SavingsStats = {
    listCalls: 0,
    detailCalls: 0,
    userCalls: 0,
    dedupeHits: 0,
    cacheHits: 0,
  };

  private readonly inflight = new Map<string, Promise<unknown>>();
  private readonly listCache = new Map<string, AttachmentPage>();
  private readonly detailCache = new Map<string, AttachmentDetail>();
  private readonly userCache = new Map<string, UserSummary>();
  private pendingUserIds: Set<string> | null = null;
  private pendingUserPromise: Promise<void> | null = null;

  constructor(
    private readonly inner: ConfluenceApi,
    private readonly savingsEnabled: boolean = true,
  ) {}

  private shared<T>(key: string, run: () => Promise<T>): Promise<T> {
    if (!this.savingsEnabled) return run();
    const existing = this.inflight.get(key);
    if (existing) {
      this.stats.dedupeHits += 1;
      return existing as Promise<T>;
    }
    const promise = run().finally(() => {
      this.inflight.delete(key);
    });
    this.inflight.set(key, promise);
    return promise;
  }

  listAttachments(pageId: string, cursor?: string, limit?: number): Promise<AttachmentPage> {
    const key = `list:${pageId}:${cursor ?? ''}:${limit ?? ''}`;
    if (this.savingsEnabled) {
      const cached = this.listCache.get(key);
      if (cached) {
        this.stats.cacheHits += 1;
        return Promise.resolve(cached);
      }
    }
    return this.shared(key, async () => {
      this.stats.listCalls += 1;
      const page = await this.inner.listAttachments(pageId, cursor, limit);
      if (this.savingsEnabled) this.listCache.set(key, page);
      return page;
    });
  }

  getAttachment(
    attachmentId: string,
    opts?: { includeLabels?: boolean },
  ): Promise<AttachmentDetail> {
    const key = `detail:${attachmentId}:${opts?.includeLabels ? 1 : 0}`;
    if (this.savingsEnabled) {
      const cached = this.detailCache.get(key);
      if (cached) {
        this.stats.cacheHits += 1;
        return Promise.resolve(cached);
      }
    }
    return this.shared(key, async () => {
      this.stats.detailCalls += 1;
      const detail = await this.inner.getAttachment(attachmentId, opts);
      if (this.savingsEnabled) this.detailCache.set(key, detail);
      return detail;
    });
  }

  resolveUsers(accountIds: string[]): Promise<UserSummary[]> {
    if (!this.savingsEnabled) {
      this.stats.userCalls += 1;
      return this.inner.resolveUsers(accountIds);
    }
    const missing = accountIds.filter((id) => !this.userCache.has(id));
    if (missing.length === 0) {
      this.stats.cacheHits += 1;
      return Promise.resolve(this.fromUserCache(accountIds));
    }
    // 同一event loop内の要求を1本に集約する(V1 §4.5.1 users-bulk集約)
    if (!this.pendingUserIds) {
      this.pendingUserIds = new Set<string>();
      this.pendingUserPromise = Promise.resolve().then(async () => {
        const ids = [...(this.pendingUserIds ?? [])];
        this.pendingUserIds = null;
        this.pendingUserPromise = null;
        this.stats.userCalls += 1;
        const users = await this.inner.resolveUsers(ids);
        for (const user of users) this.userCache.set(user.accountId, user);
      });
    }
    for (const id of missing) this.pendingUserIds.add(id);
    const flush = this.pendingUserPromise;
    return (flush ?? Promise.resolve()).then(() => this.fromUserCache(accountIds));
  }

  private fromUserCache(accountIds: string[]): UserSummary[] {
    return accountIds
      .map((id) => this.userCache.get(id))
      .filter((u): u is UserSummary => u !== undefined);
  }

  thumbnailUrl(attachmentId: string, version: number, width: number): string {
    return this.inner.thumbnailUrl(attachmentId, version, width);
  }

  originalUrl(pageId: string, attachmentId: string, version: number): string {
    return this.inner.originalUrl(pageId, attachmentId, version);
  }
}
