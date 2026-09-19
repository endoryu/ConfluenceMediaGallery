/**
 * Gallery entry(Phase 1)。V1 §6.1の初期化手順:
 * 静的HTML+背景(index.html/CSS)→context取得→一覧1ページ目→逐次描画→順序確定
 * →Thumbnailロード(§6.3: thumbキャッシュ優先→原寸fallback、viewport優先度)。
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
import type { MediaModel } from './media-items';
import { pickThumbBucket, selectThumb } from './media-items';
import type { TileImageAssignment } from './tile-loader';
import { TileLoader, estimateTilesPerViewport, priorityForIndex } from './tile-loader';

// module評価時点 ≈ DOMContentLoaded(type=module はdeferred実行)
mark('p1.gallery.dcl');

const diagnostics = new DiagnosticBuffer();
registerGlobalErrorHandler(diagnostics);

/** Galleryセッションの正本(§6.1)。Phase 2でViewer snapshotの源泉になる */
let sessionItems: readonly AttachmentSummary[] = [];

/** CSS design tokenの数値読み出し(§6.2の一箇所定義をJS側でも共有する) */
function tokenPx(name: string, fallback: number): number {
  const raw = getComputedStyle(document.documentElement).getPropertyValue(name);
  const value = Number.parseFloat(raw);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

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

    let model: MediaModel | null = null;
    let loader: TileLoader | null = null;
    let tileWidth = tokenPx('--mg-tile-min', 220);

    // §6.3: thumbキャッシュ(w320/w640)優先→原寸fallback。URLは正規形builderのみ(§5.2)
    const resolveSrc = (
      item: AttachmentSummary,
      displayWidthCssPx: number,
    ): TileImageAssignment | null => {
      if (item.kind !== 'image') return null; // 動画・音声は種別アイコンのまま(Phase 4)
      const bucket = pickThumbBucket(displayWidthCssPx, window.devicePixelRatio);
      const thumb = selectThumb(model?.thumbsByTarget.get(item.attachmentId), bucket);
      if (thumb) {
        return {
          src: api.originalUrl(item.pageId, thumb.cacheAttachmentId, thumb.cacheVersion),
          isOriginalFallback: false,
        };
      }
      return {
        src: api.originalUrl(item.pageId, item.attachmentId, item.version),
        isOriginalFallback: true,
      };
    };

    const onImageFailure = (item: AttachmentSummary): void => {
      view.setTileError(item.attachmentId);
      rateLimit.recordMediaFailure();
      diagnostics.record('error', `thumbnail load失敗: ${item.attachmentId}`);
      // 閾値超過時はレート制限疑いprobe(安価なREST 1件 — §11.1.1)
      if (rateLimit.shouldIssueProbe()) {
        void api
          .getAttachment(item.attachmentId)
          .catch(() => undefined)
          .finally(() => {
            rateLimit.probeFinished();
          });
      }
    };

    /** 順序確定後にDOM順で画像を割り当てる(初回viewport=high、直近1画面=auto、以遠=lazy+IO) */
    const applyImages = (items: readonly AttachmentSummary[]): void => {
      const grid = root.querySelector<HTMLElement>('.mg-grid');
      if (!grid) return;
      const viewportHeight = Math.min(window.innerHeight, window.screen?.height ?? window.innerHeight);
      const estimate = estimateTilesPerViewport(
        grid.clientWidth || root.clientWidth,
        viewportHeight,
        tokenPx('--mg-tile-min', 220),
        tokenPx('--mg-gap', 8),
      );
      tileWidth = estimate.tileWidth;
      loader?.disconnect();
      loader = new TileLoader({ resolveSrc, onFailure: onImageFailure });
      items.forEach((item, index) => {
        const host = view.getMediaHost(item.attachmentId);
        if (host) {
          loader?.assign(host, item, priorityForIndex(index, estimate.count), estimate.tileWidth);
        }
      });
      mark('p1.gallery.images.start');
    };

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
        if (result.ok && result.model) {
          sessionItems = result.items;
          model = result.model;
          if (result.items.length > 0) applyImages(result.items);
        }
      });
    };

    const view = new GridView(
      root,
      (attachmentId) => {
        // error状態のタイルclick=個別Retry(§11)。通常clickはPhase 2でModal open
        if (view.isTileError(attachmentId)) {
          const item = sessionItems.find((i) => i.attachmentId === attachmentId);
          const host = view.getMediaHost(attachmentId);
          if (item && host && loader) {
            view.clearTileError(attachmentId);
            loader.assign(host, item, 'high', tileWidth);
          }
          return;
        }
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
