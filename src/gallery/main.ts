/**
 * Gallery entry(WU-1: probe app骨格)。
 * macro contextからpageId/siteUrlを取得し、Attachment一覧のprobe UIを表示する。
 */
import { getMacroContext } from '../shared/api/macro-context';
import { ForgeConfluenceApi } from '../shared/api/forge-confluence-api';
import { DiagnosticBuffer } from '../shared/diagnostics/diagnostic-buffer';
import { registerGlobalErrorHandler } from '../shared/diagnostics/global-error-handler';
import { DiagnosticsPanel } from '../shared/probe/diagnostics-panel';
import { mark } from '../shared/probe/marks';
import { RequestInventory } from '../shared/probe/request-inventory';
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
    await renderProbeUi(probeRoot, {
      pageId: context.pageId,
      api,
      diagnostics,
    });
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
