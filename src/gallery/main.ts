/**
 * Gallery entry(Phase 1)。V1 §6.1の初期化手順:
 * 静的HTML+背景(index.html/CSS)→context取得→一覧1ページ目→逐次描画→順序確定
 * →Thumbnailロード(§6.3: thumbキャッシュ優先→原寸fallback、viewport優先度)。
 * 一覧結果はセッション正本としてここで保持する(Phase 2のViewerが使用)。
 */
import './gallery.css';
import { CachingConfluenceApi } from '../shared/api/caching-confluence-api';
import { v1DownloadPath } from '../shared/api/confluence-api';
import { ForgeConfluenceApi } from '../shared/api/forge-confluence-api';
import { getMacroContext } from '../shared/api/macro-context';
import { RateLimitStateMachine } from '../shared/api/rate-limit-state';
import { openViewerModal } from '../shared/api/viewer-modal';
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
import { buildViewerSnapshot } from './viewer-launch';
import { ThumbcacheClaim } from './thumbcache/claim';
import type { ThumbcacheConfig } from './thumbcache/config';
import { loadThumbcacheConfig } from './thumbcache/config';
import { ThumbcacheGenerator } from './thumbcache/generator';

// module評価時点 ≈ DOMContentLoaded(type=module はdeferred実行)
mark('p1.gallery.dcl');

