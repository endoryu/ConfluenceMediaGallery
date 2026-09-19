/**
 * Gallery entry(WU-1: probe app骨格)。
 * macro contextからpageId/siteUrlを取得し、Attachment一覧のprobe UIを表示する。
 */
import { emitProbeEvent, onProbeEvent } from '../shared/api/bridge-events';
import { CachingConfluenceApi } from '../shared/api/caching-confluence-api';
import { getMacroContext } from '../shared/api/macro-context';
import { ForgeConfluenceApi } from '../shared/api/forge-confluence-api';
import { RateLimitStateMachine } from '../shared/api/rate-limit-state';
import { openViewerModal } from '../shared/api/viewer-modal';
import { DiagnosticBuffer } from '../shared/diagnostics/diagnostic-buffer';
import { registerGlobalErrorHandler } from '../shared/diagnostics/global-error-handler';
import { DiagnosticsPanel } from '../shared/probe/diagnostics-panel';
import { mark } from '../shared/probe/marks';
import { RequestInventory } from '../shared/probe/request-inventory';
import { runMediaProbe } from './probes/media-probe';
import { attemptViewerWarmup, runModalProbe } from './probes/modal-probe';
import { runG2WriteProbe, runUsersBulkProbe } from './probes/scope-probe';
import { runPageSizeProbe, runStandardSessionProbe } from './probes/session-probe';
import { runOriginalProbe } from './probes/original-probe';
import { runThumbnailProbe } from './probes/thumbnail-probe';
import { renderProbeUi } from './probe-ui';

const diagnostics = new DiagnosticBuffer();
registerGlobalErrorHandler(diagnostics);

const inventory = new RequestInventory();
inventory.start();

async function init(): Promise<void> {
  const app = document.getElementById('app');
  if (!app) return;

  const heading = document.createElement('h1');
  heading.textContent = 'Media Gallery probe (WU-1)';
  app.append(heading);

  const probeRoot = document.createElement('div');
  app.append(probeRoot);

  const panel = new DiagnosticsPanel(app, diagnostics, inventory);

  try {
    mark('p0.gallery.context.start');
    const context = await getMacroContext();
    mark('p0.gallery.context.end');
    const rateLimit = new RateLimitStateMachine();
    const api = new ForgeConfluenceApi(context.siteBaseUrl, (meta) => {
      panel.recordResponseMeta(meta);
      rateLimit.observe(meta); // 縮退state machineへの通知(V1 §11.1.1)
    });
    rateLimit.onChange((next, prev) => {
      diagnostics.record('state', `rate-limit: ${prev} -> ${next}`);
    });
    // 節約策adapter。__MG_SAVINGS__はbuild時定数(WU-7作業6の比較フラグ)
    const cachedApi = new CachingConfluenceApi(api, __MG_SAVINGS__);
    const probeOutput = document.createElement('div');

    // WU-5作業8: Gallery初期ロードと独立にModalを開けることの確認用。
    // 一覧取得のawaitより前にボタンを描画する(低速回線で一覧待ちの間に押す)
    const earlyModalButton = document.createElement('button');
    earlyModalButton.type = 'button';
    earlyModalButton.textContent = '即時Modalテスト(一覧ロード前でも可)';
    earlyModalButton.addEventListener('click', () => {
      void runModalProbe(
        probeOutput,
        {
          attachmentId: 'early-probe',
          pageId: context.pageId,
          title: 'early-probe',
          mediaType: 'image/png',
          kind: 'image',
          version: 1,
        },
        { api, diagnostics, openModal: openViewerModal, emitEvent: emitProbeEvent, onEvent: onProbeEvent },
      );
    });
    const warmupButton = document.createElement('button');
    warmupButton.type = 'button';
    warmupButton.textContent = 'Viewer warm-up試行(非表示iframe)';
    const warmupStatus = document.createElement('span');
    warmupButton.addEventListener('click', () =>
      attemptViewerWarmup(document, diagnostics, warmupStatus),
    );
    probeRoot.append(earlyModalButton, warmupButton, warmupStatus, probeOutput);

    const items = await renderProbeUi(probeRoot, {
      pageId: context.pageId,
      api: cachedApi,
      diagnostics,
      onProbe: (action, item) => {
        if (action === 'thumbnail') {
          void runThumbnailProbe(probeOutput, item, { api, diagnostics });
        } else if (action === 'original') {
          // 動画・音声はWU-4のRange/seek probe、画像はWU-3のOriginal probe
          if (item.kind === 'video' || item.kind === 'audio') {
            runMediaProbe(probeOutput, item, { api, diagnostics });
          } else {
            void runOriginalProbe(probeOutput, item, { api, diagnostics });
          }
        } else {
          void runModalProbe(probeOutput, item, {
            api,
            diagnostics,
            openModal: openViewerModal,
            emitEvent: emitProbeEvent,
            onEvent: onProbeEvent,
          });
        }
      },
    });
    // (即時Modal・warm-upボタンは一覧取得前に上で描画済み)

    // WU-6: scope probe(users-bulk疎通、G2 write roundtrip)
    const scopeArea = document.createElement('div');
    const usersBulkButton = document.createElement('button');
    usersBulkButton.type = 'button';
    usersBulkButton.dataset['action'] = 'users-bulk-probe';
    usersBulkButton.textContent = 'users-bulk疎通probe';
    const usersBulkStatus = document.createElement('span');
    usersBulkButton.addEventListener('click', () => {
      void runUsersBulkProbe(usersBulkStatus, items, cachedApi, diagnostics);
    });
    const g2Button = document.createElement('button');
    g2Button.type = 'button';
    g2Button.dataset['action'] = 'g2-write-probe';
    g2Button.textContent = 'G2 write probe(mg_thumbcache upload→版更新→削除)';
    const g2Status = document.createElement('span');
    g2Button.addEventListener('click', () => {
      void runG2WriteProbe(g2Status, context.pageId, api, diagnostics, document);
    });
    scopeArea.append(usersBulkButton, usersBulkStatus, g2Button, g2Status);

    // WU-7: 標準セッション/page size比較probe
    const sessionButton = document.createElement('button');
    sessionButton.type = 'button';
    sessionButton.dataset['action'] = 'standard-session-probe';
    sessionButton.textContent = `標準セッションprobe(30件、savings=${String(__MG_SAVINGS__)})`;
    sessionButton.addEventListener('click', () => {
      void runStandardSessionProbe(probeOutput, items, {
        api: cachedApi,
        diagnostics,
        savingsEnabled: __MG_SAVINGS__,
      });
    });
    const pageSizeButton = document.createElement('button');
    pageSizeButton.type = 'button';
    pageSizeButton.dataset['action'] = 'page-size-probe';
    pageSizeButton.textContent = 'page size比較probe(25/50/100/250×3)';
    pageSizeButton.addEventListener('click', () => {
      void runPageSizeProbe(probeOutput, { rawApi: api, pageId: context.pageId, diagnostics });
    });
    scopeArea.append(sessionButton, pageSizeButton);
    probeRoot.append(scopeArea);
  } catch (error) {
    diagnostics.record(
      'error',
      `初期化に失敗(${error instanceof Error ? error.message : 'unknown'})`,
    );
    const failure = document.createElement('p');
    failure.textContent = '初期化に失敗しました(診断出力を参照)';
    probeRoot.append(failure);
  }
  diagnostics.record('info', 'gallery: init完了');
}

void init();
