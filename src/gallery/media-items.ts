/**
 * MediaItem整形・分類・thumbキャッシュ対応付け(V1 §5.1/§5.2、Phase1_Spec WU-2)。
 * - 一覧(セッション正本)からグリッド表示対象・thumbキャッシュ・configを分離する
 * - thumbは元Attachmentと版一致の場合のみ有効。版ズレはstale(WU-5のGC対象)
 * - メディアURLは正規形へ一元化: UIコードはadapterのURL builder経由(§5.2)
 */
import type { AttachmentSummary } from '../shared/types/media';
import { THUMBNAIL_WIDTH_CANDIDATES } from '../shared/constants';
import {
  isThumbcacheConfigTitle,
  isThumbcacheTitle,
  parseThumbcacheName,
} from './thumbcache/naming';

/** グリッドのタイル画像として使えるthumbキャッシュ添付への参照 */
export interface ThumbcacheRef {
  /** thumbキャッシュ添付自体のid(URL builderへ渡す) */
  readonly cacheAttachmentId: string;
  /** thumbキャッシュ添付自体の版(PUT更新で進む) */
  readonly cacheVersion: number;
  readonly targetAttachmentId: string;
  readonly targetVersion: number;
  readonly width: number;
}

export interface MediaModel {
  /** グリッド表示対象(mg_thumbcache_*と非メディアを除く) */
  readonly media: readonly AttachmentSummary[];
  /** 元attachmentId → 現行版と一致する有効thumb(width昇順) */
  readonly thumbsByTarget: ReadonlyMap<string, readonly ThumbcacheRef[]>;
  /** 版ズレ・対象喪失のthumb(WU-5のGC候補) */
  readonly staleThumbs: readonly ThumbcacheRef[];
  /** mg_thumbcache_config添付(存在する場合) */
  readonly configItem?: AttachmentSummary;
}

/** グリッド表示対象か(V1 §5.2: mg_thumbcache_*は除外、§5.1: kindがメディアのもの) */
export function isGalleryItem(item: AttachmentSummary): boolean {
  if (isThumbcacheTitle(item.title)) return false;
  return item.kind === 'image' || item.kind === 'video' || item.kind === 'audio';
}

/** 一覧全件からMediaModelを構築する */
export function buildMediaModel(items: readonly AttachmentSummary[]): MediaModel {
  const media: AttachmentSummary[] = [];
  const currentVersion = new Map<string, number>();
  let configItem: AttachmentSummary | undefined;
  const refs: ThumbcacheRef[] = [];

  for (const item of items) {
    if (isThumbcacheConfigTitle(item.title)) {
      configItem = item;
      continue;
    }
    const parsed = parseThumbcacheName(item.title);
    if (parsed) {
      refs.push({
        cacheAttachmentId: item.attachmentId,
        cacheVersion: item.version,
        targetAttachmentId: parsed.targetAttachmentId,
        targetVersion: parsed.targetVersion,
        width: parsed.width,
      });
      continue;
    }
    if (isGalleryItem(item)) {
      media.push(item);
      currentVersion.set(item.attachmentId, item.version);
    }
  }

  const thumbsByTarget = new Map<string, ThumbcacheRef[]>();
  const staleThumbs: ThumbcacheRef[] = [];
  for (const ref of refs) {
    if (currentVersion.get(ref.targetAttachmentId) === ref.targetVersion) {
      const list = thumbsByTarget.get(ref.targetAttachmentId) ?? [];
      list.push(ref);
      thumbsByTarget.set(ref.targetAttachmentId, list);
    } else {
      // 対象添付が存在しない・版が進んでいる → 無効(§6.3のfallback対象、GC候補)
      staleThumbs.push(ref);
    }
  }
  for (const list of thumbsByTarget.values()) list.sort((a, b) => a.width - b.width);

  return {
    media,
    thumbsByTarget,
    staleThumbs,
    ...(configItem ? { configItem } : {}),
  };
}

/** 要求bucket: タイル表示幅×DPR以上の最小、上限640(V1 §6.3) */
export function pickThumbBucket(displayWidthCssPx: number, devicePixelRatio: number): number {
  const needed = displayWidthCssPx * Math.max(1, devicePixelRatio);
  for (const candidate of THUMBNAIL_WIDTH_CANDIDATES) {
    if (candidate >= needed) return candidate;
  }
  return THUMBNAIL_WIDTH_CANDIDATES[THUMBNAIL_WIDTH_CANDIDATES.length - 1] ?? 640;
}

/**
 * タイルに使うthumbを選ぶ。希望bucket以上の最小、なければ最大幅。
 * 有効なthumbが1つもなければnull(原寸fallback — V1 §6.3)。
 */
export function selectThumb(
  thumbs: readonly ThumbcacheRef[] | undefined,
  desiredWidth: number,
): ThumbcacheRef | null {
  if (!thumbs || thumbs.length === 0) return null;
  for (const thumb of thumbs) {
    if (thumb.width >= desiredWidth) return thumb; // width昇順前提
  }
  return thumbs[thumbs.length - 1] ?? null;
}
