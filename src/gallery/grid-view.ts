/**
 * グリッドDOM描画(V1 §6.2)。GalleryViewのDOM実装。
 * - タイル=button全体がclick/Enter/Space対象(Phase 1では診断記録のみのno-op)
 * - 比率枠(aspect-ratio 4:3)はCSSで画像取得前から確保
 * - タイトル要素は初回DOM生成時から存在(§6.4。hover表示スタイルはWU-6)
 * - 画像ロードはWU-4(本WUではplaceholderのみ)
 */
import type { AttachmentSummary } from '../shared/types/media';
import type { GalleryStatusState, GalleryView } from './gallery-controller';

/** 動画・音声は種別アイコン+汎用タイル(V1 §6.2/§2.1)。画像はWU-4でimgを載せる */
const KIND_ICON: Record<AttachmentSummary['kind'], string> = {
  image: '',
  video: '▶',
  audio: '♪',
  unsupported: '',
};

export class GridView implements GalleryView {
  private readonly grid: HTMLUListElement;
  private readonly status: HTMLElement;
  private readonly tilesById = new Map<string, HTMLLIElement>();
  private retryButton: HTMLButtonElement | null = null;

  constructor(
    root: HTMLElement,
    private readonly onActivate: (attachmentId: string) => void,
    private readonly onRetry: () => void,
  ) {
    const grid = root.querySelector<HTMLUListElement>('.mg-grid');
    const status = root.querySelector<HTMLElement>('.mg-status');
    if (!grid || !status) throw new Error('gallery shell(.mg-grid/.mg-status)が存在しない');
    this.grid = grid;
    this.status = status;
  }

  showStatus(state: GalleryStatusState, message: string): void {
    this.status.hidden = false;
    this.status.dataset['state'] = state;
    this.status.textContent = message;
    this.removeRetryButton();
    if (state === 'error') {
      const retry = this.status.ownerDocument.createElement('button');
      retry.type = 'button';
      retry.className = 'mg-retry';
      retry.textContent = '再試行';
      retry.addEventListener('click', () => {
        this.onRetry();
      });
      this.status.append(retry);
      this.retryButton = retry;
    }
  }

  clearStatus(): void {
    this.removeRetryButton();
    this.status.hidden = true;
    this.status.textContent = '';
  }

  private removeRetryButton(): void {
    this.retryButton?.remove();
    this.retryButton = null;
  }

  appendTiles(items: readonly AttachmentSummary[]): void {
    const doc = this.grid.ownerDocument;
    const fragment = doc.createDocumentFragment();
    for (const item of items) {
      if (this.tilesById.has(item.attachmentId)) continue;
      const li = doc.createElement('li');
      li.className = 'mg-tile-item';
      const tile = doc.createElement('button');
      tile.type = 'button';
      tile.className = 'mg-tile';
      tile.dataset['attachmentId'] = item.attachmentId;
      tile.setAttribute('aria-label', item.title);
      const media = doc.createElement('span');
      media.className = `mg-tile-media mg-tile-media--${item.kind}`;
      media.textContent = KIND_ICON[item.kind];
      media.setAttribute('aria-hidden', 'true'); // アクセシブル名はbutton側(title)

      const title = doc.createElement('span');
      title.className = 'mg-tile-title';
      title.textContent = item.title;
      title.setAttribute('aria-hidden', 'true');
      tile.append(media, title);
      // click handlerは同期処理のみ(§13.2の8ms予算。Enter/Spaceはbuttonのclickに集約)
      tile.addEventListener('click', () => {
        this.onActivate(item.attachmentId);
      });
      li.append(tile);
      fragment.append(li);
      this.tilesById.set(item.attachmentId, li);
    }
    this.grid.append(fragment);
  }

  reorderTiles(orderedIds: readonly string[]): void {
    const fragment = this.grid.ownerDocument.createDocumentFragment();
    for (const id of orderedIds) {
      const li = this.tilesById.get(id);
      if (li) fragment.append(li);
    }
    this.grid.append(fragment);
  }

  resetTiles(): void {
    this.grid.textContent = '';
    this.tilesById.clear();
  }
}
