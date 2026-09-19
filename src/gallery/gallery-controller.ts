/**
 * Gallery初期化の取得系(V1 §6.1の手順3〜6)。bridge非依存で単体テスト可能。
 * - 1ページ目の結果で直ちに描画を開始し、続きページは既存グリッドを維持して追加
 * - 全件取得後に一度だけ順序を確定する(更新日時降順、同一日時はattachmentId昇順)
 * - 一覧結果はGalleryセッションの正本として返す。再送契機は明示Retryのみ(§6.1)
 */
import type { ConfluenceApi } from '../shared/api/confluence-api';
import type { AttachmentSummary } from '../shared/types/media';
import { DEFAULT_LIST_LIMIT } from '../shared/constants';

export type GalleryStatusState = 'loading' | 'error' | 'empty' | 'blocked';

export interface GalleryView {
  showStatus(state: GalleryStatusState, message: string): void;
  clearStatus(): void;
  /** 次のanimation frameで呼ばれる。既存タイルを維持したまま追加する */
  appendTiles(items: readonly AttachmentSummary[]): void;
  /** 全件取得後の一度きりの並べ替え(attachmentIdの確定順) */
  reorderTiles(orderedIds: readonly string[]): void;
  /** Retry時の再構築用。通常ロードでは呼ばれても空のまま */
  resetTiles(): void;
}

export interface GalleryControllerOptions {
  readonly api: ConfluenceApi;
  readonly pageId: string;
  readonly view: GalleryView;
  readonly limit?: number;
  /** 既定はrequestAnimationFrame。テストでは同期実行を注入する */
  readonly raf?: (callback: () => void) => void;
  /** 表示対象を含む最初のページ応答を受けたとき(計測mark用) */
  readonly onFirstPage?: () => void;
  /** 最初のタイルbatchがDOMへ渡ったとき(計測mark用) */
  readonly onFirstBatch?: () => void;
  readonly onDiagnostic?: (kind: 'info' | 'error', message: string) => void;
}

export interface GalleryLoadResult {
  readonly ok: boolean;
  /** セッション正本(確定順)。okがfalseのときは空 */
  readonly items: readonly AttachmentSummary[];
}

/** グリッド表示対象か(自己管理thumbキャッシュ添付と非メディアを除外。詳細はWU-2) */
export function isGalleryItem(item: AttachmentSummary): boolean {
  if (item.title.startsWith('mg_thumbcache_')) return false;
  return item.kind === 'image' || item.kind === 'video' || item.kind === 'audio';
}

/** 更新日時降順、同一日時はattachmentId昇順(V1 §6.1の固定順序) */
export function compareGalleryOrder(a: AttachmentSummary, b: AttachmentSummary): number {
  const aTime = Date.parse(a.updatedAt ?? a.createdAt ?? '') || 0;
  const bTime = Date.parse(b.updatedAt ?? b.createdAt ?? '') || 0;
  if (aTime !== bTime) return bTime - aTime;
  return compareIdAsc(a.attachmentId, b.attachmentId);
}

/** 数値文字列は数値順、それ以外は辞書順で昇順比較する */
function compareIdAsc(a: string, b: string): number {
  if (/^\d+$/.test(a) && /^\d+$/.test(b)) {
    if (a.length !== b.length) return a.length - b.length;
  }
  return a < b ? -1 : a > b ? 1 : 0;
}

export class GalleryController {
  private readonly raf: (callback: () => void) => void;
  private loading = false;

  constructor(private readonly options: GalleryControllerOptions) {
    this.raf =
      options.raf ??
      ((callback) => {
        requestAnimationFrame(callback);
      });
  }

  /**
   * 一覧の全ページを取得し、ページ到着ごとに描画を進める。
   * 戻り値のitemsがセッション正本(§6.1)。失敗時はview側にerror表示済み。
   */
  async loadAll(): Promise<GalleryLoadResult> {
    if (this.loading) return { ok: false, items: [] };
    this.loading = true;
    const { api, pageId, view, onDiagnostic } = this.options;
    const limit = this.options.limit ?? DEFAULT_LIST_LIMIT;
    const all: AttachmentSummary[] = [];
    let firstBatchDone = false;
    try {
      view.resetTiles();
      view.showStatus('loading', '読み込み中…');
      let cursor: string | undefined;
      do {
        const page = await api.listAttachments(pageId, cursor, limit);
        const media = page.items.filter(isGalleryItem);
        all.push(...media);
        if (media.length > 0) {
          const isFirst = !firstBatchDone;
          firstBatchDone = true;
          if (isFirst) this.options.onFirstPage?.();
          // 1ページ目応答後、次のanimation frameで最初のタイルbatchを反映(§13.3)
          await new Promise<void>((resolve) => {
            this.raf(() => {
              view.appendTiles(media);
              if (isFirst) {
                view.clearStatus();
                this.options.onFirstBatch?.();
              }
              resolve();
            });
          });
        }
        cursor = page.nextCursor;
      } while (cursor !== undefined);

      if (all.length === 0) {
        view.showStatus('empty', 'このページにメディアの添付はありません');
        return { ok: true, items: [] };
      }
      // 全件取得完了後に順序を確定する。再配置は一度(§6.1)
      all.sort(compareGalleryOrder);
      view.reorderTiles(all.map((item) => item.attachmentId));
      onDiagnostic?.('info', `gallery: 一覧確定 ${all.length}件`);
      return { ok: true, items: all };
    } catch (error) {
      onDiagnostic?.(
        'error',
        `gallery: 一覧取得失敗(${error instanceof Error ? error.message : 'unknown'})`,
      );
      view.showStatus('error', '添付一覧を取得できませんでした');
      return { ok: false, items: all };
    } finally {
      this.loading = false;
    }
  }
}
