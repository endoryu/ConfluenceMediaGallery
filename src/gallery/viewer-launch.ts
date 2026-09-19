/**
 * Viewer起動用snapshotの生成(V1 §7.1、Phase2_Spec WU-1)。
 * click handler内で同期実行される(§13.3)ため、純粋な整形のみを行う。
 * Phase 2のナビ対象はimageのみ: itemsはimage kindで構成し、indexはその列内。
 */
import type { AttachmentSummary } from '../shared/types/media';
import type {
  ViewerSnapshot,
  ViewerSnapshotItem,
  ViewerSnapshotRateLimit,
} from '../shared/types/viewer-snapshot';
import type { MediaModel } from './media-items';
import { selectThumb } from './media-items';

/** Viewer初期画像はthumbキャッシュw640優先(V1 §7.4、Phase2_Spec §11) */
export const VIEWER_THUMB_WIDTH = 640;

export interface BuildSnapshotOptions {
  readonly items: readonly AttachmentSummary[];
  readonly model: MediaModel | null;
  readonly siteBaseUrl: string;
  readonly pageId: string;
  readonly attachmentId: string;
  readonly rateLimit?: ViewerSnapshotRateLimit;
  readonly now?: () => number;
}

/**
 * 選択attachmentIdからsnapshotを組み立てる。
 * 対象がimage以外・不在の場合はnull(Viewerを開かない — 動画音声はPhase 4)。
 */
export function buildViewerSnapshot(options: BuildSnapshotOptions): ViewerSnapshot | null {
  const images = options.items.filter((item) => item.kind === 'image');
  const index = images.findIndex((item) => item.attachmentId === options.attachmentId);
  if (index < 0) return null;

  const snapshotItems: ViewerSnapshotItem[] = images.map((item) => {
    const thumb = selectThumb(
      options.model?.thumbsByTarget.get(item.attachmentId),
      VIEWER_THUMB_WIDTH,
    );
    return {
      attachmentId: item.attachmentId,
      pageId: item.pageId,
      version: item.version,
      title: item.title,
      kind: item.kind,
      ...(thumb
        ? {
            thumb: {
              cacheAttachmentId: thumb.cacheAttachmentId,
              cacheVersion: thumb.cacheVersion,
              width: thumb.width,
            },
          }
        : {}),
    };
  });

  return {
    schemaVersion: 1,
    siteBaseUrl: options.siteBaseUrl,
    pageId: options.pageId,
    index,
    items: snapshotItems,
    ...(options.rateLimit ? { rateLimit: options.rateLimit } : {}),
    t0: (options.now ?? Date.now)(),
  };
}
