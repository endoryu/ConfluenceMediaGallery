/**
 * Confluence v2 APIレスポンスの変換(bridge非依存。単体テスト可能)。
 */
import type { AttachmentSummary } from '../types/media';
import { mediaKindOf } from '../types/media';

export interface V2AttachmentJson {
  id: string;
  pageId?: string;
  title?: string;
  mediaType?: string;
  fileSize?: number;
  createdAt?: string;
  comment?: string;
  downloadLink?: string;
  version?: { number?: number; createdAt?: string; authorId?: string };
  _links?: { download?: string };
}

export function toSummary(json: V2AttachmentJson, fallbackPageId: string): AttachmentSummary {
  const mediaType = json.mediaType ?? 'application/octet-stream';
  const summary: {
    -readonly [K in keyof AttachmentSummary]?: AttachmentSummary[K];
  } = {
    attachmentId: json.id,
    pageId: json.pageId ?? fallbackPageId,
    title: json.title ?? `attachment-${json.id}`,
    mediaType,
    kind: mediaKindOf(mediaType),
    version: json.version?.number ?? 1,
  };
  if (json.fileSize !== undefined) summary.fileSize = json.fileSize;
  if (json.createdAt !== undefined) summary.createdAt = json.createdAt;
  if (json.version?.createdAt !== undefined) summary.updatedAt = json.version.createdAt;
  if (json.version?.authorId !== undefined) summary.authorId = json.version.authorId;
  if (json.comment !== undefined) summary.comment = json.comment;
  const downloadLink = json.downloadLink ?? json._links?.download;
  if (downloadLink !== undefined) summary.downloadLink = downloadLink;
  return summary as AttachmentSummary;
}

/** `_links.next` からcursor query値を取り出す */
export function extractCursor(nextLink: string | undefined): string | undefined {
  if (!nextLink) return undefined;
  const match = nextLink.match(/[?&]cursor=([^&]+)/);
  return match?.[1] ? decodeURIComponent(match[1]) : undefined;
}
