/**
 * MediaItem論理データ(V1仕様書 §5.1)。
 * Phase 0ではprobeに必要な部分集合を扱う。
 */

export type MediaKind = 'image' | 'video' | 'audio' | 'unsupported';

export interface AttachmentSummary {
  readonly attachmentId: string;
  readonly pageId: string;
  readonly title: string;
  readonly mediaType: string;
  readonly kind: MediaKind;
  readonly version: number;
  readonly fileSize?: number;
  readonly createdAt?: string;
  readonly updatedAt?: string;
  readonly authorId?: string;
  readonly comment?: string;
  /** 一覧レスポンスの downloadLink/_links.download。正本はP0-2で確定(V1仕様書 §5.1) */
  readonly downloadLink?: string;
}

export interface AttachmentPage {
  readonly items: readonly AttachmentSummary[];
  readonly nextCursor?: string;
}

export interface AttachmentDetail extends AttachmentSummary {
  readonly labels?: readonly string[];
}

export interface UserSummary {
  readonly accountId: string;
  readonly displayName: string;
}

/** mediaTypeからkindを導出する(V1仕様書 §5.1) */
export function mediaKindOf(mediaType: string): MediaKind {
  if (mediaType.startsWith('image/')) return 'image';
  if (mediaType.startsWith('video/')) return 'video';
  if (mediaType.startsWith('audio/')) return 'audio';
  return 'unsupported';
}
