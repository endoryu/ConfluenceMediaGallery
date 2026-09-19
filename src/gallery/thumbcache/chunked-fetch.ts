/**
 * thumbキャッシュ生成の素材取得(Phase1_Spec WU-5作業3。P0-8 G1cで実証)。
 * 一括取得が失敗した大容量向けに、Range分割(4MB×N、上限128MB)で全量を結合する。
 * Phase 0の src/gallery/probes/original-probe.ts から移設(WU-0)。
 */
import type { BinaryFetchOptions, BinaryFetchResult } from '../../shared/api/confluence-api';

/** 素材取得に必要な最小interface(ForgeConfluenceApiが構造的に満たす) */
export interface BinaryFetcher {
  fetchBinary(pathWithQuery: string, opts?: BinaryFetchOptions): Promise<BinaryFetchResult>;
}

export interface ChunkedFetchResult {
  readonly blob?: Blob;
  readonly total?: number;
  readonly chunks?: number;
  readonly ms: number;
  readonly note?: string;
}

export async function chunkedFetchBinary(
  api: BinaryFetcher,
  path: string,
  onProgress?: (loaded: number, total: number) => void,
): Promise<ChunkedFetchResult> {
  const CHUNK = 4 * 1024 * 1024;
  const MAX_TOTAL = 128 * 1024 * 1024;
  const started = performance.now();
  const done = (extra: { blob?: Blob; total?: number; chunks?: number; note?: string }) => ({
    ...extra,
    ms: performance.now() - started,
  });
  const first = await api.fetchBinary(path, { range: `bytes=0-${CHUNK - 1}` });
  if (!first.ok || !first.blob) {
    return done({ note: `初回chunk失敗: status=${first.status} ${first.note ?? ''}` });
  }
  if (first.status !== 206) {
    return done({ blob: first.blob, total: first.blob.size, chunks: 1, note: 'Range無視(200で全量)' });
  }
  const totalMatch = first.contentRange?.match(/\/(\d+)\s*$/);
  const total = totalMatch?.[1] ? Number(totalMatch[1]) : undefined;
  if (!total || !Number.isFinite(total)) {
    return done({ note: `Content-Range不明(${first.contentRange ?? '-'})` });
  }
  if (total > MAX_TOTAL) {
    return done({ note: `total ${total} bytes が上限128MBを超過` });
  }
  const parts: Blob[] = [first.blob];
  let offset = first.blob.size;
  let chunks = 1;
  while (offset < total) {
    const end = Math.min(offset + CHUNK, total) - 1;
    const res = await api.fetchBinary(path, { range: `bytes=${offset}-${end}` });
    if (!res.ok || !res.blob || res.status !== 206) {
      return done({ note: `chunk失敗: offset=${offset} status=${res.status} ${res.note ?? ''}` });
    }
    parts.push(res.blob);
    offset += res.blob.size;
    chunks += 1;
    onProgress?.(offset, total);
    if (res.blob.size === 0) return done({ note: `空chunk受領: offset=${offset}` });
  }
  const type = first.contentType;
  return done({
    blob: new Blob(parts, type ? { type } : undefined),
    total,
    chunks,
  });
}
