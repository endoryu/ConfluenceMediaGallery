/**
 * Modal contextからのsnapshot復元(V1 §7.1、Phase2_Spec WU-1)。
 * 外部入力として防御的にparseし、不正はnull(エラーfallback表示へ)。
 */
import type { MediaKind } from '../shared/types/media';
import type {
  ViewerSnapshot,
  ViewerSnapshotItem,
} from '../shared/types/viewer-snapshot';

const KINDS: readonly MediaKind[] = ['image', 'video', 'audio', 'unsupported'];

function parseItem(raw: unknown): ViewerSnapshotItem | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const o = raw as Record<string, unknown>;
  if (
    typeof o['attachmentId'] !== 'string' ||
    typeof o['pageId'] !== 'string' ||
    typeof o['version'] !== 'number' ||
    typeof o['title'] !== 'string' ||
    typeof o['kind'] !== 'string' ||
    !KINDS.includes(o['kind'] as MediaKind)
  ) {
    return null;
  }
  const thumbRaw = o['thumb'];
  let thumb: ViewerSnapshotItem['thumb'];
  if (typeof thumbRaw === 'object' && thumbRaw !== null) {
    const t = thumbRaw as Record<string, unknown>;
    if (
      typeof t['cacheAttachmentId'] === 'string' &&
      typeof t['cacheVersion'] === 'number' &&
      typeof t['width'] === 'number'
    ) {
      thumb = {
        cacheAttachmentId: t['cacheAttachmentId'],
        cacheVersion: t['cacheVersion'],
        width: t['width'],
      };
    }
  }
  return {
    attachmentId: o['attachmentId'],
    pageId: o['pageId'],
    version: o['version'],
    title: o['title'],
    kind: o['kind'] as MediaKind,
    ...(thumb ? { thumb } : {}),
  };
}

export function parseViewerSnapshot(raw: unknown): ViewerSnapshot | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const o = raw as Record<string, unknown>;
  if (o['schemaVersion'] !== 1) return null;
  if (
    typeof o['siteBaseUrl'] !== 'string' ||
    typeof o['pageId'] !== 'string' ||
    typeof o['index'] !== 'number' ||
    !Array.isArray(o['items'])
  ) {
    return null;
  }
  const items: ViewerSnapshotItem[] = [];
  for (const rawItem of o['items'] as unknown[]) {
    const item = parseItem(rawItem);
    if (!item) return null; // 1件でも壊れていれば全体を不正扱い(並び順の同一性が正)
    items.push(item);
  }
  if (items.length === 0) return null;
  const index = Math.trunc(o['index']);
  if (index < 0 || index >= items.length) return null;

  let rateLimit: ViewerSnapshot['rateLimit'];
  const rl = o['rateLimit'];
  if (typeof rl === 'object' && rl !== null) {
    const r = rl as Record<string, unknown>;
    if (
      (r['phase'] === 'Normal' || r['phase'] === 'Degraded' || r['phase'] === 'Blocked') &&
      typeof r['retryAfterMs'] === 'number'
    ) {
      rateLimit = {
        phase: r['phase'],
        retryAfterMs: r['retryAfterMs'],
        ...(typeof r['blockedUntilEpoch'] === 'number'
          ? { blockedUntilEpoch: r['blockedUntilEpoch'] }
          : {}),
      };
    }
  }
  return {
    schemaVersion: 1,
    siteBaseUrl: o['siteBaseUrl'],
    pageId: o['pageId'],
    index,
    items,
    ...(rateLimit ? { rateLimit } : {}),
    t0: typeof o['t0'] === 'number' ? o['t0'] : 0,
  };
}
