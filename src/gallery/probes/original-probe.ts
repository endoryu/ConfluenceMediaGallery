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

export interface OriginalProbeOptions {
  readonly api: ConfluenceApi & ThumbnailProbeApi;
  readonly diagnostics: DiagnosticBuffer;
  readonly loadImage?: ImageLoader;
  readonly corsProbe?: CorsProbe;
}

function absolutize(link: string, baseUrl: string): string {
  try {
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
}
