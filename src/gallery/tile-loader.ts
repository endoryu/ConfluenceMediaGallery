/**
 * Thumbnailロード(V1 §6.3、Phase1_Spec WU-4)。
 * | 初回viewport内          | eager、fetchpriority=high |
 * | viewport直近1画面分     | eager、fetchpriority=auto |
 * | それ以外                | loading=lazy + IntersectionObserver、fetchpriority=low |
 * 遠隔タイルはIOが視界1画面手前に入るまでsrcを与えず、取得をviewport周辺に
 * 限定する(§13.3。native lazyの先読み距離はブラウザ依存のため独自に制御)。
 * srcはthumbキャッシュ優先→原寸fallback(選択は呼び出し側resolver — WU-2)。
 * 画面密度変化・リサイズ時は取得済み画像を維持する(§6.3。再割当てしない)。
 */
import type { AttachmentSummary } from '../shared/types/media';

export interface TileImageAssignment {
  /** adapterのURL builderで構築した正規形URL(§5.2) */
  readonly src: string;
  /** 原寸fallbackか(thumbキャッシュ未使用 — WU-5の生成判定に使う) */
  readonly isOriginalFallback: boolean;
}

export interface TileLoaderOptions {
  /** タイル画像のURLを返す。nullは画像なし(動画・音声等) */
  readonly resolveSrc: (item: AttachmentSummary, displayWidthCssPx: number) => TileImageAssignment | null;
  /** media load失敗の通知(縮退state machine・error表示へ) */
  readonly onFailure?: (item: AttachmentSummary, imageElement: HTMLImageElement) => void;
  readonly onLoaded?: (item: AttachmentSummary, imageElement: HTMLImageElement) => void;
  /** テスト注入用IntersectionObserver factory */
  readonly createObserver?: (callback: IntersectionObserverCallback) => IntersectionObserver;
}

export type TilePriority = 'high' | 'auto' | 'low';

/** DOM順indexと画面あたりタイル数から優先度層を決める(§6.3) */
export function priorityForIndex(index: number, tilesPerViewport: number): TilePriority {
  if (index < tilesPerViewport) return 'high';
  if (index < tilesPerViewport * 2) return 'auto';
  return 'low';
}

/** コンテナ幅・viewport高からviewportあたりのタイル数を概算する */
export function estimateTilesPerViewport(
  containerWidthCssPx: number,
  viewportHeightCssPx: number,
  tileMinWidthCssPx: number,
  gapCssPx: number,
): { columns: number; rows: number; count: number; tileWidth: number } {
  const columns = Math.max(
    1,
    Math.floor((containerWidthCssPx + gapCssPx) / (tileMinWidthCssPx + gapCssPx)),
  );
  const tileWidth = (containerWidthCssPx - gapCssPx * (columns - 1)) / columns;
  const tileHeight = tileWidth * (3 / 4);
  const rows = Math.max(1, Math.ceil(viewportHeightCssPx / (tileHeight + gapCssPx)));
  return { columns, rows, count: columns * rows, tileWidth };
}

export class TileLoader {
  private readonly observer: IntersectionObserver | null;
  private readonly pending = new Map<Element, () => void>();

  constructor(private readonly options: TileLoaderOptions) {
    const create =
      this.options.createObserver ??
      ((callback: IntersectionObserverCallback) =>
        // 視界1画面手前でsrcを与える(取得をviewport周辺に限定 — §13.3)
        new IntersectionObserver(callback, { rootMargin: '100% 0%' }));
    this.observer =
      typeof IntersectionObserver === 'undefined' && !this.options.createObserver
        ? null
        : create((entries) => {
            for (const entry of entries) {
              if (!entry.isIntersecting) continue;
              const start = this.pending.get(entry.target);
              if (start) {
                this.pending.delete(entry.target);
                this.observer?.unobserve(entry.target);
                start();
              }
            }
          });
  }

  /**
   * タイルへ画像を割り当てる。mediaHost要素(.mg-tile-media)へimgを追加する。
   * 割当てはDOM確定順に一度だけ行う(リサイズでの再割当てなし — §6.3)。
   */
  assign(
    mediaHost: HTMLElement,
    item: AttachmentSummary,
    priority: TilePriority,
    displayWidthCssPx: number,
  ): void {
    const assignment = this.options.resolveSrc(item, displayWidthCssPx);
    if (!assignment) return;
    const doc = mediaHost.ownerDocument;
    const img = doc.createElement('img');
    img.alt = ''; // 代替テキストはタイルbutton(アクセシブル名)が担う
    img.decoding = 'async';
    img.setAttribute('fetchpriority', priority);
    img.dataset['fallback'] = assignment.isOriginalFallback ? '1' : '0';
    img.addEventListener('error', () => {
      this.options.onFailure?.(item, img);
    });
    img.addEventListener('load', () => {
      this.options.onLoaded?.(item, img);
    });
    const start = (): void => {
      img.src = assignment.src;
    };
    if (priority === 'low') {
      img.loading = 'lazy';
      if (this.observer) {
        // IOが視界に近づけてからsrc設定(それまで取得しない)
        this.pending.set(mediaHost, start);
        mediaHost.append(img);
        this.observer.observe(mediaHost);
        return;
      }
    }
    mediaHost.append(img);
    start();
  }

  disconnect(): void {
    this.observer?.disconnect();
    this.pending.clear();
  }
}
