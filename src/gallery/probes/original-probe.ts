/**
 * WU-3 Original画像直接表示probe(P0-2)+G1 CORS読み出し判定(P0-8前半)。
 * 1. v1 download endpointの302記録(redirect probe)
 * 2. v1 endpointとdownloadLinkのnative <img>比較(正本候補の確定)
 * 3. 同一URL再読込(cache。正本はDevTools)
 * 4. version検証(旧版/なし)
 * 5. G1: crossorigin付きロードとcanvas.toBlob()の成立性
 * 出力は画面内とdiagnostics(host+pathのみ)。
 */
import type { ConfluenceApi, ThumbnailProbeApi } from '../../shared/api/confluence-api';
import type { DiagnosticBuffer } from '../../shared/diagnostics/diagnostic-buffer';
import type { AttachmentSummary } from '../../shared/types/media';
import type { ImageLoader } from './probe-dom';
import { appendKeyValues, loadInto, nativeImageLoader, stripQuery, withoutParam } from './probe-dom';

export interface CorsProbeResult {
  /** crossorigin=anonymous でのロード可否 */
  readonly crossoriginLoaded: boolean;
  /** 縮小canvasからのBlob取得可否(G1の本体) */
  readonly blobObtained: boolean;
  readonly blobSize?: number;
  readonly blobType?: string;
  /** crossoriginなしロード+canvas読み出し時のエラー(tainted想定) */
  readonly taintedError?: string;
  readonly note?: string;
}

export type CorsProbe = (doc: Document, url: string) => Promise<CorsProbeResult>;

function loadImageElement(
  doc: Document,
  url: string,
  useCors: boolean,
): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = doc.createElement('img');
    if (useCors) img.crossOrigin = 'anonymous';
    img.addEventListener('load', () => resolve(img), { once: true });
    img.addEventListener('error', () => resolve(null), { once: true });
    img.src = url;
  });
}

function canvasToBlob(doc: Document, img: HTMLImageElement): Promise<Blob | null> {
  const canvas = doc.createElement('canvas');
  const scale = Math.min(1, 320 / Math.max(1, img.naturalWidth));
  canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
  canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
  const ctx = canvas.getContext('2d');
  if (!ctx) return Promise.resolve(null);
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  return new Promise((resolve, reject) => {
    try {
      canvas.toBlob((blob) => resolve(blob), 'image/jpeg', 0.8);
    } catch (error) {
      reject(error instanceof Error ? error : new Error('toBlob failed'));
    }
  });
}

/** G1判定の既定実装(実ブラウザ用。jsdomテストではstubを注入する) */
export const defaultCorsProbe: CorsProbe = async (doc, url) => {
  const result: { -readonly [K in keyof CorsProbeResult]?: CorsProbeResult[K] } = {
    crossoriginLoaded: false,
    blobObtained: false,
  };
  const corsImg = await loadImageElement(doc, url, true);
  if (corsImg) {
    result.crossoriginLoaded = true;
    try {
      const blob = await canvasToBlob(doc, corsImg);
      if (blob) {
        result.blobObtained = true;
        result.blobSize = blob.size;
        result.blobType = blob.type;
      } else {
        result.note = 'toBlobがnullを返した';
      }
    } catch (error) {
      result.note = `crossoriginロード成立だが読み出し失敗: ${error instanceof Error ? error.message : 'unknown'}`;
    }
    return result as CorsProbeResult;
  }
  // crossorigin不成立 → 通常ロード+tainted読み出しの挙動を記録
  const plainImg = await loadImageElement(doc, url, false);
  if (!plainImg) {
    result.note = 'crossorigin・通常ロードとも失敗';
    return result as CorsProbeResult;
  }
  try {
    const blob = await canvasToBlob(doc, plainImg);
    if (blob) {
      result.blobObtained = true;
      result.blobSize = blob.size;
      result.blobType = blob.type;
      result.note = 'crossoriginなしで読み出し成立(想定外。要検証)';
    }
  } catch (error) {
    result.taintedError = error instanceof Error ? `${error.name}: ${error.message}` : 'unknown';
  }
  return result as CorsProbeResult;
};

/** G1b: bridge経由blob→createImageBitmap→canvas縮小→toBlob の結果 */
export interface BridgeBlobProbeResult {
  readonly bytesFetched: boolean;
  readonly sourceSize?: number;
  readonly sourceType?: string;
  readonly blobObtained: boolean;
  readonly blobSize?: number;
  readonly blobType?: string;
  readonly note?: string;
}

