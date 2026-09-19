/**
 * 実site E2E共通部品(ガイド §7.1の半自動方式)。
 * - REST(認証はstorageState由来)でページ・添付を発見し、URL手入力を不要にする
 * - macro iframe(forge cdn上の/gallery/)の発見
 * - ネットワーク記録(status/ヘッダー/サイズ。queryは記録しない — CLAUDE.md §10)
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import type { APIRequestContext, Frame, Page, Response } from '@playwright/test';

export const SITE = process.env['MG_SITE'] ?? 'https://ryu-dev.atlassian.net';

export async function findPageIdByTitle(request: APIRequestContext, title: string): Promise<string> {
  const res = await request.get(
    `${SITE}/wiki/rest/api/content/search?cql=${encodeURIComponent(`title="${title}" and type=page`)}`,
  );
  if (!res.ok()) throw new Error(`page search failed: ${res.status()} (${title})`);
  const json = (await res.json()) as { results?: { id?: string }[] };
  const id = json.results?.[0]?.id;
  if (!id) throw new Error(`page not found: ${title}`);
  return id;
}

export interface AttachmentRef {
  readonly id: string;
  readonly title: string;
  readonly mediaType: string;
  readonly version: number;
}

export async function listAttachments(
  request: APIRequestContext,
  pageId: string,
): Promise<AttachmentRef[]> {
  const res = await request.get(`${SITE}/wiki/api/v2/pages/${pageId}/attachments?limit=250`);
  if (!res.ok()) throw new Error(`attachment list failed: ${res.status()}`);
  const json = (await res.json()) as {
    results?: { id?: string; title?: string; mediaType?: string; version?: { number?: number } }[];
  };
  return (json.results ?? []).map((r) => ({
    id: r.id ?? '',
    title: r.title ?? '',
    mediaType: r.mediaType ?? '',
    version: r.version?.number ?? 1,
  }));
}

export async function openGalleryFrame(page: Page, pageId: string): Promise<Frame> {
  await page.goto(`${SITE}/wiki/pages/viewpage.action?pageId=${pageId}`, {
    waitUntil: 'domcontentloaded',
  });
  const deadline = Date.now() + 90_000;
  for (;;) {
    const frame = page
      .frames()
      .find((f) => f.url().includes('cdn.prod.atlassian-dev.net') && f.url().includes('/gallery/'));
    if (frame) {
      const table = frame.locator('table');
      if ((await table.count()) > 0) return frame;
    }
    if (Date.now() > deadline) throw new Error('gallery frame not found (macro未配置または未ロード)');
    await page.waitForTimeout(500);
  }
}

export interface RecordedResponse {
  readonly hostPath: string;
  readonly status: number;
  readonly contentType?: string;
  readonly contentRange?: string;
  readonly contentLength?: string;
  readonly acceptRanges?: string;
  readonly requestRange?: string;
  readonly at: number;
  bodyBytes?: number;
}

function stripToHostPath(url: string): string {
  try {
    const u = new URL(url);
    return `${u.host}${u.pathname}`;
  } catch {
    return url.split('?')[0] ?? url;
  }
}

/** attachment/media系レスポンスの記録(query・token・cookieは保持しない) */
export class NetworkRecorder {
  readonly records: RecordedResponse[] = [];

  constructor(page: Page, private readonly filter: (hostPath: string) => boolean) {
    page.on('response', (response: Response) => {
      const hostPath = stripToHostPath(response.url());
      if (!this.filter(hostPath)) return;
      const headers = response.headers();
      const rec: RecordedResponse = {
        hostPath,
        status: response.status(),
        at: Date.now(),
        ...(headers['content-type'] ? { contentType: headers['content-type'] } : {}),
        ...(headers['content-range'] ? { contentRange: headers['content-range'] } : {}),
        ...(headers['content-length'] ? { contentLength: headers['content-length'] } : {}),
        ...(headers['accept-ranges'] ? { acceptRanges: headers['accept-ranges'] } : {}),
        ...(response.request().headers()['range']
          ? { requestRange: response.request().headers()['range'] }
          : {}),
      };
      this.records.push(rec);
      void response
        .request()
        .sizes()
        .then((sizes) => {
          rec.bodyBytes = sizes.responseBodySize;
        })
        .catch(() => undefined);
    });
  }

  snapshot(): RecordedResponse[] {
    return this.records.map((r) => ({ ...r }));
  }

  countSince(at: number, predicate: (r: RecordedResponse) => boolean): number {
    return this.records.filter((r) => r.at >= at && predicate(r)).length;
  }
}

export function saveResult(name: string, data: unknown): string {
  mkdirSync('local/e2e-results', { recursive: true });
  const path = `local/e2e-results/${name}-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
  writeFileSync(path, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
  return path;
}

/** probe行のOriginalボタンをclickする(attachmentIdを含む行で特定) */
export async function clickProbeButton(
  frame: Frame,
  attachmentId: string,
  action: 'thumbnail' | 'original' | 'modal',
): Promise<void> {
  const button = frame.locator(
    `tr:has(td:text-is("${attachmentId}")) button[data-action="${action}"]`,
  );
  await button.click({ timeout: 15_000 });
}
