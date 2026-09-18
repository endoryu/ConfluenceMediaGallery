/**
 * Viewer entry(WU-5: Modal iframe内のprobe)。
 * Viewerコードは Gallery bundle に含めない(CLAUDE.md §8)。
 */
import { emitProbeEvent, onProbeEvent } from '../shared/api/bridge-events';
import { closeView, getModalContext } from '../shared/api/view-context';
import { DiagnosticBuffer } from '../shared/diagnostics/diagnostic-buffer';
import { registerGlobalErrorHandler } from '../shared/diagnostics/global-error-handler';
import { DiagnosticsPanel } from '../shared/probe/diagnostics-panel';
import { mark } from '../shared/probe/marks';
import { RequestInventory } from '../shared/probe/request-inventory';
import { renderViewerProbe } from './viewer-probe';

// module評価時点 ≈ DOMContentLoaded(type=module はdeferred実行)
mark('p0.viewer.dcl');
const dclAtEpoch = Date.now();

const diagnostics = new DiagnosticBuffer();
registerGlobalErrorHandler(diagnostics);
const inventory = new RequestInventory();
inventory.start();

async function init(): Promise<void> {
  const app = document.getElementById('app');
  if (!app) return;

  let context: Record<string, unknown> = {};
  try {
    context = await getModalContext();
  } catch (error) {
    diagnostics.record(
      'error',
      `modal context取得失敗(${error instanceof Error ? error.message : 'unknown'})`,
    );
  }

  const t0 = typeof context['t0'] === 'number' ? (context['t0'] as number) : undefined;
  const metrics: { dclDeltaMs?: number; paintDeltaMs?: number } = {};
  if (t0 !== undefined) metrics.dclDeltaMs = dclAtEpoch - t0;

  await new Promise<void>((resolve) => {
    requestAnimationFrame(() => {
      mark('p0.viewer.first-paint');
      if (t0 !== undefined) metrics.paintDeltaMs = Date.now() - t0;
      resolve();
    });
  });

  await renderViewerProbe(app, {
    context,
    diagnostics,
    close: closeView,
    emitEvent: emitProbeEvent,
    onEvent: onProbeEvent,
    metrics,
  });

  new DiagnosticsPanel(app, diagnostics, inventory);
  diagnostics.record('info', 'viewer: init完了');
}

void init();
