/**
 * Gallery entry(WU-1: probe app骨格)。
 * macro contextからpageId/siteUrlを取得し、Attachment一覧のprobe UIを表示する。
 */
import { emitProbeEvent, onProbeEvent } from '../shared/api/bridge-events';
import { getMacroContext } from '../shared/api/macro-context';
import { ForgeConfluenceApi } from '../shared/api/forge-confluence-api';
import { openViewerModal } from '../shared/api/viewer-modal';
import { DiagnosticBuffer } from '../shared/diagnostics/diagnostic-buffer';
import { registerGlobalErrorHandler } from '../shared/diagnostics/global-error-handler';
import { DiagnosticsPanel } from '../shared/probe/diagnostics-panel';
import { mark } from '../shared/probe/marks';
import { RequestInventory } from '../shared/probe/request-inventory';
import { attemptViewerWarmup, runModalProbe } from './probes/modal-probe';
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
    const api = new ForgeConfluenceApi(context.siteBaseUrl, (meta) => {
      panel.recordResponseMeta(meta);
    });
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

    await renderProbeUi(probeRoot, {
      pageId: context.pageId,
      api,
      diagnostics,
      onProbe: (action, item) => {
        if (action === 'thumbnail') {
          void runThumbnailProbe(probeOutput, item, { api, diagnostics });
        } else if (action === 'original') {
          void runOriginalProbe(probeOutput, item, { api, diagnostics });
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
