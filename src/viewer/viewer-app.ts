/**
 * Viewer表示制御(Phase 2)。DOM分離・mock注入で単体テスト可能(Phase2_Spec §5)。
 * WU-1: snapshot受領→即座に現在画像のURL設定(§13.3「起動後の最初の処理」)。
 * WU-2: 2段表示(§7.4) — thumb(w640)即表示→Originalを別要素でload+decode→
 *        次のanimation frameで一度だけ差し替え(即時)。失敗系:
 *        Original失敗=前段(thumb)維持 / すべて失敗=エラーfallback+Retry+
 *        「Originalを開く」/ダウンロード導線(§11)。
 * WU-3でナビゲーションがshowItem()を呼ぶ。
 */
import { v1DownloadPath } from '../shared/api/confluence-api';
import type { ViewerSnapshot, ViewerSnapshotItem } from '../shared/types/viewer-snapshot';

export interface ViewerAppOptions {
  readonly root: HTMLElement;
  readonly snapshot: ViewerSnapshot;
  /** 差し替えframeスケジューラ(既定requestAnimationFrame。テストは同期注入) */
  readonly raf?: (callback: () => void) => void;
  /** Original preload要素のfactory(§9.2: lane同時1。テストはstub注入) */
  readonly createPreload?: () => HTMLImageElement;
  /** Esc/閉じる要求(§7.3: closeOnEscape:false前提の自前handler→view.close) */
  readonly onCloseRequest?: () => void;
  readonly onDiagnostic?: (kind: 'info' | 'error', message: string) => void;
  readonly onMark?: (name: string) => void;
}

/** form control・native media control上のキーはそのcontrolに委ねる(§7.3) */
function isControlTarget(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false;
  const tag = target.tagName;
  return (
    tag === 'INPUT' ||
    tag === 'TEXTAREA' ||
    tag === 'SELECT' ||
    tag === 'VIDEO' ||
    tag === 'AUDIO' ||
    (target as HTMLElement).isContentEditable
  );
}

/** 正規形URL(§5.2)。thumbキャッシュ添付も同じv1 download正規形で参照する */
export function itemImageUrl(siteBaseUrl: string, item: ViewerSnapshotItem): string {
  if (item.thumb) {
    return itemOriginalUrl(siteBaseUrl, { ...item, attachmentId: item.thumb.cacheAttachmentId, version: item.thumb.cacheVersion });
  }
  return itemOriginalUrl(siteBaseUrl, item);
}

export function itemOriginalUrl(siteBaseUrl: string, item: ViewerSnapshotItem): string {
  const origin = siteBaseUrl.replace(/\/$/, '');
  return `${origin}${v1DownloadPath(item.pageId, item.attachmentId, item.version)}`;
}

export class ViewerApp {
  private readonly image: HTMLImageElement;
  private readonly status: HTMLElement;
  private readonly prevButton: HTMLButtonElement | null;
  private readonly nextButton: HTMLButtonElement | null;
  private readonly raf: (callback: () => void) => void;
  private readonly createPreload: () => HTMLImageElement;
  private index: number;
  /** ナビゲーションで進んだ古いpreload完了を無効化する世代トークン */
  private renderSeq = 0;
  private stageShown = false;
  private preload: HTMLImageElement | null = null;

  constructor(private readonly options: ViewerAppOptions) {
    // shell欠落は診断記録+detached要素で無害化する(throwしない — §8.4系ルール)
    const doc = options.root.ownerDocument;
    const image = options.root.querySelector<HTMLImageElement>('.mgv-image');
    const status = options.root.querySelector<HTMLElement>('.mgv-status');
    if (!image || !status) {
      options.onDiagnostic?.('error', 'viewer shell(.mgv-image/.mgv-status)が存在しない');
    }
    this.image = image ?? doc.createElement('img');
    this.status = status ?? doc.createElement('p');
    this.prevButton = options.root.querySelector<HTMLButtonElement>('.mgv-nav--prev');
    this.nextButton = options.root.querySelector<HTMLButtonElement>('.mgv-nav--next');
    this.attachNavigation(doc);
    this.index = options.snapshot.index;
    this.raf =
      options.raf ??
      ((callback) => {
        requestAnimationFrame(callback);
      });
    this.createPreload =
      options.createPreload ?? (() => this.image.ownerDocument.createElement('img'));
  }

  get currentIndex(): number {
    return this.index;
  }

  get current(): ViewerSnapshotItem {
    // parse(snapshot.ts)がitems非空とindex範囲を保証。範囲外は先頭へ丸める
    const items = this.options.snapshot.items;
    return items[this.index] ?? (items[0] as ViewerSnapshotItem);
  }

  /** 起動後の最初の処理: 現在画像のURL設定(§13.3) */
  start(): void {
    this.render();
  }

  /** indexの画像を表示する(ナビゲーション — §7.3) */
  showItem(index: number): void {
    if (index < 0 || index >= this.options.snapshot.items.length) return;
    this.index = index;
    this.options.onMark?.('p2.viewer.nav');
    this.render();
  }