export type BridgeBlobProbe = (
  doc: Document,
  api: ThumbnailProbeApi,
  pathWithQuery: string,
) => Promise<BridgeBlobProbeResult>;

/**
 * G1b既定実装。cross-origin画像を<img>経由でcanvasへ入れず、
 * requestConfluenceで取得したBlobからImageBitmapを生成するためtaintしない。
 */
export const defaultBridgeBlobProbe: BridgeBlobProbe = async (doc, api, pathWithQuery) => {
  const result: { -readonly [K in keyof BridgeBlobProbeResult]?: BridgeBlobProbeResult[K] } = {
    bytesFetched: false,
    blobObtained: false,
  };
  const fetched = await api.fetchBinary(pathWithQuery);
  if (!fetched.ok || !fetched.blob) {
    result.note = `bridge取得失敗: status=${fetched.status} ${fetched.note ?? ''}`;
    return result as BridgeBlobProbeResult;
  }
  result.bytesFetched = true;
  result.sourceSize = fetched.blob.size;
  if (fetched.contentType !== undefined) result.sourceType = fetched.contentType;
  try {
    const bitmap = await createImageBitmap(fetched.blob);
    const canvas = doc.createElement('canvas');
    const scale = Math.min(1, 320 / Math.max(1, bitmap.width));
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      result.note = '2d contextが取得できない';
      return result as BridgeBlobProbeResult;
    }
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    const blob = await new Promise<Blob | null>((resolve, reject) => {
      try {
        canvas.toBlob((b) => resolve(b), 'image/jpeg', 0.8);
      } catch (error) {
        reject(error instanceof Error ? error : new Error('toBlob failed'));
      }
    });
    if (blob) {
      result.blobObtained = true;
      result.blobSize = blob.size;
      result.blobType = blob.type;
    } else {
      result.note = 'toBlobがnullを返した';
    }
  } catch (error) {
    result.note = `decode/縮小失敗: ${error instanceof Error ? `${error.name}: ${error.message}` : 'unknown'}`;
  }
  return result as BridgeBlobProbeResult;
};

export interface OriginalProbeOptions {
  readonly api: ConfluenceApi & ThumbnailProbeApi;
  readonly diagnostics: DiagnosticBuffer;
  readonly loadImage?: ImageLoader;
  readonly corsProbe?: CorsProbe;
  readonly bridgeBlobProbe?: BridgeBlobProbe;
}

/**
 * v2 APIの `_links` は `/wiki` ベース相対のため、`/` 始まりで `/wiki/` 以外は
 * `<origin>/wiki` を前置して解決する(初回実測で `/wiki` 欠落404を確認)。
 */
function absolutize(link: string, baseUrl: string): string {
  try {
    if (link.startsWith('/') && !link.startsWith('/wiki/')) {
      return `${new URL(baseUrl).origin}/wiki${link}`;
    }
    return new URL(link, baseUrl).toString();
  } catch {
    return link;
  }
}

function v1DownloadPath(item: AttachmentSummary): string {
  return `/wiki/rest/api/content/${encodeURIComponent(item.pageId)}/child/attachment/${encodeURIComponent(item.attachmentId)}/download?version=${item.version}`;
}

