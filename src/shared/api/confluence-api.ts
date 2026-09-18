/**
 * adapter interface(Phase0_Spec §5.3)。
 * UIコードはこのinterface越しにConfluenceへアクセスする。
 * `@forge/bridge` への依存は src/shared/api/ に閉じる(CLAUDE.md §8)。
 */
import type { AttachmentDetail, AttachmentPage, UserSummary } from '../types/media';

export interface ConfluenceApi {
  listAttachments(pageId: string, cursor?: string, limit?: number): Promise<AttachmentPage>;
  getAttachment(attachmentId: string, opts?: { includeLabels?: boolean }): Promise<AttachmentDetail>;
  resolveUsers(accountIds: string[]): Promise<UserSummary[]>;
  /** native elementのsrcへ渡すURLを返す(通信しない) */
  thumbnailUrl(attachmentId: string, version: number, width: number): string;
  /** native elementのsrcへ渡すURLを返す(通信しない) */
  originalUrl(pageId: string, attachmentId: string, version: number): string;
}

/**
 * レスポンスのレート制限系ヘッダー(V1仕様書 §11.1系統への入力)。
 * adapterが解釈し、縮退state machine(WU-7で実装)へ通知する。
 */
export interface ResponseMeta {
  readonly path: string;
  readonly status: number;
  readonly rateLimitHeaders: Readonly<Record<string, string>>;
}

export type ResponseMetaListener = (meta: ResponseMeta) => void;

/** レスポンスから記録対象ヘッダーを抽出する */
export function extractRateLimitHeaders(headers: {
  get(name: string): string | null;
}): Record<string, string> {
  const names = [
    'ratelimit-limit',
    'ratelimit-remaining',
    'ratelimit-reset',
    'x-ratelimit-limit',
    'x-ratelimit-remaining',
    'x-ratelimit-reset',
    'retry-after',
    'r',
  ];
  const out: Record<string, string> = {};
  for (const name of names) {
    const value = headers.get(name);
    if (value !== null) out[name] = value;
  }
  return out;
}
