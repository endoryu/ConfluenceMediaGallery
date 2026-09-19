/**
 * Viewer表示制御(Phase 2)。DOM分離・mock注入で単体テスト可能(Phase2_Spec §5)。
 * WU-1: snapshot受領→即座に現在画像のURLを設定する(§13.3「起動後の最初の処理」)。
 * WU-2で2段表示(thumb→Original preload+swap)、WU-3でナビゲーションを拡張する。
 */
import { v1DownloadPath } from '../shared/api/confluence-api';
import type { ViewerSnapshot, ViewerSnapshotItem } from '../shared/types/viewer-snapshot';

export interface ViewerAppOptions {
  readonly root: HTMLElement;
  readonly snapshot: ViewerSnapshot;
  readonly onDiagnostic?: (kind: 'info' | 'error', message: string) => void;
  readonly onMark?: (name: string) => void;
}

/** 正規形URL(§5.2)。thumbキャッシュ添付も同じv1 download正規形で参照する */
export function itemImageUrl(siteBaseUrl: string, item: ViewerSnapshotItem): string {
  const origin = siteBaseUrl.replace(/\/$/, '');
  if (item.thumb) {
    return `${origin}${v1DownloadPath(item.pageId, item.thumb.cacheAttachmentId, item.thumb.cacheVersion)}`;
  }
  return `${origin}${v1DownloadPath(item.pageId, item.attachmentId, item.version)}`;
}

export class ViewerApp {
  private readonly image: HTMLImageElement;
  private readonly status: HTMLElement;
  private index: number;

  constructor(private readonly options: ViewerAppOptions) {
    const image = options.root.querySelector<HTMLImageElement>('.mgv-image');
    const status = options.root.querySelector<HTMLElement>('.mgv-status');
    if (!image || !status) throw new Error('viewer shell(.mgv-image/.mgv-status)が存在しない');
    this.image = image;
    this.status = status;
    this.index = options.snapshot.index;
  }

  get current(): ViewerSnapshotItem {
    const item = this.options.snapshot.items[this.index];
    if (!item) throw new Error(`snapshot index不正: ${this.index}`);
    return item;
  }

  /** 起動後の最初の処理: 現在画像のURL設定(§13.3)。thumb優先→原寸fallback(§7.4) */
  start(): void {
    const item = this.current;
    this.image.alt = ''; // アクセシブル名はWU-3のナビ文脈で整備(title保持はsnapshot)
    this.image.src = itemImageUrl(this.options.snapshot.siteBaseUrl, item);
    this.image.hidden = false;
    this.options.onMark?.('p2.viewer.image-url-set');
    this.options.onDiagnostic?.(
      'info',
      `viewer: 表示開始 index=${this.index} thumb=${item.thumb ? 'あり' : 'なし(原寸)'}`,
    );
  }

  showStatus(message: string): void {
    this.status.textContent = message;
    this.status.hidden = false;
  }
}
