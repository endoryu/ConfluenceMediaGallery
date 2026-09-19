/**
 * Viewer entry(Phase 2)。
 * WU-1: snapshot受領→即座に現在画像のURL設定(§13.3「起動後の最初の処理」)。
 * WU-2で2段表示、WU-3でナビゲーションを接続する。
 * ViewerコードはGallery bundleに含めない(CLAUDE.md §8)。
 */
import './viewer.css';
import { closeView, getModalContext } from '../shared/api/view-context';
import { DiagnosticBuffer } from '../shared/diagnostics/diagnostic-buffer';
import { registerGlobalErrorHandler } from '../shared/diagnostics/global-error-handler';
import { mark } from '../shared/diagnostics/marks';
import { parseViewerSnapshot } from './snapshot';
import { ViewerApp } from './viewer-app';

// module評価時点 ≈ DOMContentLoaded(type=module はdeferred実行)
mark('p2.viewer.dcl');
const dclAtEpoch = Date.now();

const diagnostics = new DiagnosticBuffer();
registerGlobalErrorHandler(diagnostics);
// 診断バッファの画面内読み出し口(E2E・手動診断用。console/外部へは出さない — §8)
(globalThis as unknown as { __MG_DIAG__?: () => unknown }).__MG_DIAG__ = () =>
  diagnostics.snapshot();

async function init(): Promise<void> {
  const root = document.querySelector<HTMLElement>('.mgv-viewer');
  if (!root) return;
  const status = root.querySelector<HTMLElement>('.mgv-status');

  let snapshotRaw: unknown = {};
  try {
    snapshotRaw = await getModalContext();
  } catch (error) {
    diagnostics.record(
      'error',
      `viewer: context取得失敗(${error instanceof Error ? error.message : 'unknown'})`,
    );
  }
  const snapshot = parseViewerSnapshot(snapshotRaw);
  if (!snapshot) {
    diagnostics.record('error', 'viewer: snapshot不正');
    if (status) {
      status.textContent = '表示情報を受け取れませんでした。閉じて再度開いてください';
      status.hidden = false;
    }
    return;
  }

  // 起動計測(P0-4方式): click(t0)→dcl、→first-paint
  if (snapshot.t0 > 0) {
    diagnostics.record('info', `viewer: dclDelta=${dclAtEpoch - snapshot.t0}ms`);
  }
  const app = new ViewerApp({
    root,
    snapshot,
    onCloseRequest: () => {
      closeView(); // Esc自前handler→view.close(§7.3)
    },
    onDiagnostic: (kind, message) => {
      diagnostics.record(kind, message);
    },
    onMark: mark,
  });
  app.start();
  requestAnimationFrame(() => {
    mark('p2.viewer.first-paint');
    if (snapshot.t0 > 0) {
      diagnostics.record('info', `viewer: paintDelta=${Date.now() - snapshot.t0}ms`);
    }
  });
}

void init();
