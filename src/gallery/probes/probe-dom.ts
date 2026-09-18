/**
 * probe共通部品: native <img> ロード計測とDOM表示ヘルパー。
 * 診断メッセージへはhost+pathのみを渡す(signed URL query除去。CLAUDE.md §10)。
 */
import type { DiagnosticBuffer } from '../../shared/diagnostics/diagnostic-buffer';
import { mark, measure } from '../../shared/probe/marks';

export interface ImageLoadResult {
  readonly ok: boolean;
  readonly naturalWidth: number;
  readonly naturalHeight: number;
  readonly loadMs: number;
  readonly decodeMs?: number;
  readonly element?: HTMLImageElement;
}

export type ImageLoader = (doc: Document, url: string) => Promise<ImageLoadResult>;

/** native <img> でロードし p0.img.* markを打つ(既定実装) */
export const nativeImageLoader: ImageLoader = async (doc, url) => {
  const img = doc.createElement('img');
  img.decoding = 'async';
  const started = performance.now();
  const loaded = new Promise<boolean>((resolve) => {
    img.addEventListener('load', () => resolve(true), { once: true });
    img.addEventListener('error', () => resolve(false), { once: true });
  });
  mark('p0.img.src-set');
  img.src = url;
  const ok = await loaded;
  mark('p0.img.load');
  const loadMs = performance.now() - started;
  let decodeMs: number | undefined;
  if (ok && typeof img.decode === 'function') {
    const decodeStarted = performance.now();
    try {
      await img.decode();
      mark('p0.img.decoded');
      measure('p0.img.src-set→p0.img.decoded', 'p0.img.src-set', 'p0.img.decoded');
      decodeMs = performance.now() - decodeStarted;
    } catch {
      // decode失敗はloadMsのみ記録
    }
  }
  const result: { -readonly [K in keyof ImageLoadResult]?: ImageLoadResult[K] } = {
    ok,
    naturalWidth: img.naturalWidth,
    naturalHeight: img.naturalHeight,
    loadMs,
    element: img,
  };
  if (decodeMs !== undefined) result.decodeMs = decodeMs;
  return result as ImageLoadResult;
};

export function stripQuery(url: string): string {
  try {
    const u = new URL(url);
    return `${u.host}${u.pathname}`;
  } catch {
    return url.split('?')[0] ?? url;
  }
}

export function withoutParam(url: string, param: string): string {
  try {
    const u = new URL(url);
    u.searchParams.delete(param);
    return u.toString();
  } catch {
    return url;
  }
}

export function appendKeyValues(doc: Document, parent: HTMLElement, rows: [string, string][]): void {
  const dl = doc.createElement('dl');
  for (const [key, value] of rows) {
    const dt = doc.createElement('dt');
    dt.textContent = key;
    const dd = doc.createElement('dd');
    dd.textContent = value;
    dl.append(dt, dd);
  }
  parent.append(dl);
}

export function describeLoad(result: ImageLoadResult): string {
  if (!result.ok) return 'error(表示不可)';
  const decode = result.decodeMs === undefined ? '-' : `${result.decodeMs.toFixed(1)}ms`;
  return `natural ${result.naturalWidth}x${result.naturalHeight}, load ${result.loadMs.toFixed(1)}ms, decode ${decode}`;
}

export async function loadInto(
  doc: Document,
  parent: HTMLElement,
  label: string,
  url: string,
  loader: ImageLoader,
  diagnostics: DiagnosticBuffer,
  kindPrefix = 'probe',
): Promise<ImageLoadResult> {
  const figure = doc.createElement('figure');
  const caption = doc.createElement('figcaption');
  caption.textContent = `${label}: 読込中…`;
  figure.append(caption);
  parent.append(figure);
  const result = await loader(doc, url);
  caption.textContent = `${label}: ${describeLoad(result)}`;
  if (result.element) {
    result.element.style.maxWidth = '320px';
    figure.append(result.element);
  }
  diagnostics.record(
    result.ok ? 'info' : 'error',
    `${kindPrefix} ${label} → ${describeLoad(result)} (${stripQuery(url)})`,
  );
  return result;
}