  /** ナビゲーション配線(§7.3): 前後ボタン/Arrow/Esc。端で無効化 */
  private attachNavigation(doc: Document): void {
    this.prevButton?.addEventListener('click', () => {
      this.showItem(this.index - 1);
    });
    this.nextButton?.addEventListener('click', () => {
      this.showItem(this.index + 1);
    });
    doc.addEventListener('keydown', (event) => {
      if (isControlTarget(event.target)) return; // controlに委ねる(§7.3)
      if (event.key === 'ArrowLeft') {
        this.showItem(this.index - 1);
      } else if (event.key === 'ArrowRight') {
        this.showItem(this.index + 1);
      } else if (event.key === 'Escape') {
        // closeOnEscape:false前提の自前handler(§7.3)
        this.options.onCloseRequest?.();
      }
    });
  }

  private updateNavButtons(): void {
    if (this.prevButton) this.prevButton.disabled = this.index <= 0;
    if (this.nextButton) {
      this.nextButton.disabled = this.index >= this.options.snapshot.items.length - 1;
    }
  }

  /** 2段表示(§7.4)。Retryもここへ戻る(該当要求だけ再実行 — §11) */
  private render(): void {
    this.renderSeq += 1;
    const seq = this.renderSeq;
    const item = this.current;
    const site = this.options.snapshot.siteBaseUrl;
    this.clearError();
    this.stageShown = false;
    this.preload = null;
    this.updateNavButtons();
    // 新しい画像の表示状態は毎回fitに戻す(§7.3。ズーム状態はWU-3bで拡張)
    this.image.style.removeProperty('transform');

    const stage1Url = itemImageUrl(site, item);
    const originalUrl = itemOriginalUrl(site, item);
    const isDirectOriginal = !item.thumb; // 原寸fallback(§7.4 Shell→Original)

    const onStage1Load = (): void => {
      if (seq !== this.renderSeq) return;
      this.stageShown = true;
      this.options.onMark?.('p2.viewer.stage1-visible');
    };
    const onStage1Error = (): void => {
      if (seq !== this.renderSeq) return;
      this.options.onDiagnostic?.('error', `viewer: 前段load失敗(${item.attachmentId})`);
      if (isDirectOriginal) this.showErrorFallback(item, originalUrl); // 全滅
      // thumb失敗時はOriginal preloadの完了(下)で回復を待つ
    };
    this.image.addEventListener('load', onStage1Load, { once: true });
    this.image.addEventListener('error', onStage1Error, { once: true });
    this.image.alt = item.title; // 代替テキストはAttachment title(§13.4)
    this.image.hidden = false;
    this.image.src = stage1Url;
    this.options.onMark?.('p2.viewer.image-url-set');
    this.options.onDiagnostic?.(
      'info',
      `viewer: 表示開始 index=${this.index} thumb=${item.thumb ? 'あり' : 'なし(原寸)'}`,
    );
    if (isDirectOriginal) return; // 1段のみ

    // 2段目: Originalを別のpreload要素でload+decode(§7.4。lane同時1 — §9.2)
    const preload = this.createPreload();
    this.preload = preload;
    preload.addEventListener(
      'load',
      () => {
        const decode = typeof preload.decode === 'function' ? preload.decode() : Promise.resolve();
        void decode
          .catch(() => undefined) // decode失敗はswap時のdecodeに委ねる(表示は継続)
          .then(() => {
            if (seq !== this.renderSeq) return; // ナビ済み(stale)は破棄
            // 差し替えは次のanimation frameで一度だけ・即時(§7.4)
            this.raf(() => {
              if (seq !== this.renderSeq) return;
              this.image.src = originalUrl;
              this.options.onMark?.('p2.viewer.original-swap');
            });
          });
      },
      { once: true },
    );
    preload.addEventListener(
      'error',
      () => {
        if (seq !== this.renderSeq) return;
        this.options.onDiagnostic?.('error', `viewer: Original失敗(${item.attachmentId})`);
        if (this.stageShown) {
          // Original失敗時はthumb表示を維持する(§7.4/§11)
          this.options.onDiagnostic?.('info', 'viewer: thumb表示を維持');
        } else {
          this.showErrorFallback(item, originalUrl); // すべて失敗
        }
      },
      { once: true },
    );
    preload.src = originalUrl;
  }

  /** すべて失敗時のエラーfallback(§7.4/§11: Retry+Originalを開く+ダウンロード) */
  private showErrorFallback(item: ViewerSnapshotItem, originalUrl: string): void {
    const doc = this.status.ownerDocument;
    this.image.hidden = true;
    this.status.textContent = '画像を読み込めませんでした';
    this.status.dataset['state'] = 'error';
    const retry = doc.createElement('button');
    retry.type = 'button';
    retry.className = 'mgv-retry';
    retry.textContent = '再試行';
    retry.addEventListener('click', () => {
      this.render();
    });
    const open = doc.createElement('a');
    open.className = 'mgv-open-original';
    open.href = originalUrl;
    open.target = '_blank';
    open.rel = 'noopener';
    open.textContent = 'Originalを開く';
    const download = doc.createElement('a');
    download.className = 'mgv-download';
    download.href = originalUrl;
    download.setAttribute('download', item.title);
    download.textContent = 'ダウンロード';
    this.status.append(' ', retry, ' ', open, ' ', download);
    this.status.hidden = false;
  }

  private clearError(): void {
    if (this.status.dataset['state'] === 'error') {
      delete this.status.dataset['state'];
      this.status.textContent = '';
      this.status.hidden = true;
    }
  }

  showStatus(message: string): void {
    this.status.textContent = message;
    this.status.hidden = false;
  }
}
