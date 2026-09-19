/**
 * Gallery→Viewerのcompact snapshot(V1 §7.1)。
 * 選択indexと並び順(セッション正本)を再現できる最小のJSONメタデータ。
 * Original参照は正規形URL builder(v1DownloadPath+siteBaseUrl)で再構成するため
 * URL文字列は持たない(§5.2の正規形一元化。signed URL持込防止 — CLAUDE.md §10)。
 */
import type { RateLimitPhase } from '../api/rate-limit-state';
import type { MediaKind } from './media';

export interface ViewerSnapshotThumbRef {
  readonly cacheAttachmentId: string;
  readonly cacheVersion: number;
  readonly width: number;
}

export interface ViewerSnapshotItem {
  readonly attachmentId: string;
  readonly pageId: string;
  readonly version: number;
  readonly title: string;
  readonly kind: MediaKind;
  /** thumbキャッシュ参照(w640優先で選択済み。なければ原寸fallback) */
  readonly thumb?: ViewerSnapshotThumbRef;
}

/** 縮退状態の引継ぎ(§11.1「Gallery/Viewer双方で共有」の最小実装 — WU-4) */
export interface ViewerSnapshotRateLimit {
  readonly phase: RateLimitPhase;
  readonly retryAfterMs: number;
  readonly blockedUntilEpoch?: number;
}

export interface ViewerSnapshot {
  readonly schemaVersion: 1;
  readonly siteBaseUrl: string;
  readonly pageId: string;
  /** items内の選択index(Phase 2のナビ対象=imageのみ) */
  readonly index: number;
  readonly items: readonly ViewerSnapshotItem[];
  readonly rateLimit?: ViewerSnapshotRateLimit;
  /** Modal.open呼び出し時刻(epoch ms。起動計測用 — P0-4方式) */
  readonly t0: number;
}