export async function runOriginalProbe(
  container: HTMLElement,
  item: AttachmentSummary,
  options: OriginalProbeOptions,
): Promise<void> {
  const doc = container.ownerDocument;
  const loader = options.loadImage ?? nativeImageLoader;
  const corsProbe = options.corsProbe ?? defaultCorsProbe;
  const bridgeBlobProbe = options.bridgeBlobProbe ?? defaultBridgeBlobProbe;
  const { api, diagnostics } = options;

  const section = doc.createElement('section');
  const heading = doc.createElement('h3');
  heading.textContent = `Original probe: ${item.attachmentId} v${item.version}`;
  section.append(heading);
  container.append(section);

  // 1. v1 download endpointの302記録
  const redirect = await api.redirectProbe(v1DownloadPath(item));
  appendKeyValues(doc, section, [
    ['redirect probe mode', redirect.mode],
    ['status', String(redirect.status)],
    ['Location(host+path)', redirect.locationHostPath ?? '-'],
    ['Cache-Control', redirect.cacheControl ?? '-'],
    ['ETag', redirect.etag ?? '-'],
    ['note', redirect.note ?? '-'],
  ]);
  diagnostics.record(
    'info',
    `original redirect probe: mode=${redirect.mode} status=${redirect.status} location=${redirect.locationHostPath ?? '-'} cache-control=${redirect.cacheControl ?? '-'}`,
  );

  // 2. v1 endpoint と downloadLink のnative表示比較(正本候補確定 — Phase0_Spec WU-3作業1〜3)
  const compareArea = doc.createElement('div');
  section.append(compareArea);
  const v1Url = api.originalUrl(item.pageId, item.attachmentId, item.version);
  await loadInto(doc, compareArea, 'v1 endpoint', v1Url, loader, diagnostics, 'original');
  if (item.downloadLink) {
    const dlUrl = absolutize(item.downloadLink, v1Url);
    await loadInto(doc, compareArea, 'downloadLink', dlUrl, loader, diagnostics, 'original');
  } else {
    const p = doc.createElement('p');
    p.textContent = 'downloadLink: 一覧レスポンスに存在しない';
    compareArea.append(p);
    diagnostics.record('info', 'original downloadLink: 一覧レスポンスに存在しない');
  }

  // 3. 同一URL再読込(cache。正本はDevTools)
  const reloadButton = doc.createElement('button');
  reloadButton.type = 'button';
  reloadButton.dataset['action'] = 'original-reload';
  reloadButton.textContent = '同一URL再読込(cache確認)';
  const reloadArea = doc.createElement('div');
  reloadButton.addEventListener('click', () => {
    void loadInto(doc, reloadArea, '再読込', v1Url, loader, diagnostics, 'original');
  });
  section.append(reloadButton, reloadArea);

  // 4. version検証(旧版が存在する場合のみ)
  if (item.version >= 2) {
    const versionHeading = doc.createElement('h4');
    versionHeading.textContent = 'version検証';
    const versionArea = doc.createElement('div');
    section.append(versionHeading, versionArea);
    await loadInto(
      doc,
      versionArea,
      `version=${item.version - 1}(旧版)`,
      api.originalUrl(item.pageId, item.attachmentId, item.version - 1),
      loader,
      diagnostics,
      'original',
    );
    await loadInto(
      doc,
      versionArea,
      'versionなし',
      withoutParam(v1Url, 'version'),
      loader,
      diagnostics,
      'original',
    );
  }

  // 5. G1: CORS読み出し判定(P0-8前半。不成立ならthumbキャッシュ書き戻しは失効・再裁定)
  const g1Heading = doc.createElement('h4');
  g1Heading.textContent = 'G1: CORS読み出し(canvas.toBlob)';
  section.append(g1Heading);
  const g1 = await corsProbe(doc, v1Url);
  appendKeyValues(doc, section, [
    ['crossoriginロード', g1.crossoriginLoaded ? '成立' : '不成立'],
    ['Blob取得(G1本体)', g1.blobObtained ? '成立' : '不成立'],
    ['Blob size/type', g1.blobObtained ? `${g1.blobSize ?? '-'} bytes / ${g1.blobType ?? '-'}` : '-'],
    ['taintedエラー', g1.taintedError ?? '-'],
    ['note', g1.note ?? '-'],
  ]);
  diagnostics.record(
    g1.blobObtained ? 'info' : 'error',
    `G1 CORS readback: crossorigin=${g1.crossoriginLoaded} blob=${g1.blobObtained} size=${g1.blobSize ?? '-'} tainted=${g1.taintedError ?? '-'} note=${g1.note ?? '-'} (${stripQuery(v1Url)})`,
  );

  // 5b. G1b: bridge経由blob→縮小(CORSに依存しない代替経路)
  const g1bHeading = doc.createElement('h4');
  g1bHeading.textContent = 'G1b: bridge経由blob→縮小(代替経路)';
  section.append(g1bHeading);
  const g1b = await bridgeBlobProbe(doc, api, v1DownloadPath(item));
  appendKeyValues(doc, section, [
    ['bytes取得(requestConfluence)', g1b.bytesFetched ? `成立(${g1b.sourceSize ?? '-'} bytes / ${g1b.sourceType ?? '-'})` : '不成立'],
    ['縮小Blob取得(G1b本体)', g1b.blobObtained ? `成立(${g1b.blobSize ?? '-'} bytes / ${g1b.blobType ?? '-'})` : '不成立'],
    ['note', g1b.note ?? '-'],
  ]);
  diagnostics.record(
    g1b.blobObtained ? 'info' : 'error',
    `G1b bridge-blob readback: bytes=${g1b.bytesFetched} src=${g1b.sourceSize ?? '-'} blob=${g1b.blobObtained} out=${g1b.blobSize ?? '-'} note=${g1b.note ?? '-'} (${stripQuery(v1Url)})`,
  );
}
