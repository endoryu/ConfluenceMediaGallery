/**
 * jsdom単体テスト用mock adapter(Phase0_Spec §5.3)。
 * 同一interfaceを実装し、任意のstatus/ヘッダー/遅延を注入できる。
 * `@forge/bridge` に依存しない。
 */
import type { AttachmentDetail, AttachmentPage, AttachmentSummary, UserSummary } from '../types/media';
import type {
  BinaryFetchResult,
  ConfluenceApi,
  RedirectProbeResult,
  ResponseMetaListener,
  ThumbnailProbeApi,
} from './confluence-api';

export interface MockBehavior {
  /** 呼び出しごとの遅延(ms) */
  delayMs?: number;
  /** 指定するとlist/get/resolveが必ずこのstatusで失敗する */
  failStatus?: number;
  /** 通知するレート制限ヘッダー */
  rateLimitHeaders?: Record<string, string>;
  /** thumbnailRedirectProbeが返す結果 */
  redirectResult?: RedirectProbeResult;
}

export class MockConfluenceApi implements ConfluenceApi, ThumbnailProbeApi {
  readonly calls: string[] = [];

  constructor(
    private readonly attachments: readonly AttachmentSummary[],
    private readonly users: readonly UserSummary[] = [],
    private behavior: MockBehavior = {},
    private readonly onResponseMeta?: ResponseMetaListener,
  ) {}

  setBehavior(behavior: MockBehavior): void {
    this.behavior = behavior;
  }

  private async simulate(path: string): Promise<void> {
    this.calls.push(path);
    if (this.behavior.delayMs) {
      await new Promise((resolve) => setTimeout(resolve, this.behavior.delayMs));
    }
    const status = this.behavior.failStatus ?? 200;
    this.onResponseMeta?.({
      path,
      status,
      rateLimitHeaders: this.behavior.rateLimitHeaders ?? {},
    });
    if (this.behavior.failStatus !== undefined) {
      throw new Error(`Confluence API ${this.behavior.failStatus} (${path})`);
    }
  }

  async listAttachments(pageId: string, cursor?: string, limit?: number): Promise<AttachmentPage> {
    await this.simulate(`list:${pageId}`);
    const offset = cursor ? Number(cursor) : 0;
    const size = limit ?? 50;
    const items = this.attachments.slice(offset, offset + size);
    const next = offset + size < this.attachments.length ? String(offset + size) : undefined;
    return next === undefined ? { items } : { items, nextCursor: next };
  }

  async getAttachment(
    attachmentId: string,
    _opts?: { includeLabels?: boolean },
  ): Promise<AttachmentDetail> {
    await this.simulate(`get:${attachmentId}`);
    const found = this.attachments.find((a) => a.attachmentId === attachmentId);
    if (!found) throw new Error(`mock: attachment ${attachmentId} not found`);
    return found;
  }

  async resolveUsers(accountIds: string[]): Promise<UserSummary[]> {
    await this.simulate(`users:${accountIds.length}`);
    return this.users.filter((u) => accountIds.includes(u.accountId));
  }

  async thumbnailRedirectProbe(
    attachmentId: string,
    _version: number | undefined,
    _width: number,
  ): Promise<RedirectProbeResult> {
    return this.redirectProbe(`thumbnail:${attachmentId}`);
  }

  async fetchBinary(
    pathWithQuery: string,
    opts?: { range?: string },
  ): Promise<BinaryFetchResult> {
    await this.simulate(`fetch-binary:${pathWithQuery.split('?')[0]}`);
    if (opts?.range) {
      return {
        ok: true,
        status: 206,
        blob: new Blob(['mock'], { type: 'image/png' }),
        contentType: 'image/png',
        contentRange: 'bytes 0-3/16',
      };
    }
    return {
      ok: true,
      status: 200,
      blob: new Blob(['mock-image-bytes'], { type: 'image/png' }),
      contentType: 'image/png',
    };
  }

  async redirectProbe(pathWithQuery: string): Promise<RedirectProbeResult> {
    await this.simulate(`redirect-probe:${pathWithQuery.split('?')[0]}`);
    return (
      this.behavior.redirectResult ?? {
        mode: 'manual-302',
        status: 302,
        locationHostPath: 'media.mock.test/file/thumb',
        cacheControl: 'private, max-age=3600',
      }
    );
  }

  thumbnailUrl(attachmentId: string, version: number, width: number): string {
    return `mock://thumbnail/${attachmentId}?version=${version}&width=${width}`;
  }

  originalUrl(pageId: string, attachmentId: string, version: number): string {
    return `mock://original/${pageId}/${attachmentId}?version=${version}`;
  }
}
