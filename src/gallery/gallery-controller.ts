/**
 * Gallery初期化の取得系(V1 §6.1の手順3〜6)。bridge非依存で単体テスト可能。
 * - 1ページ目の結果で直ちに描画を開始し、続きページは既存グリッドを維持して追加
 * - 全件取得後に一度だけ順序を確定する(更新日時降順、同一日時はattachmentId昇順)
 * - 一覧結果はGalleryセッションの正本として返す。再送契機は明示Retryのみ(§6.1)
 */
import type { ConfluenceApi } from '../shared/api/confluence-api';
import type { AttachmentSummary } from '../shared/types/media';
import { DEFAULT_LIST_LIMIT, TILES_PER_FRAME } from '../shared/constants';
import type { MediaModel } from './media-items';
import { buildMediaModel, isGalleryItem } from './media-items';

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
  /** thumb対応表・stale・config(WU-2)。成功時のみ */
  readonly model?: MediaModel;
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
    const raw: AttachmentSummary[] = [];
    let firstBatchDone = false;
    try {
      view.resetTiles();
      view.showStatus('loading', '読み込み中…');
      let cursor: string | undefined;
      do {
        const page = await api.listAttachments(pageId, cursor, limit);
        raw.push(...page.items);
        const media = page.items.filter(isGalleryItem);
        if (media.length > 0) {
          const isFirst = !firstBatchDone;
          firstBatchDone = true;
          if (isFirst) this.options.onFirstPage?.();
          // 1ページ目応答後、次のanimation frameで最初のタイルbatchを反映(§13.3)。
          // タイルDOMは1frameあたりTILES_PER_FRAME件までに分割して追加する(§6.2)
          for (let offset = 0; offset < media.length; offset += TILES_PER_FRAME) {
            const chunk = media.slice(offset, offset + TILES_PER_FRAME);
            const isFirstChunk = isFirst && offset === 0;
            await new Promise<void>((resolve) => {
              this.raf(() => {
                view.appendTiles(chunk);
                if (isFirstChunk) {
                  view.clearStatus();
                  this.options.onFirstBatch?.();
                }
                resolve();
              });
            });
          }
        }
        cursor = page.nextCursor;
      } while (cursor !== undefined);

      // 分類・thumb対応付け(WU-2)。一覧全件から対応表を構築する
      const model = buildMediaModel(raw);
      if (model.media.length === 0) {
        view.showStatus('empty', 'このページにメディアの添付はありません');
        return { ok: true, items: [], model };
      }
      // 全件取得完了後に順序を確定する。再配置は一度(§6.1)
      const items = [...model.media].sort(compareGalleryOrder);
      view.reorderTiles(items.map((item) => item.attachmentId));
      onDiagnostic?.(
        'info',
        `gallery: 一覧確定 ${items.length}件(thumb対応${model.thumbsByTarget.size}件、stale ${model.staleThumbs.length}件)`,
      );
      return { ok: true, items, model };
    } catch (error) {
      onDiagnostic?.(
        'error',
        `gallery: 一覧取得失敗(${error instanceof Error ? error.message : 'unknown'})`,
      );
      view.showStatus('error', '添付一覧を取得できませんでした');
      return { ok: false, items: [] };
    } finally {
      this.loading = false;
    }
  }
}
