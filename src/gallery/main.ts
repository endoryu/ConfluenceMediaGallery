/**
 * Gallery entry(Phase 1 WU-1)。V1 §6.1の初期化手順:
 * 静的HTML+背景(index.html/CSS)→context取得→一覧1ページ目→逐次描画→順序確定。
 * 一覧結果はセッション正本としてここで保持する(Phase 2のViewerが使用)。
 */
import './gallery.css';
import { CachingConfluenceApi } from '../shared/api/caching-confluence-api';
import { ForgeConfluenceApi } from '../shared/api/forge-confluence-api';
import { getMacroContext } from '../shared/api/macro-context';
import { RateLimitStateMachine } from '../shared/api/rate-limit-state';
import { DiagnosticBuffer } from '../shared/diagnostics/diagnostic-buffer';
import { registerGlobalErrorHandler } from '../shared/diagnostics/global-error-handler';
import { mark } from '../shared/diagnostics/marks';
import type { AttachmentSummary } from '../shared/types/media';
import { GalleryController } from './gallery-controller';
import { GridView } from './grid-view';

// module評価時点 ≈ DOMContentLoaded(type=module はdeferred実行)
mark('p1.gallery.dcl');

const diagnostics = new DiagnosticBuffer();
registerGlobalErrorHandler(diagnostics);

/** Galleryセッションの正本(§6.1)。Phase 2でViewer snapshotの源泉になる */
let sessionItems: readonly AttachmentSummary[] = [];

async function init(): Promise<void> {
  const root = document.querySelector<HTMLElement>('.mg-gallery');
  if (!root) return;

  try {
    const context = await getMacroContext();
    mark('p1.gallery.context.end');

    const rateLimit = new RateLimitStateMachine();
    const api = new ForgeConfluenceApi(context.siteBaseUrl, (meta) => {
      rateLimit.observe(meta); // 縮退state machineへの通知(V1 §11.1.1)
    });
    rateLimit.onChange((next, prev) => {
      diagnostics.record('state', `rate-limit: ${prev} -> ${next}`);
    });
    // 節約策adapter(V1 §4.5.1)。__MG_SAVINGS__はbuild時定数
    const cachedApi = new CachingConfluenceApi(api, __MG_SAVINGS__);

    // load(Retry含む)→controller→viewの相互参照は呼び出し時解決の閉包で結ぶ
    const load = (): void => {
      // Blocked中は新規要求を停止する(§11.1。本表示はWU-6)
      if (!rateLimit.canIssueRequests()) {
        view.showStatus(
          'blocked',
          `混雑のため待機中です(約${Math.ceil(rateLimit.retryAfterMs / 1000)}秒後に再試行できます)`,
        );
        return;
      }
      void controller.loadAll().then((result) => {
        mark('p1.gallery.list.complete');
        if (result.ok) sessionItems = result.items;
      });
    };

    const view = new GridView(
      root,
      (attachmentId) => {
        // Phase 1はno-op(診断記録のみ)。Phase 2でModal openに置き換える
        diagnostics.record('info', `tile activate: ${attachmentId}(viewerはPhase 2)`);
      },
      load,
    );

    const controller = new GalleryController({
      api: cachedApi,
      pageId: context.pageId,
      view,
      onFirstPage: () => {
        mark('p1.gallery.list.page1');
      },
      onFirstBatch: () => {
        mark('p1.gallery.tiles.first-batch');
      },
      onDiagnostic: (kind, message) => {
        diagnostics.record(kind, message);
      },
    });

    load();
  } catch (error) {
    diagnostics.record(
      'error',
      `gallery: 初期化失敗(${error instanceof Error ? error.message : 'unknown'})`,
    );
    const status = root.querySelector<HTMLElement>('.mg-status');
    if (status) {
      status.hidden = false;
      status.dataset['state'] = 'error';
      status.textContent = 'ギャラリーを初期化できませんでした';
    }
  }
}

void init();

export { sessionItems };
