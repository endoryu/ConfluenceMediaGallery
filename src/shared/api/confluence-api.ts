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

/**
 * Thumbnail 302 probe の結果(Phase0_Spec §WU-2 作業1)。
 * Location は host+path のみ保持する(signed URLのquery除去。CLAUDE.md §10)。
 */
export interface RedirectProbeResult {
  /** manual-302: redirect:manualで302とヘッダーを取得できた / manual-opaque: opaque応答 / followed: redirectが追従された / error */
  readonly mode: 'manual-302' | 'manual-opaque' | 'followed' | 'error';
  readonly status: number;
  readonly locationHostPath?: string;
  readonly cacheControl?: string;
  readonly expires?: string;
  readonly etag?: string;
  readonly note?: string;
}

/** WU-2/WU-3 probe用の拡張。Phase 1へは持ち込まない */
export interface ThumbnailProbeApi {
  thumbnailRedirectProbe(
    attachmentId: string,
    version: number | undefined,
    width: number,
  ): Promise<RedirectProbeResult>;
  /** 任意のsite相対pathへのredirect probe(WU-3: v1 download endpoint等) */
  redirectProbe(pathWithQuery: string): Promise<RedirectProbeResult>;
  /** requestConfluence経由でbinaryを取得する(G1b/G1c: bridge経由blob→縮小の成立性確認) */
  fetchBinary(pathWithQuery: string, opts?: BinaryFetchOptions): Promise<BinaryFetchResult>;
}

export interface BinaryFetchOptions {
  /** Rangeヘッダー(例: 'bytes=0-1023')。大容量の分割取得判別(G1c)用 */
  readonly range?: string;
}

/**
 * thumbキャッシュ書込み(P0-8で実証、Phase 1 WU-5で本採用)。
 * write:attachment:confluence の用途は自己管理thumb添付に限る(V1 §3.3)。
 * 呼び出し側はファイル名を必ず命名ガード(thumbcache/naming.ts)に通す。
 */
export interface AttachmentWriterApi {
  /**
   * 現在ユーザーが添付を更新できるか(v2 attachments operations)。
   * 生成可否の判定に使う。v1 content GET+expand=operationsはappスコープ外で
   * 401になるため使用しない(WU-5実測)。
   */
  canUpdateAttachment(attachmentId: string): Promise<boolean>;
  uploadAttachment(
    pageId: string,
    fileName: string,
    blob: Blob,
  ): Promise<{ status: number; attachmentId?: string; note?: string }>;
  updateAttachmentData(
    pageId: string,
    attachmentId: string,
    fileName: string,
    blob: Blob,
  ): Promise<{ status: number; note?: string }>;
  deleteAttachment(attachmentId: string): Promise<{ status: number; note?: string }>;
}

/** 旧称(Phase 0 probe期)。既存参照の互換用 */
export type WriteProbeApi = AttachmentWriterApi;

export interface BinaryFetchResult {
  readonly ok: boolean;
  readonly status: number;
  readonly blob?: Blob;
  readonly contentType?: string;
  /** Content-Rangeヘッダー(206時) */
  readonly contentRange?: string;
  readonly note?: string;
}

/** 正規形v1 download endpointのsite相対path(V1 §5.1 downloadLink行、§5.2) */
export function v1DownloadPath(pageId: string, attachmentId: string, version: number): string {
  return `/wiki/rest/api/content/${encodeURIComponent(pageId)}/child/attachment/${encodeURIComponent(attachmentId)}/download?version=${version}`;
}

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
