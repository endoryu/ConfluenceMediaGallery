/**
 * ConfluenceApi のForge実装。通信手段は `requestConfluence()` のみ(CLAUDE.md §3)。
 * `@forge/bridge` のimportは src/shared/api/ に閉じる(CLAUDE.md §8)。
 */
import { requestConfluence } from '@forge/bridge';
import type { AttachmentDetail, AttachmentPage, AttachmentSummary, UserSummary } from '../types/media';
import type { ConfluenceApi, ResponseMetaListener } from './confluence-api';
import { extractRateLimitHeaders } from './confluence-api';
import type { V2AttachmentJson } from './v2-mapping';
import { extractCursor, toSummary } from './v2-mapping';

export class ForgeConfluenceApi implements ConfluenceApi {
  constructor(
    private readonly siteBaseUrl: string,
    private readonly onResponseMeta?: ResponseMetaListener,
  ) {}

  private async requestJson(path: string): Promise<unknown> {
    const response = await requestConfluence(path, {
      headers: { Accept: 'application/json' },
    });
    this.notify(path, response);
    if (!response.ok) {
      throw new Error(`Confluence API ${response.status} (path種別: ${path.split('?')[0]})`);
    }
    return response.json();
  }

  private notify(path: string, response: { status: number; headers: { get(n: string): string | null } }): void {
    this.onResponseMeta?.({
      path: path.split('?')[0] ?? path,
      status: response.status,
      rateLimitHeaders: extractRateLimitHeaders(response.headers),
    });
  }

  async listAttachments(pageId: string, cursor?: string, limit?: number): Promise<AttachmentPage> {
    const params = new URLSearchParams();
    if (limit !== undefined) params.set('limit', String(limit));
    if (cursor !== undefined) params.set('cursor', cursor);
    const query = params.size > 0 ? `?${params.toString()}` : '';
    const json = (await this.requestJson(
      `/wiki/api/v2/pages/${encodeURIComponent(pageId)}/attachments${query}`,
    )) as { results?: V2AttachmentJson[]; _links?: { next?: string } };
    const nextCursor = extractCursor(json._links?.next);
    const page: { items: AttachmentSummary[]; nextCursor?: string } = {
      items: (json.results ?? []).map((r) => toSummary(r, pageId)),
    };
    if (nextCursor !== undefined) page.nextCursor = nextCursor;
    return page;
  }

  async getAttachment(
    attachmentId: string,
    opts?: { includeLabels?: boolean },
  ): Promise<AttachmentDetail> {
    const json = (await this.requestJson(
      `/wiki/api/v2/attachments/${encodeURIComponent(attachmentId)}`,
    )) as V2AttachmentJson;
    const detail: { -readonly [K in keyof AttachmentDetail]?: AttachmentDetail[K] } = {
      ...toSummary(json, json.pageId ?? ''),
    };
    if (opts?.includeLabels) {
      const labelsJson = (await this.requestJson(
        `/wiki/api/v2/attachments/${encodeURIComponent(attachmentId)}/labels`,
      )) as { results?: { name?: string }[] };
      detail.labels = (labelsJson.results ?? [])
        .map((l) => l.name)
        .filter((n): n is string => typeof n === 'string');
    }
    return detail as AttachmentDetail;
  }

  async resolveUsers(accountIds: string[]): Promise<UserSummary[]> {
    if (accountIds.length === 0) return [];
    const path = '/wiki/api/v2/users-bulk';
    const response = await requestConfluence(path, {
      method: 'POST',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify({ accountIds }),
    });
    this.notify(path, response);
    if (!response.ok) {
      throw new Error(`Confluence API ${response.status} (users-bulk)`);
    }
    const json = (await response.json()) as {
      results?: { accountId?: string; displayName?: string }[];
    };
    return (json.results ?? [])
      .filter((u): u is { accountId: string; displayName: string } =>
        typeof u.accountId === 'string' && typeof u.displayName === 'string',
      )
      .map((u) => ({ accountId: u.accountId, displayName: u.displayName }));
  }

  thumbnailUrl(attachmentId: string, version: number, width: number): string {
    return (
      `${this.siteBaseUrl}/wiki/api/v2/attachments/${encodeURIComponent(attachmentId)}` +
      `/thumbnail/download?version=${version}&width=${width}&height=${width}`
    );
  }

  originalUrl(pageId: string, attachmentId: string, version: number): string {
    return (
      `${this.siteBaseUrl}/wiki/rest/api/content/${encodeURIComponent(pageId)}` +
      `/child/attachment/${encodeURIComponent(attachmentId)}/download?version=${version}`
    );
  }
}