const diagnostics = new DiagnosticBuffer();
registerGlobalErrorHandler(diagnostics);
// 診断バッファの画面内読み出し口(E2E・手動診断用。console/外部へは出さない — §8)
(globalThis as unknown as { __MG_DIAG__?: () => unknown }).__MG_DIAG__ = () =>
  diagnostics.snapshot();

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
      if (meta.status >= 400) {
        diagnostics.record('error', `api ${meta.status}: ${meta.path}`);
      }
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
      view.setTileError(item.attachmentId, item.kind);
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

    /** thumb生成・GC・config更新(WU-5)。表示完了後のidleで実行、失敗は静かにfallback継続 */
    const startThumbcacheMaintenance = async (mdl: MediaModel): Promise<void> => {
      try {
        let config: ThumbcacheConfig | null = null;
        if (mdl.configItem) {
          config = await loadThumbcacheConfig(
            api,
            v1DownloadPath(mdl.configItem.pageId, mdl.configItem.attachmentId, mdl.configItem.version),
          );
        }
        const generator = new ThumbcacheGenerator({
          pageId: context.pageId,
          document,
          fetcher: api,
          writer: api,
          buildSourcePath: (item) => v1DownloadPath(item.pageId, item.attachmentId, item.version),
          claim: new ThumbcacheClaim({ pageId: context.pageId }),
          onDiagnostic: (kind, message) => {
            diagnostics.record(kind, message);
          },
        });
        const summary = await generator.run(mdl, config);
        mark('p1.thumbcache.done');
        diagnostics.record(
          'info',
          `thumbcache: ${summary.outcome} generated=${summary.generated} deleted=${summary.deleted} skipped=${summary.skipped}`,
        );
        // 手動操作UI(クリア/無効化)はwriterのみ表示(WU-5作業8)
        const sampleId =
          mdl.media[0]?.attachmentId ??
          [...mdl.thumbsByTarget.values()][0]?.[0]?.cacheAttachmentId ??
          mdl.configItem?.attachmentId;
        const isWriter =
          summary.outcome === 'generated' ||
          (summary.outcome !== 'not-writer' &&
            sampleId !== undefined &&
            (await api.canUpdateAttachment(sampleId)));
        if (isWriter) setupAdminBar(generator, mdl, config);
      } catch (error) {
        diagnostics.record(
          'error',
          `thumbcache: 実行失敗(${error instanceof Error ? error.message : 'unknown'})`,
        );
      }
    };

    const setupAdminBar = (
      generator: ThumbcacheGenerator,
      mdl: MediaModel,
      config: ThumbcacheConfig | null,
    ): void => {
      if (root.querySelector('.mg-admin')) return;
      const bar = document.createElement('div');
      bar.className = 'mg-admin';
      const clearButton = document.createElement('button');
      clearButton.type = 'button';
      clearButton.textContent = 'サムネイルキャッシュをクリア';
      clearButton.addEventListener('click', () => {
        clearButton.disabled = true;
        void generator.clearAll(mdl, config).finally(() => {
          clearButton.disabled = false;
        });
      });
      const toggleButton = document.createElement('button');
      toggleButton.type = 'button';
      let disabled = config?.disabled ?? false;
      const label = (): string =>
        disabled ? 'このページで生成を有効化' : 'このページで生成を無効化';
      toggleButton.textContent = label();
      toggleButton.addEventListener('click', () => {
        toggleButton.disabled = true;
        void generator
          .setDisabled(config, !disabled)
          .then((changed) => {
            if (changed) {
              disabled = !disabled;
              toggleButton.textContent = label();
            }
          })
          .finally(() => {
            toggleButton.disabled = false;
          });
      });
      bar.append(clearButton, toggleButton);
      root.append(bar);
    };

    // load(Retry含む)→controller→viewの相互参照は呼び出し時解決の閉包で結ぶ
    const load = (): void => {
      // Blocked中は新規要求を停止し、手動再読み込みに委ねる(§11.1.2)
      if (!rateLimit.canIssueRequests()) {
        view.showStatus(
          'blocked',
          `一覧を取得できませんでした(混雑中)。約${Math.max(1, Math.ceil(rateLimit.retryAfterMs / 1000))}秒後に再読み込みできます`,
        );
        return;
      }
      void controller.loadAll().then((result) => {
        mark('p1.gallery.list.complete');
        if (result.ok && result.model) {
          sessionItems = result.items;
          model = result.model;
          if (result.items.length > 0) applyImages(result.items);
          // 生成・GCは表示より下位の優先度で開始する(§6.3、性能憲法)
          void startThumbcacheMaintenance(result.model);
        }
      });
    };

    // Viewer close時のfocus復帰(§13.4)。復帰先タイル喪失時はグリッド先頭へ。
    // Modal close直後は親(Confluence)のfocus管理がiframeのfocusを奪うため、
    // 短い間隔で数回上書きする(装飾ではなくfocus確定のための再試行)
    const restoreFocus = (attachmentId: string): void => {
      const focusTile = (): void => {
        const tile =
          root.querySelector<HTMLButtonElement>(
            `.mg-tile[data-attachment-id="${attachmentId}"]`,
          ) ?? root.querySelector<HTMLButtonElement>('.mg-tile');
        tile?.focus();
      };
      focusTile();
      setTimeout(focusTile, 150);
      setTimeout(focusTile, 500);
    };

    const view = new GridView(
      root,
      (attachmentId) => {
        // error状態のタイルclick=個別Retry(§11)
        if (view.isTileError(attachmentId)) {
          const item = sessionItems.find((i) => i.attachmentId === attachmentId);
          const host = view.getMediaHost(attachmentId);
          if (item && host && loader) {
            view.clearTileError(attachmentId);
            loader.assign(host, item, 'high', tileWidth);
          }
          return;
        }
        // click handlerはsnapshot生成+Modal.open()のみ(同期 — §7.1/§13.3)
        const snapshot = buildViewerSnapshot({
          items: sessionItems,
          model,
          siteBaseUrl: context.siteBaseUrl,
          pageId: context.pageId,
          attachmentId,
          rateLimit: { phase: rateLimit.current, retryAfterMs: rateLimit.retryAfterMs },
        });
        if (!snapshot) {
          // 動画・音声はPhase 4で接続(現状は診断記録のみ)
          diagnostics.record('info', `tile activate: ${attachmentId}(image以外はPhase 4)`);
          return;
        }
        mark('p2.gallery.open-click');
        void openViewerModal(snapshot as unknown as Record<string, unknown>, () => {
          restoreFocus(attachmentId);
        }).catch((error: unknown) => {
          diagnostics.record(
            'error',
            `Modal.open失敗(${error instanceof Error ? error.message : 'unknown'})`,
          );
        });
      },
      load,
    );

    const controller = new GalleryController({
      api: cachedApi,
      pageId: context.pageId,
      view,
      retryAfterMs: () => rateLimit.retryAfterMs,
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
